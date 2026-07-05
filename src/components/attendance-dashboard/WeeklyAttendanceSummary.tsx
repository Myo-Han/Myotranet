// 이번 주 근무 현황 요약 카드
// 필수 근무시간/최대 근무가능시간은 직원 관리 화면에서 직원별로 설정한 값(users.weekly_required_hours/weekly_max_hours)을 사용합니다.
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';

const LEGAL_STANDARD_WEEKLY_HOURS = 40; // 근로기준법상 법정근로시간(주)

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 해당 날짜가 속한 주의 월요일을 반환
const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay(); // 0=일 ... 6=토
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatHhMm = (hours: number) => {
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}시간 ${m}분`;
};

const WeeklyAttendanceSummary: React.FC = () => {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [totalWorkSeconds, setTotalWorkSeconds] = useState(0);
  const [loading, setLoading] = useState(true);

  const requiredHours = user?.weekly_required_hours ?? 40;
  const maxHours = user?.weekly_max_hours ?? 52;

  const weekStart = useMemo(() => {
    const base = getMonday(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }, [weekOffset]);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  // "n월 n째주" 라벨 (주 시작일 기준)
  const weekLabel = useMemo(() => {
    const month = weekStart.getMonth() + 1;
    const weekIndex = Math.ceil(weekStart.getDate() / 7);
    return `${month}월 ${weekIndex}째주`;
  }, [weekStart]);

  const rangeLabel = useMemo(() => {
    const fmt = (d: Date) => {
      const dow = d.toLocaleDateString('ko-KR', { weekday: 'short' });
      return `${d.getMonth() + 1}월 ${d.getDate()}일(${dow})`;
    };
    return `${fmt(weekStart)} - ${fmt(weekEnd)}`;
  }, [weekStart, weekEnd]);

  useEffect(() => {
    if (!user?.id) return;
    const fetchWeek = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('total_work_seconds')
          .eq('user_id', user.id)
          .gte('date', toDateKey(weekStart))
          .lte('date', toDateKey(weekEnd));

        if (error) throw error;

        const sum = (data || []).reduce((acc: number, r: any) => acc + (r.total_work_seconds || 0), 0);
        setTotalWorkSeconds(sum);
      } catch (e) {
        console.error('주간 근무시간 로드 실패:', e);
        setTotalWorkSeconds(0);
      } finally {
        setLoading(false);
      }
    };
    fetchWeek();
  }, [user?.id, weekStart, weekEnd]);

  const workedHours = totalWorkSeconds / 3600;
  const progressPct = requiredHours > 0 ? Math.round((workedHours / requiredHours) * 100) : 0;
  const remainingHours = Math.max(requiredHours - workedHours, 0);
  // 잔여일: 필수 근무시간을 5일 기준 일평균으로 환산해 남은 일수를 근사 계산
  const remainingDays = requiredHours > 0 ? remainingHours / (requiredHours / 5) : 0;
  const legalOvertimeHours = Math.max(workedHours - LEGAL_STANDARD_WEEKLY_HOURS, 0);
  const scheduledOvertimeHours = Math.max(workedHours - requiredHours, 0);

  return (
    <div className="bg-white shadow rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setWeekOffset((v) => v - 1)}
          className="px-2 py-1 rounded hover:bg-gray-100"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-bold">{weekLabel}</div>
          <div className="text-xs text-gray-500">{rangeLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset((v) => v + 1)}
          className="px-2 py-1 rounded hover:bg-gray-100"
        >
          ›
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center">불러오는 중...</p>
      ) : (
        <>
          <p className="text-center text-sm">
            <span className="font-semibold text-blue-600">{formatHhMm(workedHours)}</span> 근무중 입니다.
          </p>

          <div className="w-full bg-gray-100 rounded-full h-4 relative overflow-hidden">
            <div
              className="h-4 rounded-full bg-gradient-to-r from-indigo-500 to-pink-400"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-semibold text-white">
              {progressPct}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-2 text-sm max-w-md mx-auto">
            <span className="text-gray-500">잔여시간 / 잔여일</span>
            <span className="text-right font-medium">
              {formatHhMm(remainingHours)} / {Math.max(0, Math.round(remainingDays * 10) / 10)}일
            </span>

            <span className="text-gray-500">필수 근무 시간</span>
            <span className="text-right font-medium">{requiredHours}시간</span>

            <span className="text-gray-500">최대 근무 가능 시간</span>
            <span className="text-right font-medium">{maxHours}시간</span>

            <span className="text-gray-500">법정 초과 근무 시간</span>
            <span className="text-right font-medium">{formatHhMm(legalOvertimeHours)}</span>

            <span className="text-gray-500">소정 초과 근무 시간</span>
            <span className="text-right font-medium">{formatHhMm(scheduledOvertimeHours)}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyAttendanceSummary;
