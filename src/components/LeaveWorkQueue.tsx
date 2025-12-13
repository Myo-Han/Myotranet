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
const [success, setSuccess] = useState('');
const [submittingId, setSubmittingId] = useState<string | null>(null);

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

  const getMaxStep = async (approvalLineId: string) => {
  const { data, error } = await supabase
    .from('approval_line_steps')
    .select('step_order')
    .eq('approval_line_id', approvalLineId)
    .order('step_order', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return Number(data?.step_order || 1);
};

const handleApprove = async (r: QueueRow) => {
  if (!user?.id) return;

  setError('');
  setSuccess('');
  setSubmittingId(r.leave_approval_id);

  try {
    const maxStep = await getMaxStep(r.approval_line_id);

    const { error: logErr } = await supabase.from('leave_approval_actions').insert({
      leave_approval_id: r.leave_approval_id,
      step_order: r.current_step_order,
      actor_user_id: user.id,
      action: 'approved',
      notes: null,
    });
    if (logErr) throw logErr;

    if (r.current_step_order >= maxStep) {
      const { error: upErr } = await supabase
        .from('leave_approvals')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', r.leave_approval_id);
      if (upErr) throw upErr;
    } else {
      const { error: upErr } = await supabase
        .from('leave_approvals')
        .update({ current_step_order: r.current_step_order + 1, updated_at: new Date().toISOString() })
        .eq('id', r.leave_approval_id);
      if (upErr) throw upErr;
    }

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
  setSubmittingId(r.leave_approval_id);

  try {
    const { error: logErr } = await supabase.from('leave_approval_actions').insert({
      leave_approval_id: r.leave_approval_id,
      step_order: r.current_step_order,
      actor_user_id: user.id,
      action: 'rejected',
      notes: notes || null,
    });
    if (logErr) throw logErr;

    const { error: upErr } = await supabase
      .from('leave_approvals')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', r.leave_approval_id);
    if (upErr) throw upErr;

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
        <h2 className="text-xl font-bold">휴가 결재 업무</h2>
        <button
          onClick={fetchQueue}
          className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
        >
          새로고침
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
{success && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">{success}</div>}


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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
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

<td className="px-4 py-3 text-sm">
  <div className="flex gap-2">
    <button
      onClick={() => handleApprove(r)}
      disabled={submittingId === r.leave_approval_id}
      className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
    >
      승인
    </button>
    <button
      onClick={() => handleReject(r)}
      disabled={submittingId === r.leave_approval_id}
      className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
    >
      반려
    </button>
  </div>
</td>

              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
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
