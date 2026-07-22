// 연차 신청 패널 (근태관리 탭의 "연차 신청" 카테고리).
// 미니멀/컴팩트 스타일로 재정리했고, "연차 신청"/"수정" 버튼을 누르면 페이지 이동 없이
// 같은 영역 안에서 목록 <-> 폼(LeaveRequestFormBody)으로 바로 전환된다.
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { Leave as LeaveType, LeaveBalanceHistory } from '../../types';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';
import { useLeaveRequest, deleteLeaveRequest, isLeaveEditable } from '../../hooks/useLeaveRequest';
import { getRevisionStatusLabel } from '../../utils/attendanceLabels';
import LeaveRequestFormBody from './LeaveRequestFormBody';
import Pagination, { paginate } from './Pagination';

// ✅ leave_balance_history.policy_code는 "휴가 신청 유형"(annual/half_day/quarter_day)이 아니라
// 실제로 증감된 "잔액 풀"(annual_leave=연차 잔액 / monthly_leave=월차 잔액)을 가리킨다.
const POOL_LABEL: Record<string, string> = {
  annual_leave: '연차(잔액)',
  monthly_leave: '월차(잔액)',
};
const getPoolLabel = (code: string) => POOL_LABEL[code] || code;

type TeamLeaveRow = LeaveType & {
  requester?: { name: string } | null;
};

const CardHeading: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div className="px-4 py-3 border-b border-gray-100">
    <h2 className="text-sm font-medium text-gray-900">{children}</h2>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const LeaveAnnualPanel: React.FC = () => {
  const { user } = useAuth();
  const lr = useLeaveRequest(user);

  // ✅ 목록 화면 <-> 신청/수정 폼 화면 전환 (페이지 이동 없이 같은 영역 안에서 바뀜)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editLeaveId, setEditLeaveId] = useState<string | null>(null);

  const [leaves, setLeaves] = useState<LeaveType[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<TeamLeaveRow[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<LeaveBalanceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  // ✅ 테이블 페이지네이션 (5개씩 + 이전/다음/번호)
  const [historyPage, setHistoryPage] = useState(1);
  const [myLeavePage, setMyLeavePage] = useState(1);
  const [teamLeavePage, setTeamLeavePage] = useState(1);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      await fetchLeaves();
      await fetchTeamLeaves();
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

      if (historyFilter.policyCode !== 'all') {
        query = query.eq('policy_code', historyFilter.policyCode);
      }

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
      setHistoryPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilter, user]);

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

  const openNewForm = () => {
    setEditLeaveId(null);
    setViewMode('form');
  };

  const handleEditLeave = (leave: LeaveType) => {
    setDetailOpen(false);
    setEditLeaveId(leave.id);
    setViewMode('form');
  };

  const closeForm = () => {
    setViewMode('list');
    setEditLeaveId(null);
    fetchLeaves();
    fetchBalanceHistory();
    setMyLeavePage(1);
    setHistoryPage(1);
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

      // ✅ 이 조직은 approval_lines 템플릿이 없어 approval_line_id가 null인 경우가 대부분이다.
      // 템플릿이 없으면 사용자 지정 결재라인(leave_approval_custom_steps)을 대신 조회한다.
      if ((approval as any).approval_line_id) {
        const { data: steps, error: stepsErr } = await supabase
          .from('approval_line_steps')
          .select('*')
          .eq('approval_line_id', (approval as any).approval_line_id)
          .order('step_order', { ascending: true });

        if (stepsErr) throw stepsErr;
        setDetailSteps((steps || []) as any);
      } else {
        const { data: customSteps, error: customStepsErr } = await supabase
          .from('leave_approval_custom_steps')
          .select('*')
          .eq('leave_approval_id', (approval as any).id)
          .order('step_order', { ascending: true });

        if (customStepsErr) throw customStepsErr;
        setDetailSteps(
          ((customSteps || []) as any[]).map((s) => ({
            id: s.id,
            approval_line_id: '',
            step_order: s.step_order,
            required: true,
            assignee_user_id: s.approver_user_id,
            assignee_role: null,
            assignee_position: null,
            assignee_project_code: null,
            assignee_part_code: null,
            assignee_department_code: null,
          })) as any,
        );
      }

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

  // ✅ 폼 화면: 신청/수정 모두 같은 영역 안에서 처리
  if (viewMode === 'form') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-900">{editLeaveId ? '연차 신청 수정' : '새 연차 신청'}</h2>
          <button
            type="button"
            onClick={closeForm}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            목록으로
          </button>
        </div>
        <LeaveRequestFormBody leaveId={editLeaveId ?? undefined} onDone={closeForm} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={openNewForm}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700"
        >
          연차 신청
        </button>
      </div>

      {/* 잔여 연차 + 올해 휴가 통계를 한 줄의 컴팩트한 지표로 통합 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
          <div className="text-xs text-gray-500 mb-1">잔여 연차</div>
          <div className="text-lg font-medium text-blue-600">{totalLeaveBalance}일</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
          <div className="text-xs text-gray-500 mb-1">총 발생</div>
          <div className="text-lg font-medium text-green-600">{stats.totalAccrual}일</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
          <div className="text-xs text-gray-500 mb-1">총 사용</div>
          <div className="text-lg font-medium text-orange-600">{stats.totalUsed}일</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2.5">
          <div className="text-xs text-gray-500 mb-1">총 소멸</div>
          <div className="text-lg font-medium text-red-600">{stats.totalExpired}일</div>
        </div>
      </div>
      <p className="text-xs text-gray-400 -mt-2">연차·월차 잔여일수를 합산한 값입니다. 본인만 확인할 수 있어요.</p>

      {/* 휴가 증감 이력 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-sm font-medium text-gray-900">휴가 증감 이력</h2>
          <div className="flex gap-1.5">
            <select
              value={historyFilter.period}
              onChange={(e) => setHistoryFilter({ ...historyFilter, period: e.target.value })}
              className="text-xs border border-gray-300 rounded px-1.5 py-1"
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
              className="text-xs border border-gray-300 rounded px-1.5 py-1"
            >
              <option value="all">전체 휴가</option>
              <option value="annual_leave">{POOL_LABEL.annual_leave}</option>
              <option value="monthly_leave">{POOL_LABEL.monthly_leave}</option>
            </select>

            <select
              value={historyFilter.changeType}
              onChange={(e) => setHistoryFilter({ ...historyFilter, changeType: e.target.value })}
              className="text-xs border border-gray-300 rounded px-1.5 py-1"
            >
              <option value="all">전체 유형</option>
              <option value="accrual">발생만</option>
              <option value="used">사용만</option>
              <option value="expired">소멸만</option>
              <option value="manual_add">수동지급</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">날짜</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">휴가 종류</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">변동 유형</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">변동량</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">변동 후 잔액</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">사유</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginate(balanceHistory, historyPage).map((history) => (
                <tr key={history.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {new Date(history.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {getPoolLabel(history.policy_code)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`px-1.5 py-0.5 text-xs rounded ${history.change_type === 'accrual' || history.change_type === 'manual_add'
                        ? 'bg-green-50 text-green-700'
                        : history.change_type === 'used'
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-red-50 text-red-700'
                        }`}
                    >
                      {getChangeTypeLabel(history.change_type)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                    <span
                      className={`font-medium ${history.change_amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                    >
                      {history.change_amount > 0 ? '+' : ''}
                      {history.change_amount}일
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {['annual_leave', 'monthly_leave'].includes(history.policy_code)
                      ? `${history.balance_after}일`
                      : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{history.reason || '-'}</td>
                </tr>
              ))}
              {balanceHistory.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-400">
                    증감 이력이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={historyPage} totalCount={balanceHistory.length} onChange={setHistoryPage} />
      </div>

      {/* 나의 휴가 신청 내역 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <CardHeading>나의 휴가 신청 내역</CardHeading>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">신청일자</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">시작일</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">종료일</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">유형</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">일수</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">사유</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginate(leaves, myLeavePage).map((leave) => (
                <tr
                  key={leave.id}
                  onClick={() => openApprovalDetail(leave)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {new Date(((leave as any).created_at || leave.start_date) as string).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {new Date(leave.start_date).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {new Date(leave.end_date).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {lr.getPolicyName(leave.type)}
                    {leave.type === 'half_day' && leave.half_day_period && (
                      <span className="text-gray-400 ml-1">({leave.half_day_period === 'am' ? '오전' : '오후'})</span>
                    )}
                    {leave.type === 'quarter_day' && leave.quarter_start_time && (
                      <span className="text-gray-400 ml-1">({leave.quarter_start_time.slice(0, 5)}~)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {leave.days_requested}일
                    {leave.paid_days > 0 && (
                      <span className="text-xs text-green-600 ml-1">(유급 {leave.paid_days}일)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{leave.reason}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={`px-1.5 py-0.5 text-xs rounded ${leave.status === 'approved'
                        ? 'bg-green-50 text-green-700'
                        : leave.status === 'rejected'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-yellow-50 text-yellow-700'
                        }`}
                    >
                      {leave.status === 'approved' ? '승인' : leave.status === 'rejected' ? '반려' : '대기'}
                    </span>
                  </td>
                </tr>
              ))}
              {leaves.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-gray-400">
                    신청 내역이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={myLeavePage} totalCount={leaves.length} onChange={setMyLeavePage} />
      </div>

      {/* 팀원 휴가 신청 현황 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <CardHeading sub="같은 프로젝트 소속 팀원들의 휴가 신청 내역입니다. (잔여 연차는 본인만 볼 수 있어요)">
          팀원 휴가 신청 현황
        </CardHeading>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">신청자</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">기간</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">유형</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">사유</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {paginate(teamLeaves, teamLeavePage).map((leave) => {
                const { label, colorClass } = getRevisionStatusLabel(leave.status);
                return (
                  <tr key={leave.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{leave.requester?.name || '-'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                      {new Date(leave.start_date).toLocaleDateString('ko-KR')} ~ {new Date(leave.end_date).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{lr.getPolicyName(leave.type)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{leave.reason || '-'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 text-xs rounded ${colorClass}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
              {teamLeaves.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-gray-400">
                    같은 프로젝트 팀원의 휴가 신청 내역이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={teamLeavePage} totalCount={teamLeaves.length} onChange={setTeamLeavePage} />
      </div>

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
              <h3 className="text-lg font-medium">결재 진행 현황</h3>
              <div className="flex items-center gap-2">
                {detailLeave && isLeaveEditable(detailLeave.start_date) && (
                  <>
                    <button
                      onClick={() => handleEditLeave(detailLeave)}
                      disabled={deletingLeave}
                      className="px-3 py-1 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteLeave(detailLeave)}
                      disabled={deletingLeave}
                      className="px-3 py-1 text-sm bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                    >
                      {deletingLeave ? '삭제 중...' : '삭제'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDetailOpen(false)}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  닫기
                </button>
              </div>
            </div>

            {detailLeave && !isLeaveEditable(detailLeave.start_date) && (
              <p className="text-xs text-gray-400 mb-3">이미 시작했거나 지난 휴가는 수정/삭제할 수 없습니다.</p>
            )}

            {detailLoading && (
              <div className="py-6 text-center text-sm text-gray-600">로딩중</div>
            )}

            {!detailLoading && detailError && (
              <div className="py-3 text-red-600 text-sm">{detailError}</div>
            )}

            {!detailLoading && !detailError && !detailApproval && (
              <div className="py-6 text-center text-sm text-gray-600">결재 인스턴스가 없습니다</div>
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
                          <div className="font-medium">반려 사유</div>
                          <div className="mt-1">{lastRejected.notes}</div>
                        </div>
                      )}

                      <div className="border border-gray-200 rounded-md overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">단계</div>
                        <div className="divide-y divide-gray-100">
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
                                  <div className="font-medium">{s.step_order}단계</div>
                                  {processedAt && <div className="text-xs text-gray-500 mt-1">{processedAt}</div>}
                                </div>

                                <span
                                  className={`px-2 py-0.5 text-xs rounded-full ${stateLabel === '완료'
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
    </div>
  );
};

export default LeaveAnnualPanel;
