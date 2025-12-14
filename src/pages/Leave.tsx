import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Leave as LeaveType, LeaveBalanceHistory } from '../types';
import { LeavePolicy } from '../components/LeavePolicyManager';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';

const Leave: React.FC = () => {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<LeaveType[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<LeaveBalanceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);

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

  // 필터 상태
  const [historyFilter, setHistoryFilter] = useState({
    period: '1month',
    policyCode: 'all',
    changeType: 'all',
  });

  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'annual_leave',
    halfDayPeriod: 'am', // 오전/오후
    daysRequested: 1,
    reason: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 정책 목록 가져오기
      const { data: policiesData, error: policiesError } = await supabase
        .from('leave_policies')
        .select('*')
        .eq('enabled', true)
        .order('created_at', { ascending: true });

      if (policiesError) throw policiesError;

      const sortedPolicies = (policiesData || []).sort((a, b) =>
        (a.config.deduction_priority || 999) - (b.config.deduction_priority || 999)
      );
      setPolicies(sortedPolicies);

      // 휴가 신청 내역 가져오기
      await fetchLeaves();

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
  }, [historyFilter, user]);

  const calculateDays = (startDate: string, endDate: string, leaveType: string) => {
    if (!startDate || !endDate) return 0;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 날짜 검증
    if (end < start) {
      return 0;
    }

    // 반차는 무조건 0.5일
    if (leaveType === 'half_day') {
      return 0.5;
    }

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // startDate, endDate, leaveType 변경 시에만 일수 재계산
  useEffect(() => {
    const days = calculateDays(form.startDate, form.endDate, form.leaveType);
    setForm(prev => ({ ...prev, daysRequested: days }));
  }, [form.startDate, form.endDate, form.leaveType]);

  const submitLeaveRequest = async () => {
    if (!user || !form.startDate || !form.endDate || !form.reason) {
      setError('모든 필드를 입력해주세요');
      return;
    }

    // 날짜 검증
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      setError('과거 날짜는 신청할 수 없습니다');
      return;
    }

    if (end < start) {
      setError('종료일은 시작일보다 이전일 수 없습니다');
      return;
    }

    // 너무 먼 미래 방지 (2년 이내)
    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    if (start > twoYearsLater) {
      setError('2년 이내의 날짜만 신청 가능합니다');
      return;
    }

    try {
      // 선택한 정책 찾기
      const selectedPolicy = policies.find(p => p.policy_code === form.leaveType);
      if (!selectedPolicy) {
        setError('선택한 휴가 정책을 찾을 수 없습니다');
        return;
      }

      // paid_days, unpaid_days 계산
      let paidDays = 0;
      let unpaidDays = 0;

      if (selectedPolicy.config.is_paid) {
        paidDays = Math.min(form.daysRequested, selectedPolicy.config.paid_days || 0);
        unpaidDays = Math.max(0, form.daysRequested - paidDays);
      } else {
        unpaidDays = form.daysRequested;
      }

      const { error } = await supabase.from('leaves').insert({
        user_id: user.id,
        start_date: form.startDate,
        end_date: form.endDate,
        type: form.leaveType,
        days_requested: form.daysRequested,
        paid_days: paidDays,
        unpaid_days: unpaidDays,
        reason: form.reason,
        status: 'pending',

        // ✅ 신청 당시 소속 스냅샷 저장 (결재 매칭/목록 표시용)
        requester_project: (user as any).project ?? null,
        requester_part: (user as any).part ?? null,
        requester_department: (user as any).department ?? null,
      });

      if (error) throw error;

      setSuccess('휴가 신청이 제출되었습니다');
      setShowModal(false);
      setForm({
        startDate: '',
        endDate: '',
        leaveType: 'annual_leave',
        halfDayPeriod: 'am',
        daysRequested: 1,
        reason: '',
      });
      fetchLeaves();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '신청 실패');
    }
  };

  const getPolicyName = (policyCode: string) => {
    const policy = policies.find(p => p.policy_code === policyCode);
    return policy?.policy_name || policyCode;
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

  const openApprovalDetail = async (leave: LeaveType) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailApproval(null);
    setDetailSteps([]);
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

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* 휴가 잔액 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-700">연차 잔여</h2>
            <div className="text-3xl font-bold text-blue-600">{user?.annual_leave_balance || 0}일</div>
          </div>
          <p className="text-sm text-gray-500">근속 1년 이상 직원 대상</p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-700">월차 잔여</h2>
            <div className="text-3xl font-bold text-green-600">{user?.monthly_leave_balance || 0}일</div>
          </div>
          <p className="text-sm text-gray-500">근속 1년 미만 직원 대상</p>
        </div>
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
                {policies
                  .filter(p => ['annual_leave', 'monthly_leave'].includes(p.policy_code))
                  .map(p => (
                    <option key={p.policy_code} value={p.policy_code}>
                      {p.policy_name}
                    </option>
                  ))}
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
                    {getPolicyName(history.policy_code)}
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

      {/* 휴가 신청 내역 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">휴가 신청 내역</h2>
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
                    {getPolicyName(leave.type)}
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
              <button
                onClick={() => setDetailOpen(false)}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                닫기
              </button>
            </div>

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

      {/* 휴가 신청 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">휴가 신청</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">휴가 유형</label>
                <select
                  value={form.leaveType}
                  onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {policies.map((policy) => (
                    <option key={policy.policy_code} value={policy.policy_code}>
                      {policy.policy_name}
                      {policy.config.is_paid && ` (유급 ${policy.config.paid_days}일)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              {form.leaveType !== 'half_day' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    min={form.startDate || new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              )}

              {form.leaveType === 'half_day' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">반차 구분</label>
                  <select
                    value={form.halfDayPeriod}
                    onChange={(e) => setForm({ ...form, halfDayPeriod: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="am">오전 반차</option>
                    <option value="pm">오후 반차</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">일수</label>
                <input
                  type="number"
                  value={form.daysRequested}
                  readOnly
                  className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="휴가 사유를 입력하세요"
                />
              </div>
            </div>

            <div className="mt-6 flex space-x-2">
              <button
                onClick={submitLeaveRequest}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                신청
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setForm({
                    startDate: '',
                    endDate: '',
                    leaveType: 'annual_leave',
                    halfDayPeriod: 'am',
                    daysRequested: 1,
                    reason: '',
                  });
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          휴가 신청
        </button>
      </div>
    </div>
  );
};

export default Leave;