import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';
import type { ReportMode } from './reportTypes';
import { clampDateRangeMax31Days, getRangeForMode, getTodayKey } from './reportUtils';
import ReportControls from './ReportControls';
import ReportPreview from './ReportPreview';
import { fetchAttendanceWithEvents, fetchUserName } from './supabaseReports';

const AttendanceReportSelf: React.FC = () => {
  const { user } = useAuth();

  const [mode, setMode] = useState<ReportMode>('month_detail');

  const today = getTodayKey();
  const [dateStart, setDateStart] = useState<string>(today);
  const [dateEnd, setDateEnd] = useState<string>(today);

  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [userName, setUserName] = useState<string>('사용자');

  const [loadedStartKey, setLoadedStartKey] = useState<string>(dateStart);
  const [loadedEndKey, setLoadedEndKey] = useState<string>(dateEnd);

  const [attendance, setAttendance] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  const canLoad = useMemo(() => {
    if (!user?.id) return false;

    if (mode === 'date_detail') {
      if (!dateStart || !dateEnd) return false;
      if (dateStart > dateEnd) return false;
      return clampDateRangeMax31Days(dateStart, dateEnd);
    }

    return !!month;
  }, [dateEnd, dateStart, mode, month, user?.id]);

  const hint = useMemo(() => {
    if (mode !== 'date_detail') return '';
    if (!dateStart || !dateEnd) return '날짜를 선택해주세요.';
    if (dateStart > dateEnd) return '시작일이 종료일보다 늦습니다.';
    if (!clampDateRangeMax31Days(dateStart, dateEnd)) return '최대 31일 범위만 가능합니다.';
    return '';
  }, [dateEnd, dateStart, mode]);

  const handleLoad = async () => {
    if (!user?.id) return;
    if (!canLoad) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const name = await fetchUserName(user.id);
      setUserName(name);

      const { startKey, endKey } = getRangeForMode(mode, dateStart, dateEnd, month);
      setLoadedStartKey(startKey);
      setLoadedEndKey(endKey);

      const { attendance: a, events: e } = await fetchAttendanceWithEvents({ userId: user.id, startKey, endKey });
      setAttendance(a);
      setEvents(e);

      setSuccess('미리보기가 준비되었습니다');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err?.message || '불러오기에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!user) return <ErrorMessage message="로그인이 필요합니다" />;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold">출퇴근 증명서 출력</h1>
        <p className="text-sm text-gray-600 mt-1">본인 증명서만 출력할 수 있습니다.</p>
      </div>

      <div className="print:hidden">
        <ReportControls
          mode={mode}
          setMode={setMode}
          dateStart={dateStart}
          dateEnd={dateEnd}
          setDateStart={setDateStart}
          setDateEnd={setDateEnd}
          month={month}
          setMonth={setMonth}
          canLoad={canLoad}
          hint={hint}
          onLoad={handleLoad}
          onPrint={handlePrint}
          loading={loading}
        />
      </div>

      {loading && <Loading />}
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="print:break-inside-avoid">
        <ReportPreview
          mode={mode}
          userName={userName}
          startKey={loadedStartKey}
          endKey={loadedEndKey}
          month={month}
          attendance={attendance}
          events={events}
        />
      </div>
    </div>
  );
};

export default AttendanceReportSelf;