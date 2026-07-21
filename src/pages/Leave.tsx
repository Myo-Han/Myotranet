import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Leave as LeaveType, LeaveBalanceHistory } from '../types';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import { useLeaveRequest, todayKey, deleteLeaveRequest, isLeaveEditable } from '../hooks/useLeaveRequest';
import { getRevisionStatusLabel, localDateTimeInputToIso } from '../utils/attendanceLabels';

// ✅ leave_balance_history.policy_code는 "휴가 신청 유형"(annual/half_day/quarter_day)이 아니라
// 실제로 증감된 "잔액 풀"(annual_leave=연차 잔액 / monthly_leave=월차 잔액)을 가리킨다.
// (leave_policies에는 애초에 'annual_leave'/'monthly_leave'라는 policy_code가 존재하지 않음)
const POOL_LABEL: Record<string, string> = {
  annual_leave: '연차(잔액)',
  monthly_leave: '월차(잔액)',
};
const getPoolLabel = (code: string) => POOL_LABEL[code] || code;

// ✅ 연장근무 신청 행. 근태관리 페이지에 있던 "연장근무 신청" 기능이 이 페이지로 이전되었다.
type OvertimeRequestRow = {
  id: string;
  user_id: string;
  work_date: string;
  requested_start_at: string;
  requested_end_at: string;
  reason: string | null;
  status: string;
  created_at: string;
  requester?: { name: string } | null;
};

type TeamLeaveRow = LeaveType & {
  requester?: { name: string } | null;
};

const shiftDateStr = (yyyyMMdd: string, deltaDays: number) => {
  const [y, m, d] = yyyyMMdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const formatDateTimeShort = (iso: string) => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.toLocaleDateString('ko-KR')} ${hh}:${mm}`;
};

const Leave: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const lr = useLeaveRequest(user);

  // ✅ 연차 / 연장근무 카테고리 탭 (근태관리의 "근태신청" 버튼으로 이 페이지에 진입)
  const [category, setCategory] = useState<'annual' | 'overtime'>('annual');

  const [leaves, setLeaves] = useState<LeaveType[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<TeamLeaveRow[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<LeaveBalanceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ✅ 연장근무 신청/조회 상태
  const [myOvertime, setMyOvertime] = useState<OvertimeRequestRow[]>([]);
  const [teamOvertime, setTeamOvertime] = useState<OvertimeRequestRow[]>([]);
  const [overtimeLoading, setOvertimeLoading] = useState(true);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeSubmitting, setOvertimeSubmitting] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState({
    workDate: todayKey(),
    startTime: '18:00',
    endTime: '20:00',
    reason: '',
  });

  // ✅ 결재 진행 상세 모달
  type LeaveApprovalRow = {
    id: string;
    leave_id: string;
    approval_line_id: string;
    status: string;
    current_step_order: number | null;
    created_at?: string;
  };

  type ApprovalLineStepRow = {
    id: string;
    approval_line_id: string;
    step_order: number;
    required: boolean;

    assignee_user_id: string | null;
    assignee_role: string | null;
    assignee_position: string | null;

    assignee_project_code: string | null;
    assignee_part_code: string | null;
    assignee_department_code: string | null;
  };

  type LeaveApprovalActionRow = {
    id: string;
    leave_approval_id: string;
    step_order: number;
    actor_user_id: string | null;
    action: string; // 'approved' | 'rejected' | ...
    notes: string | null;
    created_at: string;
  };

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailApproval, setDetailApproval] = useState<LeaveApprovalRow | null>(null);
  const [detailSteps, setDetailSteps] = useState<ApprovalLineStepRow[]>([]);
  const [detailActions, setDetailActions] = useState<LeaveApprovalActionRow[]>([]);
  const [detailLeave, setDetailLeave] = useState<LeaveType | null>(null);
  const [deletingLeave, setDeletingLeave] = useState(false);

  // 필터 상태
  const [historyFilter, setHistoryFilter] = useState({
    period: '1month',
    policyCode: 'all',
    changeType: 'all',
  });

  useEffect(() => {
    fetchData();
    fetchOvertimeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 휴가 신청 내역 가져오기 (나 + 팀원)
      await fetchLeaves();
      await fetchTeamLeaves();

      // 휴가 증감 이력 가져오기
      await fetchBalanceHistory();
    } catch (err: any) {
      setError(err.message || '데이터 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaves = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('leaves')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;

      const list = (data || []) as any[];
      const leaveIds = list.map((l) => l.id).filter(Boolean);

      if (leaveIds.length) {
        const { data: apprRows, error: apprErr } = await supabase
          .from('leave_approvals')
          .select('leave_id, status')
          .in('leave_id', leaveIds);

        if (apprErr) throw apprErr;

        const statusById = new Map<string, string>();
        (apprRows || []).forEach((r: any) => {
          if (r.leave_id) statusById.set(r.leave_id, r.status);
        });

        const merged = list.map((l) => {
          const approvalStatus = statusById.get(l.id);
          if (approvalStatus === 'approved') return Object.assign({}, l, { status: 'approved' });
          if (approvalStatus === 'rejected') return Object.assign({}, l, { status: 'rejected' });
          return l;
        });

        setLeaves(merged as any);
        return;
      }

      setLeaves(list as any);
    } catch (err: any) {
      setError(err.message || '휴가 내역 로딩 실패');
    }
  };

  // ✅ 같은 프로젝트 소속 팀원들의 휴가 신청 현황 (RLS가 본인/관리자/같은 프로젝트로 조회를 제한해줌)
  const fetchTeamLeaves = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('leaves')
        .select('*, requester:users!leaves_user_id_fkey(name)')
        .neq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTeamLeaves((data || []) as any);
    } catch (err: any) {
      console.error('팀원 휴가 신청 로딩 실패:', err);
      setTeamLeaves([]);
    }
  };

  const fetchBalanceHistory = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('leave_balance_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // 기간 필터
      if (historyFilter.period !== 'all') {
        const now = new Date();
        let startDate = new Date();

        switch (historyFilter.period) {
          case '1month':
            startDate.setMonth(now.getMonth() - 1);
            break;
          case '3months':
            startDate.setMonth(now.getMonth() - 3);
            break;
          case '6months':
            startDate.setMonth(now.getMonth() - 6);
            break;
          case '1year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        }

        query = query.gte('created_at', startDate.toISOString());
      }

      // 정책 필터
      if (historyFilter.policyCode !== 'all') {
        query = query.eq('policy_code', historyFilter.policyCode);
      }

      // 변동 유형 필터
      if (historyFilter.changeType !== 'all') {
        query = query.eq('change_type', historyFilter.changeType);
      }

      const { data, error } = await query;
      if (error) throw error;

      setBalanceHistory(data || []);
    } catch (err: any) {
      console.error('증감 이력 로딩 실패:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBalanceHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilter, user]);

  // ✅ 나 + 같은 프로젝트 팀원의 연장근무 신청 현황
  const fetchOvertimeData = async () => {
    if (!user) return;
    setOvertimeLoading(true);
    try {
      const [mineRes, teamRes] = await Promise.all([
        supabase
          .from('overtime_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('overtime_requests')
          .select('*, requester:users!overtime_requests_user_id_fkey(name)')
          .neq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (mineRes.error) throw mineRes.error;
      if (teamRes.error) throw teamRes.error;

      setMyOvertime((mineRes.data || []) as any);
      setTeamOvertime((teamRes.data || []) as any);
    } catch (err: any) {
      console.error('연장근무 신청 로딩 실패:', err);
      setMyOvertime([]);
      setTeamOvertime([]);
    } finally {
      setOvertimeLoading(false);
    }
  };

  // ✅ 연장근무 신청 제출: 날짜+시작/종료 시각을 하나의 로컬 datetime 문자열로 합친 뒤
  // localDateTimeInputToIso로 변환해서 저장한다 (출퇴근 수정요청과 동일하게, 타임존 버그 재발 방지).
  // 종료 시각이 시작 시각보다 이르거나 같으면 자정을 넘긴 근무로 보고 종료일을 다음날로 계산한다.
  const submitOvertimeRequest = async () => {
    if (!user) return;
    if (!overtimeForm.workDate || !overtimeForm.startTime || !overtimeForm.endTime) {
      setError('날짜와 시간을 모두 입력해주세요');
      return;
    }
    if (!overtimeForm.reason.trim()) {
      setError('사유를 입력해주세요');
      return;
    }

    setOvertimeSubmitting(true);
    setError('');
    try {
      let endDateStr = overtimeForm.workDate;
      if (overtimeForm.endTime <= overtimeForm.startTime) {
        endDateStr = shiftDateStr(overtimeForm.workDate, 1);
      }

      const startIso = localDateTimeInputToIso(`${overtimeForm.workDate}T${overtimeForm.startTime}`);
      const endIso = localDateTimeInputToIso(`${endDateStr}T${overtimeForm.endTime}`);

      if (!startIso || !endIso) {
        setError('시간을 올바르게 입력해주세요');
        return;
      }

      const { error: insertError } = await supabase.from('overtime_requests').insert({
        user_id: user.id,
        work_date: overtimeForm.workDate,
        requested_start_at: startIso,
        requested_end_at: endIso,
        reason: overtimeForm.reason,
        status: 'pending',
      });

      if (insertError) throw insertError;

      setSuccess('연장근무 신청이 제출되었습니다');
      setShowOvertimeModal(false);
      setOvertimeForm({ workDate: todayKey(), startTime: '18:00', endTime: '20:00', reason: '' });
      fetchOvertimeData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '연장근무 신청 실패');
    } finally {
      setOvertimeSubmitting(false);
    }
  };

  const getChangeTypeLabel = (changeType: string) => {
    const labels: Record<string, string> = {
      accrual: '발생',
      used: '사용',
      expired: '소멸',
      manual_add: '수동지급',
      manual_subtract: '수동차감',
    };
    return labels[changeType] || changeType;
  };

  const getYearStats = () => {
    const thisYear = new Date().getFullYear();
    const yearHistory = balanceHistory.filter(h => {
      const year = new Date(h.created_at).getFullYear();
      return year === thisYear;
    });

    const totalAccrual = yearHistory
      .filter(h => h.change_type === 'accrual' || h.change_type === 'manual_add')
      .reduce((sum, h) => sum + h.change_amount, 0);

    const totalUsed = yearHistory
      .filter(h => h.change_type === 'used')
      .reduce((sum, h) => sum + Math.abs(h.change_amount), 0);

    const totalExpired = yearHistory
      .filter(h => h.change_type === 'expired')
      .reduce((sum, h) => sum + Math.abs(h.change_amount), 0);

    return { totalAccrual, totalUsed, totalExpired };
  };

  const handleEditLeave = (leave: LeaveType) => {
    setDetailOpen(false);
    navigate(`/leave/edit/${leave.id}`);
  };

  const handleDeleteLeave = async (leave: LeaveType) => {
    if (!window.confirm('이 휴가 신청을 삭제하시겠습니까? 이미 승인된 건이라면 차감된 잔액도 함께 복구됩니다.')) return;

    setDeletingLeave(true);
    const result = await deleteLeaveRequest(leave.id);
    setDeletingLeave(false);

    if (result.ok) {
      setDetailOpen(false);
      setSuccess('휴가 신청이 삭제되었습니다.');
      setTimeout(() => setSuccess(''), 3000);
      fetchLeaves();
    } else {
      setDetailError(result.error || '삭제에 실패했습니다');
    }
  };

  const openApprovalDetail = async (leave: LeaveType) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailApproval(null);
    setDetailSteps([]);
    setDetailLeave(leave);
    setDetailActions([]);

    try {
      const { data: approval, error: approvalErr } = await supabase
        .from('leave_approvals')
        .select('*')
        .eq('leave_id', leave.id)
        .maybeSingle();

      if (approvalErr) throw approvalErr;

      if (!approval) {
        setDetailApproval(null);
        return;
      }

      setDetailApproval(approval as any);

      const { data: steps, error: stepsErr } = await supabase
        .from('approval_line_steps')
        .select('*')
        .eq('approval_line_id', (approval as any).approval_line_id)
        .order('step_order', { ascending: true });

      if (stepsErr) throw stepsErr;
      setDetailSteps((steps || []) as any);

      const { data: actions, error: actionsErr } = await supabase
        .from('leave_approval_actions')
        .select('*')
        .eq('leave_approval_id', (approval as any).id)
        .order('created_at', { ascending: true });

      if (actionsErr) throw actionsErr;
      setDetailActions(((actions || []) as any) as LeaveApprovalActionRow[]);
    } catch (e: any) {
      setDetailError(e.message || '결재 진행 조회 실패');
    } finally {
      setDetailLoading(false);
    }
  };

  const stats = getYearStats();
  // ✅ 연차/월차 잔여를 "잔여 연차"로 통합 표시 (본인만 볼 수 있음: user 정보는 본인 것만 로드됨)
  const totalLeaveBalance = (user?.annual_leave_balance || 0) + (user?.monthly_leave_balance || 0);

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* 카테고리 탭 + 신청 버튼(오른쪽 상단) */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCategory('annual')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${category === 'annual'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            연차
          </button>
          <button
            type="button"
            onClick={() => setCategory('overtime')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${category === 'overtime'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            연장근무
          </button>
        </div>

        <div className="pb-2">
          {category === 'annual' ? (
            <button
              type="button"
              onClick={() => navigate('/leave/new')}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              연차 신청
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowOvertimeModal(true)}
              className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
            >
              연장근무 신청
            </button>
          )}
        </div>
      </div>

      {category === 'annual' && (
        <>
          {/* 잔여 연차 카드 (연차+월차 통합, 본인만 확인 가능) */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-700">잔여 연차</h2>
              <div className="text-3xl font-bold text-blue-600">{totalLeaveBalance}일</div>
            </div>
            <p className="text-sm text-gray-500">연차·월차 잔여일수를 합산한 값입니다. 본인만 확인할 수 있어요.</p>
          </div>

          {/* 올해 통계 요약 */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">올해 휴가 통계</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.totalAccrual}일</div>
                <div className="text-sm text-gray-500">총 발생</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.totalUsed}일</div>
                <div className="text-sm text-gray-500">총 사용</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.totalExpired}일</div>
                <div className="text-sm text-gray-500">총 소멸</div>
              </div>
            </div>
          </div>

          {/* 휴가 증감 이력 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">휴가 증감 이력</h2>
                <div className="flex gap-2">
                  <select
                    value={historyFilter.period}
                    onChange={(e) => setHistoryFilter({ ...historyFilter, period: e.target.value })}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1"
                  >
                    <option value="1month">최근 1개월</option>
                    <option value="3months">최근 3개월</option>
                    <option value="6months">최근 6개월</option>
                    <option value="1year">최근 1년</option>
                    <option value="all">전체</option>
                  </select>

                  <select
                    value={historyFilter.policyCode}
                    onChange={(e) => setHistoryFilter({ ...historyFilter, policyCode: e.target.value })}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1"
                  >
                    <option value="all">전체 휴가</option>
                    <option value="annual_leave">{POOL_LABEL.annual_leave}</option>
                    <option value="monthly_leave">{POOL_LABEL.monthly_leave}</option>
                  </select>

                  <select
                    value={historyFilter.changeType}
                    onChange={(e) => setHistoryFilter({ ...historyFilter, changeType: e.target.value })}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1"
                  >
                    <option value="all">전체 유형</option>
                    <option value="accrual">발생만</option>
                    <option value="used">사용만</option>
                    <option value="expired">소멸만</option>
                    <option value="manual_add">수동지급</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">휴가 종류</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">변동 유형</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">변동량</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">변동 후 잔액</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {balanceHistory.map((history) => (
                    <tr key={history.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(history.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getPoolLabel(history.policy_code)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${history.change_type === 'accrual' || history.change_type === 'manual_add'
                            ? 'bg-green-100 text-green-800'
                            : history.change_type === 'used'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-red-100 text-red-800'
                            }`}
                        >
                          {getChangeTypeLabel(history.change_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`font-semibold ${history.change_amount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                        >
                          {history.change_amount > 0 ? '+' : ''}
                          {history.change_amount}일
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {['annual_leave', 'monthly_leave'].includes(history.policy_code)
                          ? `${history.balance_after}일`
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{history.reason || '-'}</td>
                    </tr>
                  ))}
                  {balanceHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        증감 이력이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 나의 휴가 신청 내역 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">나의 휴가 신청 내역</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청일자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">시작일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">종료일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">일수</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leaves.map((leave) => (
                    <tr
                      key={leave.id}
                      onClick={() => openApprovalDetail(leave)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(((leave as any).created_at || leave.start_date) as string).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(leave.start_date).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(leave.end_date).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {lr.getPolicyName(leave.type)}
                        {leave.type === 'half_day' && leave.half_day_period && (
                          <span className="text-xs text-gray-500 ml-1">
                            ({leave.half_day_period === 'am' ? '오전' : '오후'})
                          </span>
                        )}
                        {leave.type === 'quarter_day' && leave.quarter_start_time && (
                          <span className="text-xs text-gray-500 ml-1">
                            ({leave.quarter_start_time.slice(0, 5)}~)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {leave.days_requested}일
                        {leave.paid_days > 0 && (
                          <span className="text-xs text-green-600 ml-1">(유급 {leave.paid_days}일)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{leave.reason}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${leave.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : leave.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                            }`}
                        >
                          {leave.status === 'approved' ? '승인' : leave.status === 'rejected' ? '반려' : '대기'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {leaves.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        신청 내역이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 팀원 휴가 신청 현황 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">팀원 휴가 신청 현황</h2>
              <p className="text-xs text-gray-400 mt-1">같은 프로젝트 소속 팀원들의 휴가 신청 내역입니다. (잔여 연차는 본인만 볼 수 있어요)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">기간</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {teamLeaves.map((leave) => {
                    const { label, colorClass } = getRevisionStatusLabel(leave.status);
                    return (
                      <tr key={leave.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{leave.requester?.name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(leave.start_date).toLocaleDateString('ko-KR')} ~ {new Date(leave.end_date).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lr.getPolicyName(leave.type)}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{leave.reason || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${colorClass}`}>{label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {teamLeaves.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        같은 프로젝트 팀원의 휴가 신청 내역이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {category === 'overtime' && (
        <>
          {/* 나의 연장근무 신청 내역 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">나의 연장근무 신청 내역</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">근무 일자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">시작~종료</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {!overtimeLoading && myOvertime.map((ot) => {
                    const { label, colorClass } = getRevisionStatusLabel(ot.status);
                    return (
                      <tr key={ot.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(`${ot.work_date}T00:00:00`).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDateTimeShort(ot.requested_start_at)} ~ {formatDateTimeShort(ot.requested_end_at)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{ot.reason || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${colorClass}`}>{label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {overtimeLoading && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">불러오는 중...</td>
                    </tr>
                  )}
                  {!overtimeLoading && myOvertime.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">신청 내역이 없습니다</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 팀원 연장근무 신청 현황 */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">팀원 연장근무 신청 현황</h2>
              <p className="text-xs text-gray-400 mt-1">같은 프로젝트 소속 팀원들의 연장근무 신청 내역입니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">근무 일자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">시작~종료</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {!overtimeLoading && teamOvertime.map((ot) => {
                    const { label, colorClass } = getRevisionStatusLabel(ot.status);
                    return (
                      <tr key={ot.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ot.requester?.name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(`${ot.work_date}T00:00:00`).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDateTimeShort(ot.requested_start_at)} ~ {formatDateTimeShort(ot.requested_end_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${colorClass}`}>{label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {overtimeLoading && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">불러오는 중...</td>
                    </tr>
                  )}
                  {!overtimeLoading && teamOvertime.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        같은 프로젝트 팀원의 연장근무 신청 내역이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ✅ 결재 진행 현황 모달 */}
      {detailOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">결재 진행 현황</h3>
              <div className="flex items-center gap-2">
                {detailLeave && isLeaveEditable(detailLeave.start_date) && (
                  <>
                    <button
                      onClick={() => handleEditLeave(detailLeave)}
                      disabled={deletingLeave}
                      className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteLeave(detailLeave)}
                      disabled={deletingLeave}
                      className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                    >
                      {deletingLeave ? '삭제 중...' : '삭제'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDetailOpen(false)}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                  닫기
                </button>
              </div>
            </div>

            {detailLeave && !isLeaveEditable(detailLeave.start_date) && (
              <p className="text-xs text-gray-400 mb-3">이미 시작했거나 지난 휴가는 수정/삭제할 수 없습니다.</p>
            )}

            {detailLoading && (
              <div className="py-6 text-center text-gray-600">로딩중</div>
            )}

            {!detailLoading && detailError && (
              <div className="py-3 text-red-600 text-sm">{detailError}</div>
            )}

            {!detailLoading && !detailError && !detailApproval && (
              <div className="py-6 text-center text-gray-600">결재 인스턴스가 없습니다</div>
            )}

            {!detailLoading && !detailError && detailApproval && (
              <>
                {(() => {
                  const lastRejected = detailActions.slice().reverse().find((a) => a.action === 'rejected');
                  const rejectedStep = lastRejected?.step_order ?? null;
                  const current = detailApproval.current_step_order ?? null;

                  return (
                    <>
                      {detailApproval.status === 'rejected' && lastRejected?.notes && (
                        <div className="mb-4 p-3 rounded bg-red-50 text-sm text-red-700">
                          <div className="font-semibold">반려 사유</div>
                          <div className="mt-1">{lastRejected.notes}</div>
                        </div>
                      )}

                      <div className="border rounded overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 text-sm font-semibold">단계</div>
                        <div className="divide-y">
                          {detailSteps.map((s) => {
                            const stepActions = detailActions.filter((a) => a.step_order === s.step_order);
                            const last = stepActions.length ? stepActions[stepActions.length - 1] : null;

                            let stateLabel = '대기';
                            if (detailApproval.status === 'rejected' && rejectedStep === s.step_order) {
                              stateLabel = '반려';
                            } else if (last?.action === 'approved') {
                              stateLabel = '완료';
                            } else if (
                              (detailApproval.status === 'in_progress' || detailApproval.status === 'pending') &&
                              current === s.step_order
                            ) {
                              stateLabel = '진행중';
                            } else if (current !== null && s.step_order < current) {
                              stateLabel = '완료';
                            }

                            const processedAt =
                              (stateLabel === '완료' || stateLabel === '반려') && last
                                ? new Date(last.created_at).toLocaleString('ko-KR')
                                : null;

                            return (
                              <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                <div className="text-sm text-gray-800">
                                  <div className="font-semibold">{s.step_order}단계</div>
                                  {processedAt && <div className="text-gray-500 mt-1">{processedAt}</div>}
                                </div>

                                <span
                                  className={`px-2 py-1 text-xs rounded-full ${stateLabel === '완료'
                                    ? 'bg-green-100 text-green-800'
                                    : stateLabel === '반려'
                                      ? 'bg-red-100 text-red-800'
                                      : stateLabel === '진행중'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                >
                                  {stateLabel}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}


      {/* 연장근무 신청 모달 */}
      {showOvertimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">연장근무 신청</h3>
            <p className="text-xs text-gray-500 mb-4">
              사전 승인된 시간만 근태표의 "연장근무"에 반영됩니다. 승인된 시간보다 일찍 퇴근하면 실제 퇴근시각까지만 반영돼요.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">근무 일자</label>
                <input
                  type="date"
                  value={overtimeForm.workDate}
                  onChange={(e) => setOvertimeForm({ ...overtimeForm, workDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시작 시각</label>
                  <input
                    type="time"
                    value={overtimeForm.startTime}
                    onChange={(e) => setOvertimeForm({ ...overtimeForm, startTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">종료 시각</label>
                  <input
                    type="time"
                    value={overtimeForm.endTime}
                    onChange={(e) => setOvertimeForm({ ...overtimeForm, endTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                <textarea
                  value={overtimeForm.reason}
                  onChange={(e) => setOvertimeForm({ ...overtimeForm, reason: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="연장근무 사유를 입력하세요"
                />
              </div>
            </div>
            <div className="mt-6 flex space-x-2">
              <button
                onClick={submitOvertimeRequest}
                disabled={overtimeSubmitting}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
              >
                {overtimeSubmitting ? '제출 중...' : '신청'}
              </button>
              <button
                onClick={() => setShowOvertimeModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leave;
