// 업무 > 전자결재 > 휴가신청
// 휴가관리(Leave.tsx) 탭에 있는 신청 로직과 동일한 방식으로 신청서를 제출합니다.
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';

type LeavePolicy = {
  policy_code: string;
  policy_name: string;
  enabled: boolean;
  config: any;
};

type MyLeaveRow = {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  created_at: string;
};

const todayKey = () => new Date().toISOString().split('T')[0];

const STATUS_LABEL: Record<string, string> = {
  pending: '대기중',
  approved: '승인됨',
  rejected: '반려됨',
};

const LeaveRequestForm: React.FC = () => {
  const { user } = useAuth();

  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [myLeaves, setMyLeaves] = useState<MyLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'annual_leave',
    halfDayPeriod: 'am',
    daysRequested: 1,
    reason: '',
  });

  const fetchPolicies = async () => {
    const { data, error: policiesError } = await supabase
      .from('leave_policies')
      .select('*')
      .eq('enabled', true)
      .order('created_at', { ascending: true });
    if (policiesError) throw policiesError;

    const sorted = (data || []).sort(
      (a: any, b: any) => (a.config.deduction_priority || 999) - (b.config.deduction_priority || 999)
    );
    setPolicies(sorted as LeavePolicy[]);
    if (sorted.length && !sorted.find((p: any) => p.policy_code === form.leaveType)) {
      setForm((prev) => ({ ...prev, leaveType: sorted[0].policy_code }));
    }
  };

  const fetchMyLeaves = async () => {
    if (!user) return;
    const { data, error: leavesError } = await supabase
      .from('leaves')
      .select('id, type, start_date, end_date, days_requested, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (leavesError) throw leavesError;
    setMyLeaves((data || []) as MyLeaveRow[]);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await fetchPolicies();
        await fetchMyLeaves();
      } catch (e: any) {
        setError(e?.message || '데이터 로딩 실패');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const calculateDays = (startDate: string, endDate: string, leaveType: string) => {
    if (leaveType === 'half_day') return 0.5;
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  useEffect(() => {
    const days = calculateDays(form.startDate, form.endDate, form.leaveType);
    setForm((prev) => ({ ...prev, daysRequested: days }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.startDate, form.endDate, form.leaveType]);

  const getPolicyName = (code: string) => {
    const p = policies.find((x) => x.policy_code === code);
    return p?.policy_name || code;
  };

  const canSubmit = useMemo(() => {
    if (!user) return false;
    if (!form.startDate || !form.reason.trim()) return false;
    if (form.leaveType !== 'half_day' && !form.endDate) return false;
    if (form.daysRequested <= 0) return false;
    return true;
  }, [user, form]);

  const handleSubmit = async () => {
    if (!user) return;
    setError('');
    setSuccess('');

    const start = new Date(form.startDate);
    const end = new Date(form.leaveType === 'half_day' ? form.startDate : form.endDate);
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

    setSubmitting(true);
    try {
      const selectedPolicy = policies.find((p) => p.policy_code === form.leaveType);
      if (!selectedPolicy) {
        setError('선택한 휴가 정책을 찾을 수 없습니다');
        return;
      }

      let paidDays = 0;
      let unpaidDays = 0;
      if (selectedPolicy.config.is_paid) {
        paidDays = Math.min(form.daysRequested, selectedPolicy.config.paid_days || 0);
        unpaidDays = Math.max(0, form.daysRequested - paidDays);
      } else {
        unpaidDays = form.daysRequested;
      }

      const { error: insertError } = await supabase.from('leaves').insert({
        user_id: user.id,
        start_date: form.startDate,
        end_date: form.leaveType === 'half_day' ? form.startDate : form.endDate,
        type: form.leaveType,
        days_requested: form.daysRequested,
        paid_days: paidDays,
        unpaid_days: unpaidDays,
        reason: form.reason,
        status: 'pending',
        requester_project: (user as any).project ?? null,
        requester_part: (user as any).part ?? null,
        requester_department: (user as any).department ?? null,
      });

      if (insertError) throw insertError;

      setSuccess('휴가 신청이 제출되었습니다.');
      setForm({
        startDate: '',
        endDate: '',
        leaveType: policies[0]?.policy_code || 'annual_leave',
        halfDayPeriod: 'am',
        daysRequested: 1,
        reason: '',
      });
      await fetchMyLeaves();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e?.message || '신청 실패');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return <ErrorMessage message="로그인이 필요합니다." />;
  if (loading) return <Loading />;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">휴가 신청</h1>
        <p className="text-sm text-gray-600 mt-1">휴가 유형과 기간을 선택하고 사유를 입력해 신청하세요.</p>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="bg-white shadow rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">휴가 유형</label>
          {policies.length === 0 ? (
            <p className="text-sm text-red-600">사용 가능한 휴가 정책이 없습니다. 관리자에게 문의하세요.</p>
          ) : (
            <select
              value={form.leaveType}
              onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              {policies.map((policy) => (
                <option key={policy.policy_code} value={policy.policy_code}>
                  {policy.policy_name}
                  {policy.config?.is_paid && ` (유급 ${policy.config.paid_days}일)`}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            min={todayKey()}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>

        {form.leaveType !== 'half_day' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              min={form.startDate || todayKey()}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        ) : (
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

        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >
          {submitting ? '제출 중...' : '신청'}
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3">최근 신청 내역</h2>
        {myLeaves.length === 0 ? (
          <p className="text-sm text-gray-500">신청 내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">유형</th>
                <th className="py-2">기간</th>
                <th className="py-2">일수</th>
                <th className="py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {myLeaves.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2">{getPolicyName(l.type)}</td>
                  <td className="py-2">{l.start_date} ~ {l.end_date}</td>
                  <td className="py-2">{l.days_requested}</td>
                  <td className="py-2">{STATUS_LABEL[l.status] || l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LeaveRequestForm;
