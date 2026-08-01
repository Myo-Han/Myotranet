// 대시보드 캘린더 카드. 데이터는 useCalendarEvents 훅이 전담하고
// 이 파일은 렌더링과 선택 날짜 상태만 다룬다.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useAuth } from '../context/AuthContext';
import CalendarEventForm from './CalendarEventForm';
import { occursOn, toDateStr, useCalendarEvents } from '../hooks/useCalendarEvents';
import type { CalendarEvent, CalendarKind, NewCalendarEvent } from '../hooks/useCalendarEvents';

type CalendarCardProps = {
  title?: string;
  className?: string;
  onDateClick?: (isoDate: string) => void;
};

const KIND_STYLE: Record<CalendarKind, { bg: string; fg: string; dot: string; label: string }> = {
  holiday: { bg: '#fee2e2', fg: '#b91c1c', dot: 'bg-red-500', label: '공휴일' },
  leave: { bg: '#fef3c7', fg: '#b45309', dot: 'bg-amber-500', label: '휴가' },
  event: { bg: '#dbeafe', fg: '#1d4ed8', dot: 'bg-blue-600', label: '일정' },
};

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

/** 시간 이벤트면 "14:00", 종일이면 빈 문자열 */
function timeLabel(event: CalendarEvent): string {
  if (event.allDay || !event.start) return '';
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const CalendarCard: React.FC<CalendarCardProps> = ({
  title = '캘린더',
  className = '',
  onDateClick,
}) => {
  const calRef = useRef<FullCalendar | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const { events, holidayDates, loading, error, loadRange, refresh, createEvent, deleteEvent } =
    useCalendarEvents();

  const [viewTitle, setViewTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(() => localDateStr(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fcEvents = useMemo(
    () =>
      events.map((e) => {
        const style = KIND_STYLE[e.kind];
        return {
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          backgroundColor: style.bg,
          borderColor: style.bg,
          textColor: style.fg,
        };
      }),
    [events]
  );

  const selectedEvents = useMemo(
    () =>
      events
        .filter((e) => occursOn(e, selectedDate))
        .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
    [events, selectedDate]
  );

  const selectDate = useCallback(
    (dateStr: string) => {
      setSelectedDate(dateStr);
      setFormOpen(false);
      setActionError(null);
      onDateClick?.(dateStr);
    },
    [onDateClick]
  );

  const handleCreate = useCallback(
    async (input: NewCalendarEvent) => {
      setSubmitting(true);
      setActionError(null);
      try {
        await createEvent(input);
        setFormOpen(false);
      } catch (e: any) {
        setActionError(e?.message ?? '일정 등록에 실패했습니다');
      } finally {
        setSubmitting(false);
      }
    },
    [createEvent]
  );

  const handleDelete = useCallback(
    async (event: CalendarEvent) => {
      if (!event.id) return;
      if (!window.confirm(`"${event.title}" 일정을 구글 캘린더에서 삭제할까요?`)) return;
      setSubmitting(true);
      setActionError(null);
      try {
        await deleteEvent(event.id);
      } catch (e: any) {
        setActionError(e?.message ?? '일정 삭제에 실패했습니다');
      } finally {
        setSubmitting(false);
      }
    },
    [deleteEvent]
  );

  const goto = useCallback((action: 'prev' | 'next' | 'today') => {
    const api = calRef.current?.getApi();
    if (!api) return;
    api[action]();
  }, []);

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg bg-white shadow ${className}`}>
      <style>{`
        /* 일요일/공휴일 빨강, 토요일 파랑 */
        .fc-daygrid-day.fc-holiday .fc-daygrid-day-number,
        .fc-day-sun .fc-daygrid-day-number { color: #ef4444 !important; font-weight: 600; }
        .fc-day-sat .fc-daygrid-day-number { color: #2563eb !important; }
        .fc-daygrid-day-number { text-decoration: none !important; font-size: 12px; padding: 4px 6px !important; }

        /* 일정 칩: 폰트를 줄이지 않고 넘치면 말줄임 */
        .fc-daygrid-event {
          border-radius: 4px;
          padding: 1px 5px;
          margin: 1px 2px;
          font-size: 11px;
          line-height: 1.5;
          border: none !important;
        }
        .fc-daygrid-event .fc-event-title,
        .fc-daygrid-event .fc-event-time {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;
        }
        .fc-daygrid-more-link { font-size: 10px; color: #6b7280; padding-left: 4px; }

        /* 선택한 날짜 */
        .fc-daygrid-day.fc-selected-day { background: #eff6ff !important; box-shadow: inset 0 0 0 2px #3b82f6; }
        .fc-daygrid-day.fc-day-today { background: #fffbeb !important; }
        .fc-daygrid-day { cursor: pointer; }
        .fc-theme-standard td, .fc-theme-standard th { border-color: #f1f5f9; }
        .fc-col-header-cell-cushion { font-size: 11px; color: #64748b; font-weight: 600; padding: 6px 0 !important; }
      `}</style>

      <div className="flex items-center justify-between bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-lg font-semibold text-white">{title}</h2>
          {viewTitle && <span className="truncate text-xs text-white/70">{viewTitle}</span>}
          {loading && <span className="shrink-0 text-xs text-white/60">불러오는 중…</span>}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            title="구글 캘린더에서 다시 불러오기"
            aria-label="새로고침"
            className="rounded-md bg-white/15 px-2.5 py-1.5 text-sm text-white transition hover:bg-white/25 disabled:opacity-40"
          >
            ⟳
          </button>
          <button
            type="button"
            onClick={() => goto('today')}
            className="rounded-md bg-white/15 px-3 py-1.5 text-sm text-white transition hover:bg-white/25"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => goto('prev')}
            aria-label="이전 달"
            className="rounded-md bg-white/15 px-2.5 py-1.5 text-sm text-white transition hover:bg-white/25"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => goto('next')}
            aria-label="다음 달"
            className="rounded-md bg-white/15 px-2.5 py-1.5 text-sm text-white transition hover:bg-white/25"
          >
            ›
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-2">
          <p className="truncate text-xs text-red-700" title={error}>
            캘린더를 불러오지 못했습니다 — {error}
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="shrink-0 text-xs font-medium text-red-700 underline hover:no-underline disabled:opacity-40"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="px-3 pt-3">
        {/* locale="ko"는 날짜를 "12일"로 렌더링하므로 dayCellContent로 숫자만 남긴다.
            (요일 머리글과 "2026년 8월" 표기는 한국어 그대로 두기 위해 locale은 유지) */}
        <FullCalendar
          key="calendar-root-fixed"
          ref={(r) => {
            calRef.current = r;
          }}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="ko"
          dayCellContent={(arg) => String(arg.date.getDate())}
          headerToolbar={false}
          fixedWeekCount={false}
          height="360px"
          eventDisplay="block"
          displayEventTime={false}
          dayMaxEvents={2}
          moreLinkText={(n) => `+${n}`}
          events={fcEvents}
          datesSet={(arg) => {
            setViewTitle(arg.view.title);
            loadRange(arg.start, arg.end);
          }}
          eventDidMount={(info) => {
            info.el.setAttribute('title', info.event.title);
          }}
          dayCellClassNames={(arg) => {
            const classes: string[] = [];
            if (holidayDates.has(arg.dateStr)) classes.push('fc-holiday');
            if (arg.dateStr === selectedDate) classes.push('fc-selected-day');
            return classes;
          }}
          dateClick={(arg) => selectDate(arg.dateStr)}
          eventClick={(arg) => {
            const d = toDateStr(arg.event.startStr);
            if (d) selectDate(d);
          }}
        />
      </div>

      {/* 선택한 날짜의 일정 */}
      <div className="border-t border-gray-100 px-5 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{formatDateLabel(selectedDate)}</h3>
          {isAdmin && !formOpen && (
            <button
              type="button"
              onClick={() => {
                setFormOpen(true);
                setActionError(null);
              }}
              className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              + 일정 추가
            </button>
          )}
        </div>

        {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}

        {formOpen ? (
          <CalendarEventForm
            defaultDate={selectedDate}
            submitting={submitting}
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        ) : selectedEvents.length === 0 ? (
          <p className="mt-2 text-xs text-gray-400">일정이 없습니다.</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {selectedEvents.map((e, i) => {
              const style = KIND_STYLE[e.kind];
              const time = timeLabel(e);
              return (
                <li
                  key={e.id ?? `${e.title}-${e.start}-${i}`}
                  className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800" title={e.title}>
                    {time && <span className="mr-1.5 text-xs text-gray-400">{time}</span>}
                    {e.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400">{style.label}</span>
                  {isAdmin && e.kind === 'event' && e.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(e)}
                      disabled={submitting}
                      aria-label="일정 삭제"
                      className="shrink-0 text-xs text-gray-300 transition hover:text-red-600 disabled:opacity-40 group-hover:text-gray-500"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CalendarCard;
