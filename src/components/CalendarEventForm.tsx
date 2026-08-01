// 캘린더 일정 추가 폼. CalendarCard 안에서만 쓰이는 표현 전용 컴포넌트로,
// 저장/에러 처리는 전부 부모가 담당한다.
import React, { useEffect, useState } from 'react';
import type { NewCalendarEvent } from '../hooks/useCalendarEvents';

type CalendarEventFormProps = {
  defaultDate: string; // YYYY-MM-DD
  submitting: boolean;
  onSubmit: (input: NewCalendarEvent) => void;
  onCancel: () => void;
};

const inputClass =
  'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const CalendarEventForm: React.FC<CalendarEventFormProps> = ({
  defaultDate,
  submitting,
  onSubmit,
  onCancel,
}) => {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  // 달력에서 다른 날짜를 고르면 폼의 날짜도 따라간다
  useEffect(() => {
    setStartDate(defaultDate);
    setEndDate(defaultDate);
  }, [defaultDate]);

  const dateInvalid = endDate < startDate;
  const timeInvalid = !allDay && startDate === endDate && endTime <= startTime;
  const invalid = !title.trim() || dateInvalid || timeInvalid;

  return (
    <form
      className="mt-3 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid || submitting) return;
        onSubmit({
          title: title.trim(),
          startDate,
          endDate,
          allDay,
          ...(allDay ? {} : { startTime, endTime }),
        });
      }}
    >
      <input
        autoFocus
        className={inputClass}
        placeholder="일정 제목"
        value={title}
        maxLength={100}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        종일
      </label>

      <div className="flex items-center gap-2">
        <input
          type="date"
          className={inputClass}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <span className="text-xs text-gray-400">~</span>
        <input
          type="date"
          className={inputClass}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      {!allDay && (
        <div className="flex items-center gap-2">
          <input
            type="time"
            className={inputClass}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="time"
            className={inputClass}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      )}

      {dateInvalid && <p className="text-xs text-red-600">종료일이 시작일보다 빠릅니다.</p>}
      {timeInvalid && <p className="text-xs text-red-600">종료 시각이 시작 시각보다 빠릅니다.</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={invalid || submitting}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {submitting ? '등록 중…' : '등록'}
        </button>
      </div>
    </form>
  );
};

export default CalendarEventForm;
