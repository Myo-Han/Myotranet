// 근태현황 패널 (근태관리 탭의 기본 카테고리).
// 기존 pages/Attendance.tsx의 내용을 그대로 옮겨왔다. 근태관리 페이지가 좌측 사이드바로
// 카테고리(근태현황/연차 신청/연장근무 신청)를 나누는 구조로 바뀌면서, "근태신청" 버튼은
// 제거했다(연차 신청/연장근무 신청이 사이드바 카테고리로 이미 존재하므로 버튼이 중복됨).
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { Attendance as AttendanceType } from '../../types';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';
import ProfileModal from '../ProfileModal';
import { getStatusLabel, getStatusColor, getRevisionStatusLabel, localDateTimeInputToIso } from '../../utils/attendanceLabels';
import WeeklyAttendanceSummary from './WeeklyAttendanceSummary';
import MonthlyAttendanceTable from './MonthlyAttendanceTable';

const getTodayDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const shiftDate = (yyyyMMdd: string, deltaDays: number) => {
  const [y, m, d] = yyyyMMdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const AttendanceStatusPanel: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceType[]>([]);
  const [revisionRequests, setRevisionRequests] = useState<Record<string, any>>({});
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // ✅ 실시간 표시는 클라에서만(기준값+경과초)
  const [liveAttendanceId, setLiveAttendanceId] = useState<string | null>(null);
  const [liveBaseSeconds, setLiveBaseSeconds] = useState<number>(0);
  const [liveBaseMs, setLiveBaseMs] = useState<number>(Date.now());
  const [liveRunning, setLiveRunning] = useState<boolean>(false);

  const [eventsByAttendanceId, setEventsByAttendanceId] = useState<
    Record<string, { attendance_id: string; event_type: 'pause' | 'resume'; occurred_at: string }[]>
  >({});
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceType | null>(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
  const [revisionForm, setRevisionForm] = useState({
    requestedCheckIn: '',
    requestedCheckOut: '',
    reason: '',
  });

  // 오늘 상태/휴가/업무중지 모달용 상태
  const [todayStatus, setTodayStatus] = useState<string | null>(null);
  const [isTodayOnLeave, setIsTodayOnLeave] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState<'휴게' | '외출' | '퇴근' | '기타' | ''>('');
  const [pauseMemo, setPauseMemo] = useState('');


  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchData(selectedDate === getTodayDate());
  }, [selectedDate]);

  const fetchData = async (forceSyncToday: boolean = false) => {
    setLoading(true);
    setError('');
    try {
      const { data: employeesData, error: employeesError } = await supabase
        .from('users')
        .select('id, name, profile_picture, current_status')
        .order('name');

      if (employeesError) throw employeesError;
      setAllEmployees(employeesData || []);

      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', selectedDate);

      if (attendanceError) throw attendanceError;

      const attendanceIds = (attendanceData || []).map((a: any) => a.id).filter(Boolean);

      if (attendanceIds.length > 0) {
        // ✅ 1. 휴게/중지 이벤트 조회
        const { data: evts, error: evtErr } = await supabase
          .from('attendance_events')
          .select('attendance_id, event_type, occurred_at')
          .in('attendance_id', attendanceIds)
          .in('event_type', ['pause', 'resume'])
          .order('occurred_at', { ascending: true });

        if (evtErr) throw evtErr;

        // ✅ 2. 수정 요청 내역 조회 추가
        const { data: revData, error: revErr } = await supabase
          .from('attendance_revision_requests')
          .select('attendance_id, status')
          .in('attendance_id', attendanceIds);

        if (revErr) throw revErr;

        // ✅ 3. 수정 요청 상태 매핑 저장
        const revMap: Record<string, any> = {};
        (revData || []).forEach((r) => {
          revMap[String(r.attendance_id)] = r.status;
        });
        setRevisionRequests(revMap);

        const map: Record<string, { attendance_id: string; event_type: 'pause' | 'resume'; occurred_at: string }[]> = {};
        (evts || []).forEach((e: any) => {
          const key = String(e.attendance_id);
          if (!map[key]) map[key] = [];
          map[key].push({
            attendance_id: String(e.attendance_id),
            event_type: e.event_type,
            occurred_at: e.occurred_at
          });
        });
        setEventsByAttendanceId(map);
      } else {
        setEventsByAttendanceId({});
      }

      const matchedRecords = (employeesData || []).map((employee: any) => {
        const record = attendanceData?.find((a: any) => a.user_id === employee.id);
        return {
          id: record?.id || `empty-${employee.id}`,
          user_id: employee.id,
          date: selectedDate,
          check_in: record?.check_in || null,
          check_out: record?.check_out || null,
          status: record?.status ?? null,
          current_status: employee.current_status,
          total_work_seconds: record?.total_work_seconds || 0,
          users: { name: employee.name, profile_picture: employee.profile_picture }
        };
      });

      setRecords(matchedRecords);

      const todayKey = getTodayDate();

      if (user && selectedDate === todayKey) {
        const myRecord = matchedRecords.find((r: any) => r.user_id === user.id) || null;
        const myEmployee = (employeesData || []).find((e: any) => e.id === user.id) || null;

        // 출근 전/퇴근 후면 live 끔
        if (!myRecord || !myRecord.check_in || myRecord.check_out) {
          setLiveAttendanceId(null);
          setLiveBaseSeconds(0);
          setLiveBaseMs(Date.now());
          setLiveRunning(false);
        } else {
          // ✅ 필요할 때만(첫 진입/새로고침) 정확 계산해서 DB total_work_seconds 갱신
          if (forceSyncToday) {
            const nowIso = new Date().toISOString();

            const { data: pauseEvents, error: pauseError } = await supabase
              .from('attendance_events')
              .select('event_type, occurred_at')
              .eq('user_id', user.id)
              .eq('attendance_id', myRecord.id)
              .in('event_type', ['pause', 'resume'])
              .order('occurred_at', { ascending: true });

            if (pauseError) throw pauseError;

            let totalPauseSeconds = 0;
            let lastPauseTime: Date | null = null;

            (pauseEvents || []).forEach((event: any) => {
              if (event.event_type === 'pause') {
                lastPauseTime = new Date(event.occurred_at);
              } else if (event.event_type === 'resume' && lastPauseTime) {
                const resumeTime = new Date(event.occurred_at);
                totalPauseSeconds += (resumeTime.getTime() - lastPauseTime.getTime()) / 1000;
                lastPauseTime = null;
              }
            });

            if (lastPauseTime) {
              totalPauseSeconds += (new Date(nowIso).getTime() - lastPauseTime.getTime()) / 1000;
            }

            const checkInTime = new Date(myRecord.check_in).getTime();
            const totalSeconds = Math.floor((new Date(nowIso).getTime() - checkInTime) / 1000);
            const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

            const { error: updErr } = await supabase
              .from('attendance')
              .update({ total_work_seconds: workSeconds })
              .eq('id', myRecord.id);

            if (updErr) throw updErr;

            // 화면도 즉시 반영
            setRecords(prev =>
              prev.map((r: any) => (r.id === myRecord.id ? { ...r, total_work_seconds: workSeconds } : r))
            );

            setLiveBaseSeconds(workSeconds);
          } else {
            setLiveBaseSeconds(myRecord.total_work_seconds || 0);
          }

          setLiveAttendanceId(myRecord.id);
          setLiveBaseMs(Date.now());

          // pause면 멈추고, 아니면 클라에서 증가
          setLiveRunning(myEmployee?.current_status !== 'pause');
        }
      }

      const today = getTodayDate();

      if (user) {
        // ✅ selectedDate 조회 결과(attendanceData) 말고, "오늘"을 따로 조회해야 함
        const { data: myTodayRecord, error: myTodayError } = await supabase
          .from('attendance')
          .select('status')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle();

        if (myTodayError && myTodayError.code !== 'PGRST116') throw myTodayError;

        setTodayStatus(myTodayRecord?.status ?? null);

        const { data: leaveToday, error: leaveError } = await supabase
          .from('leaves')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today)
          .maybeSingle();

        if (leaveError && leaveError.code !== 'PGRST116') throw leaveError;

        const onLeave = !!leaveToday;
        setIsTodayOnLeave(onLeave);

        if (onLeave) {
          setTodayStatus('vacation');
        }
      } else {
        setTodayStatus(null);
        setIsTodayOnLeave(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!user) return;

    try {
      const now = new Date();
      const today = getTodayDate();

      // 1. 미래 날짜 출근 방지
      const todayDate = new Date(today);
      todayDate.setHours(0, 0, 0, 0);
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);

      if (todayDate > currentDate) {
        setError('미래 날짜에는 출근할 수 없습니다');
        return;
      }

      // 2. 승인된 휴가가 있으면 출근 불가
      const { data: leave, error: leaveError } = await supabase
        .from('leaves')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle();

      if (leaveError && leaveError.code !== 'PGRST116') throw leaveError;
      if (leave) {
        setError('오늘은 승인된 휴가일입니다. 출근을 찍을 수 없습니다.');
        return;
      }

      // 3. 오늘 attendance 이미 있으면 중복 출근 방지
      const { data: todayRecord, error: todayError } = await supabase
        .from('attendance')
        .select('id, check_out')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (todayError && todayError.code !== 'PGRST116') throw todayError;

      if (todayRecord) {
        if (!todayRecord.check_out) {
          setError('이미 출근 중입니다');
          return;
        } else {
          setError('오늘 이미 퇴근하셨습니다');
          return;
        }
      }

      // ✅ 3.5 어제 미퇴근(야근) 세션 있으면 출근 막기
      const yesterdayStr = shiftDate(today, -1);

      const { data: yesterdayOpen, error: yesterdayError } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', yesterdayStr)
        .is('check_out', null)
        .maybeSingle();

      if (yesterdayError && yesterdayError.code !== 'PGRST116') throw yesterdayError;

      if (yesterdayOpen) {
        setError('어제 출근 기록이 아직 종료되지 않았습니다(야근 중). 퇴근/업무중지를 먼저 처리하세요.');
        return;
      }

      // 4. 출근 처리
      const nowIso = now.toISOString();

      const { data: inserted, error: insertError } = await supabase
        .from('attendance')
        .insert({
          user_id: user.id,
          date: today,
          check_in: nowIso,
          status: 'working',
          total_work_seconds: 0,
        })
        .select('id, total_work_seconds')
        .single();

      if (insertError) throw insertError;

      // 출근 이벤트 기록
      const { error: eventError } = await supabase
        .from('attendance_events')
        .insert({
          user_id: user.id,
          attendance_id: inserted.id,
          event_type: 'check_in',
          occurred_at: nowIso,
        });

      if (eventError) throw eventError;

      await supabase.from('users').update({ current_status: 'working' }).eq('id', user.id);

      // ✅ 출근 직후부터 클라에서만 실시간 표시 시작
      setLiveAttendanceId(inserted.id);
      setLiveBaseSeconds(inserted.total_work_seconds ?? 0);
      setLiveBaseMs(Date.now());
      setLiveRunning(true);

      setSuccess('출근 처리되었습니다');
      fetchData(true);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Check-in failed');
    }
  };

  const handleCheckOut = async (reasonCategory: string = '퇴근', notes?: string) => {
    if (!user) return;

    try {
      // 출근한 날짜 찾기 (오늘 또는 어제)
      const today = getTodayDate();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
        yesterday.getDate()
      ).padStart(2, '0')}`;

      // 오늘 출근 레코드 확인
      let { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id, date, check_in, user_id')
        .eq('user_id', user.id)
        .eq('date', today)
        .is('check_out', null)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      // 오늘 없으면 어제 출근 레코드 확인
      if (!existing) {
        const result = await supabase
          .from('attendance')
          .select('id, date, check_in, user_id')
          .eq('user_id', user.id)
          .eq('date', yesterdayStr)
          .is('check_out', null)
          .maybeSingle();

        if (result.error && result.error.code !== 'PGRST116') throw result.error;
        existing = result.data;
      }

      if (!existing) {
        setError('출근 기록이 없습니다');
        return;
      }

      const nowIso = new Date().toISOString();

      // pause 시간 계산
      const { data: pauseEvents, error: pauseError } = await supabase
        .from('attendance_events')
        .select('event_type, occurred_at')
        .eq('user_id', user.id)
        .eq('attendance_id', existing.id)
        .in('event_type', ['pause', 'resume'])
        .order('occurred_at', { ascending: true });

      if (pauseError) throw pauseError;

      let totalPauseSeconds = 0;
      let lastPauseTime: Date | null = null;

      (pauseEvents || []).forEach((event: any) => {
        if (event.event_type === 'pause') {
          lastPauseTime = new Date(event.occurred_at);
        } else if (event.event_type === 'resume' && lastPauseTime) {
          const resumeTime = new Date(event.occurred_at);
          totalPauseSeconds += (resumeTime.getTime() - lastPauseTime.getTime()) / 1000;
          lastPauseTime = null;
        }
      });

      if (lastPauseTime) {
        totalPauseSeconds += (new Date(nowIso).getTime() - lastPauseTime.getTime()) / 1000;
      }

      const checkInTime = new Date(existing.check_in).getTime();
      const checkOutTime = new Date(nowIso).getTime();
      const totalSeconds = Math.floor((checkOutTime - checkInTime) / 1000);
      const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

      // ✅ 퇴근도 상세로그 남김(먼저 insert -> 실패 시 update 안 함)
      const { data: insertedEvent, error: eventError } = await supabase
        .from('attendance_events')
        .insert({
          user_id: user.id,
          attendance_id: existing.id,
          event_type: 'check_out',
          reason_category: reasonCategory || '퇴근',
          notes: notes || null,
          occurred_at: nowIso,
        })
        .select('id')
        .single();

      if (eventError) throw eventError;

      const { error: updateError } = await supabase
        .from('attendance')
        .update({
          check_out: nowIso,
          status: 'off',
          total_work_seconds: workSeconds,
        })
        .eq('id', existing.id);

      if (updateError) {
        if (insertedEvent?.id) {
          await supabase.from('attendance_events').delete().eq('id', insertedEvent.id);
        }
        throw updateError;
      }

      await supabase.from('users').update({ current_status: null }).eq('id', user.id);

      // ✅ 퇴근 직후 실시간 표시 종료
      setLiveAttendanceId(null);
      setLiveBaseSeconds(workSeconds);
      setLiveBaseMs(Date.now());
      setLiveRunning(false);

      setSuccess('퇴근 처리되었습니다');
      fetchData(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Check-out failed');
    }
  };

  const openProfileModal = (targetUserId: string) => {
    setSelectedProfileUserId(targetUserId);
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
    setSelectedProfileUserId(null);
  };

  const openRevisionModal = (record: AttendanceType) => {
    setSelectedRecord(record);
    setRevisionForm({
      requestedCheckIn: record.check_in ? toLocalDateTimeInputValue(record.check_in) : '',
      requestedCheckOut: record.check_out ? toLocalDateTimeInputValue(record.check_out) : '',
      reason: '',
    });
    setShowRevisionModal(true);
  };

  const submitRevisionRequest = async () => {
    if (!user || !selectedRecord || !revisionForm.reason) {
      setError('모든 필드를 입력해주세요');
      return;
    }

    try {
      // ✅ datetime-local 입력값(타임존 정보 없음)을 절대시각 ISO(UTC)로 변환한 뒤 저장해야 함.
      // 변환 없이 그대로 저장하면 DB가 UTC로 잘못 해석해서 9시간(KST 기준) 어긋난 시각으로
      // 저장되고, 이후 관리자가 그대로 승인만 해도 전혀 다른 시각으로 덮어써지는 버그가 있었음.
      const { error } = await supabase.from('attendance_revision_requests').insert({
        attendance_id: selectedRecord.id || null,
        user_id: user.id,
        requested_date: selectedRecord.date,
        original_check_in: selectedRecord.check_in || null,
        original_check_out: selectedRecord.check_out || null,
        requested_check_in_at: localDateTimeInputToIso(revisionForm.requestedCheckIn),
        requested_check_out_at: localDateTimeInputToIso(revisionForm.requestedCheckOut),
        reason: revisionForm.reason,
        status: 'pending',
      });

      if (error) throw error;

      setSuccess('수정 요청이 제출되었습니다');
      setShowRevisionModal(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  const toLocalDateTimeInputValue = (isoString: string) => {
    const d = new Date(isoString);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}.${mm}.${dd}`;
  };

  const isNextDay = (checkIn: string | null, checkOut: string | null) => {
    if (!checkIn || !checkOut) return false;
    const inD = new Date(checkIn);
    const outD = new Date(checkOut);
    const inKey = `${inD.getFullYear()}-${inD.getMonth() + 1}-${inD.getDate()}`;
    const outKey = `${outD.getFullYear()}-${outD.getMonth() + 1}-${outD.getDate()}`;
    return inKey !== outKey;
  };

  const calculateWorkHours = (
    recordId: string | null,
    isMine: boolean,
    checkIn: string | null,
    checkOut: string | null,
    workSeconds?: number | null
  ) => {
    if (!checkIn) return '-';

    const isToday = selectedDate === getTodayDate();
    let totalSeconds: number;

    if (checkOut) {
      totalSeconds = workSeconds || 0;
    } else if (isToday) {
      // ✅ 내 기록 + 오늘 + live 연결된 경우: 기존 그대로 유지
      if (isMine && recordId && liveAttendanceId === recordId) {
        const delta = liveRunning ? Math.floor((currentTime.getTime() - liveBaseMs) / 1000) : 0;
        totalSeconds = Math.max(0, liveBaseSeconds + delta);
      } else {
        // ✅ 타사원 포함: now 기준으로 계산해서 "표시만" 증가 (pause 구간은 제외)
        if (!recordId) {
          totalSeconds = workSeconds || 0;
        } else {
          const nowMs = currentTime.getTime();
          const checkInMs = new Date(checkIn).getTime();

          const evts = eventsByAttendanceId[recordId] || [];
          let totalPauseSeconds = 0;
          let lastPauseMs: number | null = null;

          for (const e of evts) {
            const t = new Date(e.occurred_at).getTime();
            if (e.event_type === 'pause') {
              lastPauseMs = t;
            } else if (e.event_type === 'resume' && lastPauseMs !== null) {
              totalPauseSeconds += (t - lastPauseMs) / 1000;
              lastPauseMs = null;
            }
          }

          if (lastPauseMs !== null) {
            totalPauseSeconds += (nowMs - lastPauseMs) / 1000;
          }

          const totalSecondsRaw = Math.floor((nowMs - checkInMs) / 1000);
          totalSeconds = Math.max(0, totalSecondsRaw - Math.floor(totalPauseSeconds));
        }
      }
    } else {
      return '-';
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  };

  const formatWorkTime = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const getTodayButtonLabel = () => {
    if (isTodayOnLeave) return '';

    // todayStatus와 user.current_status 확인
    const myEmployee = allEmployees.find(e => e.id === user?.id);
    const currentStatus = myEmployee?.current_status;

    const label = getStatusLabel(todayStatus, currentStatus, true);

    if (label === '휴가' || label === '퇴근') return '';
    if (label === '근무중') return '업무중지';
    if (label === '근무중단') return '업무재개';
    if (label === '미출근') return '출근';

    return '출근';
  };

  // 🔹 휴게/외출/기타 상태에서 "업무재개"
  const handleResumeFromPause = async () => {
    if (!user) return;

    try {
      const today = getTodayDate();

      const { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (selectError) throw selectError;
      if (!existing) {
        setError('출근 기록이 없습니다');
        return;
      }

      const { error: updateError } = await supabase
        .from('attendance')
        .update({
          status: 'working',
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
      await supabase.from('users').update({ current_status: null }).eq('id', user.id);
      setSuccess('업무가 재개되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '업무 재개에 실패했습니다');
    }
  };

  // 🔹 오늘 버튼 클릭 시 동작 (출근 / 업무중지 / 업무재개)
  const handleTodayAction = async () => {
    if (!user) return;

    if (isTodayOnLeave) {
      setError('오늘은 승인된 휴가일입니다. 출근을 찍을 수 없습니다.');
      return;
    }

    const myEmployee = allEmployees.find(e => e.id === user.id);
    const currentStatus = myEmployee?.current_status;

    const label = getStatusLabel(todayStatus, currentStatus, true);

    if (label === '미출근') {
      await handleCheckIn();
      return;
    }

    if (label === '근무중') {
      setPauseReason('');
      setPauseMemo('');
      setShowPauseModal(true);
      return;
    }

    if (label === '근무중단') {
      await handleResume();
      return;
    }

    // 퇴근 상태 등은 아무 동작 안 함
  };

  // 🔹 업무중지 모달에서 사유 선택 후 확정
  const handlePauseConfirm = async () => {
    if (!pauseReason) {
      setError('사유를 선택해주세요');
      return;
    }

    // ✅ "퇴근" 선택이면 pause 저장 금지 -> 진짜 퇴근 처리로 보냄(조퇴도 메모로 남김)
    if (pauseReason === '퇴근') {
      await handleCheckOut('퇴근', pauseMemo || null);
      setShowPauseModal(false);
      setPauseReason('');
      setPauseMemo('');
      return;
    }

    try {
      const today = getTodayDate();

      // 출근한 날짜 찾기 (오늘 또는 어제)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
        yesterday.getDate()
      ).padStart(2, '0')}`;

      let { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id, date, check_in')
        .eq('user_id', user!.id)
        .eq('date', today)
        .is('check_out', null)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      // 오늘 없으면 어제 확인
      if (!existing) {
        const result = await supabase
          .from('attendance')
          .select('id, date, check_in')
          .eq('user_id', user!.id)
          .eq('date', yesterdayStr)
          .is('check_out', null)
          .maybeSingle();

        if (result.error && result.error.code !== 'PGRST116') throw result.error;
        existing = result.data;
      }

      if (!existing) {
        setError('출근 기록이 없습니다');
        return;
      }

      const nowIso = new Date().toISOString();

      // 1) pause 이벤트 insert (롤백 대비 id 확보)
      const { data: insertedEvent, error: eventError } = await supabase
        .from('attendance_events')
        .insert({
          user_id: user!.id,
          attendance_id: existing.id,
          event_type: 'pause',
          reason_category: pauseReason,
          notes: pauseMemo || null,
          occurred_at: nowIso,
        })
        .select('id')
        .single();

      if (eventError) throw eventError;

      // 2) 지금까지 누적(휴게 제외) 계산해서 DB에 고정
      const { data: pauseEvents, error: pauseError } = await supabase
        .from('attendance_events')
        .select('event_type, occurred_at')
        .eq('user_id', user!.id)
        .eq('attendance_id', existing.id)
        .in('event_type', ['pause', 'resume'])
        .order('occurred_at', { ascending: true });

      if (pauseError) throw pauseError;

      let totalPauseSeconds = 0;
      let lastPauseTime: Date | null = null;

      (pauseEvents || []).forEach((event: any) => {
        if (event.event_type === 'pause') {
          lastPauseTime = new Date(event.occurred_at);
        } else if (event.event_type === 'resume' && lastPauseTime) {
          const resumeTime = new Date(event.occurred_at);
          totalPauseSeconds += (resumeTime.getTime() - lastPauseTime.getTime()) / 1000;
          lastPauseTime = null;
        }
      });

      // 마지막 pause는 방금 nowIso라서 (now-now)=0초가 됨
      if (lastPauseTime) {
        totalPauseSeconds += (new Date(nowIso).getTime() - lastPauseTime.getTime()) / 1000;
      }

      const checkInTime = new Date(existing.check_in).getTime();
      const totalSeconds = Math.floor((new Date(nowIso).getTime() - checkInTime) / 1000);
      const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

      // 3) attendance 업데이트(상태 paused + 누적 고정)
      const { error: updateError } = await supabase
        .from('attendance')
        .update({ status: 'paused', total_work_seconds: workSeconds })
        .eq('id', existing.id);

      if (updateError) {
        if (insertedEvent?.id) {
          await supabase.from('attendance_events').delete().eq('id', insertedEvent.id);
        }
        throw updateError;
      }

      await supabase.from('users').update({ current_status: 'pause' }).eq('id', user!.id);

      // ✅ pause 직후: 클라 실시간 증가 멈춤 + 기준값 갱신
      setLiveAttendanceId(existing.id);
      setLiveBaseSeconds(workSeconds);
      setLiveBaseMs(Date.now());
      setLiveRunning(false);

      setSuccess('업무중지 처리되었습니다');
      setShowPauseModal(false);
      setPauseReason('');
      setPauseMemo('');
      setTimeout(() => fetchData(false), 300);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '업무중지 실패');
    }
  };

  const handleResume = async () => {
    if (!user) return;

    try {
      const today = getTodayDate();

      // 출근한 날짜 찾기 (오늘 또는 어제)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(
        yesterday.getDate()
      ).padStart(2, '0')}`;

      let { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id, date, check_in')
        .eq('user_id', user.id)
        .eq('date', today)
        .is('check_out', null)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      // 오늘 없으면 어제 확인
      if (!existing) {
        const result = await supabase
          .from('attendance')
          .select('id, date, check_in')
          .eq('user_id', user.id)
          .eq('date', yesterdayStr)
          .is('check_out', null)
          .maybeSingle();

        if (result.error && result.error.code !== 'PGRST116') throw result.error;
        existing = result.data;
      }

      if (!existing) {
        setError('출근 기록이 없습니다');
        return;
      }

      const nowIso = new Date().toISOString();

      // 1) resume 이벤트 insert
      const { data: insertedEvent, error: eventError } = await supabase
        .from('attendance_events')
        .insert({
          user_id: user.id,
          attendance_id: existing.id,
          event_type: 'resume',
          reason_category: null,
          notes: null,
          occurred_at: nowIso,
        })
        .select('id')
        .single();

      if (eventError) throw eventError;

      // 2) pause/resume로 휴게시간 계산
      const { data: pauseEvents, error: pauseError } = await supabase
        .from('attendance_events')
        .select('event_type, occurred_at')
        .eq('user_id', user.id)
        .eq('attendance_id', existing.id)
        .in('event_type', ['pause', 'resume'])
        .order('occurred_at', { ascending: true });

      if (pauseError) throw pauseError;

      let totalPauseSeconds = 0;
      let lastPauseTime: Date | null = null;

      (pauseEvents || []).forEach((event: any) => {
        if (event.event_type === 'pause') {
          lastPauseTime = new Date(event.occurred_at);
        } else if (event.event_type === 'resume' && lastPauseTime) {
          const resumeTime = new Date(event.occurred_at);
          totalPauseSeconds += (resumeTime.getTime() - lastPauseTime.getTime()) / 1000;
          lastPauseTime = null;
        }
      });

      if (lastPauseTime) {
        totalPauseSeconds += (new Date(nowIso).getTime() - lastPauseTime.getTime()) / 1000;
      }

      const checkInTime = new Date(existing.check_in).getTime();
      const totalSeconds = Math.floor((new Date(nowIso).getTime() - checkInTime) / 1000);
      const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

      // 3) attendance 업데이트(상태 working + 누적 고정)
      const { error: updateError } = await supabase
        .from('attendance')
        .update({ total_work_seconds: workSeconds, status: 'working' })
        .eq('id', existing.id);

      if (updateError) {
        if (insertedEvent?.id) {
          await supabase.from('attendance_events').delete().eq('id', insertedEvent.id);
        }
        throw updateError;
      }

      await supabase.from('users').update({ current_status: 'working' }).eq('id', user.id);

      // ✅ resume 직후: 클라 실시간 증가 재개 + 기준값 갱신
      setLiveAttendanceId(existing.id);
      setLiveBaseSeconds(workSeconds);
      setLiveBaseMs(Date.now());
      setLiveRunning(true);

      setSuccess('업무재개 처리되었습니다');
      setTimeout(() => fetchData(false), 300);
      setTimeout(() => setSuccess(''), 3000);

      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '업무재개 실패');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* 이번 주 근무 현황 */}
      <WeeklyAttendanceSummary />

      {/* 월간 근태 상세 (각 행의 "근무시간 상세" 칸을 클릭하면 해당 날짜 출퇴근 수정 요청 모달이 바로 열림) */}
      <MonthlyAttendanceTable
        onRequestRevision={(record) => openRevisionModal(record as any)}
        revisionStatusByAttendanceId={revisionRequests}
      />

      {/* 업무중지 사유 선택 모달 */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">업무 중지 사유 선택</h3>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {['휴게', '외출', '퇴근', '기타'].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setPauseReason(reason as '휴게' | '외출' | '퇴근' | '기타')}
                    className={`px-3 py-1 rounded-full text-sm border ${pauseReason === reason
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-100 text-gray-700 border-gray-300'
                      }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  사유 메모 (선택)
                </label>
                <textarea
                  value={pauseMemo}
                  onChange={(e) => setPauseMemo(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex space-x-2">
              <button
                onClick={handlePauseConfirm}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                확인
              </button>
              <button
                onClick={() => setShowPauseModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {user && showProfileModal && selectedProfileUserId && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={closeProfileModal}
          userId={selectedProfileUserId}
          currentUserId={user.id}
          readOnly
        />
      )}

      {/* Revision modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-1">출퇴근 수정 요청</h3>
            {selectedRecord && (
              <p className="text-xs text-gray-500 mb-3">
                {selectedRecord.date}
                {!selectedRecord.check_in && !selectedRecord.check_out && ' · 출근 기록이 없는 날입니다. 출퇴근 시간을 입력해 추가를 요청할 수 있습니다.'}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">출근 시간</label>
                <input
                  type="datetime-local"
                  value={revisionForm.requestedCheckIn}
                  onChange={(e) => setRevisionForm({ ...revisionForm, requestedCheckIn: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">퇴근 시간</label>
                <input
                  type="datetime-local"
                  value={revisionForm.requestedCheckOut}
                  onChange={(e) => setRevisionForm({ ...revisionForm, requestedCheckOut: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                <textarea
                  value={revisionForm.reason}
                  onChange={(e) => setRevisionForm({ ...revisionForm, reason: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex space-x-2">
              <button
                onClick={submitRevisionRequest}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                제출
              </button>
              <button
                onClick={() => setShowRevisionModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AttendanceStatusPanel;
