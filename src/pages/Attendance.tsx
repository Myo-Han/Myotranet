import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Attendance as AttendanceType, AttendanceRevisionRequest } from '../types';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';

const Attendance: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceType[]>([]);
  const [revisionRequests, setRevisionRequests] = useState<AttendanceRevisionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceType | null>(null);
  const [revisionForm, setRevisionForm] = useState({
    requestedCheckIn: '',
    requestedCheckOut: '',
    reason: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const isManagerOrAdmin = user?.role === 'Manager' || user?.role === 'Admin';

      let recordsQuery = supabase
        .from('attendance')
        .select('id, user_id, date, check_in, check_out, early_leave, status, notes')
        .order('date', { ascending: false });

      if (!isManagerOrAdmin && user) {
        recordsQuery = recordsQuery.eq('user_id', user.id);
      }

      const { data: attendanceData, error: attendanceError } = await recordsQuery;
      if (attendanceError) throw attendanceError;

      setRecords(attendanceData || []);

      const { data: revisionsData, error: revisionsError } = await supabase
        .from('attendance_revision_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (revisionsError) throw revisionsError;

      setRevisionRequests(revisionsData || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // ✅ 오늘 승인된 휴가가 있으면 출근 불가
      const { data: leaveToday, error: leaveError } = await supabase
        .from('leaves')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle();

      if (leaveError && leaveError.code !== 'PGRST116') throw leaveError;

      if (leaveToday) {
        setError('오늘은 승인된 휴가일입니다. 출근을 찍을 수 없습니다.');
        return;
      }

      const { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      if (!existing) {
        const { error: insertError } = await supabase.from('attendance').insert({
          user_id: user.id,
          date: today,
          check_in: new Date().toISOString(),
          status: 'present',
        });
        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase
          .from('attendance')
          .update({
            check_in: new Date().toISOString(),
            status: 'present',
          })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }

      setSuccess('출근 처리되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Check-in failed');
    }
  };

  const handleCheckOut = async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().slice(0, 10);

      const { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!existing) {
        setError('출근 기록이 없습니다');
        return;
      }

      const { error: updateError } = await supabase
        .from('attendance')
        .update({
          check_out: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;

      setSuccess('퇴근 처리되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Check-out failed');
    }
  };

  const handleEarlyLeave = async () => {
    if (!user) return;

    try {
      const today = new Date().toISOString().slice(0, 10);

      const { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!existing) {
        setError('출근 기록이 없습니다');
        return;
      }

      const { error: updateError } = await supabase
        .from('attendance')
        .update({
          early_leave: new Date().toISOString(),
          status: 'early_leave',
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;

      setSuccess('조퇴 처리되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Early leave failed');
    }
  };

  const openRevisionModal = (record: AttendanceType) => {
    setSelectedRecord(record);
    setRevisionForm({
      requestedCheckIn: record.check_in ? new Date(record.check_in).toISOString().slice(0, 16) : '',
      requestedCheckOut: record.check_out ? new Date(record.check_out).toISOString().slice(0, 16) : '',
      reason: '',
    });
    setShowRevisionModal(true);
  };

  const submitRevisionRequest = async () => {
    if (!user || !selectedRecord || !revisionForm.reason) {
      setError('모든 필드를 입력해주세요');
      return;
    }

    try {
      const { error } = await supabase.from('attendance_revision_requests').insert({
        attendance_id: selectedRecord.id,
        user_id: user.id,
        requested_date: selectedRecord.date,
        requested_check_in: revisionForm.requestedCheckIn || null,
        requested_check_out: revisionForm.requestedCheckOut || null,
        reason: revisionForm.reason,
        status: 'pending',
      });

      if (error) throw error;

      setSuccess('수정 요청이 제출되었습니다');
      setShowRevisionModal(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    }
  };

  const reviewRevisionRequest = async (
    requestId: string,
    status: 'approved' | 'rejected',
    notes: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('attendance_revision_requests')
        .update({
          status,
          review_notes: notes,
          reviewed_at: new Date().toISOString(),
          reviewer_id: user.id,
        })
        .eq('id', requestId);

      if (error) throw error;

      setSuccess(`수정 요청이 ${status === 'approved' ? '승인' : '반려'}되었습니다`);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to review request');
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">출퇴근 관리</h1>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* Check-in/out buttons */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">오늘의 출퇴근</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={handleCheckIn}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200"
          >
            출근
          </button>
          <button
            onClick={handleCheckOut}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200"
          >
            퇴근
          </button>
          <button
            onClick={handleEarlyLeave}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition duration-200"
          >
            조퇴
          </button>
        </div>
      </div>

      {/* Attendance records */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">출퇴근 기록</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {(user?.role === 'Manager' || user?.role === 'Admin') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">출근</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">퇴근</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">조퇴</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((record: any) => (
                <tr key={record.id}>
                  {(user?.role === 'Manager' || user?.role === 'Admin') && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.name}</td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(record.date).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTime(record.check_in)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTime(record.check_out)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTime(record.early_leave)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${record.status === 'present' ? 'bg-green-100 text-green-800' :
                      record.status === 'early_leave' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {record.user_id === user?.id && (
                      <button
                        onClick={() => openRevisionModal(record)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        수정 요청
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revision requests for Manager/Admin */}
      {(user?.role === 'Manager' || user?.role === 'Admin') && revisionRequests.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">출퇴근 수정 요청</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {revisionRequests.map((request) => (
              <div key={request.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">{request.user_name}</p>
                    <p className="text-sm text-gray-600">날짜: {new Date(request.requested_date).toLocaleDateString('ko-KR')}</p>
                    <p className="text-sm text-gray-600 mt-2">사유: {request.reason}</p>
                    <div className="mt-2 text-sm">
                      <p>요청 출근: {formatTime(request.requested_check_in)}</p>
                      <p>요청 퇴근: {formatTime(request.requested_check_out)}</p>
                    </div>
                  </div>
                  {request.status === 'pending' && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => reviewRevisionRequest(request.id, 'approved', '승인됨')}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => reviewRevisionRequest(request.id, 'rejected', '반려됨')}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        반려
                      </button>
                    </div>
                  )}
                  {request.status !== 'pending' && (
                    <span className={`px-3 py-1 rounded-full text-sm ${request.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                      {request.status === 'approved' ? '승인됨' : '반려됨'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revision modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">출퇴근 수정 요청</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">출근 시간</label>
                <input
                  type="datetime-local"
                  value={revisionForm.requestedCheckIn}
                  onChange={(e) => setRevisionForm({ ...revisionForm, requestedCheckIn: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">퇴근 시간</label>
                <input
                  type="datetime-local"
                  value={revisionForm.requestedCheckOut}
                  onChange={(e) => setRevisionForm({ ...revisionForm, requestedCheckOut: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                <textarea
                  value={revisionForm.reason}
                  onChange={(e) => setRevisionForm({ ...revisionForm, reason: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex space-x-2">
              <button
                onClick={submitRevisionRequest}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                제출
              </button>
              <button
                onClick={() => setShowRevisionModal(false)}
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

export default Attendance;
