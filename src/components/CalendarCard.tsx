import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const HOLIDAY_API = '/api/calendar/holiday';
const MYOHAN_API = '/api/calendar/myohancalendar';

// 구글 캘린더에 새 일정이 생겨도 이 시간 안에는 재조회하지 않는다.
// (기존에는 한 번 불러온 달을 영원히 캐싱해서 새 일정이 새로고침 전까지 안 보였음)
const CACHE_TTL_MS = 60_000;

type CalendarCardProps = {
  title?: string;
  className?: string;
  onDateClick?: (isoDate: string) => void;
  events?: Array<{ title: string; date?: string; start?: string; end?: string }>;
};

type EventsByMonth = Record<string, any[]>;

/** API 응답을 events 배열로 정규화. 실패 시 서버가 준 error 메시지를 담아 throw. */
async function fetchEvents(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = String(body.error);
    } catch {
      /* JSON 아니면 상태코드만 사용 */
    }
    throw new Error(detail);
  }
  const body = await res.json();
  return Array.isArray(body?.events) ? body.events : [];
}

const CalendarCard: React.FC<CalendarCardProps> = ({
  title = '캘린더',
  className = '',
  onDateClick,
}) => {
  const calRef = useRef<FullCalendar | null>(null);
  const [viewTitle, setViewTitle] = useState<string>('');

  // 1. 이벤트 데이터 상태: 월(YYYY-MM)별로 보관해서 재조회 시 그 달만 교체된다.
  //    (누적 append 방식이면 구글에서 삭제/수정된 일정이 화면에 남는 문제가 있음)
  const [holidayByMonth, setHolidayByMonth] = useState<EventsByMonth>({});
  const [myohanByMonth, setMyohanByMonth] = useState<EventsByMonth>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2. 캐싱/중복요청 제어: 렌더와 무관한 값이라 ref로 관리 → fetch 함수 identity 고정
  const fetchedAtRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const rangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const holidayEvents = useMemo(() => {
    // 인접 월 그리드가 겹치므로 title+date 기준으로 중복 제거
    const map = new Map<string, any>();
    for (const list of Object.values(holidayByMonth)) {
      for (const e of list) map.set(`${e.title}-${e.date || e.start}`, e);
    }
    return Array.from(map.values());
  }, [holidayByMonth]);

  const myohanEvents = useMemo(() => {
    const map = new Map<string, any>();
    for (const list of Object.values(myohanByMonth)) {
      for (const e of list) map.set(e.id ?? `${e.title}-${e.date || e.start}`, e);
    }
    return Array.from(map.values());
  }, [myohanByMonth]);

  // ✅ 데이터가 업데이트될 때마다 달력을 강제로 다시 그려서 스타일(빨간색)을 입힘
  useEffect(() => {
    if (calRef.current) {
      const api = calRef.current.getApi();
      api.render();
    }
  }, [holidayEvents, myohanEvents]);

  const holidayDateSet = useMemo(() => {
    const set = new Set<string>();
    const toDateStr = (v?: string) => {
      if (!v) return undefined;
      const s = v.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    };
    for (const e of holidayEvents) {
      const d = toDateStr(e.date) || toDateStr(e.start);
      if (d) set.add(d);
    }
    return set;
  }, [holidayEvents]);

  // 3. API 호출 (범위 기반). force=true면 TTL 무시하고 즉시 재조회.
  const fetchEventsForRange = useCallback(
    async (start: Date, end: Date, force = false) => {
      rangeRef.current = { start, end };

      const midDate = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
      const monthKey = `${midDate.getFullYear()}-${String(midDate.getMonth() + 1).padStart(2, '0')}`;

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

      // 한쪽이 죽어도 다른 쪽은 살리려고 allSettled 사용
      // (기존에는 둘 중 하나만 실패해도 전체를 throw해서 달력이 통째로 비었음)
      const [hRes, mRes] = await Promise.allSettled([
        fetchEvents(`${HOLIDAY_API}?${params}`),
        fetchEvents(`${MYOHAN_API}?${params}`),
      ]);

      const failures: string[] = [];

      if (hRes.status === 'fulfilled') {
        setHolidayByMonth((prev) => ({ ...prev, [monthKey]: hRes.value }));
      } else {
        failures.push(`공휴일: ${hRes.reason?.message ?? '불러오기 실패'}`);
      }

      if (mRes.status === 'fulfilled') {
        setMyohanByMonth((prev) => ({ ...prev, [monthKey]: mRes.value }));
      } else {
        failures.push(`묘한 캘린더: ${mRes.reason?.message ?? '불러오기 실패'}`);
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
    },
    []
  );

  const handleRefresh = useCallback(() => {
    const r = rangeRef.current;
    if (r) fetchEventsForRange(r.start, r.end, true);
  }, [fetchEventsForRange]);

  // 탭으로 돌아오면 TTL 기준으로 최신 일정 반영 (구글 캘린더에서 방금 만든 일정 대응)
  useEffect(() => {
    const revalidate = () => {
      if (document.hidden) return;
      const r = rangeRef.current;
      if (r) fetchEventsForRange(r.start, r.end);
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [fetchEventsForRange]);

  const headerButtons = useMemo(
    () => ({
      prev: () => calRef.current?.getApi().prev(),
      next: () => calRef.current?.getApi().next(),
      today: () => calRef.current?.getApi().today(),
    }),
    []
  );

  return (
    <div className={`bg-white shadow rounded-lg overflow-hidden flex flex-col ${className}`}>
      {/* ✅ 공휴일 및 요일 색상 강제 지정을 위한 CSS */}
      <style>{`
        /* 공휴일 숫자 빨간색 (최우선순위) */
        .fc-daygrid-day.fc-holiday .fc-daygrid-day-number {
          color: #ef4444 !important;
          font-weight: 600 !important;
        }
        /* 일요일 빨간색 */
        .fc-day-sun .fc-daygrid-day-number {
          color: #ef4444 !important;
        }
        /* 토요일 파란색 */
        .fc-day-sat .fc-daygrid-day-number {
          color: #2563eb !important;
        }
        /* 기본 날짜 숫자 스타일 */
        .fc-daygrid-day-number {
          text-decoration: none !important;
        }
      `}</style>

      <div className="bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xl font-semibold text-white shrink-0">{title}</h2>
          {viewTitle && <span className="text-xs text-emerald-100 truncate">{viewTitle}</span>}
          {loading && <span className="text-xs text-white/70 shrink-0">불러오는 중…</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            title="구글 캘린더에서 다시 불러오기"
            aria-label="새로고침"
            className="px-2.5 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition disabled:opacity-40"
          >
            ⟳
          </button>
          <button type="button" onClick={headerButtons.today} className="px-3 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition">오늘</button>
          <button type="button" onClick={headerButtons.prev} className="px-2.5 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition">‹</button>
          <button type="button" onClick={headerButtons.next} className="px-2.5 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition">›</button>
        </div>
      </div>

      {error && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700 truncate" title={error}>
            캘린더를 불러오지 못했습니다 — {error}
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="shrink-0 text-xs font-medium text-red-700 underline hover:no-underline disabled:opacity-40"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="p-4 flex-1 min-h-0">
        <FullCalendar
          key="calendar-root-fixed" // ✅ key 고정하여 데이터 로드 시 리마운트(오늘로 이동) 방지
          ref={(r) => { calRef.current = r; }}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          fixedWeekCount={false}
          height="450px"
          eventDisplay="block"
          events={[
            ...holidayEvents.map(e => ({ ...e, backgroundColor: 'transparent', borderColor: 'transparent', textColor: '#ef4444' })),
            ...myohanEvents.map(e => ({ ...e, backgroundColor: 'transparent', borderColor: 'transparent', textColor: '#000000' }))
          ]}
          datesSet={(arg) => {
            setViewTitle(arg.view.title);
            fetchEventsForRange(arg.start, arg.end);
          }}
          eventDidMount={(info) => {
            const titleEl = info.el.querySelector('div');
            const cell = info.el.closest('.fc-daygrid-day');
            if (!titleEl || !cell) return;
            const cellWidth = cell.clientWidth - 8;
            let fontSize = 10;
            const estimatedWidth = info.event.title.length * fontSize;
            if (estimatedWidth > cellWidth) {
              fontSize = Math.max(7, Math.floor(cellWidth / info.event.title.length));
            }
            titleEl.style.fontSize = `${fontSize}px`;
            titleEl.style.whiteSpace = 'nowrap';
            titleEl.style.overflow = 'hidden';
            titleEl.style.textOverflow = 'ellipsis';
          }}
          dayMaxEvents={false}
          dayCellClassNames={(arg) => {
            // ✅ 데이터가 로드되면 fc-holiday 클래스를 추가하여 CSS가 적용되게 함
            return holidayDateSet.has(arg.dateStr) ? ['fc-holiday'] : [];
          }}
          // ✅ JS 스타일링은 제거 (CSS가 !important로 처리)
          dayCellDidMount={() => {}}
          dateClick={(arg) => onDateClick?.(arg.dateStr)}
        />
      </div>
    </div>
  );
};

export default CalendarCard;
