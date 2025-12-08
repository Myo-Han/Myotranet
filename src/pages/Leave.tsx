import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Leave as LeaveType } from '../types';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';

const Leave: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [leaves, setLeaves] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'annual',
    daysRequested: 1,
    reason: '',
  });

  useEffect(() => {
    fetchLeaves();
  }, []);

  const fetchLeaves = async () => {
    setLoading(true);
    setError('');
    try {
      const isManagerOrAdmin = user?.role === 'Manager' || user?.role === 'Admin';

      let query = supabase.from('leaves').select('*').order('start_date', { ascending: false });

      if (!isManagerOrAdmin && user) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setLeaves(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load leaves');
    } finally {
      setLoading(false);
    }
  };

  const calculateDays = () => {
    if (!form.startDate || !form.endDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return form.leaveType === 'half_day' ? 0.5 : diffDays;
  };

  useEffect(() => {
    setForm({ ...form, daysRequested: calculateDays() });
  }, [form.startDate, form.endDate, form.leaveType]);

  const submitLeaveRequest = async () => {
    if (!user || !form.startDate || !form.endDate || !form.reason) {
      setError('모든 필드를 입력해주세요');
      return;
    }

    try {
      const { error } = await supabase.from('leaves').insert({
        user_id: user.id,
        start_date: form.startDate,
        end_date: form.endDate,
        type: form.leaveType,
        days_requested: form.daysRequested,
        reason: form.reason,
        status: 'pending',
      });

      if (error) throw error;

      setSuccess('휴가 신청이 제출되었습니다');
      setShowModal(false);
      fetchLeaves();
      refreshUser();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    }
  };

  const reviewLeaveRequest = async (
    leaveId: string,
    status: 'approved' | 'rejected',
    notes: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('leaves')
        .update({
          status,
          review_notes: notes,
          approved_at: new Date().toISOString(),
          approver_id: user.id,
        })
        .eq('id', leaveId);

      if (error) throw error;

      setSuccess(`휴가 신청이 ${status === 'approved' ? '승인' : '반려'}되었습니다`);
      fetchLeaves();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to review request');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">휴가 관리</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          휴가 신청
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">잔여 연차</h2>
          <div className="text-3xl font-bold text-green-600">{user?.annual_leave_balance}일</div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">휴가 신청 내역</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {(user?.role === 'Manager' || user?.role === 'Admin') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청자</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">시작일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">종료일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">일수</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                {(user?.role === 'Manager' || user?.role === 'Admin') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leaves.map((leave) => (
                <tr key={leave.id}>
                  {(user?.role === 'Manager' || user?.role === 'Admin') && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{leave.name}</td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(leave.start_date).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(leave.end_date).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {leave.leave_type === 'annual' ? '연차' : '반차'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{leave.days_requested}일</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{leave.reason}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      leave.status === 'approved' ? 'bg-green-100 text-green-800' :
                      leave.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {leave.status === 'approved' ? '승인' : leave.status === 'rejected' ? '반려' : '대기'}
                    </span>
                  </td>
                  {(user?.role === 'Manager' || user?.role === 'Admin') && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {leave.status === 'pending' && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => reviewLeaveRequest(leave.id, 'approved', '승인됨')}
                            className="text-green-600 hover:text-green-800"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => reviewLeaveRequest(leave.id, 'rejected', '반려됨')}
                            className="text-red-600 hover:text-red-800"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">휴가 신청</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">유형</label>
                <select
                  value={form.leaveType}
                  onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="annual">연차</option>
                  <option value="half_day">반차 (0.5일)</option>
                </select>
              </div>
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
                onClick={() => setShowModal(false)}
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
