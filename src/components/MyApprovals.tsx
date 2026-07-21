// 나의 결재: 내가 신청한 결재건 중 아직 처리되지 않은(진행 중, status='pending') 건들을
// 유형별(휴가 신청 / 출퇴근 수정 요청 / 연장근무 신청) 목록으로 보여준다.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';

type LeaveRow = {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  days_requested: number | null;
  reason: string | null;
  created_at: string;
};

type RevisionRow = {
  id: string;
  requested_date: string;
  requested_check_in_at: string | null;
  requested_check_out_at: string | null;
  reason: string | null;
  created_at: string;
};

type OvertimeRow = {
  id: string;
  work_date: string;
  requested_start_at: string;
  requested_end_at: string;
  reason: string | null;
  created_at: string;
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

const PendingBadge = () => (
  <span className="shrink-0 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800">결재 대기중</span>
);

const SectionCard: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => (
  <div className="bg-white shadow rounded-lg overflow-hidden">
    <div className="px-6 py-4 border-b flex items-center justify-between">
      <h3 className="font-bold text-gray-900">{title}</h3>
      <span className="text-sm text-gray-400">{count}건</span>
    </div>
    {count === 0 ? (
      <p className="text-sm text-gray-400 text-center py-6">진행 중인 건이 없습니다.</p>
    ) : (
      <div className="divide-y">{children}</div>
    )}
  </div>
);

const MyApprovals: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRow[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [leaveRes, revisionRes, overtimeRes] = await Promise.all([
          supabase
            .from('leaves')
            .select('id, start_date, end_date, type, days_requested, reason, created_at')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
          supabase
            .from('attendance_revision_requests')
            .select('id, requested_date, requested_check_in_at, requested_check_out_at, reason, created_at')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
          supabase
            .from('overtime_requests')
            .select('id, work_date, requested_start_at, requested_end_at, reason, created_at')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        ]);

        if (leaveRes.error) throw leaveRes.error;
        if (revisionRes.error) throw revisionRes.error;
        if (overtimeRes.error) throw overtimeRes.error;

        setLeaves((leaveRes.data || []) as LeaveRow[]);
        setRevisions((revisionRes.data || []) as RevisionRow[]);
        setOvertimes((overtimeRes.data || []) as OvertimeRow[]);
      } catch (e) {
        console.error('나의 결재 로드 실패:', e);
        setLeaves([]);
        setRevisions([]);
        setOvertimes([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const totalCount = leaves.length + revisions.length + overtimes.length;

  if (loading) {
    return <p className="text-sm text-gray-400 text-center py-6">불러오는 중...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">나의 결재</h2>
          <p className="text-sm text-gray-500 mt-1">내가 신청한 결재건 중 아직 처리되지 않은 건들입니다.</p>
        </div>
        <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-600">
          진행 중 {totalCount}건
        </span>
      </div>

      <SectionCard title="휴가 신청" count={leaves.length}>
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
            <PendingBadge />
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
            <PendingBadge />
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
            <PendingBadge />
          </div>
        ))}
      </SectionCard>
    </div>
  );
};

export default MyApprovals;
