// 캘린더 기능의 데이터 계층.
// 화면 컴포넌트(CalendarCard)는 이 훅만 사용하고 fetch를 직접 호출하지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const HOLIDAY_API = '/api/calendar/holiday';
const MYOHAN_API = '/api/calendar/myohancalendar';

// 일정 생성/삭제용 엔드포인트.
// Vercel Hobby 플랜의 서버리스 함수 12개 상한에 이미 도달해서 전용 파일을 새로 만들 수 없다.
// 기존 휴가 캘린더 함수(create-leave-event)에 action 분기를 얹어 재사용한다.
const MUTATE_API = '/api/calendar/create-leave-event';

// 구글 캘린더에 새 일정이 생겨도 이 시간 안에는 재조회하지 않는다.
const CACHE_TTL_MS = 60_000;

export type CalendarKind = 'holiday' | 'leave' | 'event';

export type CalendarEvent = {
  id?: string;
  title: string;
  start?: string;
  end?: string;
  allDay: boolean;
  kind: CalendarKind;
};

export type NewCalendarEvent = {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (사용자가 고른 마지막 날, 포함)
  allDay: boolean;
  startTime?: string; // HH:mm (allDay=false일 때만 사용)
  endTime?: string;
  description?: string;
};

type EventsByMonth = Record<string, CalendarEvent[]>;

type RawEvent = {
  id?: string;
  title?: string;
  date?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
};

// 휴가 일정은 "{이름} {연차|반차|반반차}" 형태로 생성되므로 제목으로 추정한다.
// 색상 구분에만 쓰고, 삭제 가능 여부는 서버가 DB(leaves.calendar_event_id)로 판정한다.
const LEAVE_TITLE_RE = /(연차|반차|반반차)/;

export function toDateStr(value?: string): string | undefined {
  if (!value) return undefined;
  const s = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 이벤트가 해당 날짜에 걸쳐 있는지. 종일 이벤트의 end는 배타적이라 하루 빼서 비교한다. */
export function occursOn(event: CalendarEvent, dateStr: string): boolean {
  const start = toDateStr(event.start);
  if (!start) return false;

  const rawEnd = toDateStr(event.end);
  if (!rawEnd) return start === dateStr;

  const lastDay = event.allDay ? addDays(rawEnd, -1) : rawEnd;
  return dateStr >= start && dateStr <= lastDay;
}

function normalize(raw: RawEvent, isHoliday: boolean): CalendarEvent {
  const title = raw.title ?? '(제목 없음)';
  return {
    id: raw.id,
    title,
    start: raw.date ?? raw.start,
    end: raw.end,
    allDay: raw.allDay !== false,
    kind: isHoliday ? 'holiday' : LEAVE_TITLE_RE.test(title) ? 'leave' : 'event',
  };
}

/** 응답을 이벤트 배열로 정규화. 실패 시 서버가 준 error 메시지를 담아 throw. */
async function fetchList(url: string, isHoliday: boolean): Promise<CalendarEvent[]> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = String(body.error);
    } catch {
      /* JSON이 아니면 상태코드만 사용 */
    }
    throw new Error(detail);
  }
  const body = await res.json();
  const list: RawEvent[] = Array.isArray(body?.events) ? body.events : [];
  return list.filter((e) => e.date || e.start).map((e) => normalize(e, isHoliday));
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function mutate(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(MUTATE_API, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = String(body.error);
    } catch {
      /* JSON이 아니면 상태코드만 사용 */
    }
    throw new Error(detail);
  }
}

export function useCalendarEvents() {
  // 월(YYYY-MM)별로 보관해서 재조회 시 그 달만 통째로 교체된다.
  // 누적 append 방식이면 구글에서 삭제/수정된 일정이 화면에 남는다.
  const [holidayByMonth, setHolidayByMonth] = useState<EventsByMonth>({});
  const [myohanByMonth, setMyohanByMonth] = useState<EventsByMonth>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 렌더와 무관한 값이라 ref로 관리 → loadRange의 identity가 고정된다.
  const fetchedAtRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const events = useMemo(() => {
    // 인접 월 그리드가 겹치므로 중복 제거
    const map = new Map<string, CalendarEvent>();
    for (const list of Object.values(holidayByMonth)) {
      for (const e of list) map.set(`h:${e.title}:${e.start}`, e);
    }
    for (const list of Object.values(myohanByMonth)) {
      for (const e of list) map.set(e.id ? `m:${e.id}` : `m:${e.title}:${e.start}`, e);
    }
    return Array.from(map.values());
  }, [holidayByMonth, myohanByMonth]);

  const holidayDates = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (e.kind !== 'holiday') continue;
      const d = toDateStr(e.start);
      if (d) set.add(d);
    }
    return set;
  }, [events]);

  const loadRange = useCallback(async (start: Date, end: Date, force = false) => {
    rangeRef.current = { start, end };

    const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
    const monthKey = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}`;

    if (inFlightRef.current.has(monthKey)) return;
    if (!force) {
      const fetchedAt = fetchedAtRef.current.get(monthKey);
      if (fetchedAt && Date.now() - fetchedAt < CACHE_TTL_MS) return;
    }

    inFlightRef.current.add(monthKey);
    setLoading(true);

    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    });

    // 한쪽이 죽어도 다른 쪽은 살린다 (Promise.all이면 하나만 실패해도 달력이 통째로 빈다)
    const [holiday, myohan] = await Promise.allSettled([
      fetchList(`${HOLIDAY_API}?${params}`, true),
      fetchList(`${MYOHAN_API}?${params}`, false),
    ]);

    const failures: string[] = [];

    if (holiday.status === 'fulfilled') {
      setHolidayByMonth((prev) => ({ ...prev, [monthKey]: holiday.value }));
    } else {
      failures.push(`공휴일: ${holiday.reason?.message ?? '불러오기 실패'}`);
    }

    if (myohan.status === 'fulfilled') {
      setMyohanByMonth((prev) => ({ ...prev, [monthKey]: myohan.value }));
    } else {
      failures.push(`묘한 캘린더: ${myohan.reason?.message ?? '불러오기 실패'}`);
    }

    if (failures.length === 0) {
      fetchedAtRef.current.set(monthKey, Date.now());
      setError(null);
    } else {
      // 실패한 달은 캐시에 기록하지 않아 다음 시도 때 바로 재조회된다
      fetchedAtRef.current.delete(monthKey);
      setError(failures.join(' / '));
      console.error('Calendar fetch error:', failures.join(' / '));
    }

    inFlightRef.current.delete(monthKey);
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    const r = rangeRef.current;
    if (!r) return Promise.resolve();
    return loadRange(r.start, r.end, true);
  }, [loadRange]);

  // 탭으로 돌아오면 TTL 기준으로 최신 일정 반영
  useEffect(() => {
    const revalidate = () => {
      if (document.hidden) return;
      const r = rangeRef.current;
      if (r) loadRange(r.start, r.end);
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [loadRange]);

  const createEvent = useCallback(
    async (input: NewCalendarEvent) => {
      await mutate({ action: 'createEvent', ...input });
      await refresh();
    },
    [refresh]
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      await mutate({ action: 'deleteEvent', eventId });
      await refresh();
    },
    [refresh]
  );

  return {
    events,
    holidayDates,
    loading,
    error,
    loadRange,
    refresh,
    createEvent,
    deleteEvent,
  };
}
