// 연장근무 사전 승인 수신함
// 직원이 근태관리 화면에서 "연장근무 신청"(날짜 + 시작~종료 시각 + 사유)을 올리면
// 여기서 관리자가 승인/반려한다. 승인해도 이 테이블 값을 attendance 테이블에 직접 쓰지는 않고,
// 승인된 시간대(requested_start_at~requested_end_at)와 실제 출퇴근 시간(attendance.check_in~check_out)이
// 겹치는 구간만 MonthlyAttendanceTable에서 동적으로 계산해 "연장근무" 칸에 반영한다.
// (조기 퇴근하면 자동으로 겹치는 시간만큼만 줄어들고, attendance_revision_requests처럼
//  별도 apply 단계가 필요 없어 더 단순함)
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';
import ProfileModal from './ProfileModal';
import { getRevisionStatusLabel } from '../utils/attendanceLabels';

type UserRow = {
  id: string;
  name: string | null;
  profile_picture: string | null;
  role?: string | null;
};

type OvertimeRequestRow = {
  id: string;
  user_id: string;
  work_date: string;
  requested_start_at: string;
  requested_end_at: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  created_at: string;
};

const formatDate = (isoOrDate: string | null) => {
  if (!isoOrDate) return '-';
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return '-';
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
};

const formatTime = (iso: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

const OvertimeRequestInbox: React.FC = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [requests, setRequests] = useState<OvertimeRequestRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [usersById, setUsersById] = useState<Record<string, UserRow>>({});

  const [reviewNotes, setReviewNotes] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const canReview = user?.role === 'Admin' || user?.role === 'Manager';

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return requests.find((r) => String(r.id) === String(selectedId)) ?? null;
  }, [requests, selectedId]);

  const selectedUser = useMemo(() => {
    if (!selected) return null;
    return usersById[selected.user_id] ?? null;
  }, [selected, usersById]);

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
        .from('overtime_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (reqErr) throw reqErr;

      const next = (reqData ?? []) as OvertimeRequestRow[];
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

      setReviewNotes('');
    } catch (e: any) {
      setError(e?.message || '연장근무 신청 목록을 불러오지 못했습니다.');
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
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { error: updErr } = await supabase
        .from('overtime_requests')
        .update({
          status,
          review_notes: reviewNotes || null,
          reviewed_at: new Date().toISOString(),
          reviewer_id: user.id,
        })
        .eq('id', selected.id);

      if (updErr) throw updErr;

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
        <h2 className="text-xl font-semibold">연장근무 요청</h2>
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
            요청 목록 ({requests.length})
          </div>
          <div className="max-h-[70vh] overflow-auto divide-y">
            {requests.length === 0 && (
              <div className="p-4 text-sm text-gray-500">요청이 없습니다.</div>
            )}

            {requests.map((r) => {
              const u = usersById[r.user_id];
              const name = u?.name ?? '이름 없음';
              const line1 = `${name} · ${formatDate(r.work_date)}`;
              const line2 = `${formatTime(r.requested_start_at)} ~ ${formatTime(r.requested_end_at)}`;
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
                        근무일: {formatDate(selected.work_date)} · 생성: {new Date(selected.created_at).toLocaleString('ko-KR')}
                      </div>
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {(() => {
                    const { label, colorClass } = getRevisionStatusLabel(selected.status);
                    return <span className={`px-2 py-1 text-xs rounded-full ${colorClass}`}>{label}</span>;
                  })()}
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-800 mb-3">요청 내용</div>

                <div className="text-sm text-gray-700 mb-3">
                  <span className="font-semibold">사유:</span>{' '}
                  <span className="break-words">{selected.reason || '(없음)'}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">시작 시각</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatDate(selected.requested_start_at)} {formatTime(selected.requested_start_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">종료 시각</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatDate(selected.requested_end_at)} {formatTime(selected.requested_end_at)}
                    </div>
                  </div>
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

export default OvertimeRequestInbox;
