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

  const submit = async (): Promise<boolean> => {
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
    resetForm,
    setError,
    setSuccess,
    refetchPolicies: fetchPolicies,
  };
}
