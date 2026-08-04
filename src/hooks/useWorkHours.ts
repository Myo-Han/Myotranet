// 오늘 / 이번 주 근무시간 집계.
//
// attendance.total_work_seconds는 퇴근(또는 업무정지) 시점에만 확정된다.
// 그래서 진행 중인 세션은 check_in 이후 경과 시간에서 pause 구간을 빼서 따로 더해야
// 실제 근무시간이 나온다. 계산 규칙은 Dashboard의 calcWorkSecondsUntil과 동일하다.
//
// 1초마다 다시 그리는 대신 60초 주기로 재조회한다. 화면 표기가 분 단위(H:MM)라
// 그 이상 자주 갱신할 이유가 없고, 탭을 켜둔 사람이 많아도 부담이 적다.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

type AttendanceRow = {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_work_seconds: number | null;
};

const REFRESH_MS = 60_000;

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** 이번 주 첫날(월요일). 주 40시간 기준이 월~일이라 월요일을 시작으로 본다. */
function startOfWeek(today: Date): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const mondayIndex = (d.getDay() + 6) % 7; // 월=0 … 일=6
  d.setDate(d.getDate() - mondayIndex);
  return d;
}

/** 아직 퇴근하지 않은 세션의 근무 초. pause~resume 구간은 제외한다. */
async function openSessionSeconds(userId: string, row: AttendanceRow, now: Date): Promise<number> {
  if (!row.check_in) return 0;

  const { data: events, error } = await supabase
    .from('attendance_events')
    .select('event_type, occurred_at')
    .eq('user_id', userId)
    .eq('attendance_id', row.id)
    .in('event_type', ['pause', 'resume'])
    // 재출근으로 같은 row를 재사용할 때 이전 세션 이벤트가 섞이지 않도록 현재 세션만
    .gte('occurred_at', row.check_in)
    .order('occurred_at', { ascending: true });

  if (error) return 0;

  let pauseSeconds = 0;
  let lastPause: Date | null = null;

  for (const e of (events || []) as { event_type: string; occurred_at: string }[]) {
    if (e.event_type === 'pause') {
      lastPause = new Date(e.occurred_at);
    } else if (e.event_type === 'resume' && lastPause) {
      pauseSeconds += (new Date(e.occurred_at).getTime() - lastPause.getTime()) / 1000;
      lastPause = null;
    }
  }
  // 아직 재개하지 않았다면 지금까지가 전부 정지 구간
  if (lastPause) {
    pauseSeconds += (now.getTime() - (lastPause as Date).getTime()) / 1000;
  }

  const elapsed = Math.floor((now.getTime() - new Date(row.check_in).getTime()) / 1000);
  return Math.max(0, elapsed - Math.floor(pauseSeconds));
}

export function useWorkHours(userId?: string) {
  const [todaySeconds, setTodaySeconds] = useState<number | null>(null);
  const [weekSeconds, setWeekSeconds] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;

    const now = new Date();
    const today = toLocalDateStr(now);
    const from = toLocalDateStr(startOfWeek(now));

    const { data, error } = await supabase
      .from('attendance')
      .select('id, date, check_in, check_out, total_work_seconds')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', today);

    // 부가 지표라 실패해도 조용히 둔다 (직전 값 유지)
    if (error) return;

    const rows = (data || []) as AttendanceRow[];
    let week = 0;
    let todayTotal = 0;

    for (const row of rows) {
      // 퇴근 전이면 확정분(total_work_seconds)에 진행 중인 세션을 더한다
      const banked = Number(row.total_work_seconds || 0);
      const live = row.check_out ? 0 : await openSessionSeconds(userId, row, now);
      const seconds = banked + live;

      week += seconds;
      if (row.date === today) todayTotal += seconds;
    }

    setWeekSeconds(week);
    setTodaySeconds(todayTotal);
  }, [userId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    // 탭을 다시 켰을 때 오래된 값이 남아 있지 않도록
    const onFocus = () => {
      if (!document.hidden) load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  return { todaySeconds, weekSeconds, reload: load };
}

/** 초 → "H:MM" */
export function formatHM(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
