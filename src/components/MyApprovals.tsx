// 나의 결재: 내가 신청한 결재건을 유형별(휴가 신청 / 출퇴근 수정 요청 / 연장근무 신청)로
// 전체(진행 중 + 이미 처리된 건) 보여준다.
// 정렬 우선순위: 1) 진행 중(pending) 건이 먼저, 2) 그 다음 날짜(신청일시) 최신순.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { getRevisionStatusLabel } from '../utils/attendanceLabels';
import { deleteLeaveRequest, isLeaveEditable } from '../hooks/useLeaveRequest';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | string;

type LeaveRow = {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  days_requested: number | null;
  reason: string | null;
  created_at: string;
  status: ApprovalStatus | null;
};

type RevisionRow = {
  id: string;
  requested_date: string;
  requested_check_in_at: string | null;
  requested_check_out_at: string | null;
  reason: string | null;
  created_at: string;
  status: ApprovalStatus | null;
};

type OvertimeRow = {
  id: string;
  work_date: string;
  requested_start_at: string;
  requested_end_at: string;
  reason: string | null;
  created_at: string;
  status: ApprovalStatus | null;
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual_leave: '연차',
  half_day: '반차',
  quarter_day: '반반차',
  monthly_leave: '월차',
  maternity_leave: '출산휴가',
  maternity_leave_multiple: '출산휴가(다태아)',
  paternity_leave: '배우자출산휴가',
  menstrual_leave: '생리휴가',
  family_care_leave: '가족돌봄휴가',
  event_leave_marriage_self: '결혼(본인)',
  event_leave_marriage_child: '결혼(자녀)',
  event_leave_death_parent: '사망(부모)',
  event_leave_death_grandparent: '사망(조부모)',
};

const formatDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.toLocaleDateString('ko-KR', { weekday: 'short' });
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${dow})`;
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  const dow = d.toLocaleDateString('ko-KR', { weekday: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${dow}) ${hh}:${mm}`;
};

// ✅ 진행 중(pending) 건이 항상 먼저 오고, 같은 상태 안에서는 신청일시(created_at) 최신순
const sortByPendingThenDate = <T extends { status: ApprovalStatus | null; created_at: string }>(
  rows: T[],
): T[] =>
  [...rows].sort((a, b) => {
    const aRank = (a.status || 'pending') === 'pending' ? 0 : 1;
    const bRank = (b.status || 'pending') === 'pending' ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

const StatusBadge: React.FC<{ status: ApprovalStatus | null }> = ({ status }) => {
  const { colorClass } = getRevisionStatusLabel(status);
  const displayLabel =
    status === 'pending' || !status
      ? '결재 대기중'
      : status === 'approved'
        ? '승인됨'
        : status === 'rejected'
          ? '반려됨'
          : status;
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs ${colorClass}`}>{displayLabel}</span>
  );
};

const SectionCard: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-6 py-4 border-b flex items-center justify-between text-left"
      >
        <h3 className="font-bold text-gray-900">{title}</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{count}건</span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        count === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">신청 내역이 없습니다.</p>
        ) : (
          <div className="divide-y">{children}</div>
        )
      )}
    </div>
  );
};

const MyApprovals: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRow[]>([]);
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null);
  const [leaveActionError, setLeaveActionError] = useState('');

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [leaveRes, revisionRes, overtimeRes] = await Promise.all([
        supabase
          .from('leaves')
          .select('id, start_date, end_date, type, days_requested, reason, created_at, status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('attendance_revision_requests')
          .select('id, requested_date, requested_check_in_at, requested_check_out_at, reason, created_at, status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('overtime_requests')
          .select('id, work_date, requested_start_at, requested_end_at, reason, created_at, status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (leaveRes.error) throw leaveRes.error;
      if (revisionRes.error) throw revisionRes.error;
      if (overtimeRes.error) throw overtimeRes.error;

      setLeaves(sortByPendingThenDate((leaveRes.data || []) as LeaveRow[]));
      setRevisions(sortByPendingThenDate((revisionRes.data || []) as RevisionRow[]));
      setOvertimes(sortByPendingThenDate((overtimeRes.data || []) as OvertimeRow[]));
    } catch (e) {
      console.error('나의 결재 로드 실패:', e);
      setLeaves([]);
      setRevisions([]);
      setOvertimes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleEditLeave = (leaveId: string) => {
    navigate(`/leave/edit/${leaveId}`);
  };

  const handleDeleteLeave = async (leaveId: string) => {
    if (!window.confirm('이 휴가 신청을 삭제하시겠습니까? 이미 승인된 건이라면 차감된 잔액도 함께 복구됩니다.')) return;

    setLeaveActionError('');
    setDeletingLeaveId(leaveId);
    const result = await deleteLeaveRequest(leaveId);
    setDeletingLeaveId(null);

    if (result.ok) {
      load();
    } else {
      setLeaveActionError(result.error || '삭제에 실패했습니다');
    }
  };

  const totalCount = leaves.length + revisions.length + overtimes.length;
  const pendingCount =
    leaves.filter((l) => (l.status || 'pending') === 'pending').length +
    revisions.filter((r) => (r.status || 'pending') === 'pending').length +
    overtimes.filter((o) => (o.status || 'pending') === 'pending').length;

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-6">불러오는 중...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">나의 결재</h2>
          <p className="text-sm text-gray-500 mt-1">내가 신청한 결재 내역입니다. 총 {totalCount}건</p>
        </div>
        <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-600">
          진행 중 {pendingCount}건
        </span>
      </div>

      <SectionCard title="휴가 신청" count={leaves.length}>
        {leaveActionError && (
          <div className="px-6 py-2 text-sm text-red-600 bg-red-50">{leaveActionError}</div>
        )}
        {leaves.map((l) => (
          <div key={l.id} className="px-6 py-4 flex items-start justify-between gap-4">
            <div>
              <div className="font-medium text-gray-800">
                {LEAVE_TYPE_LABEL[l.type] || l.type}
                {l.days_requested ? ` · ${l.days_requested}일` : ''}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                {formatDate(l.start_date)} ~ {formatDate(l.end_date)}
              </div>
              {l.reason && <div className="text-sm text-gray-400 mt-1">사유: {l.reason}</div>}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <StatusBadge status={l.status} />
              {isLeaveEditable(l.start_date) && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEditLeave(l.id)}
                    disabled={deletingLeaveId === l.id}
                    className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLeave(l.id)}
                    disabled={deletingLeaveId === l.id}
                    className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                  >
                    {deletingLeaveId === l.id ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="출퇴근 수정 요청" count={revisions.length}>
        {revisions.map((r) => (
          <div key={r.id} className="px-6 py-4 flex items-start justify-between gap-4">
            <div>
              <div className="font-medium text-gray-800">{formatDate(r.requested_date)}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                요청 출근: {formatDateTime(r.requested_check_in_at)} · 요청 퇴근: {formatDateTime(r.requested_check_out_at)}
              </div>
              {r.reason && <div className="text-sm text-gray-400 mt-1">사유: {r.reason}</div>}
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </SectionCard>

      <SectionCard title="연장근무 신청" count={overtimes.length}>
        {overtimes.map((o) => (
          <div key={o.id} className="px-6 py-4 flex items-start justify-between gap-4">
            <div>
              <div className="font-medium text-gray-800">{formatDate(o.work_date)}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {formatDateTime(o.requested_start_at)} ~ {formatDateTime(o.requested_end_at)}
              </div>
              {o.reason && <div className="text-sm text-gray-400 mt-1">사유: {o.reason}</div>}
            </div>
            <StatusBadge status={o.status} />
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default MyApprovals;
