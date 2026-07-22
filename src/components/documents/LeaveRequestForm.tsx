// 업무 > 전자결재 > 휴가신청
// 휴가관리(Leave.tsx) 탭과 동일한 공용 훅(useLeaveRequest)으로 신청서를 제출합니다.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';
import { useLeaveRequest, todayKey } from '../../hooks/useLeaveRequest';

type MyLeaveRow = {
  id: string;
  type: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: '대기중',
  approved: '승인됨',
  rejected: '반려됨',
};

const LEAVE_TYPE_HINT: Record<string, string> = {
  annual: '시작일과 종료일을 선택하세요.',
  half_day: '반차를 사용할 날짜와 오전/오후를 선택하세요.',
  quarter_day: '반반차를 사용할 날짜와 시작 시각을 선택하세요.',
};

const LeaveRequestForm: React.FC = () => {
  const { user } = useAuth();
  const lr = useLeaveRequest(user);

  const [myLeaves, setMyLeaves] = useState<MyLeaveRow[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(true);

  const fetchMyLeaves = async () => {
    if (!user) return;
    const { data, error: leavesError } = await supabase
      .from('leaves')
      .select('id, type, start_date, end_date, days_requested, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (leavesError) return;
    setMyLeaves((data || []) as MyLeaveRow[]);
  };

  useEffect(() => {
    const load = async () => {
      setLeavesLoading(true);
      await fetchMyLeaves();
      setLeavesLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSubmit = async () => {
    const ok = await lr.submit();
    if (ok) await fetchMyLeaves();
  };

  if (!user) return <ErrorMessage message="로그인이 필요합니다." />;
  if (lr.loading || leavesLoading) return <Loading />;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-sm font-medium text-gray-900">휴가 신청</h1>
        <p className="text-xs text-gray-500 mt-1">휴가 유형과 기간을 선택하고 사유를 입력해 신청하세요.</p>
      </div>

      {lr.error && <ErrorMessage message={lr.error} />}
      {lr.success && <SuccessMessage message={lr.success} />}

      <div className="bg-white border border-gray-200 rounded-md p-4 space-y-4">
        {lr.balancePoolLabel && (
          <div className="text-xs bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-blue-800">
            현재 {lr.balancePoolLabel} 잔여일수: <span className="font-semibold">{lr.availableBalance}일</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">휴가 유형</label>
          {lr.policies.length === 0 ? (
            <p className="text-xs text-red-600">사용 가능한 휴가 정책이 없습니다. 관리자에게 문의하세요.</p>
          ) : (
            <select
              value={lr.form.leaveType}
              onChange={(e) => lr.setForm({ ...lr.form, leaveType: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs"
            >
              {lr.policies.map((policy) => (
                <option key={policy.policy_code} value={policy.policy_code}>
                  {policy.policy_name}
                </option>
              ))}
            </select>
          )}
          {LEAVE_TYPE_HINT[lr.form.leaveType] && (
            <p className="text-xs text-gray-400 mt-1">{LEAVE_TYPE_HINT[lr.form.leaveType]}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {lr.isAnnual ? '시작일' : '사용일'}
          </label>
          <input
            type="date"
            value={lr.form.startDate}
            onChange={(e) => lr.setForm({ ...lr.form, startDate: e.target.value })}
            min={todayKey()}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs"
          />
        </div>

        {lr.isAnnual && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">종료일</label>
            <input
              type="date"
              value={lr.form.endDate}
              onChange={(e) => lr.setForm({ ...lr.form, endDate: e.target.value })}
              min={lr.form.startDate || todayKey()}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs"
            />
          </div>
        )}

        {lr.isHalfDay && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">반차 구분</label>
            <select
              value={lr.form.halfDayPeriod}
              onChange={(e) => lr.setForm({ ...lr.form, halfDayPeriod: e.target.value as 'am' | 'pm' })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs"
            >
              <option value="am">오전 반차</option>
              <option value="pm">오후 반차</option>
            </select>
          </div>
        )}

        {lr.isQuarterDay && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">시작 시각</label>
            <input
              type="time"
              value={lr.form.quarterStartTime}
              onChange={(e) => lr.setForm({ ...lr.form, quarterStartTime: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">일수</label>
          <input
            type="number"
            value={lr.daysRequested}
            readOnly
            className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">사유</label>
          <textarea
            value={lr.form.reason}
            onChange={(e) => lr.setForm({ ...lr.form, reason: e.target.value })}
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs"
            placeholder="휴가 사유를 입력하세요"
          />
        </div>

        <button
          type="button"
          disabled={!lr.canSubmit || lr.submitting}
          onClick={handleSubmit}
          className="w-full px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40"
        >
          {lr.submitting ? '제출 중...' : '신청'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">최근 신청 내역</h2>
        </div>
        {myLeaves.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">신청 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">유형</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">기간</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">일수</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {myLeaves.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{lr.getPolicyName(l.type)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{l.start_date} ~ {l.end_date}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{l.days_requested}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{STATUS_LABEL[l.status] || l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveRequestForm;
