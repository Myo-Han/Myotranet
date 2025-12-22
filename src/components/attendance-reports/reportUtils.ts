import type { ReportMode } from './reportTypes';

export type AttendanceRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  check_in: string | null; // ISO
  check_out: string | null; // ISO
  status: string | null; // working | paused | off | vacation | null
  total_work_seconds: number | null; // net work seconds (pause 제외)
};

export type AttendanceEventRow = {
  id?: string;
  attendance_id: string;
  user_id: string;
  event_type: string; // check_in | check_out | pause | resume | etc
  occurred_at: string; // ISO
  reason_category: string | null;
  notes: string | null;
};

export const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const parseDateKeyToLocalMidnight = (yyyyMMdd: string) => {
  const [y, m, d] = yyyyMMdd.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

export const formatTimeHHMM = (iso: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const formatDurationHhMm = (seconds: number | null | undefined) => {
  if (!seconds || seconds <= 0) return '-';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
};

export const formatMmDdDow = (yyyyMMdd: string) => {
  const d = parseDateKeyToLocalMidnight(yyyyMMdd);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dow = d.toLocaleDateString('ko-KR', { weekday: 'short' }); // 월/화/수...
  return `${mm}/${dd}(${dow})`;
};

export const getMonthRange = (yyyyMm: string) => {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 0, 0, 0, 0); // last day
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { startKey, endKey, daysInMonth: end.getDate() };
};

export const diffDaysInclusive = (startKey: string, endKey: string) => {
  const a = parseDateKeyToLocalMidnight(startKey).getTime();
  const b = parseDateKeyToLocalMidnight(endKey).getTime();
  const diff = Math.floor((b - a) / (24 * 3600 * 1000));
  return diff + 1;
};

export const clampDateRangeMax31Days = (startKey: string, endKey: string) => {
  const days = diffDaysInclusive(startKey, endKey);
  return days <= 31;
};

export const groupEventsByAttendanceId = (events: AttendanceEventRow[]) => {
  const map: Record<string, AttendanceEventRow[]> = {};
  for (const e of events) {
    const k = String(e.attendance_id);
    if (!map[k]) map[k] = [];
    map[k].push(e);
  }
  Object.keys(map).forEach((k) => {
    map[k].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  });
  return map;
};

// pause/resume 누적(세션 범위 안에서만)
export const calcPauseSecondsInRange = (events: AttendanceEventRow[], rangeStartIso: string, rangeEndIso: string) => {
  const startMs = new Date(rangeStartIso).getTime();
  const endMs = new Date(rangeEndIso).getTime();
  if (!(endMs > startMs)) return 0;

  const sorted = [...events]
    .filter((e) => e.event_type === 'pause' || e.event_type === 'resume')
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  let totalPauseSeconds = 0;
  let lastPauseMs: number | null = null;

  for (const ev of sorted) {
    const t = new Date(ev.occurred_at).getTime();

    if (ev.event_type === 'pause') {
      lastPauseMs = t;
      continue;
    }

    if (ev.event_type === 'resume' && lastPauseMs !== null) {
      const pauseStart = Math.max(lastPauseMs, startMs);
      const pauseEnd = Math.min(t, endMs);
      if (pauseEnd > pauseStart) totalPauseSeconds += (pauseEnd - pauseStart) / 1000;
      lastPauseMs = null;
    }
  }

  if (lastPauseMs !== null) {
    const pauseStart = Math.max(lastPauseMs, startMs);
    const pauseEnd = endMs;
    if (pauseEnd > pauseStart) totalPauseSeconds += (pauseEnd - pauseStart) / 1000;
  }

  return Math.max(0, Math.floor(totalPauseSeconds));
};

// (구버전 데이터 대비) check_in/check_out 이벤트가 없으면 합성해서 붙임
export const ensureCheckInOutEvents = (att: AttendanceRow, events: AttendanceEventRow[]) => {
  const out: AttendanceEventRow[] = [...events];

  const hasCheckIn = out.some((e) => e.event_type === 'check_in');
  const hasCheckOut = out.some((e) => e.event_type === 'check_out');

  if (att.check_in && !hasCheckIn) {
    out.push({
      attendance_id: att.id,
      user_id: att.user_id,
      event_type: 'check_in',
      occurred_at: att.check_in,
      reason_category: null,
      notes: null,
    });
  }

  if (att.check_out && !hasCheckOut) {
    out.push({
      attendance_id: att.id,
      user_id: att.user_id,
      event_type: 'check_out',
      occurred_at: att.check_out,
      reason_category: null,
      notes: null,
    });
  }

  out.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  return out;
};

export const buildDateKeyList = (startKey: string, endKey: string) => {
  const start = parseDateKeyToLocalMidnight(startKey);
  const end = parseDateKeyToLocalMidnight(endKey);
  const out: string[] = [];

  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

export const getRangeForMode = (mode: ReportMode, dateStart: string, dateEnd: string, month: string) => {
  if (mode === 'date_detail') return { startKey: dateStart, endKey: dateEnd };
  const { startKey, endKey } = getMonthRange(month);
  return { startKey, endKey };
};