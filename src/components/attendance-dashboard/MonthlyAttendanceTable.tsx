// 월간 근태 상세 테이블
// "야간근무시간(실제)"는 출퇴근 기록 기준으로 22:00~06:00 구간과 겹치는 시간을 계산한 값입니다.
// (사전 신청 기능은 별도로 없어 "실제" 값만 표시합니다.)
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { getRevisionStatusLabel } from '../../utils/attendanceLabels';

type AttendanceRow = {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  total_work_seconds: number | null;
};

type LeaveRow = {
  start_date: string;
  end_date: string;
  type: string;
};

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual_leave: '연차',
  half_day: '반차',
  monthly_leave: '월차',
  maternity_leave: '출산휴가',
  maternity_leave_multiple: '출산휴가(다태아)',
  paternity_leave: '배우자출산휴가',
  menstrual_leave: '생리휴가',
  family_care_leave: '가족돌봄휴가',
  event_leave_marriage_self: '결혼(본인)',
  event_leave_marriage_child: '결혼(자녀)',
  event_leave_death_parent: '사망(부모)',
  event_leave_death_grandparent: '사망(조부모)',
};

const getMonthRange = (yyyyMm: string) => {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { startKey: toKey(start), endKey: toKey(end), daysInMonth: end.getDate() };
};

const formatHM = (iso: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDurationHM = (hours: number) => {
  if (hours <= 0) return '00:00';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// 두 구간의 겹치는 시간(시간 단위)을 계산
const overlapHours = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? (end - start) / (1000 * 60 * 60) : 0;
};

// 야간(22:00~다음날 06:00) 근무시간 계산
const calcNightHours = (checkIn: string | null, checkOut: string | null) => {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  if (end <= start) return 0;

  let total = 0;
  const dayMs = 24 * 60 * 60 * 1000;
  // 근무 시작일 기준 전날 22시 ~ 당일 06시, 당일 22시 ~ 다음날 06시 두 구간을 모두 체크
  const startDay = new Date(checkIn);
  startDay.setHours(0, 0, 0, 0);

  for (let offset = -1; offset <= 1; offset++) {
    const nightStart = new Date(startDay.getTime() + offset * dayMs);
    nightStart.setHours(22, 0, 0, 0);
    const nightEnd = new Date(nightStart.getTime() + 8 * 60 * 60 * 1000); // 22:00 + 8h = 06:00
    total += overlapHours(start, end, nightStart.getTime(), nightEnd.getTime());
  }
  return total;
};

type MonthlyAttendanceTableProps = {
  onRequestRevision?: (record: AttendanceRow) => void;
  revisionStatusByAttendanceId?: Record<string, any>;
};

const MonthlyAttendanceTable: React.FC<MonthlyAttendanceTableProps> = ({
  onRequestRevision,
  revisionStatusByAttendanceId = {},
}) => {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [revisionDateKey, setRevisionDateKey] = useState('');
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);

  const requiredHours = user?.weekly_required_hours ?? 40;
  const dailyStandardHours = requiredHours / 5; // 주 5일 근무 가정 하 일 표준 근무시간

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      try {
        const { startKey, endKey } = getMonthRange(month);

        const { data: attData, error: attErr } = await supabase
          .from('attendance')
          .select('id, date, check_in, check_out, status, total_work_seconds')
          .eq('user_id', user.id)
          .gte('date', startKey)
          .lte('date', endKey)
          .order('date', { ascending: true });
        if (attErr) throw attErr;

        const { data: leaveData, error: leaveErr } = await supabase
          .from('leaves')
          .select('start_date, end_date, type')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .lte('start_date', endKey)
          .gte('end_date', startKey);
        if (leaveErr) throw leaveErr;

        setRows((attData || []) as AttendanceRow[]);
        setLeaves((leaveData || []) as LeaveRow[]);
      } catch (e) {
        console.error('월간 근태 로드 실패:', e);
        setRows([]);
        setLeaves([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, month]);

  const dayList = useMemo(() => {
    const { daysInMonth } = getMonthRange(month);
    const [y, m] = month.split('-').map(Number);
    const list: { dateKey: string; dow: string; isWeekend: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m - 1, d);
      const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dowIdx = dt.getDay();
      list.push({
        dateKey,
        dow: dt.toLocaleDateString('ko-KR', { weekday: 'short' }),
        isWeekend: dowIdx === 0 || dowIdx === 6,
      });
    }
    return list;
  }, [month]);

  const rowsByDate = useMemo(() => {
    const map: Record<string, AttendanceRow> = {};
    rows.forEach((r) => { map[r.date] = r; });
    return map;
  }, [rows]);

  const leaveForDate = (dateKey: string) => leaves.find((l) => l.start_date <= dateKey && dateKey <= l.end_date);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
        <div className="w-24" />
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => shiftMonth(-1)} className="px-2 py-1 rounded hover:bg-gray-100">‹</button>
          <div className="font-bold">{month.replace('-', '년 ')}월</div>
          <button type="button" onClick={() => shiftMonth(1)} className="px-2 py-1 rounded hover:bg-gray-100">›</button>
        </div>

        {onRequestRevision && (
          <div className="flex items-center gap-2">
            <select
              value={revisionDateKey}
              onChange={(e) => setRevisionDateKey(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-xs"
            >
              <option value="">날짜 선택</option>
              {dayList
                .filter(({ dateKey }) => rowsByDate[dateKey])
                .map(({ dateKey, dow }) => (
                  <option key={dateKey} value={dateKey}>
                    {dateKey.slice(5)}({dow})
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!revisionDateKey || !rowsByDate[revisionDateKey]}
              onClick={() => {
                const record = rowsByDate[revisionDateKey];
                if (record) onRequestRevision(record);
              }}
              className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-40"
            >
              근태 수정요청
            </button>
            {revisionDateKey && rowsByDate[revisionDateKey] && revisionStatusByAttendanceId[rowsByDate[revisionDateKey].id] && (
              (() => {
                const { label, colorClass } = getRevisionStatusLabel(
                  revisionStatusByAttendanceId[rowsByDate[revisionDateKey].id]
                );
                return <span className={`px-2 py-0.5 rounded-full text-[11px] ${colorClass}`}>{label}</span>;
              })()
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-6">불러오는 중...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-gray-500">
                <th className="px-3 py-2 text-left">일자</th>
                <th className="px-3 py-2 text-left">구분</th>
                <th className="px-3 py-2 text-left">총근무시간</th>
                <th className="px-3 py-2 text-left">신청한 근태</th>
                <th className="px-3 py-2 text-left">출근시간</th>
                <th className="px-3 py-2 text-left">퇴근시간</th>
                <th className="px-3 py-2 text-left w-1/3">근무시간 상세</th>
                <th className="px-3 py-2 text-left">연장근무</th>
                <th className="px-3 py-2 text-left">야간근무(실제)</th>
              </tr>
            </thead>
            <tbody>
              {dayList.map(({ dateKey, dow, isWeekend }) => {
                const record = rowsByDate[dateKey];
                const leave = leaveForDate(dateKey);
                const workedHours = (record?.total_work_seconds || 0) / 3600;
                const overtimeHours = Math.max(workedHours - dailyStandardHours, 0);
                const nightHours = calcNightHours(record?.check_in || null, record?.check_out || null);

                // 근무시간 상세 bar: 06:00~24:00 범위를 기준으로 출퇴근 구간 비율 표시
                let barLeftPct = 0;
                let barWidthPct = 0;
                if (record?.check_in) {
                  const inD = new Date(record.check_in);
                  const outD = record.check_out ? new Date(record.check_out) : inD;
                  const dayStartHour = 6;
                  const dayTotalHours = 18; // 06:00 ~ 24:00
                  const inHour = inD.getHours() + inD.getMinutes() / 60;
                  const outHour = outD.getHours() + outD.getMinutes() / 60;
                  barLeftPct = Math.max(0, Math.min(100, ((inHour - dayStartHour) / dayTotalHours) * 100));
                  const rawWidth = ((Math.max(outHour, inHour) - inHour) / dayTotalHours) * 100;
                  barWidthPct = Math.max(2, Math.min(100 - barLeftPct, rawWidth));
                }

                return (
                  <tr key={dateKey} className={isWeekend ? 'bg-red-50/40' : ''}>
                    <td className={`px-3 py-2 whitespace-nowrap ${isWeekend ? 'text-red-500' : 'text-gray-700'}`}>
                      {dateKey.slice(5).replace('-', '-')}({dow})
                    </td>
                    <td className="px-3 py-2 text-gray-400">{isWeekend ? '휴일' : ''}</td>
                    <td className="px-3 py-2">{record ? formatDurationHM(workedHours) : '-'}</td>
                    <td className="px-3 py-2">
                      {leave ? (
                        <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs">
                          {LEAVE_TYPE_LABEL[leave.type] || leave.type}
                        </span>
                      ) : ''}
                    </td>
                    <td className="px-3 py-2">{formatHM(record?.check_in || null)}</td>
                    <td className="px-3 py-2">{formatHM(record?.check_out || null)}</td>
                    <td className="px-3 py-2">
                      <div className="w-full bg-gray-100 rounded h-3 relative">
                        {record?.check_in && (
                          <div
                            className="absolute h-3 bg-blue-400 rounded"
                            style={{ left: `${barLeftPct}%`, width: `${barWidthPct}%` }}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{overtimeHours > 0 ? formatDurationHM(overtimeHours) : '00:00'}</td>
                    <td className="px-3 py-2">{nightHours > 0 ? formatDurationHM(nightHours) : '00:00'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MonthlyAttendanceTable;
