// 휴가 승인 페이지
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';

type QueueRow = {
  leave_approval_id: string;
  leave_id: string;
  approval_line_id: string;
  current_step_order: number;
  leave_status: string | null;
  start_date: string; // date
  end_date: string; // date
  days_requested: number;
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

const LeaveWorkQueue: React.FC = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserMini>>({});

  const requesterIds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.requester_user_id && s.add(r.requester_user_id));
    return Array.from(s);
  }, [rows]);

  const fetchQueue = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError('');

    try {
      const { data, error: rpcErr } = await supabase.rpc('get_leave_work_queue', {
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
        <h2 className="text-xl font-bold">휴가 결재 업무</h2>
        <button
          onClick={fetchQueue}
          className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
        >
          새로고침
        </button>
      </div>

      {error && <ErrorMessage message={error} />}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청자</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">소속</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">기간</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">일수</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">단계</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((r) => (
              <tr key={r.leave_approval_id}>
                <td className="px-4 py-3 text-sm text-gray-900">{displayRequester(r.requester_user_id)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{displayScope(r)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {r.start_date} ~ {r.end_date}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.days_requested}일</td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.reason || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{r.current_step_order}단계</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  처리할 휴가 결재가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* requesterIds 사용 안 하면 경고날 수 있어서 메모로 남김 */}
      <input type="hidden" value={requesterIds.length} readOnly />
    </div>
  );
};

export default LeaveWorkQueue;
