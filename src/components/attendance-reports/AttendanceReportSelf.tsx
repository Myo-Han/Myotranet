import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';
import type { ReportMode } from './reportTypes';
import {
  buildDateKeyList,
  calcPauseSecondsInRange,
  clampDateRangeMax31Days,
  ensureCheckInOutEvents,
  formatDurationHhMm,
  formatTimeHHMM,
  getRangeForMode,
  getTodayKey,
  groupEventsByAttendanceId,
} from './reportUtils';
import ReportControls from './ReportControls';
import ReportPreview from './ReportPreview';
import { fetchAttendanceWithEvents, fetchUserName } from './supabaseReports';
import AttendanceDailyDetailTemplate, { type AttendanceDailyDetailRow, } from '../../pages/document-template/AttendanceDailyDetailTemplate';
import { getEventTypeLabel } from '../../utils/attendanceLabels';

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

  const dailyDetailRows = useMemo<AttendanceDailyDetailRow[]>(() => {
    if (mode !== 'date_detail') return [];

    const keys = buildDateKeyList(loadedStartKey, loadedEndKey);

    const attByDate: Record<string, any> = {};
    for (const a of attendance) attByDate[String(a.date)] = a;

    const evByAttId = groupEventsByAttendanceId(events as any[]);

    const out: AttendanceDailyDetailRow[] = [];

    for (const key of keys) {
      const att = attByDate[key];
      if (!att) {
        out.push({ date: key, timeText: '', eventText: '미출근', memo: '' });
        continue;
      }

      const ev = ensureCheckInOutEvents(att, evByAttId[String(att.id)] || []);
      if (!ev.length) {
        out.push({ date: key, timeText: '', eventText: '미출근', memo: '' });
        continue;
      }

      for (const e of ev) {
        const memo =
          (e.reason_category || e.notes) ? [e.reason_category, e.notes].filter(Boolean).join(' / ') : '';

        out.push({
          date: key,
          timeText: formatTimeHHMM(e.occurred_at),
          eventText: getEventTypeLabel(e.event_type),
          memo,
        });
      }
    }

    return out;
  }, [attendance, events, loadedEndKey, loadedStartKey, mode]);

  const dailyTotals = useMemo(() => {
    if (mode !== 'date_detail') {
      return { totalText: '', breakText: '', netText: '' };
    }

    const evByAttId = groupEventsByAttendanceId(events as any[]);

    let totalSecondsSum = 0;
    let pauseSecondsSum = 0;
    let netSecondsSum = 0;

    for (const att of attendance as any[]) {
      if (!att?.check_in || !att?.check_out) continue;

      const totalSeconds = Math.max(
        0,
        Math.floor((new Date(att.check_out).getTime() - new Date(att.check_in).getTime()) / 1000)
      );

      const ev = ensureCheckInOutEvents(att, evByAttId[String(att.id)] || []);
      const pauseSeconds = calcPauseSecondsInRange(ev, att.check_in, att.check_out);

      const netSeconds =
        typeof att.total_work_seconds === 'number'
          ? Math.max(0, Math.floor(att.total_work_seconds))
          : Math.max(0, totalSeconds - pauseSeconds);

      totalSecondsSum += totalSeconds;
      pauseSecondsSum += pauseSeconds;
      netSecondsSum += netSeconds;
    }

    return {
      totalText: formatDurationHhMm(totalSecondsSum),
      breakText: formatDurationHhMm(pauseSecondsSum),
      netText: formatDurationHhMm(netSecondsSum),
    };
  }, [attendance, events, mode]);

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

      // ✅ 미리보기 누르면 PDF까지 생성해서 아래 뷰어에 바로 뜨게
      await handleBuildPdf(startKey, endKey);

      setSuccess('미리보기가 준비되었습니다');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err?.message || '불러오기에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleBuildPdf = async (startKey: string, endKey: string) => {
    if (!user?.id) return;

    setPdfLoading(true);
    setError('');

    try {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);

      // ✅ TODO: 서버 PDF 생성 API 붙이기 (blob/pdf 반환)
      const qs = new URLSearchParams({
        userId: user.id,
        mode,
        startKey,
        endKey,
        month,
      }).toString();

      const res = await fetch(`/api/documents/attendance/daily-detail?${qs}`, {
        method: 'GET',
      });

      if (!res.ok) throw new Error('PDF 생성에 실패했습니다');

      const blob = await res.blob();
      setPdfUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e?.message || 'PDF 생성에 실패했습니다');
    } finally {
      setPdfLoading(false);
    }
  };

  if (!user) return <ErrorMessage message="로그인이 필요합니다" />;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold">출퇴근 증명서 출력</h1>
        <p className="text-sm text-gray-600 mt-1">본인 증명서만 출력할 수 있습니다.</p>
      </div>

      <div className="print:hidden ars-controls">
        <style>{`
    /* ReportControls 안의 "마지막 버튼(PDF 출력)" 숨김 */
    .ars-controls button:last-child { display: none !important; }
  `}</style>

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
          onPrint={() => { }}
          loading={loading}
        />
      </div>

      {loading && <Loading />}
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="print:break-inside-avoid">
        {pdfUrl ? (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="text-sm font-semibold">PDF 미리보기</div>

              <a
                href={pdfUrl}
                download={`출퇴근_증명서_${loadedStartKey}_${loadedEndKey}.pdf`}
                className="px-3 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800"
              >
                PDF 다운로드
              </a>
            </div>

            <div className="w-full h-[75vh]">
              <iframe title="pdf-preview" src={pdfUrl} className="w-full h-full" />
            </div>

            {pdfLoading && (
              <div className="px-4 py-2 text-xs text-gray-500">PDF 생성 중...</div>
            )}
          </div>
        ) : (
          // PDF 아직 없으면 기존 HTML 미리보기 유지
          <>
            {mode === 'date_detail' ? (
              <AttendanceDailyDetailTemplate
                issueDate={getTodayKey()}
                periodText={`${loadedStartKey} - ${loadedEndKey}`}
                departmentText="-"
                nameText={userName}
                rows={dailyDetailRows}
                totalWorkText={dailyTotals.totalText}
                breakText={dailyTotals.breakText}
                netWorkText={dailyTotals.netText}
                noteText=""
              />
            ) : (
              <ReportPreview
                mode={mode}
                userName={userName}
                startKey={loadedStartKey}
                endKey={loadedEndKey}
                month={month}
                attendance={attendance}
                events={events}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AttendanceReportSelf;