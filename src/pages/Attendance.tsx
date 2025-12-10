import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Attendance as AttendanceType, AttendanceRevisionRequest } from '../types';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';

const getTodayDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const Attendance: React.FC = () => {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceType[]>([]);
  const [revisionRequests, setRevisionRequests] = useState<AttendanceRevisionRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceType | null>(null);
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
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
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
          status: record?.status || 'absent',
          current_status: employee.current_status,
          total_work_seconds: record?.total_work_seconds || 0,
          users: { name: employee.name, profile_picture: employee.profile_picture }
        };
      });

      setRecords(matchedRecords);

      const { data: revisionsData, error: revisionsError } = await supabase
        .from('attendance_revision_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (revisionsError) throw revisionsError;

      setRevisionRequests(revisionsData || []);

      // 🔹 오늘 내 상태 + 휴가 여부 계산
      const today = getTodayDate();

      if (user) {
        const myTodayRecord =
          (attendanceData || []).find(
            (r: any) => r.user_id === user.id && r.date === today
          ) || null;

        setTodayStatus(myTodayRecord?.status || null);

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
          setTodayStatus('VACATION');
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

      // 2. 오늘 승인된 휴가 체크
      const { data: leaveToday, error: leaveError } = await supabase
        .from('leaves')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle();

      if (leaveError && leaveError.code !== 'PGRST116') throw leaveError;

      if (leaveToday) {
        setError('오늘은 승인된 휴가일입니다. 출근을 찍을 수 없습니다.');
        return;
      }

      // 3. 미완료 레코드 체크 (전날 이전)
      const { data: incompleteRecords, error: incompleteError } = await supabase
        .from('attendance')
        .select('id, date, check_in, check_out')
        .eq('user_id', user.id)
        .is('check_out', null)
        .lt('date', today);

      if (incompleteError) throw incompleteError;

      if (incompleteRecords && incompleteRecords.length > 0) {
        // 야근 중인지 확인 (전날 출근 후 24시간 이내)
        const lastIncomplete = incompleteRecords[0];
        const checkInTime = new Date(lastIncomplete.check_in);
        const hoursSinceCheckIn = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        if (hoursSinceCheckIn > 24) {
          setError(
            `${lastIncomplete.date} 퇴근 기록이 없습니다. 관리자에게 수정 요청을 제출하세요.`
          );
          return;
        }
        // 24시간 이내면 야근 중으로 간주하고 진행
      }

      // 4. 당일 중복 출근 방지
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

      // 5. 출근 처리
      const nowIso = now.toISOString();

      const { error: insertError } = await supabase.from('attendance').insert({
        user_id: user.id,
        date: today,
        check_in: nowIso,
        status: 'present',
        total_work_seconds: 0,
      });

      if (insertError) throw insertError;

      await supabase.from('users').update({ current_status: 'work' }).eq('id', user.id);

      setSuccess('출근 처리되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Check-in failed');
    }
  };

  const handleCheckOut = async () => {
    if (!user) return;

    try {
      // 출근한 날짜 찾기 (오늘 또는 어제)
      const today = getTodayDate();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      // 오늘 출근 레코드 확인
      let { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id, date, check_in, user_id')
        .eq('user_id', user.id)
        .eq('date', today)
        .is('check_out', null)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      // 오늘 없으면 어제 출근 레코드 확인 (야근 케이스)
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

      // attendance_events에서 pause 시간 계산
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

      // pause와 resume 쌍을 찾아서 시간 계산
      (pauseEvents || []).forEach((event: any) => {
        if (event.event_type === 'pause') {
          lastPauseTime = new Date(event.occurred_at);
        } else if (event.event_type === 'resume' && lastPauseTime) {
          const resumeTime = new Date(event.occurred_at);
          const pauseDuration = (resumeTime.getTime() - lastPauseTime.getTime()) / 1000;
          totalPauseSeconds += pauseDuration;
          lastPauseTime = null;
        }
      });

      // 아직 resume 안 한 pause가 있으면 현재까지 시간 계산
      if (lastPauseTime) {
        const now = new Date();
        const pauseDuration = (now.getTime() - lastPauseTime.getTime()) / 1000;
        totalPauseSeconds += pauseDuration;
      }

      // 총 근무시간 = (퇴근 - 출근) - pause 시간
      const checkInTime = new Date(existing.check_in).getTime();
      const checkOutTime = new Date(nowIso).getTime();
      const totalSeconds = Math.floor((checkOutTime - checkInTime) / 1000);
      const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

      const updateData: any = {
        check_out: nowIso,
        status: 'off',
        total_work_seconds: workSeconds,
      };

      const { error: updateError } = await supabase
        .from('attendance')
        .update(updateData)
        .eq('id', existing.id);

      if (updateError) throw updateError;

      await supabase.from('users').update({ current_status: null }).eq('id', user.id);

      setSuccess('퇴근 처리되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Check-out failed');
    }
  };

  const handleEarlyLeave = async () => {
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
          early_leave: new Date().toISOString(),
          status: 'early_leave',
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
      await supabase.from('users').update({ current_status: null }).eq('id', user.id);
      setSuccess('조퇴 처리되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Early leave failed');
    }
  };

  const openRevisionModal = (record: AttendanceType) => {
    setSelectedRecord(record);
    setRevisionForm({
      requestedCheckIn: record.check_in ? new Date(record.check_in).toISOString().slice(0, 16) : '',
      requestedCheckOut: record.check_out ? new Date(record.check_out).toISOString().slice(0, 16) : '',
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}.${mm}.${dd}`;
  };

  const isNextDay = (checkIn: string | null, checkOut: string | null) => {
    if (!checkIn || !checkOut) return false;
    const inDate = new Date(checkIn).toISOString().slice(0, 10);
    const outDate = new Date(checkOut).toISOString().slice(0, 10);
    return inDate !== outDate;
  };

  const calculateWorkHours = (checkIn: string | null, checkOut: string | null, workSeconds: number) => {
    if (!checkIn) return '-';
    const isToday = selectedDate === getTodayDate();
    let totalSeconds: number;
    if (checkOut) {
      totalSeconds = workSeconds;
    } else if (isToday) {
      const start = new Date(checkIn).getTime();
      const now = currentTime.getTime();
      totalSeconds = Math.max(0, Math.floor((now - start) / 1000));
    } else {
      return '-';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (checkOut || !isToday) {
      return `${hours}h`;
    } else {
      return `${hours}h ${minutes}m`;
    }
  };

  const getStatusLabel = (status: string | null, currentStatus?: string | null) => {
    const isToday = selectedDate === getTodayDate();
    if (status === 'absent') return '미출근';
    if (status === 'off') return '퇴근';
    if (status === 'present' && isToday) {
      if (currentStatus === 'work') return '근무중';
      if (currentStatus === 'pause') return '휴게중';
      if (currentStatus === 'break') return '휴게중';
      if (currentStatus === 'out') return '외근중';
      if (currentStatus === 'meeting') return '회의중';
      return '근무중';
    }
    if (status === 'VACATION') return '휴가';
    return '미출근';
  };

  const getStatusColor = (status: string, currentStatus: string | null) => {
    const label = getStatusLabel(status, currentStatus);
    if (label === '근무중') return 'bg-green-100 text-green-800';
    if (label === '휴게중') return 'bg-orange-100 text-orange-800';
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
    if (label === '휴게중') return '업무재개';
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
          status: 'present',
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

    if (label === '휴게중') {
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

    try {
      const today = getTodayDate();

      // 출근한 날짜 찾기 (오늘 또는 어제)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      let { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id, date, check_in')
        .eq('user_id', user!.id)
        .eq('date', today)
        .is('check_out', null)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      // 오늘 없으면 어제 확인 (야근)
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

      // attendance_events에 pause 기록
      const { error: eventError } = await supabase.from('attendance_events').insert({
        user_id: user!.id,
        attendance_id: existing.id,
        event_type: 'pause',
        reason_category: pauseReason,
        notes: pauseMemo || null,
        occurred_at: nowIso,
      });

      if (eventError) throw eventError;

      await supabase.from('users').update({ current_status: 'pause' }).eq('id', user!.id);

      setSuccess('업무중지 처리되었습니다');
      setShowPauseModal(false);
      setPauseReason('');
      setPauseMemo('');
      fetchData();
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
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      let { data: existing, error: selectError } = await supabase
        .from('attendance')
        .select('id, date, check_in')
        .eq('user_id', user.id)
        .eq('date', today)
        .is('check_out', null)
        .maybeSingle();

      if (selectError && selectError.code !== 'PGRST116') throw selectError;

      // 오늘 없으면 어제 확인 (야근)
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

      // attendance_events에 resume 기록
      const { error: eventError } = await supabase.from('attendance_events').insert({
        user_id: user.id,
        attendance_id: existing.id,
        event_type: 'resume',
        occurred_at: nowIso,
      });

      if (eventError) throw eventError;

      // 현재까지 누적 근무시간 계산
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
          const pauseDuration = (resumeTime.getTime() - lastPauseTime.getTime()) / 1000;
          totalPauseSeconds += pauseDuration;
          lastPauseTime = null;
        }
      });

      // 현재까지 총 근무시간 업데이트
      const checkInTime = new Date(existing.check_in).getTime();
      const now = new Date().getTime();
      const totalSeconds = Math.floor((now - checkInTime) / 1000);
      const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

      await supabase
        .from('attendance')
        .update({ total_work_seconds: workSeconds })
        .eq('id', existing.id);

      await supabase.from('users').update({ current_status: 'work' }).eq('id', user.id);

      setSuccess('업무재개 처리되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '업무재개 실패');
    }
  };

  if (loading) return <Loading />;

  const isToday = selectedDate === getTodayDate();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">출퇴근 관리</h1>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* Check-in/out button (토글) */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">오늘의 출퇴근</h2>
        <p className="text-sm text-gray-600 mb-4">
          오늘 상태:{' '}
          <span className="font-medium">
            {getStatusLabel(isTodayOnLeave ? 'VACATION' : todayStatus)}
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
              const date = new Date(selectedDate);
              date.setDate(date.getDate() - 1);
              setSelectedDate(date.toISOString().slice(0, 10));
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
              const date = new Date(selectedDate);
              date.setDate(date.getDate() + 1);
              setSelectedDate(date.toISOString().slice(0, 10));
            }} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">→</button>

            {selectedDate !== getTodayDate() && (
              <button onClick={() => setSelectedDate(getTodayDate())}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">오늘</button>
            )}
          </div>

          <button onClick={fetchData} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">
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
                    <div className="flex items-center gap-2">
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
                    </div>
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
                    {calculateWorkHours(record.check_in, record.check_out, record.total_work_seconds)}
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
