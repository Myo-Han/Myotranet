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

// ✅ 승인된 연장근무 신청. "연장근무" 칸은 이 승인된 시간대와 실제 출퇴근 시간이
// 겹치는 구간만 계산해 보여준다 (사전 승인제: 승인되지 않은 초과근무는 표시되지 않음).
type OvertimeRow = {
  work_date: string;
  requested_start_at: string;
  requested_end_at: string;
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
  onLeaveRequestClick?: () => void;
  onOvertimeRequestClick?: () => void;
};

const MonthlyAttendanceTable: React.FC<MonthlyAttendanceTableProps> = ({
  onRequestRevision,
  revisionStatusByAttendanceId = {},
  onLeaveRequestClick,
  onOvertimeRequestClick,
}) => {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [approvedOvertime, setApprovedOvertime] = useState<OvertimeRow[]>([]);
  const [loading, setLoading] = useState(true);

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

        const { data: otData, error: otErr } = await supabase
          .from('overtime_requests')
          .select('work_date, requested_start_at, requested_end_at')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .gte('work_date', startKey)
          .lte('work_date', endKey);
        if (otErr) throw otErr;

        setRows((attData || []) as AttendanceRow[]);
        setLeaves((leaveData || []) as LeaveRow[]);
        setApprovedOvertime((otData || []) as OvertimeRow[]);
      } catch (e) {
        console.error('월간 근태 로드 실패:', e);
        setRows([]);
        setLeaves([]);
        setApprovedOvertime([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, month]);

  const overtimeByDate = useMemo(() => {
    const map: Record<string, OvertimeRow[]> = {};
    approvedOvertime.forEach((o) => {
      if (!map[o.work_date]) map[o.work_date] = [];
      map[o.work_date].push(o);
    });
    return map;
  }, [approvedOvertime]);

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
        <div className="w-24 hidden sm:block" />
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => shiftMonth(-1)} className="px-2 py-1 rounded hover:bg-gray-100">‹</button>
          <div className="font-bold">{month.replace('-', '년 ')}월</div>
          <button type="button" onClick={() => shiftMonth(1)} className="px-2 py-1 rounded hover:bg-gray-100">›</button>
        </div>
        {(onLeaveRequestClick || onOvertimeRequestClick) ? (
          <div className="flex items-center gap-2">
            {onLeaveRequestClick && (
              <button
                type="button"
                onClick={onLeaveRequestClick}
                className="px-3 py-1.5 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700"
              >
                연차신청
              </button>
            )}
            {onOvertimeRequestClick && (
              <button
                type="button"
                onClick={onOvertimeRequestClick}
                className="px-3 py-1.5 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700"
              >
                연장근무 신청
              </button>
            )}
          </div>
        ) : (
          <div className="w-24 hidden sm:block" />
        )}
      </div>
      {onRequestRevision && (
        <p className="px-4 pt-3 text-xs text-gray-400">근무시간 상세 칸을 클릭하면 해당 날짜의 출퇴근 수정을 요청할 수 있습니다.</p>
      )}

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
                // ✅ 연장근무는 사전 승인제: 승인된 연장근무 신청 시간대와 실제 출퇴근 시간이
                // 겹치는 구간만 계산한다. 승인받은 시간보다 일찍 퇴근하면 실제 퇴근시각까지만
                // 자동으로 줄어들고, 총근무시간(정규+연장 합산)은 기존처럼 total_work_seconds 그대로다.
                const overtimeHours = (() => {
                  if (!record?.check_in) return 0;
                  const workStart = new Date(record.check_in).getTime();
                  const workEnd = record.check_out ? new Date(record.check_out).getTime() : workStart;
                  const approvedList = overtimeByDate[dateKey] || [];
                  return approvedList.reduce((sum, ot) => {
                    const otStart = new Date(ot.requested_start_at).getTime();
                    const otEnd = new Date(ot.requested_end_at).getTime();
                    return sum + overlapHours(workStart, workEnd, otStart, otEnd);
                  }, 0);
                })();
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
                      {record && onRequestRevision ? (
                        <button
                          type="button"
                          onClick={() => onRequestRevision(record)}
                          title="클릭하여 출퇴근 수정 요청"
                          className="w-full flex items-center gap-2 bg-transparent p-0 border-0 cursor-pointer group text-left"
                        >
                          <div className="flex-1 bg-gray-100 rounded h-3 relative group-hover:ring-2 group-hover:ring-blue-300 transition">
                            {record.check_in && (
                              <div
                                className="absolute h-3 bg-blue-400 rounded"
                                style={{ left: `${barLeftPct}%`, width: `${barWidthPct}%` }}
                              />
                            )}
                          </div>
                          {revisionStatusByAttendanceId[record.id] && (() => {
                            const { label, colorClass } = getRevisionStatusLabel(revisionStatusByAttendanceId[record.id]);
                            return <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] ${colorClass}`}>{label}</span>;
                          })()}
                        </button>
                      ) : (
                        <div className="w-full bg-gray-100 rounded h-3" />
                      )}
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
