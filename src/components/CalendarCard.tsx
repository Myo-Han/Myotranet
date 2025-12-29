import React, { useMemo, useRef, useState, useCallback } from 'react';
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
}) => {
  const calRef = useRef<FullCalendar | null>(null);
  const [viewTitle, setViewTitle] = useState<string>('');

  // 1. 이벤트 데이터 상태 (누적 저장)
  const [holidayEvents, setHolidayEvents] = useState<any[]>([]);
  const [myohanEvents, setMyohanEvents] = useState<any[]>([]);

  // 2. 캐싱 상태: 이미 불러온 연-월(YYYY-MM)을 기록
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());

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

  // 3. API 호출 및 데이터 누적 함수
  const fetchEventsForRange = useCallback(async (start: Date, end: Date) => {
    // 현재 보고 있는 달의 중앙 날짜를 기준으로 월 키(YYYY-MM) 생성
    const midDate = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
    const monthKey = `${midDate.getFullYear()}-${String(midDate.getMonth() + 1).padStart(2, '0')}`;

    // 이미 불러온 월이면 중단
    if (loadedMonths.has(monthKey)) return;

    try {
      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
      });

      const [hRes, mRes] = await Promise.all([
        fetch(`${HOLIDAY_API}?${params}`),
        fetch(`${MYOHAN_API}?${params}`),
      ]);

      if (!hRes.ok || !mRes.ok) throw new Error('데이터 로드 실패');

      const hData = await hRes.json();
      const mData = await mRes.json();

      const hList = Array.isArray(hData?.events) ? hData.events : [];
      const mList = Array.isArray(mData?.events) ? mData.events : [];

      setHolidayEvents((prev) => {
        const combined = [...prev, ...hList];
        // title과 date를 조합하거나 고유 ID가 있다면 그것을 사용하여 중복 제거
        return Array.from(new Map(combined.map(item => [`${item.title}-${item.date || item.start}`, item])).values());
      });

      setMyohanEvents((prev) => {
        const combined = [...prev, ...mList];
        // myohancalendar.ts는 id를 반환하므로 id 기준 중복 제거
        return Array.from(new Map(combined.map(item => [item.id, item])).values());
      });

      // 캐시 업데이트
      setLoadedMonths((prev) => new Set(prev).add(monthKey));
    } catch (e) {
      console.error('Calendar fetch error:', e);
    }
  }, [loadedMonths]);

  return (
    <div className={`bg-white shadow rounded-lg overflow-hidden flex flex-col ${className}`}>
      <div className="bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xl font-semibold text-white shrink-0">{title}</h2>
          {viewTitle && <span className="text-xs text-emerald-100 truncate">{viewTitle}</span>}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={headerButtons.today} className="px-3 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition">오늘</button>
          <button type="button" onClick={headerButtons.prev} className="px-2.5 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition">‹</button>
          <button type="button" onClick={headerButtons.next} className="px-2.5 py-1.5 rounded-md bg-white/15 text-white text-sm hover:bg-white/25 transition">›</button>
        </div>
      </div>

      <div className="p-4 flex-1 min-h-0">
        <FullCalendar
          key={`cal-${holidayDateSet.size}`}
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
          // 4. 달력의 날짜 범위가 바뀔 때(초기 로드 포함) 실행되는 함수
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
          dateClick={(arg) => onDateClick?.(arg.dateStr)}
        />
      </div>
    </div>
  );
};

export default CalendarCard;