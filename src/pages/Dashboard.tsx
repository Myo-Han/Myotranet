import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { User } from '../types';
import CalendarCard from '../components/CalendarCard';
import ProfileModal from '../components/ProfileModal';
import { ReactionBar } from '../components/reactions';
import { CommentThread } from '../components/comments';
import SearchModal from '../components/SearchModal';
import LettersModal from '../components/LettersModal';
import { getStatusLabel } from '../utils/attendanceLabels';
import EvidenceIssueModal from '../components/EvidenceIssueModal';
import { markAsRead } from '../../api/readLog';

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLettersOpen, setIsLettersOpen] = useState(false);
  const [isEvidenceIssueOpen, setIsEvidenceIssueOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [notices, setNotices] = useState<Notice[]>(
    () => loadCache<Notice[]>(NOTICES_CACHE_KEY) ?? []
  );
  const [allNotices, setAllNotices] = useState<Notice[]>([]); // ✅ 전체 공지 저장
  const [isAllNoticeListOpen, setIsAllNoticeListOpen] = useState(false); // ✅ 전체보기 모달 상태
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<number>>(new Set()); // 읽은 공지 ID 보관용

  // ✅ 전체 공지 불러오기 함수 추가
  const fetchAllNotices = async () => {
    const { data, error } = await supabase
      .from('notices')
      .select('id, title, content, is_pinned, created_at')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAllNotices(data as Notice[]);
      setIsAllNoticeListOpen(true);
    }
  };
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, annual_leave_balance, profile_picture')
        .or(
          `name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
        );

      if (error) throw error;

      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

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

  // ✅ 같은 부서 팀원 상태 (부서가 지정되어 있지 않으면 아무도 표시하지 않음)
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!deptCode || !user?.id) {
        setTeamMembers([]);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('id, name, profile_picture, current_status')
        .eq('department', deptCode)
        .eq('is_active', true)
        .neq('id', user.id)
        .order('name', { ascending: true });

      if (!error) {
        setTeamMembers((data || []) as TeamMember[]);
      }
    };

    fetchTeamMembers();
  }, [deptCode, user?.id]);

  const projCode = String((userExtra?.project ?? (user as any)?.project ?? '')).trim();
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
      {/* User Profile Card */}
      {/* Profile + Notice Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch h-[520px]">
        {/* User Profile Card */}
        <div className="bg-white shadow rounded-lg overflow-hidden h-full flex flex-col">
          <div className="bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-6 py-4">
            <h2 className="text-xl font-semibold text-white">프로필</h2>
          </div>
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-6">
                {user?.profile_picture && (
                  <img
                    src={user.profile_picture}
                    alt={user.name}
                    className="h-24 w-24 rounded-full border-4 border-blue-200"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-baseline space-x-2">
                    <h3 className="text-2xl font-bold text-gray-900">{user?.name}</h3>
                    {posName && (
                      <span className="text-sm font-medium text-gray-500">{posName}</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-gray-600" title="사번">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                      </svg>
                      <span>{userExtra?.employee_number || '미등록'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600" title="소속">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                      <span>{affiliationText}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600" title="이메일">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      <span>{user?.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600" title="휴대폰 번호">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      <span>{userExtra?.phone || '연락처 미등록'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600" title="생일">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m0-13.5H1.5m10.5 0H21m-9 0H1.5m10.5 0H21m-9 0v13.5" />
                      </svg>
                      <span>{userExtra?.birth_date ? new Date(userExtra.birth_date).toLocaleDateString('ko-KR') : '미등록'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600" title="입사일">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0 text-gray-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      <span>{userExtra?.hire_date ? new Date(userExtra.hire_date).toLocaleDateString('ko-KR') : '미등록'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 italic" title="상태 메시지">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4 flex-shrink-0 text-gray-400 not-italic">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                      </svg>
                      <span>{userExtra?.status_message || '상태 메시지가 없습니다.'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowProfileModal(true)}
                className="text-sm text-gray-500 hover:text-gray-700 bg-transparent shrink-0"
              >
                [편집]
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              {/* ✅ 상태 표시 + 액션 아이콘 (출근하기 / 업무정지·재개 / 퇴근하기) */}
              <div className={`flex items-center gap-3 rounded-xl border ${statusMeta.wrap} px-4 py-3`}>
                <span className={`h-2.5 w-2.5 rounded-full ${statusMeta.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${statusMeta.title}`}>현재 상태</p>
                  <p className={`text-base font-semibold ${statusMeta.value}`}>{statusMeta.label}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(() => {
                    const isPaused = statusMeta.label === '근무중단';
                    const canCheckIn = statusMeta.label === '미출근' || statusMeta.label === '퇴근';
                    const canToggle = statusMeta.label === '근무중' || isPaused;
                    const canCheckOut = statusMeta.label === '근무중' || isPaused;
                    const disabled = actionBusy !== null;

                    const btnClass = (enabled: boolean, activeColor: string) =>
                      `flex h-9 w-9 items-center justify-center rounded-full border transition ${
                        enabled
                          ? `${activeColor} cursor-pointer`
                          : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                      }`;

                    return (
                      <>
                        <button
                          type="button"
                          title="출근하기"
                          disabled={!canCheckIn || disabled}
                          onClick={() =>
                            runStatusAction(
                              'checkin',
                              statusMeta.label === '퇴근' ? handleDashboardReCheckIn : handleDashboardCheckIn
                            )
                          }
                          className={btnClass(canCheckIn, 'border-indigo-200 bg-indigo-600 text-white hover:bg-indigo-700')}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          title={isPaused ? '업무재개' : '업무정지'}
                          disabled={!canToggle || disabled}
                          onClick={() =>
                            runStatusAction(
                              isPaused ? 'resume' : 'pause',
                              isPaused ? handleDashboardResume : handleDashboardPauseConfirm
                            )
                          }
                          className={btnClass(canToggle, 'border-amber-200 bg-amber-500 text-white hover:bg-amber-600')}
                        >
                          {isPaused ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                            </svg>
                          )}
                        </button>

                        <button
                          type="button"
                          title="퇴근하기"
                          disabled={!canCheckOut || disabled}
                          onClick={() => runStatusAction('checkout', () => handleDashboardCheckOut('퇴근', null))}
                          className={btnClass(canCheckOut, 'border-gray-300 bg-gray-800 text-white hover:bg-gray-900')}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>

              {actionError && (
                <p className="mt-2 flex items-center gap-1 text-sm text-red-600">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                  {actionError}
                </p>
              )}

              {statusMeta.label === '휴가' && (
                <p className="mt-2 text-center text-sm text-gray-400">오늘은 휴가일입니다.</p>
              )}
            </div>

            {/* ✅ 같은 부서 팀원 상태 (부서 미지정 시 표시 안 함) */}
            {deptCode && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="mb-3 text-xs font-medium text-gray-500">같은 부서 팀원</p>

                {teamMembers.length === 0 ? (
                  <p className="text-sm text-gray-400">같은 부서에 다른 팀원이 없습니다.</p>
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
        <div className="bg-white shadow rounded-lg overflow-hidden h-full flex flex-col">
          <div className="bg-gradient-to-r from-[#5C5E66] to-[#4B4E51] px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">공지</h2>
            <div className="flex items-center gap-3">
              {notices.length > 0 && (
                <span className="text-xs text-yellow-100">
                  최근 {notices.length}개 (7일 이내)
                </span>
              )}
              {/* ✅ 전체보기 버튼 추가 */}
              <button
                onClick={fetchAllNotices}
                className="text-xs bg-white/20 hover:bg-white/40 text-white px-2 py-1 rounded border border-white/30 transition"
              >
                전체
              </button>
            </div>
          </div>
          <div className="p-6 space-y-3 flex-1 overflow-y-auto">
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

        <CalendarCard title="캘린더" />
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setIsEvidenceIssueOpen(true)}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-blue-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">증빙서 발급</h3>
          <p className="text-sm text-gray-500 mt-1">출퇴근 등 서류 발급</p>
        </button>
        <a
          href="https://www.notion.so/2ce8b0cc5ed08039a648ecbcb2cb5ee8?source=copy_link"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left block"
        >
          <div className="text-orange-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">운영툴 제안</h3>
          <p className="text-sm text-gray-500 mt-1">버그 / 기능 개선 제안</p>
        </a>

        <button
          onClick={() => setIsLettersOpen(true)}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-purple-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">마음의 편지</h3>
          <p className="text-sm text-gray-500 mt-1">익명 또는 실명 편지</p>
        </button>

        <button
          onClick={() => setIsSearchOpen(true)}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-indigo-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">직원 검색</h3>
          <p className="text-sm text-gray-500 mt-1">상세 프로필 조회</p>
        </button>
      </div>
      {/* ✅ 모든 공지 목록 모달 */}
      {isAllNoticeListOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 h-[70vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">공지사항 전체목록</h2>
              <button onClick={() => setIsAllNoticeListOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {allNotices.map((notice) => (
                <button
                  key={notice.id}
                  onClick={() => {
                    setSelectedNotice(notice);
                    setIsNoticeModalOpen(true);
                  }}
                  className="w-full text-left p-3 rounded-md hover:bg-gray-100 border-b last:border-0 transition"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm text-gray-800">{notice.title}</span>
                    <span className="text-xs text-gray-400">{new Date(notice.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t flex justify-end">
              <button onClick={() => setIsAllNoticeListOpen(false)} className="px-4 py-2 bg-gray-800 text-white rounded-md text-sm">닫기</button>
            </div>
          </div>
        </div>
      )}
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
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
      <LettersModal
        isOpen={isLettersOpen}
        onClose={() => setIsLettersOpen(false)}
      />
      <EvidenceIssueModal
        isOpen={isEvidenceIssueOpen}
        onClose={() => setIsEvidenceIssueOpen(false)}
      />
    </div >
  );
};

export default Dashboard;
