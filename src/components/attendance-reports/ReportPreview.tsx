import React, { useMemo } from 'react';
import { getEventTypeLabel, getStatusLabel } from '../../utils/attendanceLabels';
import type { ReportMode } from './reportTypes';
import {
  AttendanceEventRow,
  AttendanceRow,
  buildDateKeyList,
  calcPauseSecondsInRange,
  ensureCheckInOutEvents,
  formatDurationHhMm,
  formatMmDdDow,
  formatTimeHHMM,
  getMonthRange,
  groupEventsByAttendanceId,
  parseDateKeyToLocalMidnight,
} from './reportUtils';

type Props = {
  mode: ReportMode;
  userName: string;

  startKey: string;
  endKey: string;
  month: string; // YYYY-MM

  attendance: AttendanceRow[];
  events: AttendanceEventRow[];
};

const ReportPreview: React.FC<Props> = ({ mode, userName, startKey, endKey, month, attendance, events }) => {
  const eventsByAttId = useMemo(() => groupEventsByAttendanceId(events), [events]);

  const dateDetailRows = useMemo(() => {
    // 날짜범위 내에서, attendance가 없는 날도 출력은 하되(행은 이벤트가 없으면 없음) -> 필요하면 "미출근" 표시를 1줄 넣어줌
    const keys = buildDateKeyList(startKey, endKey);

    const attByDate: Record<string, AttendanceRow> = {};
    for (const a of attendance) attByDate[a.date] = a;

    const rows: Array<{ date: string; name: string; event: string; time: string; memo: string }> = [];

    for (const key of keys) {
      const att = attByDate[key];
      if (!att) {
        rows.push({ date: key, name: userName, event: '미출근', time: '-', memo: '-' });
        continue;
      }

      const ev = ensureCheckInOutEvents(att, eventsByAttId[att.id] || []);
      if (ev.length === 0) {
        rows.push({ date: key, name: userName, event: '미출근', time: '-', memo: '-' });
        continue;
      }

      for (const e of ev) {
        const memo = (e.reason_category || e.notes) ? [e.reason_category, e.notes].filter(Boolean).join(' / ') : '-';
        rows.push({
          date: key,
          name: userName,
          event: getEventTypeLabel(e.event_type),
          time: formatTimeHHMM(e.occurred_at),
          memo,
        });
      }
    }

    return rows;
  }, [attendance, endKey, eventsByAttId, startKey, userName]);

  const monthDetailRows = useMemo(() => {
    const { startKey: mStart, endKey: mEnd } = getMonthRange(month);
    const start = parseDateKeyToLocalMidnight(mStart);
    const end = parseDateKeyToLocalMidnight(mEnd);

    const attByDate: Record<string, AttendanceRow> = {};
    for (const a of attendance) attByDate[a.date] = a;

    const rows: Array<{
      dateLabel: string;
      checkIn: string;
      checkOut: string;
      total: string;
      pause: string;
      net: string;
      status: string;
    }> = [];

    const cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      const att = attByDate[key];

      if (!att || !att.check_in || !att.check_out) {
        const status = getStatusLabel(att?.status ?? null, null, false);
        rows.push({
          dateLabel: formatMmDdDow(key),
          checkIn: att?.check_in ? formatTimeHHMM(att.check_in) : '-',
          checkOut: att?.check_out ? formatTimeHHMM(att.check_out) : '-',
          total: '-',
          pause: '-',
          net: '-',
          status: status || '미출근',
        });
        cur.setDate(cur.getDate() + 1);
        continue;
      }

      const ev = ensureCheckInOutEvents(att, eventsByAttId[att.id] || []);
      const totalSeconds = Math.max(0, Math.floor((new Date(att.check_out).getTime() - new Date(att.check_in).getTime()) / 1000));
      const pauseSeconds = calcPauseSecondsInRange(ev, att.check_in, att.check_out);
      const netSeconds = att.total_work_seconds ?? Math.max(0, totalSeconds - pauseSeconds);

      rows.push({
        dateLabel: formatMmDdDow(key),
        checkIn: formatTimeHHMM(att.check_in),
        checkOut: formatTimeHHMM(att.check_out),
        total: formatDurationHhMm(totalSeconds),
        pause: formatDurationHhMm(pauseSeconds),
        net: formatDurationHhMm(netSeconds),
        status: getStatusLabel(att.status, null, false),
      });

      cur.setDate(cur.getDate() + 1);
    }

    return rows;
  }, [attendance, eventsByAttId, month]);

  const monthSummary = useMemo(() => {
    const { startKey: mStart, daysInMonth } = getMonthRange(month);

    const attByDate: Record<string, AttendanceRow> = {};
    for (const a of attendance) attByDate[a.date] = a;

    const dayCells: Array<{ day: number; text: string }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${mStart.slice(0, 8)}${String(d).padStart(2, '0')}`; // YYYY-MM-01
      const att = attByDate[key];

      if (!att || !att.check_in || !att.check_out) {
        dayCells.push({ day: d, text: '-' });
        continue;
      }

      const ci = formatTimeHHMM(att.check_in);
      const co = formatTimeHHMM(att.check_out);

      const ev = ensureCheckInOutEvents(att, eventsByAttId[att.id] || []);
      const totalSeconds = Math.max(0, Math.floor((new Date(att.check_out).getTime() - new Date(att.check_in).getTime()) / 1000));
      const pauseSeconds = calcPauseSecondsInRange(ev, att.check_in, att.check_out);
      const netSeconds = att.total_work_seconds ?? Math.max(0, totalSeconds - pauseSeconds);

      dayCells.push({
        day: d,
        text: `${ci}~${co}\n(${formatDurationHhMm(netSeconds)})`,
      });
    }

    return { dayCells };
  }, [attendance, eventsByAttId, month]);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <style>{`
  @media print {
  body { background: #fff !important; }
  .print-page { box-shadow: none !important; padding: 0 !important; }

  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }
  
  /* 일별은 페이지 넘어가도 OK */
  table { page-break-inside: auto; }
  
  /* 월별 상세/요약은 한 페이지에 */
  .print\:break-inside-avoid { 
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
`}</style>

      <div className="print-page">
        <div className="mb-4">
          <h2 className="text-xl font-bold">
            {mode === 'date_detail' && '날짜별 상세'}
            {mode === 'month_detail' && '월별 상세'}
            {mode === 'month_summary' && '월별 요약'}
          </h2>
          <div className="text-sm text-gray-600 mt-1">
            {userName} ·{' '}
            {mode === 'date_detail' ? `${startKey} ~ ${endKey}` : `${month}`}
          </div>
        </div>

        {mode === 'date_detail' && (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-3 py-2 text-left">날짜</th>
                  <th className="border px-3 py-2 text-left">이름</th>
                  <th className="border px-3 py-2 text-left">이벤트</th>
                  <th className="border px-3 py-2 text-left">시간</th>
                  <th className="border px-3 py-2 text-left">사유/메모</th>
                </tr>
              </thead>
              <tbody>
                {dateDetailRows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="border px-3 py-2">{r.date}</td>
                    <td className="border px-3 py-2">{r.name}</td>
                    <td className="border px-3 py-2">{r.event}</td>
                    <td className="border px-3 py-2">{r.time}</td>
                    <td className="border px-3 py-2 whitespace-pre-wrap">{r.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mode === 'month_detail' && (
          <div className="overflow-x-auto print:break-inside-avoid">
            <table className="min-w-full border border-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-3 py-2 text-left">날짜</th>
                  <th className="border px-3 py-2 text-left">출근</th>
                  <th className="border px-3 py-2 text-left">퇴근</th>
                  <th className="border px-3 py-2 text-left">총 근무</th>
                  <th className="border px-3 py-2 text-left">휴게</th>
                  <th className="border px-3 py-2 text-left">순수 근무</th>
                  <th className="border px-3 py-2 text-left">상태</th>
                </tr>
              </thead>
              <tbody>
                {monthDetailRows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="border px-3 py-2">{r.dateLabel}</td>
                    <td className="border px-3 py-2">{r.checkIn}</td>
                    <td className="border px-3 py-2">{r.checkOut}</td>
                    <td className="border px-3 py-2">{r.total}</td>
                    <td className="border px-3 py-2">{r.pause}</td>
                    <td className="border px-3 py-2">{r.net}</td>
                    <td className="border px-3 py-2">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mode === 'month_summary' && (
          <div className="overflow-x-auto print:break-inside-avoid">
            <table className="min-w-full border border-gray-200 text-[9px] table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-2 py-2 text-left w-20">월</th>
                  {monthSummary.dayCells.map((c) => (
                    <th key={c.day} className="border px-2 py-2 text-center w-16">
                      {c.day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border px-2 py-2 font-medium">성명</td>
                  {monthSummary.dayCells.map((c) => (
                    <td key={c.day} className="border px-2 py-2 text-center">
                      {''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border px-2 py-2 font-medium">{userName}</td>
                  {monthSummary.dayCells.map((c) => (
                    <td key={c.day} className="border px-2 py-2 text-center">
                      {''}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border px-2 py-2 whitespace-pre-wrap font-medium">출근~퇴근{'\n'}(근무시간)</td>
                  {monthSummary.dayCells.map((c) => (
                    <td key={c.day} className="border px-2 py-2 whitespace-pre-wrap text-center">
                      {c.text}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            <div className="text-xs text-gray-500 mt-2">* (근무시간)은 순수 근무 기준입니다.</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPreview;