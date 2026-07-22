// 연장근무 결재 업무.
// 기존에는 관리자/매니저 아무나 단일 승인/반려하는 구조였지만, 연차와 동일하게
// 결재라인(순차 결재)이 도입되면서 LeaveWorkQueue.tsx와 동일한 패턴(get_overtime_work_queue +
// approve_overtime_step/reject_overtime_step RPC)으로 전환했다. 지금 내 차례인 건만 여기 뜬다.
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';

type QueueRow = {
  overtime_approval_id: string;
  overtime_id: string;
  approval_line_id: string | null;
  current_step_order: number;
  ot_status: string | null;
  work_date: string;
  requested_start_at: string;
  requested_end_at: string;
  requester_user_id: string;
  requester_project: string | null;
  requester_part: string | null;
  requester_department: string | null;
  reason: string | null;
};

type UserMini = {
  id: string;
  name: string | null;
  email: string | null;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.toLocaleDateString('ko-KR')} ${hh}:${mm}`;
};

const OvertimeRequestInbox: React.FC = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserMini>>({});

  const fetchQueue = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError('');

    try {
      const { data, error: rpcErr } = await supabase.rpc('get_overtime_work_queue', {
        p_actor_id: user.id,
      });

      if (rpcErr) throw rpcErr;

      const list = (data || []) as QueueRow[];
      setRows(list);

      const ids = Array.from(new Set(list.map((r) => r.requester_user_id).filter(Boolean)));
      if (ids.length > 0) {
        const { data: uData, error: uErr } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', ids);

        if (uErr) throw uErr;

        const map: Record<string, UserMini> = {};
        (uData || []).forEach((u: any) => {
          map[u.id] = { id: u.id, name: u.name ?? null, email: u.email ?? null };
        });
        setUserMap(map);
      } else {
        setUserMap({});
      }
    } catch (e: any) {
      setError(e?.message || '업무 목록 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (r: QueueRow) => {
    if (!user?.id) return;

    setError('');
    setSuccess('');
    setSubmittingId(r.overtime_approval_id);

    try {
      const { error: rpcErr } = await supabase.rpc('approve_overtime_step', {
        p_overtime_approval_id: r.overtime_approval_id,
        p_notes: null,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('승인 처리되었습니다.');
      await fetchQueue();
    } catch (e: any) {
      setError(e?.message || '승인 처리 실패');
    } finally {
      setSubmittingId(null);
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  const handleReject = async (r: QueueRow) => {
    if (!user?.id) return;

    const notes = window.prompt('반려 사유를 입력하세요 (선택)');
    setError('');
    setSuccess('');
    setSubmittingId(r.overtime_approval_id);

    try {
      const { error: rpcErr } = await supabase.rpc('reject_overtime_step', {
        p_overtime_approval_id: r.overtime_approval_id,
        p_notes: notes || null,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('반려 처리되었습니다.');
      await fetchQueue();
    } catch (e: any) {
      setError(e?.message || '반려 처리 실패');
    } finally {
      setSubmittingId(null);
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  useEffect(() => {
    fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const displayRequester = (id: string) => {
    const u = userMap[id];
    if (!u) return id;
    return u.name || u.email || id;
  };

  const displayScope = (r: QueueRow) => {
    const p = r.requester_project || '-';
    const part = r.requester_part || '-';
    const d = r.requester_department || '-';
    return `${d} / ${p} / ${part}`;
  };

  if (!user) return null;
  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900">연장근무 결재 업무</h2>
        <button
          onClick={fetchQueue}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          새로고침
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2.5">{success}</div>}

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">신청자</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">소속</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">근무 일자</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">시작~종료</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">사유</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">단계</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.overtime_approval_id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{displayRequester(r.requester_user_id)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{displayScope(r)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {new Date(`${r.work_date}T00:00:00`).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                    {formatDateTime(r.requested_start_at)} ~ {formatDateTime(r.requested_end_at)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{r.reason || '-'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{r.current_step_order}단계</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleApprove(r)}
                        disabled={submittingId === r.overtime_approval_id}
                        className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => handleReject(r)}
                        disabled={submittingId === r.overtime_approval_id}
                        className="px-2.5 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                      >
                        반려
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">
                    처리할 연장근무 결재가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OvertimeRequestInbox;
