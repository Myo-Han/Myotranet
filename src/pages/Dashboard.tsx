import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import CalendarCard from '../components/CalendarCard';
import TodayStrip from '../components/TodayStrip';
import { useWorkHours } from '../hooks/useWorkHours';
import TeamEventsCard from '../components/TeamEventsCard';
import ProfileModal from '../components/ProfileModal';
import { ReactionBar } from '../components/reactions';
import { CommentThread } from '../components/comments';
import { getStatusLabel } from '../utils/attendanceLabels';
import { markAsRead } from '../utils/readLog';

type Notice = {
  id: number;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
};

type OrgItem = {
  id: string;
  name: string;
  code: string;
};

type OrgConfig = {
  departments: OrgItem[];
  projects: OrgItem[];
  parts: OrgItem[];
  positions: OrgItem[];
};

type UserExtra = {
  department: string | null;
  project: string | null;
  part: string | null;
  position: string | null;
  annual_leave_balance: number | null;
  monthly_leave_balance: number | null;
  current_status: string | null;
  phone: string | null;
  birth_date: string | null;
  hire_date: string | null;
  status_message: string | null;
  employee_number: string | null;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 60분
const NOTICES_CACHE_KEY = 'dashboard:notices:v1';
const ORG_CACHE_KEY = 'dashboard:orgConfig:v1';
const ME_CACHE_KEY = (userId: string) => `dashboard:me:${userId}:v1`;

function loadCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (!parsed?.ts) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function saveCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch { }
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notices, setNotices] = useState<Notice[]>(
    () => loadCache<Notice[]>(NOTICES_CACHE_KEY) ?? []
  );
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<number>>(new Set()); // 읽은 공지 ID 보관용

  const [showProfileModal, setShowProfileModal] = useState(false);

  // ✅ 출근/업무정지(재개 토글)/퇴근 - 모두 즉시 처리(모달 없음)
  const [actionBusy, setActionBusy] = useState<null | 'checkin' | 'pause' | 'resume' | 'checkout'>(null);
  const [actionError, setActionError] = useState('');

  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(
    () => loadCache<OrgConfig>(ORG_CACHE_KEY)
  );
  const [userExtra, setUserExtra] = useState<UserExtra | null>(null);

  type TeamMember = {
    id: string;
    name: string;
    profile_picture: string | null;
    current_status: string | null;
  };
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // 상단 스트립의 "결재 대기" 지표.
  // LeaveWorkQueue가 쓰는 RPC를 그대로 재사용한다 (건수만 필요해서 길이만 센다).
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);

  // 오늘/이번 주 근무시간 (진행 중인 세션 포함, 60초 주기 갱신)
  const { todaySeconds, weekSeconds } = useWorkHours(user?.id);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      const { data, error } = await supabase.rpc('get_leave_work_queue', { p_actor_id: user.id });
      if (!alive || error) return; // 실패해도 스트립의 나머지 지표는 살아야 하므로 조용히 무시
      setPendingApprovals((data || []).length);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const getTodayDate = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getYesterdayDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const findOpenAttendance = async () => {
    if (!user?.id) return null;
    const today = getTodayDate();
    const y = getYesterdayDate();

    let { data: existing } = await supabase
      .from('attendance')
      .select('id, date, check_in, total_work_seconds')
      .eq('user_id', user.id)
      .eq('date', today)
      .is('check_out', null)
      .maybeSingle();

    if (!existing) {
      const r = await supabase
        .from('attendance')
        .select('id, date, check_in, total_work_seconds')
        .eq('user_id', user.id)
        .eq('date', y)
        .is('check_out', null)
        .maybeSingle();
      existing = r.data as any;
    }

    return existing as any;
  };

  // 오늘 날짜의 가장 최근 attendance row (진행중이든 이미 퇴근했든 상관없이 조회) - 재출근용
  const findTodayAttendance = async () => {
    if (!user?.id) return null;
    const today = getTodayDate();
    const { data } = await supabase
      .from('attendance')
      .select('id, date, check_in, total_work_seconds')
      .eq('user_id', user.id)
      .eq('date', today)
      .order('check_in', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as any;
  };

  const calcWorkSecondsUntil = async (attendanceId: string, checkInIso: string, nowIso: string) => {
    const { data: pauseEvents, error: pauseError } = await supabase
      .from('attendance_events')
      .select('event_type, occurred_at')
      .eq('user_id', user!.id)
      .eq('attendance_id', attendanceId)
      .in('event_type', ['pause', 'resume'])
      // ✅ 재출근(같은 attendance row 재사용) 시 이전 세션의 pause/resume이 다시 집계되지 않도록 현재 세션(check_in 이후)만 필터링
      .gte('occurred_at', checkInIso)
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

    const checkInTime = new Date(checkInIso).getTime();
    const checkOutTime = new Date(nowIso).getTime();
    const totalSeconds = Math.floor((checkOutTime - checkInTime) / 1000);
    const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

    return workSeconds;
  };

  const handleDashboardCheckOut = async (reasonCategory: string = '퇴근', notes?: string | null) => {
    const existing = await findOpenAttendance();
    if (!existing) throw new Error('출근 기록이 없습니다');

    const nowIso = new Date().toISOString();
    const sessionSeconds = await calcWorkSecondsUntil(existing.id, existing.check_in, nowIso);
    // ✅ 퇴근 후 재출근으로 같은 row를 재사용한 경우, 이전 세션에 누적된 시간(뱅킹)에 이번 세션 시간을 더함
    const bankedSeconds = Number(existing.total_work_seconds || 0);
    const workSeconds = bankedSeconds + sessionSeconds;

    // ✅ 퇴근 이벤트 먼저 insert(롤백 대비)
    const { data: insertedEvent, error: eventError } = await supabase
      .from('attendance_events')
      .insert({
        user_id: user!.id,
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

    // Attendance.tsx와 동일하게 users.current_status는 null 처리
    await supabase.from('users').update({ current_status: null }).eq('id', user!.id);

    // 대시보드는 즉시 "퇴근" 표시 되도록 로컬 상태만 off로 갱신(다음 fetchMe에서 DB status(off)로 동기화됨)
    setUserExtra((prev) => (prev ? { ...prev, current_status: 'off' } : prev));
  };

  const handleDashboardCheckIn = async () => {
    if (!user?.id) return;

    const today = getTodayDate();
    const nowIso = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from('attendance')
      .insert({
        user_id: user.id,
        date: today,
        check_in: nowIso,
        status: 'working',
        total_work_seconds: 0,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    await supabase.from('attendance_events').insert({
      user_id: user.id,
      attendance_id: inserted!.id,
      event_type: 'check_in',
      reason_category: '출근',
      notes: null,
      occurred_at: nowIso,
    });

    await supabase.from('users').update({ current_status: 'working' }).eq('id', user.id);

    setUserExtra((prev) => (prev ? { ...prev, current_status: 'working' } : prev));
  };

  // ✅ 퇴근한 이후 다시 "출근하기"를 누른 경우: 새 row를 만들지 않고 오늘 row를 재오픈, 기존 누적 시간은 보존
  const handleDashboardReCheckIn = async () => {
    if (!user?.id) return;

    const existing = await findTodayAttendance();
    if (!existing) {
      await handleDashboardCheckIn();
      return;
    }

    const nowIso = new Date().toISOString();

    await supabase.from('attendance_events').insert({
      user_id: user.id,
      attendance_id: existing.id,
      event_type: 'check_in',
      reason_category: '재출근',
      notes: null,
      occurred_at: nowIso,
    });

    await supabase
      .from('attendance')
      .update({ check_in: nowIso, check_out: null, status: 'working' })
      .eq('id', existing.id);

    await supabase.from('users').update({ current_status: 'working' }).eq('id', user.id);

    setUserExtra((prev) => (prev ? { ...prev, current_status: 'working' } : prev));
  };

  const handleDashboardPauseConfirm = async () => {
    const existing = await findOpenAttendance();
    if (!existing) throw new Error('출근 기록이 없습니다');

    const nowIso = new Date().toISOString();

    await supabase.from('attendance_events').insert({
      user_id: user!.id,
      attendance_id: existing.id,
      event_type: 'pause',
      reason_category: '업무정지',
      notes: null,
      occurred_at: nowIso,
    });

    await supabase.from('attendance').update({ status: 'paused' }).eq('id', existing.id);
    await supabase.from('users').update({ current_status: 'paused' }).eq('id', user!.id);

    setUserExtra((prev) => (prev ? { ...prev, current_status: 'paused' } : prev));
  };

  const handleDashboardResume = async () => {
    const existing = await findOpenAttendance();
    if (!existing) throw new Error('출근 기록이 없습니다');

    const nowIso = new Date().toISOString();

    await supabase.from('attendance_events').insert({
      user_id: user!.id,
      attendance_id: existing.id,
      event_type: 'resume',
      reason_category: null,
      notes: null,
      occurred_at: nowIso,
    });

    await supabase.from('attendance').update({ status: 'working' }).eq('id', existing.id);
    await supabase.from('users').update({ current_status: 'working' }).eq('id', user!.id);

    setUserExtra((prev) => (prev ? { ...prev, current_status: 'working' } : prev));
  };

  // ✅ 출근/업무정지/재개/퇴근 공통 실행기: 로딩 + 에러 상태만 관리 (모달 없이 즉시 처리)
  const runStatusAction = async (kind: 'checkin' | 'pause' | 'resume' | 'checkout', fn: () => Promise<void>) => {
    setActionError('');
    setActionBusy(kind);
    try {
      await fn();
    } catch (e: any) {
      setActionError(e?.message ?? '처리 실패');
    } finally {
      setActionBusy(null);
    }
  };

  useEffect(() => {
    const fetchNoticesAndLogs = async () => {
      if (!user?.id) return;

      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60); // 60일 데이터 기준

      // 1. 공지사항 로드
      const { data: nData, error: nErr } = await supabase
        .from('notices')
        .select('id, title, content, is_pinned, created_at')
        .gte('created_at', sixtyDaysAgo.toISOString())
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      // 2. 내 읽음 로그 로드
      const { data: lData } = await supabase
        .from('user_read_logs')
        .select('target_id')
        .eq('user_id', user.id)
        .eq('target_type', 'notice');

      if (!nErr && nData) {
        setNotices(nData as Notice[]);
        saveCache(NOTICES_CACHE_KEY, nData);
      }
      if (lData) {
        // 읽은 ID들만 뽑아서 Set에 저장
        setReadNoticeIds(new Set(lData.map(log => Number(log.target_id))));
      }
    };

    fetchNoticesAndLogs();
  }, [user?.id]);

  useEffect(() => {
    const fetchOrgConfig = async () => {
      const { data, error } = await supabase.from('org_settings').select('config').single();
      if (error) return;

      const next = {
        departments: data.config?.departments || [],
        projects: data.config?.projects || [],
        parts: data.config?.parts || [],
        positions: data.config?.positions || [],
      };
      setOrgConfig(next);
      saveCache(ORG_CACHE_KEY, next);
    };

    fetchOrgConfig();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const cacheKey = ME_CACHE_KEY(user.id);
    const cached = loadCache<UserExtra>(cacheKey);
    if (cached) setUserExtra(cached);

    const fetchMe = async () => {
      const today = getTodayDate();

      const [userRes, attRes] = await Promise.all([
        supabase
          .from('users_with_employee_number')
          .select('department, project, part, position, annual_leave_balance, monthly_leave_balance, phone, birth_date, hire_date, status_message, employee_number')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('attendance')
          .select('status')
          .eq('user_id', user.id)
          .eq('date', today)
          .maybeSingle(),
      ]);

      const userRow = userRes.data;
      if (userRes.error || !userRow) return;

      const next: UserExtra = {
        ...(userRow as any),
        current_status: attRes.error ? null : ((attRes.data?.status ?? null) as any),
      };

      setUserExtra(next);
      saveCache(cacheKey, next);
    };

    fetchMe();
  }, [user?.id]);


  const statusLabel = getStatusLabel(userExtra?.current_status ?? null, null, true);

  const statusMeta = (() => {
    switch (statusLabel) {
      case '근무중':
        return { label: statusLabel, wrap: 'bg-green-50 border-green-200', title: 'text-green-600', value: 'text-green-700', icon: 'text-green-500', dot: 'bg-green-500', iconPath: 'M5 13l4 4L19 7' };
      case '근무중단':
        return { label: statusLabel, wrap: 'bg-orange-50 border-orange-200', title: 'text-orange-600', value: 'text-orange-700', icon: 'text-orange-500', dot: 'bg-orange-500', iconPath: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' };
      case '퇴근':
        return { label: statusLabel, wrap: 'bg-gray-50 border-gray-200', title: 'text-gray-600', value: 'text-gray-700', icon: 'text-gray-500', dot: 'bg-gray-400', iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' };
      case '휴가':
        return { label: statusLabel, wrap: 'bg-blue-50 border-blue-200', title: 'text-blue-600', value: 'text-blue-700', icon: 'text-blue-500', dot: 'bg-blue-500', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' };
      default:
        return { label: '미출근', wrap: 'bg-red-50 border-red-200', title: 'text-red-600', value: 'text-red-700', icon: 'text-red-500', dot: 'bg-red-500', iconPath: 'M12 8v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z' };
    }
  })();

  const getOrgName = (list: OrgItem[] | undefined, code: string) => {
    if (!code) return '';
    return list?.find((x) => x.code === code)?.name || code;
  };

  const deptCode = String((userExtra?.department ?? (user as any)?.department ?? '')).trim();
  const projCode = String((userExtra?.project ?? (user as any)?.project ?? '')).trim();

  // ✅ 같은 프로젝트 팀원 상태 (프로젝트가 지정되어 있지 않으면 아무도 표시하지 않음)
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!projCode || !user?.id) {
        setTeamMembers([]);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, name, profile_picture, current_status')
        .eq('project', projCode)
        .eq('is_active', true)
        .neq('id', user.id)
        .order('name', { ascending: true });

      if (!error) {
        setTeamMembers((data || []) as TeamMember[]);
      }
    };

    fetchTeamMembers();
  }, [projCode, user?.id]);

  const partCode = String((userExtra?.part ?? (user as any)?.part ?? '')).trim();
  const posCode = String((userExtra?.position ?? (user as any)?.position ?? '')).trim();

  const deptName = getOrgName(orgConfig?.departments, deptCode);
  const projName = getOrgName(orgConfig?.projects, projCode);
  const partName = getOrgName(orgConfig?.parts, partCode);
  const posName = getOrgName(orgConfig?.positions, posCode);

  const affiliationParts = [deptName, projName, partName].filter(Boolean);
  const affiliationText =
    affiliationParts.length ? affiliationParts.join(' / ')
      : (posName || ' ');

  // ✅ 남은 휴가(0도 무조건 표시되게)
  const annual = Number(userExtra?.annual_leave_balance ?? (user as any)?.annual_leave_balance ?? 0);
  const monthly = Number(userExtra?.monthly_leave_balance ?? (user as any)?.monthly_leave_balance ?? 0);
  const remainingLeave = annual + monthly;

  return (
    <div className="space-y-6">
      {/* 오늘 — 매일 쓰는 액션과 숫자를 최상단 한 줄로 */}
      <TodayStrip
        statusLabel={statusMeta.label}
        busy={actionBusy !== null}
        error={actionError}
        todaySeconds={todaySeconds}
        weekSeconds={weekSeconds}
        weeklyRequiredHours={Number((user as any)?.weekly_required_hours ?? 40)}
        remainingLeave={remainingLeave}
        pendingApprovals={pendingApprovals}
        onCheckIn={() =>
          runStatusAction(
            'checkin',
            statusMeta.label === '퇴근' ? handleDashboardReCheckIn : handleDashboardCheckIn
          )
        }
        onTogglePause={() =>
          statusMeta.label === '근무중단'
            ? runStatusAction('resume', handleDashboardResume)
            : runStatusAction('pause', handleDashboardPauseConfirm)
        }
        onCheckOut={() => runStatusAction('checkout', () => handleDashboardCheckOut('퇴근', null))}
        onGoApprovals={() => navigate('/works')}
      />

      {/* 좌측(프로필·공지·구성원 소식) + 캘린더 2칸.
          높이를 고정하지 않아야 6주짜리 달에서 캘린더가 잘리지 않는다. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="flex flex-col gap-6">
        {/* User Profile Card */}
        <div className="overflow-hidden rounded-xl border border-[#e8ebef] bg-white shadow-sm">
          <div className="flex items-center justify-between bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-[18px] py-[13px]">
            <h2 className="text-[15px] font-semibold text-white">프로필</h2>
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="rounded-[7px] bg-white/[0.16] px-2.5 py-[5px] text-[13px] text-white transition hover:bg-white/25"
            >
              편집
            </button>
          </div>
          <div className="p-[18px]">
            {/* 사번·이메일·연락처 등 상세 항목은 매일 볼 정보가 아니라서 프로필 모달로 옮겼다.
                여기서는 누구인지 알아보는 데 필요한 것만 남긴다. */}
            <div className="flex items-center gap-[14px]">
              {user?.profile_picture ? (
                <img
                  src={user.profile_picture}
                  alt={user.name}
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#cfd6de] text-lg font-semibold text-white">
                  {user?.name?.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-[17px] font-bold text-[#1f2328]">{user?.name}</div>
                <div className="mt-0.5 truncate text-[12px] text-[#8c95a1]">
                  {[posName, affiliationText].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowProfileModal(true)}
              className="mt-[14px] w-full rounded-[9px] border border-[#e8ebef] py-[9px] text-[13px] font-medium text-[#5b6470] transition hover:bg-gray-50"
            >
              내 프로필 보기
            </button>

            {/* ✅ 같은 프로젝트 팀원 상태 (프로젝트 미지정 시 표시 안 함) */}
            {projCode && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="mb-3 text-xs font-medium text-gray-500">같은 프로젝트 팀원</p>

                {teamMembers.length === 0 ? (
                  <p className="text-sm text-gray-400">같은 프로젝트에 다른 팀원이 없습니다.</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {teamMembers.map((member) => {
                      const dotColor =
                        member.current_status === 'working'
                          ? 'bg-green-500'
                          : member.current_status === 'paused'
                            ? 'bg-yellow-400'
                            : 'bg-gray-300';

                      return (
                        <div key={member.id} className="flex w-14 flex-col items-center gap-1">
                          <div className="relative">
                            <div className="h-10 w-10 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                              {member.profile_picture ? (
                                <img
                                  src={member.profile_picture}
                                  alt={member.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-gray-400">
                                  {member.name?.charAt(0)}
                                </div>
                              )}
                            </div>
                            <span
                              className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${dotColor}`}
                            />
                          </div>
                          <p className="w-full truncate text-center text-[11px] text-gray-600">{member.name}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Notice Container */}
        <div className="overflow-hidden rounded-xl border border-[#e8ebef] bg-white shadow-sm">
          {/* 카드 헤더 그라데이션이 카드마다 미묘하게 달랐어서 한 값으로 통일 */}
          <div className="flex items-center justify-between bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-[18px] py-[13px]">
            <h2 className="text-[15px] font-semibold text-white">게시판</h2>
            <div className="flex items-center gap-2">
              {notices.length > 0 && (
                <span className="text-[11px] text-white/70">
                  최근 {notices.length}개
                </span>
              )}
              {/* ✅ 전체보기 버튼: 게시판 탭으로 바로 이동 */}
              <button
                onClick={() => navigate('/board')}
                className="text-xs bg-white/20 hover:bg-white/40 text-white px-2 py-1 rounded border border-white/30 transition"
              >
                전체
              </button>
            </div>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto p-[18px]">
            {notices.length === 0 ? (
              <p className="text-gray-500 text-sm">최근 공지가 없습니다.</p>
            ) : (
              notices.map((notice) => (
                <button
                  key={notice.id}
                  type="button"
                  onClick={async () => {
                    setSelectedNotice(notice);
                    setIsNoticeModalOpen(true);

                    // 읽지 않은 공지일 때만 DB에 기록 전송
                    if (user?.id && !readNoticeIds.has(notice.id)) {
                      await markAsRead(user.id, 'notice', String(notice.id));
                      // 로컬 상태 즉시 갱신해서 레드닷 지우기
                      setReadNoticeIds(prev => new Set(prev).add(notice.id));
                    }
                  }}
                  className="w-full text-left border-b last:border-b-0 pb-3 last:pb-0 hover:bg-yellow-50 rounded-md px-2 -mx-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="relative inline-block">
                      {/* 읽지 않은 경우에만 레드닷 표시 (위치: 좌측 상단 밀착, 애니메이션: 0.7초 고속) */}
                      {!readNoticeIds.has(notice.id) && (
                        <span
                          className="absolute -top-1 -left-1.5 w-2 h-2 bg-red-600 rounded-full shadow-[0_0_5px_rgba(220,38,38,0.8)] animate-[pulse_0.7s_infinite]"
                          style={{ zIndex: 1 }}
                        ></span>
                      )}

                      <h3 className={`text-sm relative ${!readNoticeIds.has(notice.id) ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                        {notice.title}
                      </h3>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(notice.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 생일 / 경조사 — 전폭이던 것을 좌측 컬럼으로 */}
        <TeamEventsCard />
        </div>

        <div className="lg:col-span-2">
          <CalendarCard title="캘린더" />
        </div>
      </div>

      {/* Quick Actions */}
      {/* Notice Modal */}
      {
        isNoticeModalOpen && selectedNotice && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 h-[60vh] overflow-hidden flex flex-col">
              <div className="px-6 py-3 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedNotice.title}
                </h2>
                <span className="text-xs text-gray-400">
                  {new Date(selectedNotice.created_at).toLocaleDateString('ko-KR')}
                </span>
              </div>
              <div className="px-6 py-4 flex-1 overflow-y-auto">
                <p className="text-sm text-gray-700 whitespace-pre-line">
                  {selectedNotice.content}
                </p>
              </div>

              <div className="px-6 py-3 border-t">
                <div className="bg-gray-50 rounded-md p-2">
                  <div className="max-h-20 overflow-y-auto">
                    <ReactionBar noticeId={selectedNotice.id} />
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 border-t">
                <div className="max-h-40 overflow-y-auto">
                  <CommentThread noticeId={selectedNotice.id} />
                </div>
              </div>
              <div className="px-6 py-2 border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsNoticeModalOpen(false)}
                  className="px-4 py-1.5 rounded-md bg-gray-800 text-white text-sm"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )
      }
      {/* 프로필 모달 */}
      {
        user && (
          <ProfileModal
            isOpen={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            userId={user.id}
            currentUserId={user.id}
          />
        )
      }
    </div >
  );
};

export default Dashboard;
