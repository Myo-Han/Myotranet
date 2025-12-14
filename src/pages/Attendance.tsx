import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Attendance as AttendanceType, AttendanceRevisionRequest } from '../types';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import ProfileModal from '../components/ProfileModal';

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

const Attendance: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceType[]>([]);
  const [revisionRequests, setRevisionRequests] = useState<AttendanceRevisionRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // ✅ 실시간 표시는 클라에서만(기준값+경과초)
  const [liveAttendanceId, setLiveAttendanceId] = useState<string | null>(null);
  const [liveBaseSeconds, setLiveBaseSeconds] = useState<number>(0);
  const [liveBaseMs, setLiveBaseMs] = useState<number>(Date.now());
  const [liveRunning, setLiveRunning] = useState<boolean>(false);
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

      const { data: revisionsData, error: revisionsError } = await supabase
        .from('attendance_revision_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (revisionsError) throw revisionsError;

      setRevisionRequests(revisionsData || []);

      // 🔹 오늘 내 상태 + 휴가 여부 계산
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
      const { error } = await supabase.from('attendance_revision_requests').insert({
        attendance_id: selectedRecord.id,
        user_id: user.id,
        requested_date: selectedRecord.date,
        requested_check_in: revisionForm.requestedCheckIn || null,
        requested_check_out: revisionForm.requestedCheckOut || null,
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

  const reviewRevisionRequest = async (
    requestId: string,
    status: 'approved' | 'rejected',
    notes: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('attendance_revision_requests')
        .update({
          status,
          review_notes: notes,
          reviewed_at: new Date().toISOString(),
          reviewer_id: user.id,
        })
        .eq('id', requestId);

      if (error) throw error;

      setSuccess(`수정 요청이 ${status === 'approved' ? '승인' : '반려'}되었습니다`);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to review request');
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
      // ✅ 내 기록 + 오늘 + live 연결된 경우: 클라에서만 증가
      if (isMine && recordId && liveAttendanceId === recordId) {
        const delta = liveRunning ? Math.floor((currentTime.getTime() - liveBaseMs) / 1000) : 0;
        totalSeconds = Math.max(0, liveBaseSeconds + delta);
      } else {
        // 다른 사람은 DB에 저장된 값만 표시(실시간 X)
        totalSeconds = workSeconds || 0;
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


  const getStatusLabel = (status: string | null, currentStatus?: string | null) => {
    const isToday = selectedDate === getTodayDate();
    if (!status) return '미출근';
    if (status === 'off') return '퇴근';
    if (status === 'vacation') return '휴가';
    if (status === 'paused') return '근무중단';
    if (status === 'working') return '근무중';
    return '미출근';
  };

  const getStatusColor = (status: string | null, currentStatus: string | null) => {
    const label = getStatusLabel(status, currentStatus);
    if (label === '근무중') return 'bg-green-100 text-green-800';
    if (label === '근무중단') return 'bg-orange-100 text-orange-800';
    if (label === '외근중') return 'bg-blue-100 text-blue-800';
    if (label === '회의중') return 'bg-purple-100 text-purple-800';
    if (label === '퇴근') return 'bg-gray-100 text-gray-800';
    if (label === '미출근') return 'bg-red-100 text-red-800';
    if (label === '휴가') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-800';
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

    const label = getStatusLabel(todayStatus, currentStatus);

    if (label === '휴가' || label === '퇴근') return '';
    if (label === '근무중') return '업무중지';
    if (label === '근무중단') return '업무재개';
    if (label === '미출근') return '출근';
    if (!todayStatus) return '출근';

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

    const label = getStatusLabel(todayStatus, currentStatus);

    if (!todayStatus || label === '미출근') {
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
      fetchData(false);
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
      fetchData(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '업무재개 실패');
    }
  };

  if (loading) return <Loading />;

  const isToday = selectedDate === getTodayDate();

  return (
    <div className="space-y-6">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* Check-in/out button (토글) */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">오늘의 출퇴근</h2>
        <p className="text-sm text-gray-600 mb-4">
          오늘 상태:{' '}
          <span className="font-medium">
            {getStatusLabel(isTodayOnLeave ? 'vacation' : todayStatus)}
          </span>
        </p>
        {getTodayButtonLabel() ? (
          <button
            onClick={handleTodayAction}
            className={`px-4 py-2 text-white rounded-lg ${getTodayButtonLabel() === '업무중지'
              ? 'bg-orange-600 hover:bg-orange-700'
              : getTodayButtonLabel() === '업무재개'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {getTodayButtonLabel()}
          </button>
        ) : (
          <p className="text-sm text-gray-500">
            {isTodayOnLeave
              ? '오늘은 휴가일입니다.'
              : '변경 가능한 상태가 없습니다.'}
          </p>
        )}
      </div>

      {/* 날짜 필터 + 새로고침 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <button onClick={() => {
              setSelectedDate(shiftDate(selectedDate, -1));
            }} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">←</button>

            <div className="relative">
              <button onClick={() => setShowCalendar(!showCalendar)}
                className="px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 min-w-[120px]">
                📅 {formatDate(selectedDate)}
              </button>
              {showCalendar && (
                <div className="absolute top-full mt-2 z-10 bg-white border border-gray-300 rounded shadow-lg">
                  <input type="date" value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); setShowCalendar(false); }}
                    className="px-3 py-2" />
                </div>
              )}
            </div>

            <button onClick={() => {
              setSelectedDate(shiftDate(selectedDate, 1));
            }} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">→</button>

            {selectedDate !== getTodayDate() && (
              <button onClick={() => setSelectedDate(getTodayDate())}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">오늘</button>
            )}
          </div>

          <button onClick={() => fetchData(true)} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">
            🔄 새로고침
          </button>
        </div>
      </div>

      {/* Attendance records */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">출퇴근 기록</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">직원</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">출근</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">퇴근</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">근무시간</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((record: any) => (
                <tr key={record.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <button
                      type="button"
                      onClick={() => openProfileModal(record.user_id)}
                      className="flex items-center gap-2 bg-transparent p-0 border-0 cursor-pointer"
                    >
                      {record.users?.profile_picture ? (
                        <img
                          src={record.users.profile_picture}
                          className="h-8 w-8 rounded-full object-cover"
                          alt="profile"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                          {record.users?.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                      <span>{record.users?.name ?? '이름 없음'}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatTime(record.check_in)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {record.check_out ? (
                      <>
                        {isNextDay(record.check_in, record.check_out) && (
                          <span className="text-orange-600 font-medium">익일 </span>
                        )}
                        {formatTime(record.check_out)}
                      </>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(record.status, record.current_status)}`}>
                      {getStatusLabel(record.status, record.current_status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {calculateWorkHours(
                      record.id ?? null,
                      record.user_id === user?.id,
                      record.check_in,
                      record.check_out,
                      record.total_work_seconds
                    )}

                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {record.user_id === user?.id && (
                      <button
                        onClick={() => openRevisionModal(record)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        수정 요청
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revision requests for Manager/Admin */}
      {(user?.role === 'Manager' || user?.role === 'Admin') && revisionRequests.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">출퇴근 수정 요청</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {revisionRequests.map((request) => (
              <div key={request.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium">{request.user_name}</p>
                    <p className="text-sm text-gray-600">날짜: {new Date(request.requested_date).toLocaleDateString('ko-KR')}</p>
                    <p className="text-sm text-gray-600 mt-2">사유: {request.reason}</p>
                    <div className="mt-2 text-sm">
                      <p>요청 출근: {formatTime(request.requested_check_in)}</p>
                      <p>요청 퇴근: {formatTime(request.requested_check_out)}</p>
                    </div>
                  </div>
                  {request.status === 'pending' && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => reviewRevisionRequest(request.id, 'approved', '승인됨')}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => reviewRevisionRequest(request.id, 'rejected', '반려됨')}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        반려
                      </button>
                    </div>
                  )}
                  {request.status !== 'pending' && (
                    <span className={`px-3 py-1 rounded-full text-sm ${request.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                      {request.status === 'approved' ? '승인됨' : '반려됨'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <h3 className="text-xl font-semibold mb-4">출퇴근 수정 요청</h3>
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

export default Attendance;
