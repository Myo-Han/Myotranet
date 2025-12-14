// 달력
import React, { useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

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

  const headerButtons = useMemo(
    () => ({
      prev: () => calRef.current?.getApi().prev(),
      next: () => calRef.current?.getApi().next(),
      today: () => calRef.current?.getApi().today(),
    }),
    []
  );

  return (
    <div className={`bg-white shadow rounded-lg overflow-hidden ${className}`}>
      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {viewTitle && <p className="text-xs text-emerald-100 mt-1">{viewTitle}</p>}
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

      <div className="p-4">
        <FullCalendar
          ref={(r) => {
            calRef.current = r;
          }}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          fixedWeekCount={true}
          expandRows={true}
          height="100%"
          dayMaxEvents={true}
          events={events}
          datesSet={(arg) => setViewTitle(arg.view.title)}
          dateClick={(arg) => onDateClick?.(arg.dateStr)}
        />
      </div>
    </div>
  );
};

export default CalendarCard;
