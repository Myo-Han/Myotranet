// 연장근무 신청 공용 로직.
// useLeaveRequest.ts와 동일한 패턴(결재라인 포함 신청/수정/삭제)을 연장근무에 맞게 미러링했다.
// 연차와 달리 잔액 차감/정책 개념이 없어 그 부분만 단순화되어 있다.
import { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';

export type OvertimeRequestFormState = {
  workDate: string;
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  reason: string;
};

const DEFAULT_FORM: OvertimeRequestFormState = {
  workDate: '',
  startTime: '18:00',
  endTime: '20:00',
  reason: '',
};

export const todayKeyOt = () => new Date().toISOString().split('T')[0];

const shiftDateStr = (yyyyMMdd: string, deltaDays: number) => {
  const [y, m, d] = yyyyMMdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// ✅ 특정 연장근무 신청이 지금 수정/삭제 가능한 상태인지 (근무일이 아직 지나지 않았는지).
// delete_overtime_request/update_overtime_request RPC와 동일한 기준(work_date >= 오늘).
export const isOvertimeEditable = (workDate: string) => workDate >= todayKeyOt();

export async function deleteOvertimeRequest(overtimeId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('delete_overtime_request', { p_overtime_id: overtimeId });
    if (error) throw error;
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || '삭제 실패' };
  }
}

export function useOvertimeRequest(user: User | null) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<OvertimeRequestFormState>(DEFAULT_FORM);

  const resetForm = () => setForm({ ...DEFAULT_FORM, workDate: todayKeyOt() });

  const canSubmit = useMemo(() => {
    if (!user) return false;
    if (!form.workDate || !form.startTime || !form.endTime) return false;
    if (!form.reason.trim()) return false;
    return true;
  }, [user, form]);

  const buildIsoRange = () => {
    let endDateStr = form.workDate;
    if (form.endTime <= form.startTime) {
      endDateStr = shiftDateStr(form.workDate, 1);
    }
    const startIso = `${form.workDate}T${form.startTime}:00`;
    const endIso = `${endDateStr}T${form.endTime}:00`;
    return { startIso, endIso };
  };

  const submit = async (customApprovals?: {
    approverIds?: string[];
    notifyIds?: string[];
    ccIds?: string[];
  }): Promise<boolean> => {
    if (!user) return false;
    setError('');
    setSuccess('');

    if (!form.workDate || !form.startTime || !form.endTime) {
      setError('날짜와 시간을 모두 입력해주세요');
      return false;
    }
    if (!form.reason.trim()) {
      setError('사유를 입력해주세요');
      return false;
    }

    setSubmitting(true);
    try {
      const { startIso, endIso } = buildIsoRange();

      const { data: inserted, error: insertError } = await supabase
        .from('overtime_requests')
        .insert({
          user_id: user.id,
          work_date: form.workDate,
          requested_start_at: startIso,
          requested_end_at: endIso,
          reason: form.reason,
          status: 'pending',
          requester_project: (user as any).project ?? null,
          requester_part: (user as any).part ?? null,
          requester_department: (user as any).department ?? null,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      let noMatchingLine = false;
      try {
        const { data: approvalResult, error: approvalError } = await supabase.rpc('initiate_overtime_approval', {
          p_overtime_id: inserted!.id,
        });
        if (approvalError) throw approvalError;
        noMatchingLine = (approvalResult as any)?.reason === 'no_matching_line_custom_only';
      } catch {
        noMatchingLine = true;
      }

      const hasCustom =
        (customApprovals?.approverIds && customApprovals.approverIds.length > 0) ||
        (customApprovals?.notifyIds && customApprovals.notifyIds.length > 0) ||
        (customApprovals?.ccIds && customApprovals.ccIds.length > 0);
      if (hasCustom) {
        try {
          const { error: customError } = await supabase.rpc('add_overtime_custom_approvers', {
            p_overtime_id: inserted!.id,
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
          ? '연장근무 신청이 제출되었습니다. (단, 결재자를 지정하지 않으면 결재 대기열에 표시되지 않습니다)'
          : '연장근무 신청이 제출되었습니다.'
      );
      resetForm();
      setTimeout(() => setSuccess(''), noMatchingLine ? 6000 : 3000);
      return true;
    } catch (e: any) {
      setError(e.message || '연장근무 신청 실패');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const loadForEdit = async (
    overtimeId: string
  ): Promise<{ ok: boolean; error?: string; approverUserIds?: string[]; ccUserIds?: string[] }> => {
    if (!user) return { ok: false, error: '로그인이 필요합니다' };

    try {
      const { data: ot, error: otErr } = await supabase
        .from('overtime_requests')
        .select('*')
        .eq('id', overtimeId)
        .maybeSingle();

      if (otErr) throw otErr;
      if (!ot) return { ok: false, error: '연장근무 신청을 찾을 수 없습니다' };
      if (ot.user_id !== user.id && user.role !== 'Admin') {
        return { ok: false, error: '본인이 신청한 건만 수정할 수 있습니다' };
      }
      if (!isOvertimeEditable(ot.work_date)) {
        return { ok: false, error: '이미 지난 연장근무 신청은 수정할 수 없습니다' };
      }

      const startD = new Date(ot.requested_start_at);
      const endD = new Date(ot.requested_end_at);
      const pad = (n: number) => String(n).padStart(2, '0');

      setForm({
        workDate: ot.work_date,
        startTime: `${pad(startD.getHours())}:${pad(startD.getMinutes())}`,
        endTime: `${pad(endD.getHours())}:${pad(endD.getMinutes())}`,
        reason: ot.reason || '',
      });

      let approverUserIds: string[] = [];
      let ccUserIds: string[] = [];

      const { data: approval } = await supabase
        .from('overtime_approvals')
        .select('id')
        .eq('overtime_id', overtimeId)
        .maybeSingle();

      if (approval?.id) {
        const { data: steps } = await supabase
          .from('overtime_approval_custom_steps')
          .select('approver_user_id, step_order')
          .eq('overtime_approval_id', approval.id)
          .order('step_order', { ascending: true });
        approverUserIds = ((steps || []) as any[]).map((s) => s.approver_user_id);
      }

      const { data: notifyRows } = await supabase
        .from('overtime_notify_recipients')
        .select('user_id, notify_type')
        .eq('overtime_id', overtimeId);
      ccUserIds = ((notifyRows || []) as any[])
        .filter((r) => r.notify_type === 'cc')
        .map((r) => r.user_id);

      return { ok: true, approverUserIds, ccUserIds };
    } catch (e: any) {
      return { ok: false, error: e?.message || '연장근무 신청 로딩 실패' };
    }
  };

  const updateExisting = async (
    overtimeId: string,
    customApprovals?: { approverIds?: string[]; notifyIds?: string[]; ccIds?: string[] }
  ): Promise<boolean> => {
    if (!user) return false;
    setError('');
    setSuccess('');

    if (!form.workDate || !form.startTime || !form.endTime) {
      setError('날짜와 시간을 모두 입력해주세요');
      return false;
    }
    if (!form.reason.trim()) {
      setError('사유를 입력해주세요');
      return false;
    }

    setSubmitting(true);
    try {
      const { startIso, endIso } = buildIsoRange();

      const { error: rpcErr } = await supabase.rpc('update_overtime_request', {
        p_overtime_id: overtimeId,
        p_work_date: form.workDate,
        p_requested_start_at: startIso,
        p_requested_end_at: endIso,
        p_reason: form.reason,
        p_approver_user_ids: customApprovals?.approverIds && customApprovals.approverIds.length > 0 ? customApprovals.approverIds : null,
        p_notify_user_ids: customApprovals?.notifyIds && customApprovals.notifyIds.length > 0 ? customApprovals.notifyIds : null,
        p_cc_user_ids: customApprovals?.ccIds && customApprovals.ccIds.length > 0 ? customApprovals.ccIds : null,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('연장근무 신청이 수정되었습니다. 결재가 처음 단계부터 다시 진행됩니다.');
      return true;
    } catch (e: any) {
      setError(e.message || '수정 실패');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form,
    setForm,
    submitting,
    error,
    success,
    canSubmit,
    submit,
    loadForEdit,
    updateExisting,
    resetForm,
    setError,
    setSuccess,
  };
}
