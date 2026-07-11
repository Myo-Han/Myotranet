// 출퇴근 수정 수신함
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';
import ProfileModal from './ProfileModal';
import { getStatusLabel, getStatusColor, getRevisionStatusLabel, localDateTimeInputToIso } from '../utils/attendanceLabels';

type UserRow = {
  id: string;
  name: string | null;
  profile_picture: string | null;
  role?: string | null;
};

type AttendanceRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  total_work_seconds: number | null;
};

type RevisionRequestRow = {
  id: string;
  attendance_id: string | null;
  user_id: string;
  requested_date: string; // date
  requested_check_in_at: string | null;
  requested_check_out_at: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  created_at: string;
};

// 타임스탬프(2025-12-29T00:00...)에서 날짜(25.12.29)만 추출
const formatDate = (isoString: string | null) => {
  if (!isoString) return '-';
  const d = new Date(isoString);
  // 잘못된 날짜 형식일 경우 NaN 방지
  if (isNaN(d.getTime())) return '-';

  // 로컬 시간(KST) 기준으로 년/월/일 추출
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
};

// 초 단위를 h m s 형식으로 변환하는 함수 추가
const secondsToHms = (sec: number | null) => {
  if (sec === null || sec === undefined) return '00h 00m 00s';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rs = s % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(rs).padStart(2, '0')}s`;
};

const formatTime = (iso: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

const isoToLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

// ✅ 중복 구현 방지: datetime-local -> ISO 변환은 attendanceLabels.ts의 공용 함수를 그대로 사용
const localInputToIso = localDateTimeInputToIso;

const calcWorkSecondsWithPause = async (
  attendanceId: string,
  checkInIso: string,
  checkOutIso: string
): Promise<number> => {
  const startMs = new Date(checkInIso).getTime();
  const endMs = new Date(checkOutIso).getTime();
  if (!(endMs > startMs)) return 0;

  const { data: pauseEvents, error } = await supabase
    .from('attendance_events')
    .select('event_type, occurred_at')
    .eq('attendance_id', attendanceId)
    .in('event_type', ['pause', 'resume'])
    .order('occurred_at', { ascending: true });

  if (error) throw error;

  let totalPauseSeconds = 0;
  let lastPauseTime: Date | null = null;

  (pauseEvents || []).forEach((ev: any) => {
    const t = new Date(ev.occurred_at);
    if (ev.event_type === 'pause') {
      lastPauseTime = t;
      return;
    }
    if (ev.event_type === 'resume' && lastPauseTime) {
      const pauseStart = Math.max(lastPauseTime.getTime(), startMs);
      const pauseEnd = Math.min(t.getTime(), endMs);
      if (pauseEnd > pauseStart) totalPauseSeconds += (pauseEnd - pauseStart) / 1000;
      lastPauseTime = null;
    }
  });

  if (lastPauseTime) {
    const pauseStart = Math.max(lastPauseTime.getTime(), startMs);
    const pauseEnd = endMs;
    if (pauseEnd > pauseStart) totalPauseSeconds += (pauseEnd - pauseStart) / 1000;
  }

  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));
  return workSeconds;
};

const AttendanceRevisionInbox: React.FC = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [requests, setRequests] = useState<RevisionRequestRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [usersById, setUsersById] = useState<Record<string, UserRow>>({});
  const [attendanceById, setAttendanceById] = useState<Record<string, AttendanceRow>>({});

  const [reviewNotes, setReviewNotes] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<{ requestedCheckIn: string; requestedCheckOut: string }>({
    requestedCheckIn: '',
    requestedCheckOut: '',
  });

  const canReview = user?.role === 'Admin' || user?.role === 'Manager';

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return requests.find((r) => String(r.id) === String(selectedId)) ?? null;
  }, [requests, selectedId]);

  const selectedUser = useMemo(() => {
    if (!selected) return null;
    return usersById[selected.user_id] ?? null;
  }, [selected, usersById]);

  const selectedAttendance = useMemo(() => {
    if (!selected?.attendance_id) return null;
    return attendanceById[selected.attendance_id] ?? null;
  }, [selected, attendanceById]);

  const filtered = useMemo(() => {
    return requests;
  }, [requests]);

  const openProfile = (uid: string) => {
    setSelectedProfileUserId(uid);
    setShowProfileModal(true);
  };

  const closeProfile = () => {
    setShowProfileModal(false);
    setSelectedProfileUserId(null);
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: reqData, error: reqErr } = await supabase
        .from('attendance_revision_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (reqErr) throw reqErr;

      const next = (reqData ?? []) as RevisionRequestRow[];
      setRequests(next);

      const nextSelected = (() => {
        if (!next.length) return null;
        if (!selectedId) return next[0].id;
        const still = next.find((x) => String(x.id) === String(selectedId));
        return still ? still.id : next[0].id;
      })();
      setSelectedId(nextSelected);

      const userIds = Array.from(new Set(next.map((r) => r.user_id).filter(Boolean)));
      const reviewerIds = Array.from(new Set(next.map((r) => r.reviewer_id).filter(Boolean))) as string[];
      const allIds = Array.from(new Set([...userIds, ...reviewerIds]));

      if (allIds.length) {
        const { data: uData, error: uErr } = await supabase
          .from('users')
          .select('id, name, profile_picture, role')
          .in('id', allIds);

        if (uErr) throw uErr;

        const map: Record<string, UserRow> = {};
        (uData ?? []).forEach((u: any) => {
          map[u.id] = {
            id: u.id,
            name: u.name ?? null,
            profile_picture: u.profile_picture ?? null,
            role: u.role ?? null,
          };
        });
        setUsersById(map);
      } else {
        setUsersById({});
      }

      const attendanceIds = Array.from(
        new Set(next.map((r) => r.attendance_id).filter((x): x is string => !!x))
      );

      if (attendanceIds.length) {
        const { data: aData, error: aErr } = await supabase
          .from('attendance')
          .select('id, user_id, date, check_in, check_out, status, total_work_seconds')
          .in('id', attendanceIds);

        if (aErr) throw aErr;

        const amap: Record<string, AttendanceRow> = {};
        (aData ?? []).forEach((a: any) => {
          amap[a.id] = {
            id: a.id,
            user_id: a.user_id,
            date: a.date,
            check_in: a.check_in ?? null,
            check_out: a.check_out ?? null,
            status: a.status ?? null,
            total_work_seconds: a.total_work_seconds ?? null,
          };
        });
        setAttendanceById(amap);
      } else {
        setAttendanceById({});
      }

      setReviewNotes('');
    } catch (e: any) {
      setError(e?.message || '수정 요청 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setReviewNotes(selected.review_notes || '');
    setEditForm({
      requestedCheckIn: isoToLocalInput(selected.requested_check_in_at),
      requestedCheckOut: isoToLocalInput(selected.requested_check_out_at),
    });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyApprovalToAttendance = async (req: RevisionRequestRow) => {
    if (!req.attendance_id) return;
    const nextCheckIn = req.requested_check_in_at;
    const nextCheckOut = req.requested_check_out_at;

    const patch: any = {};
    if (nextCheckIn) patch.check_in = nextCheckIn;
    if (req.requested_check_in_at === null) patch.check_in = null;

    if (nextCheckOut) patch.check_out = nextCheckOut;
    if (req.requested_check_out_at === null) patch.check_out = null;

    if (patch.check_out) patch.status = 'off';
    else if (patch.check_in) patch.status = 'working';

    if (patch.check_in && patch.check_out) {
      const workSeconds = await calcWorkSecondsWithPause(req.attendance_id, patch.check_in, patch.check_out);
      patch.total_work_seconds = workSeconds;
    }

    const { error: updErr } = await supabase.from('attendance').update(patch).eq('id', req.attendance_id);
    if (updErr) throw updErr;
  };

  const review = async (status: 'approved' | 'rejected') => {
    if (!user?.id) return;
    if (!selected) return;
    if (!canReview) {
      setError('권한이 없습니다.');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const nextRequestedCheckIn = localInputToIso(editForm.requestedCheckIn);
      const nextRequestedCheckOut = localInputToIso(editForm.requestedCheckOut);

      const { error: reqUpdErr } = await supabase
        .from('attendance_revision_requests')
        .update({
          status,
          review_notes: reviewNotes || null,
          reviewed_at: new Date().toISOString(),
          reviewer_id: user.id,
          requested_check_in_at: nextRequestedCheckIn,
          requested_check_out_at: nextRequestedCheckOut,
        })
        .eq('id', selected.id);

      if (reqUpdErr) throw reqUpdErr;

      if (status === 'approved') {
        const virtualReq: RevisionRequestRow = {
          ...selected,
          requested_check_in_at: nextRequestedCheckIn,
          requested_check_out_at: nextRequestedCheckOut,
          status,
          review_notes: reviewNotes || null,
          reviewer_id: user.id,
          reviewed_at: new Date().toISOString(),
        };
        await applyApprovalToAttendance(virtualReq);
      }

      setSuccess(status === 'approved' ? '승인 처리되었습니다.' : '반려 처리되었습니다.');
      await fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e?.message || '처리에 실패했습니다.');
    }
  };

  if (!canReview) {
    return <div className="bg-white shadow rounded-lg p-6 text-sm text-gray-600">권한이 없습니다.</div>;
  }

  if (loading) return <Loading />;

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-semibold">출퇴근 수정 요청</h2>
        <button
          onClick={fetchData}
          className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          type="button"
        >
          새로고침
        </button>
      </div>

      <div className="p-4">
        {error && <ErrorMessage message={error} />}
        {success && <SuccessMessage message={success} />}
      </div>

      <div className="flex gap-4 p-4">
        {/* Left: list (30%) */}
        <div className="w-[30%] min-w-[260px] border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
            요청 목록 ({filtered.length})
          </div>
          <div className="max-h-[70vh] overflow-auto divide-y">
            {filtered.length === 0 && (
              <div className="p-4 text-sm text-gray-500">요청이 없습니다.</div>
            )}

            {filtered.map((r) => {
              const u = usersById[r.user_id];
              const name = u?.name ?? '이름 없음';
              // ✅ DB에 존재하는 requested_check_in_at을 사용하고 KST 날짜 적용
              const line1 = `${name} · ${formatDate(r.requested_check_in_at)}`;
              const line2 = (r.reason || '').trim() || '(사유 없음)';
              const isSel = String(r.id) === String(selectedId);

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={[
                    'w-full text-left px-4 py-3 hover:bg-gray-50',
                    isSel ? 'bg-blue-50' : 'bg-white',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{line1}</div>
                      <div className="text-xs text-gray-600 mt-1 truncate">{line2}</div>
                    </div>
                    {/* ✅ 유틸리티를 사용하여 '대기/승인/반려' 한글 라벨 표시 */}
                    {(() => {
                      const { label, colorClass } = getRevisionStatusLabel(r.status);
                      return <span className={`px-2 py-1 text-xs rounded-full ${colorClass}`}>{label}</span>;
                    })()}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: detail (70%) */}
        <div className="flex-1 border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">상세</div>

          {!selected ? (
            <div className="p-6 text-sm text-gray-500">왼쪽에서 요청을 선택하세요.</div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => openProfile(selected.user_id)}
                    className="flex items-center gap-3 bg-transparent p-0 border-0 cursor-pointer"
                  >
                    {selectedUser?.profile_picture ? (
                      <img
                        src={selectedUser.profile_picture}
                        alt="profile"
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {(selectedUser?.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-gray-900 truncate">
                        {selectedUser?.name ?? '이름 없음'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {/* ✅ KST 기준 날짜 표시 */}
                        요청일: {formatDate(selected.requested_check_in_at)} · 생성: {new Date(selected.created_at).toLocaleString('ko-KR')}
                      </div>
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* ✅ 유틸리티를 사용하여 요청 상태 배지 한글화 */}
                  {(() => {
                    const { label, colorClass } = getRevisionStatusLabel(selected.status);
                    return <span className={`px-2 py-1 text-xs rounded-full ${colorClass}`}>{label}</span>;
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-800 mb-3">요청 내용</div>

                  <div className="text-sm text-gray-700 mb-2">
                    <span className="font-semibold">사유:</span>{' '}
                    <span className="break-words">{selected.reason || '(없음)'}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">요청 출근</label>
                      <input
                        type="datetime-local"
                        value={editForm.requestedCheckIn}
                        onChange={(e) => setEditForm((p) => ({ ...p, requestedCheckIn: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        disabled={selected.status !== 'pending'}
                      />
                      <div className="text-xs text-gray-500 mt-1">표시: {formatTime(localInputToIso(editForm.requestedCheckIn))}</div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">요청 퇴근</label>
                      <input
                        type="datetime-local"
                        value={editForm.requestedCheckOut}
                        onChange={(e) => setEditForm((p) => ({ ...p, requestedCheckOut: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        disabled={selected.status !== 'pending'}
                      />
                      <div className="text-xs text-gray-500 mt-1">표시: {formatTime(localInputToIso(editForm.requestedCheckOut))}</div>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="text-sm font-semibold text-gray-800 mb-3">현재 기록</div>

                  {selectedAttendance ? (
                    <div className="space-y-2 text-sm text-gray-700">
                      <div className="flex justify-between">
                        <span className="text-gray-600">출근</span>
                        <span className="font-semibold">{formatTime(selectedAttendance.check_in)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">퇴근</span>
                        <span className="font-semibold">{formatTime(selectedAttendance.check_out)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">상태</span>
                        {/* ✅ Attendance.tsx와 동일한 출퇴근 상태 배지 스타일 */}
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${getStatusColor(selectedAttendance.status, null)}`}>
                          {getStatusLabel(selectedAttendance.status, null)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">누적 시간</span>
                        {/* ✅ 00h 00m 00s 형식 적용 */}
                        <span className="font-semibold">{secondsToHms(selectedAttendance.total_work_seconds)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">attendance 레코드를 찾지 못했습니다.</div>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-800 mb-3">관리자 처리</div>

                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    disabled={selected.status !== 'pending'}
                  />
                </div>

                {selected.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => review('approved')}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      onClick={() => review('rejected')}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      반려
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>
                      처리일: {selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString('ko-KR') : '-'}
                    </div>
                    <div>
                      처리자: {selected.reviewer_id ? (usersById[selected.reviewer_id]?.name ?? selected.reviewer_id) : '-'}
                    </div>
                    <div>메모: {selected.review_notes || '-'}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {user && showProfileModal && selectedProfileUserId && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={closeProfile}
          userId={selectedProfileUserId}
          currentUserId={user.id}
          readOnly
        />
      )}
    </div>
  );
};

export default AttendanceRevisionInbox;
