import { supabase } from '../../supabaseClient';
import type { AttendanceEventRow, AttendanceRow } from './reportUtils';

export const fetchUserName = async (userId: string) => {
  const { data, error } = await supabase.from('users').select('name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data?.name || '').toString() || '사용자';
};

export const fetchAttendanceWithEvents = async (params: { userId: string; startKey: string; endKey: string }) => {
  const { userId, startKey, endKey } = params;

  const { data: attendance, error: aErr } = await supabase
    .from('attendance')
    .select('id, user_id, date, check_in, check_out, status, total_work_seconds')
    .eq('user_id', userId)
    .gte('date', startKey)
    .lte('date', endKey)
    .order('date', { ascending: true });

  if (aErr) throw aErr;

  const attRows: AttendanceRow[] = (attendance || []).map((r: any) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    date: String(r.date),
    check_in: r.check_in ?? null,
    check_out: r.check_out ?? null,
    status: r.status ?? null,
    total_work_seconds: r.total_work_seconds ?? 0,
  }));

  const ids = attRows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return { attendance: attRows, events: [] as AttendanceEventRow[] };

  const { data: events, error: eErr } = await supabase
    .from('attendance_events')
    .select('id, attendance_id, user_id, event_type, occurred_at, reason_category, notes')
    .in('attendance_id', ids)
    .order('occurred_at', { ascending: true });

  if (eErr) throw eErr;

  const evRows: AttendanceEventRow[] = (events || []).map((e: any) => ({
    id: String(e.id),
    attendance_id: String(e.attendance_id),
    user_id: String(e.user_id),
    event_type: String(e.event_type),
    occurred_at: String(e.occurred_at),
    reason_category: e.reason_category ?? null,
    notes: e.notes ?? null,
  }));

  return { attendance: attRows, events: evRows };
};