// 달력
import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const HOLIDAY_API = '/api/calendar/holiday';
const MYOHAN_API = '/api/calendar/myohancalendar';


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

  const [myohanEvents, setMyohanEvents] = useState<
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
      const s = v.slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
    };

    for (const e of holidayEvents) {
      const d = toDateStr(e.date) || toDateStr(e.start);
      if (d) set.add(d);
    }

    return set;
  }, [holidayEvents]);

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        const [hRes, mRes] = await Promise.all([
          fetch(HOLIDAY_API, { signal: ac.signal }),
          fetch(MYOHAN_API, { signal: ac.signal }),
        ]);

        if (!hRes.ok) throw new Error(`holiday fetch failed: ${hRes.status}`);
        if (!mRes.ok) throw new Error(`myohan fetch failed: ${mRes.status}`);

        const hData = await hRes.json();
        const hList = Array.isArray(hData) ? hData : Array.isArray(hData?.events) ? hData.events : [];
        setHolidayEvents(hList);

        const mData = await mRes.json();
        const mList = Array.isArray(mData) ? mData : Array.isArray(mData?.events) ? mData.events : [];
        setMyohanEvents(mList);
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
          key={`cal-${holidayDateSet.size}`}
          ref={(r) => { calRef.current = r; }}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          fixedWeekCount={true}
          expandRows={true}
          height="95%"
          contentHeight="auto"
          eventDisplay="block"
          events={[
            ...holidayEvents.map(e => ({
              ...e,
              backgroundColor: 'transparent',
              borderColor: 'transparent',
              textColor: '#ef4444'
            })),
            ...myohanEvents.map(e => ({
              ...e,
              backgroundColor: 'transparent',
              borderColor: 'transparent',
              textColor: '#000000'
            }))
          ]}
          eventDidMount={(info) => {
            const titleEl = info.el.querySelector('div');
            const cell = info.el.closest('.fc-daygrid-day');

            if (!titleEl || !cell) return;

            const cellWidth = cell.clientWidth - 8; // 패딩 여유
            const title = info.event.title;

            // 한글 기준 대략적인 너비 계산 (1글자 ≈ 10px at 10px font)
            let fontSize = 10;
            const estimatedWidth = title.length * fontSize;

            if (estimatedWidth > cellWidth) {
              fontSize = Math.max(7, Math.floor(cellWidth / title.length));
            }

            titleEl.style.fontSize = `${fontSize}px`;
            titleEl.style.whiteSpace = 'nowrap';
            titleEl.style.overflow = 'hidden';
            titleEl.style.textOverflow = 'ellipsis';
          }}
          dayMaxEvents={false}
          dayCellClassNames={(arg) => (holidayDateSet.has(arg.dateStr) ? ['fc-holiday'] : [])}
          dayCellDidMount={(arg) => {
            const dateStr = arg.el.getAttribute('data-date');

            const num = arg.el.querySelector('.fc-daygrid-day-number') as HTMLElement | null;
            if (!num) return;

            if (dateStr && holidayDateSet.has(dateStr)) {
              num.style.color = '#ef4444';
              num.style.fontWeight = '600';
              return;
            }

            const dow = arg.date.getDay();
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
