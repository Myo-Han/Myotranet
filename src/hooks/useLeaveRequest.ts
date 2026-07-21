// 휴가 신청(연차/반차/반반차) 공용 로직.
// 기존에는 Leave.tsx와 LeaveRequestForm.tsx에 거의 동일한 신청 로직이 중복 구현되어 있었고,
// 그 과정에서 반차 오전/오후 선택값이 DB에 저장되지 않는 버그, 잔액 초과 검증 부재 등이
// 두 파일에 각각 따로 존재했다. 이 훅으로 로직을 한 곳에 모아서 재사용한다.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';

export type LeavePolicyLite = {
  id?: string;
  policy_code: string;
  policy_name: string;
  enabled: boolean;
  config: any;
};

export type LeaveRequestFormState = {
  leaveType: string; // leave_policies.policy_code: 'annual' | 'half_day' | 'quarter_day' 등
  startDate: string;
  endDate: string;
  halfDayPeriod: 'am' | 'pm';
  quarterStartTime: string; // 'HH:MM'
  reason: string;
};

const DEFAULT_FORM: LeaveRequestFormState = {
  leaveType: 'annual',
  startDate: '',
  endDate: '',
  halfDayPeriod: 'am',
  quarterStartTime: '09:00',
  reason: '',
};

export const todayKey = () => new Date().toISOString().split('T')[0];

// ✅ 내가 올린 휴가 신청 삭제. delete_leave_request RPC가 소유권/수정 가능 여부(시작일이
// 아직 지나지 않았는지)를 서버에서 검증하고, 이미 승인 완료된 건이면 차감된 잔액도 복구한다.
// 캘린더에 이미 등록된 일정이 있었다면 RPC가 그 이벤트 id를 돌려주고, 여기서 별도 API로
// 구글 캘린더 일정도 함께 취소한다.
export async function deleteLeaveRequest(leaveId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('delete_leave_request', { p_leave_id: leaveId });
    if (error) throw error;

    const calendarEventId = (data as any)?.calendar_event_id;
    if (calendarEventId) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        await fetch('/api/calendar/delete-leave-event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ eventId: calendarEventId }),
        });
      } catch (calErr) {
        console.warn('캘린더 일정 삭제 실패 (휴가 삭제 자체는 완료됨):', calErr);
      }
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || '삭제 실패' };
  }
}

// ✅ 특정 휴가 신청이 지금 수정/삭제 가능한 상태인지 (시작일이 아직 지나지 않았는지) 판단.
// delete_leave_request/update_leave_request RPC와 동일한 기준(start_date >= 오늘)을 프론트에서도
// 재사용해서, 버튼을 아예 숨기거나 비활성화할 때 서버와 같은 규칙을 쓰도록 한다.
export const isLeaveEditable = (startDate: string) => startDate >= todayKey();

// 근속 개월 수 계산. DB의 run_leave_accrual()/approve_leave_step() RPC와 동일한 기준을 사용해서
// "연차 잔액을 쓰는지 월차 잔액을 쓰는지"를 프론트에서도 동일하게 판단한다 (1년 미만=월차, 1년 이상=연차).
export function monthsSinceHire(hireDate?: string | null): number | null {
  if (!hireDate) return null;
  const hire = new Date(hireDate);
  if (Number.isNaN(hire.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
  if (now.getDate() < hire.getDate()) months -= 1;
  return Math.max(0, months);
}

export function useLeaveRequest(user: User | null) {
  const [policies, setPolicies] = useState<LeavePolicyLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<LeaveRequestFormState>(DEFAULT_FORM);

  const fetchPolicies = async () => {
    const { data, error: policiesError } = await supabase
      .from('leave_policies')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true });
    if (policiesError) throw policiesError;

    const sorted = ((data || []) as LeavePolicyLite[]).sort(
      (a, b) => (a.config?.deduction_priority ?? 999) - (b.config?.deduction_priority ?? 999)
    );
    setPolicies(sorted);
    return sorted;
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const sorted = await fetchPolicies();
        if (sorted.length && !sorted.find((p) => p.policy_code === form.leaveType)) {
          setForm((prev) => ({ ...prev, leaveType: sorted[0].policy_code }));
        }
      } catch (e: any) {
        setError(e?.message || '휴가 정책 로딩 실패');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAnnual = form.leaveType === 'annual';
  const isHalfDay = form.leaveType === 'half_day';
  const isQuarterDay = form.leaveType === 'quarter_day';

  const daysRequested = useMemo(() => {
    if (isHalfDay) return 0.5;
    if (isQuarterDay) return 0.25;
    if (!form.startDate || !form.endDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (end < start) return 0;
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [form.startDate, form.endDate, isHalfDay, isQuarterDay]);

  // 이 신청이 실제로 차감될 잔액 풀 (근속 1년 미만=월차, 1년 이상=연차) - 신청 유형과 무관하게
  // "현재 잔액을 어느 풀에서 쓰는 사람인지"로 결정된다 (DB 승인 RPC와 동일 규칙).
  const months = monthsSinceHire(user?.hire_date);
  const balancePool: 'annual_leave' | 'monthly_leave' | null = months === null ? null : (months < 12 ? 'monthly_leave' : 'annual_leave');
  const balancePoolLabel = balancePool === 'monthly_leave' ? '월차' : balancePool === 'annual_leave' ? '연차' : '';
  const availableBalance = balancePool === 'monthly_leave'
    ? (user?.monthly_leave_balance ?? 0)
    : balancePool === 'annual_leave'
      ? (user?.annual_leave_balance ?? 0)
      : 0;

  const getPolicyName = (code: string) => policies.find((p) => p.policy_code === code)?.policy_name || code;

  const resetForm = (nextType?: string) => {
    setForm({ ...DEFAULT_FORM, leaveType: nextType || policies[0]?.policy_code || 'annual' });
  };

  const canSubmit = useMemo(() => {
    if (!user) return false;
    if (!form.startDate || !form.reason.trim()) return false;
    if (isAnnual && !form.endDate) return false;
    if (isQuarterDay && !form.quarterStartTime) return false;
    if (daysRequested <= 0) return false;
    if (balancePool === null) return false; // 입사일 미등록 등, 잔액 풀을 판단할 수 없음
    if (daysRequested > availableBalance) return false;
    return true;
  }, [user, form, isAnnual, isQuarterDay, daysRequested, balancePool, availableBalance]);

  const submit = async (customApprovals?: {
    approverIds?: string[];
    notifyIds?: string[];
    ccIds?: string[];
  }): Promise<boolean> => {
    if (!user) return false;
    setError('');
    setSuccess('');

    const start = new Date(form.startDate);
    const end = new Date(isAnnual ? form.endDate : form.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      setError('과거 날짜는 신청할 수 없습니다');
      return false;
    }
    if (end < start) {
      setError('종료일은 시작일보다 이전일 수 없습니다');
      return false;
    }

    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    if (start > twoYearsLater) {
      setError('2년 이내의 날짜만 신청 가능합니다');
      return false;
    }

    if (balancePool === null) {
      setError('입사일 정보가 없어 잔액을 확인할 수 없습니다. 관리자에게 문의하세요.');
      return false;
    }
    if (daysRequested > availableBalance) {
      setError(`${balancePoolLabel} 잔여일수(${availableBalance}일)를 초과했습니다`);
      return false;
    }

    setSubmitting(true);
    try {
      const selectedPolicy = policies.find((p) => p.policy_code === form.leaveType);
      if (!selectedPolicy) {
        setError('선택한 휴가 정책을 찾을 수 없습니다');
        return false;
      }

      let paidDays = 0;
      let unpaidDays = 0;
      if (selectedPolicy.config?.is_paid) {
        paidDays = Math.min(daysRequested, selectedPolicy.config.paid_days ?? daysRequested);
        unpaidDays = Math.max(0, daysRequested - paidDays);
      } else {
        unpaidDays = daysRequested;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('leaves')
        .insert({
          user_id: user.id,
          start_date: form.startDate,
          end_date: isAnnual ? form.endDate : form.startDate,
          type: form.leaveType,
          half_day_period: isHalfDay ? form.halfDayPeriod : null,
          quarter_start_time: isQuarterDay ? `${form.quarterStartTime}:00` : null,
          days_requested: daysRequested,
          paid_days: paidDays,
          unpaid_days: unpaidDays,
          reason: form.reason,
          status: 'pending',
          requester_project: (user as any).project ?? null,
          requester_part: (user as any).part ?? null,
          requester_department: (user as any).department ?? null,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // ✅ 신청 직후 소속에 맞는 결재선을 자동 매칭해서 결재 인스턴스를 생성한다.
      // (결재선이 없으면 신청 자체는 성공하되, 결재 대기열에 뜨지 않는다는 걸 안내)
      let noMatchingLine = false;
      try {
        const { data: approvalResult, error: approvalError } = await supabase.rpc('initiate_leave_approval', {
          p_leave_id: inserted!.id,
        });
        if (approvalError) throw approvalError;
        noMatchingLine = (approvalResult as any)?.created === false && (approvalResult as any)?.reason === 'no_matching_line';
      } catch {
        // 결재 인스턴스 생성 실패는 신청 자체를 막지 않음 (관리자가 결재선 설정 후 재확인 가능)
        noMatchingLine = true;
      }

      // ✅ 신청자가 직접 지정한 결재 순서/통보/참조가 있으면, 자동매칭된 결재선에 "추가로" 덧붙인다.
      // (실패해도 이미 접수된 신청 자체는 그대로 유지 - 콘솔에만 경고를 남김)
      const hasCustom =
        (customApprovals?.approverIds && customApprovals.approverIds.length > 0) ||
        (customApprovals?.notifyIds && customApprovals.notifyIds.length > 0) ||
        (customApprovals?.ccIds && customApprovals.ccIds.length > 0);
      if (hasCustom) {
        try {
          const { error: customError } = await supabase.rpc('add_leave_custom_approvers', {
            p_leave_id: inserted!.id,
            p_approver_user_ids: customApprovals?.approverIds && customApprovals.approverIds.length > 0 ? customApprovals.approverIds : null,
            p_notify_user_ids: customApprovals?.notifyIds && customApprovals.notifyIds.length > 0 ? customApprovals.notifyIds : null,
            p_cc_user_ids: customApprovals?.ccIds && customApprovals.ccIds.length > 0 ? customApprovals.ccIds : null,
          });
          if (customError) throw customError;
        } catch (customErr) {
          console.warn('사용자 지정 결재라인/통보/참조 등록 실패 (신청 자체는 완료됨):', customErr);
        }
      }

      setSuccess(
        noMatchingLine
          ? '휴가 신청이 제출되었습니다. (단, 해당 소속에 설정된 결재선이 없어 결재 대기열에는 표시되지 않습니다. 관리자에게 문의하세요)'
          : '휴가 신청이 제출되었습니다.'
      );
      resetForm();
      setTimeout(() => setSuccess(''), noMatchingLine ? 6000 : 3000);
      return true;
    } catch (e: any) {
      setError(e?.message || '신청 실패');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ 수정 화면 진입 시, 기존 휴가 신청 내용 + 기존에 지정했던 결재라인(결재자)/참조 명단을
  // 불러와서 폼 상태를 채운다. 결재자/참조는 PersonEntry(이름/소속 라벨)로 바로 못 만들고
  // user_id 목록만 반환하므로, 호출한 쪽(LeaveRequestPage)이 이미 불러온 구성원 목록에서
  // 이름/소속을 찾아 PersonEntry를 구성해야 한다 (순서는 step_order 기준 그대로 유지됨).
  const loadForEdit = async (
    leaveId: string
  ): Promise<{ ok: boolean; error?: string; approverUserIds?: string[]; ccUserIds?: string[] }> => {
    if (!user) return { ok: false, error: '로그인이 필요합니다' };

    try {
      const { data: leave, error: leaveErr } = await supabase
        .from('leaves')
        .select('*')
        .eq('id', leaveId)
        .maybeSingle();

      if (leaveErr) throw leaveErr;
      if (!leave) return { ok: false, error: '휴가 신청을 찾을 수 없습니다' };
      if (leave.user_id !== user.id && user.role !== 'Admin') {
        return { ok: false, error: '본인이 신청한 건만 수정할 수 있습니다' };
      }
      if (!isLeaveEditable(leave.start_date)) {
        return { ok: false, error: '이미 시작했거나 지난 휴가는 수정할 수 없습니다' };
      }

      setForm({
        leaveType: leave.type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        halfDayPeriod: (leave.half_day_period as 'am' | 'pm') || 'am',
        quarterStartTime: leave.quarter_start_time ? String(leave.quarter_start_time).slice(0, 5) : '09:00',
        reason: leave.reason || '',
      });

      let approverUserIds: string[] = [];
      let ccUserIds: string[] = [];

      const { data: approval } = await supabase
        .from('leave_approvals')
        .select('id')
        .eq('leave_id', leaveId)
        .maybeSingle();

      if (approval?.id) {
        const { data: steps } = await supabase
          .from('leave_approval_custom_steps')
          .select('approver_user_id, step_order')
          .eq('leave_approval_id', approval.id)
          .order('step_order', { ascending: true });
        approverUserIds = ((steps || []) as any[]).map((s) => s.approver_user_id);
      }

      const { data: notifyRows } = await supabase
        .from('leave_notify_recipients')
        .select('user_id, notify_type')
        .eq('leave_id', leaveId);
      ccUserIds = ((notifyRows || []) as any[])
        .filter((r) => r.notify_type === 'cc')
        .map((r) => r.user_id);

      return { ok: true, approverUserIds, ccUserIds };
    } catch (e: any) {
      return { ok: false, error: e?.message || '휴가 신청 로딩 실패' };
    }
  };

  // ✅ 기존 휴가 신청 수정. update_leave_request RPC가 소유권/수정 가능 여부를 다시 한 번
  // 서버에서 검증하고, 이미 승인 완료된 건이었다면 차감된 잔액을 복구한 뒤 새 일수 기준으로
  // 잔액이 충분한지 재검증한다. 결재라인(결재자/참조)은 여기서 넘긴 목록으로 완전히 재구성되고,
  // 결재는 처음 단계부터 다시 진행된다.
  const updateExisting = async (
    leaveId: string,
    customApprovals?: { approverIds?: string[]; notifyIds?: string[]; ccIds?: string[] }
  ): Promise<boolean> => {
    if (!user) return false;
    setError('');
    setSuccess('');

    const start = new Date(form.startDate);
    const end = new Date(isAnnual ? form.endDate : form.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      setError('과거 날짜로는 수정할 수 없습니다');
      return false;
    }
    if (end < start) {
      setError('종료일은 시작일보다 이전일 수 없습니다');
      return false;
    }

    const twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    if (start > twoYearsLater) {
      setError('2년 이내의 날짜만 신청 가능합니다');
      return false;
    }
    if (!form.reason.trim()) {
      setError('사유를 입력해주세요');
      return false;
    }

    setSubmitting(true);
    try {
      const selectedPolicy = policies.find((p) => p.policy_code === form.leaveType);
      if (!selectedPolicy) {
        setError('선택한 휴가 정책을 찾을 수 없습니다');
        return false;
      }

      let paidDays = 0;
      let unpaidDays = 0;
      if (selectedPolicy.config?.is_paid) {
        paidDays = Math.min(daysRequested, selectedPolicy.config.paid_days ?? daysRequested);
        unpaidDays = Math.max(0, daysRequested - paidDays);
      } else {
        unpaidDays = daysRequested;
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('update_leave_request', {
        p_leave_id: leaveId,
        p_start_date: form.startDate,
        p_end_date: isAnnual ? form.endDate : form.startDate,
        p_type: form.leaveType,
        p_half_day_period: isHalfDay ? form.halfDayPeriod : null,
        p_quarter_start_time: isQuarterDay ? `${form.quarterStartTime}:00` : null,
        p_reason: form.reason,
        p_days_requested: daysRequested,
        p_paid_days: paidDays,
        p_unpaid_days: unpaidDays,
        p_approver_user_ids: customApprovals?.approverIds && customApprovals.approverIds.length > 0 ? customApprovals.approverIds : null,
        p_notify_user_ids: customApprovals?.notifyIds && customApprovals.notifyIds.length > 0 ? customApprovals.notifyIds : null,
        p_cc_user_ids: customApprovals?.ccIds && customApprovals.ccIds.length > 0 ? customApprovals.ccIds : null,
      });
      if (rpcErr) throw rpcErr;

      const calendarEventId = (rpcData as any)?.calendar_event_id;
      if (calendarEventId) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          await fetch('/api/calendar/delete-leave-event', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ eventId: calendarEventId }),
          });
        } catch (calErr) {
          console.warn('캘린더 일정 삭제 실패 (수정 자체는 완료됨):', calErr);
        }
      }

      setSuccess('휴가 신청이 수정되었습니다. 결재가 처음 단계부터 다시 진행됩니다.');
      return true;
    } catch (e: any) {
      setError(e?.message || '수정 실패');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    policies,
    loading,
    submitting,
    error,
    success,
    form,
    setForm,
    isAnnual,
    isHalfDay,
    isQuarterDay,
    daysRequested,
    balancePool,
    balancePoolLabel,
    availableBalance,
    getPolicyName,
    canSubmit,
    submit,
    loadForEdit,
    updateExisting,
    resetForm,
    setError,
    setSuccess,
    refetchPolicies: fetchPolicies,
  };
}
