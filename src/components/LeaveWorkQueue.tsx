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

type VisibilityRow = {
  leave_id: string;
  leave_approval_id: string;
  approval_line_id: string | null;
  current_step_order: number | null;
  leave_status: string | null;
  approval_status: string | null;
  start_date: string;
  end_date: string;
  days_requested: number;
  requester_user_id: string;
  requester_project: string | null;
  requester_part: string | null;
  requester_department: string | null;
  reason: string | null;
  my_roles: string[];
  my_step_order: number | null;
  is_current_turn: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  approver: '결재',
  cc: '참조',
  notify: '통보',
};

const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: '결재 진행중',
  approved: '승인 완료',
  rejected: '반려됨',
};

const LeaveWorkQueue: React.FC = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserMini>>({});

  const [visRows, setVisRows] = useState<VisibilityRow[]>([]);
  const [visLoading, setVisLoading] = useState(true);
  const [visUserMap, setVisUserMap] = useState<Record<string, UserMini>>({});

  const requesterIds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.requester_user_id && s.add(r.requester_user_id));
    return Array.from(s);
  }, [rows]);

  const fetchVisibilityList = async () => {
    if (!user?.id) return;

    setVisLoading(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_leave_visibility_list', {
        p_actor_id: user.id,
      });

      if (rpcErr) throw rpcErr;

      const list = (data || []) as VisibilityRow[];
      setVisRows(list);

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
        setVisUserMap(map);
      } else {
        setVisUserMap({});
      }
    } catch (e: any) {
      console.error('결재/참조 전체 내역 로딩 실패:', e);
    } finally {
      setVisLoading(false);
    }
  };

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

  // ✅ 승인/반려는 approve_leave_step / reject_leave_step RPC로 처리한다.
  // (RLS상 승인자가 신청자 본인이 아니면 신청자의 users.잔액/leave_balance_history를
  //  직접 갱신할 권한이 없어서, 마지막 단계 승인 시 잔액 자동 차감까지 DB 함수 안에서 원자적으로 처리)
  const handleApprove = async (r: QueueRow) => {
    if (!user?.id) return;

    setError('');
    setSuccess('');
    setSubmittingId(r.leave_approval_id);

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('approve_leave_step', {
        p_leave_approval_id: r.leave_approval_id,
        p_notes: null,
      });
      if (rpcErr) throw rpcErr;

      // ✅ 이 승인이 최종 승인이었다면(모든 결재 단계 완료), 회사 구글 캘린더에 자동으로
      // 휴가 일정을 등록한다. 캘린더 등록이 실패해도 승인 자체는 이미 완료된 상태라
      // 사용자에게는 성공으로 안내하고, 캘린더 실패만 조용히 콘솔에 남긴다
      // (서비스 계정에 캘린더 쓰기 권한이 아직 공유되지 않았을 수 있음).
      if ((rpcData as any)?.final) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          await fetch('/api/calendar/create-leave-event', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ leaveId: r.leave_id }),
          });
        } catch (calErr) {
          console.warn('캘린더 자동 등록 실패 (승인 처리 자체는 완료됨):', calErr);
        }
      }

      setSuccess('승인 처리되었습니다.');
      await Promise.all([fetchQueue(), fetchVisibilityList()]);
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
      const { error: rpcErr } = await supabase.rpc('reject_leave_step', {
        p_leave_approval_id: r.leave_approval_id,
        p_notes: notes || null,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('반려 처리되었습니다.');
      await Promise.all([fetchQueue(), fetchVisibilityList()]);
    } catch (e: any) {
      setError(e?.message || '반려 처리 실패');
    } finally {
      setSubmittingId(null);
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  useEffect(() => {
    fetchQueue();
    fetchVisibilityList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const displayRequester = (id: string) => {
    const u = userMap[id];
    if (!u) return id;
    return u.name || u.email || id;
  };

  const displayVisRequester = (id: string) => {
    const u = visUserMap[id];
    if (!u) return id;
    return u.name || u.email || id;
  };

  const displayScope = (r: QueueRow) => {
    const p = r.requester_project || '-';
    const part = r.requester_part || '-';
    const d = r.requester_department || '-';
    return `${d} / ${p} / ${part}`;
  };

  const displayRoles = (roles: string[]) => roles.map((r) => ROLE_LABEL[r] || r).join(', ');

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

      {/* 내가 결재선(현재 차례 여부 무관) 또는 참조로 지정된 휴가 신청 전체 내역.
          위 표(휴가 결재 업무)는 "지금 내가 처리해야 할 건"만 보여주는 반면,
          여기는 과거/미래 단계 포함 전체 이력을 읽기 전용으로 보여준다. */}
      <div className="pt-2">
        <h3 className="text-lg font-bold mb-2">내가 결재/참조로 지정된 휴가 신청 내역</h3>

        {visLoading ? (
          <Loading />
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청자</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">기간</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">일수</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">내 역할</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {visRows.map((r) => (
                  <tr key={r.leave_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{displayVisRequester(r.requester_user_id)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {r.start_date} ~ {r.end_date}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.days_requested}일</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.reason || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {displayRoles(r.my_roles)}
                      {r.is_current_turn && (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">내 차례</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {LEAVE_STATUS_LABEL[r.approval_status || r.leave_status || 'pending'] || r.leave_status}
                    </td>
                  </tr>
                ))}

                {visRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      결재/참조로 지정된 휴가 신청이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveWorkQueue;
