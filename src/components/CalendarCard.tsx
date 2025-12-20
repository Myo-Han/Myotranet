// 달력
import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const HOLIDAY_API = '/api/calendar/holiday';


type CalendarCardProps = {
  title?: string;
  className?: string;
  onDateClick?: (isoDate: string) => void;
  events?: Array<{ title: string; date?: string; start?: string; end?: string }>;
};

const CalendarCard: React.FC<CalendarCardProps> = ({
  title = '캘린더',
  className = '',
  onDateClick,
  events = [],
}) => {
  const calRef = useRef<FullCalendar | null>(null);
  const [viewTitle, setViewTitle] = useState<string>('');

  const [holidayEvents, setHolidayEvents] = useState<
    Array<{ title: string; date?: string; start?: string; end?: string }>
  >([]);

  const headerButtons = useMemo(
    () => ({
      prev: () => calRef.current?.getApi().prev(),
      next: () => calRef.current?.getApi().next(),
      today: () => calRef.current?.getApi().today(),
    }),
    []
  );

  const holidayDateSet = useMemo(() => {
    const set = new Set<string>();

    const toDateStr = (v?: string) => {
      if (!v) return undefined;
      // 2025-01-01 or 2025-01-01T00:00:00Z -> 2025-01-01
      const s = v.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    };

    for (const e of holidayEvents as any[]) {
      const d = toDateStr(e.date) || toDateStr(e.start) || toDateStr(e.start?.dateTime) || toDateStr(e.start?.date);
      if (d) set.add(d);
    }

    return set;
  }, [holidayEvents]);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(HOLIDAY_API, { signal: ac.signal });
        if (!res.ok) throw new Error(`holiday fetch failed: ${res.status}`);

        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
        setHolidayEvents(list);
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.error(e);
      }
    })();

    return () => ac.abort();
  }, []);

  return (
    <div className={`bg-white shadow rounded-lg overflow-hidden flex flex-col ${className}`}>
      <div className="bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xl font-semibold text-white shrink-0">{title}</h2>
          {viewTitle && <span className="text-xs text-emerald-100 truncate">{viewTitle}</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={headerButtons.today}
            className="px-3 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={headerButtons.prev}
            className="px-2.5 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition"
            aria-label="이전 달"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={headerButtons.next}
            className="px-2.5 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 min-h-0">
        <FullCalendar
          key={holidayEvents.length}
          ref={(r) => { calRef.current = r; }}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          fixedWeekCount={true}
          expandRows={true}
          height="100%"
          dayMaxEvents={true}
          events={holidayEvents}
          dayCellClassNames={(arg) => (holidayDateSet.has(arg.dateStr) ? ['fc-holiday'] : [])}
          dayCellDidMount={(arg) => {
            const num = arg.el.querySelector('.fc-daygrid-day-number') as HTMLElement | null;
            if (!num) return;

            // 공휴일(빨강 우선)
            if (holidayDateSet.has(arg.dateStr)) {
              num.style.color = '#ef4444';
              num.style.fontWeight = '600';
              return;
            }

            // 주말
            const dow = arg.date.getDay(); // 0=일, 6=토
            if (dow === 0) num.style.color = '#ef4444';
            if (dow === 6) num.style.color = '#2563eb';
          }}
          datesSet={(arg) => setViewTitle(arg.view.title)}
          dateClick={(arg) => onDateClick?.(arg.dateStr)}
        />

      </div>
    </div>
  );
};

export default CalendarCard;
