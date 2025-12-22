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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [notices, setNotices] = useState<Notice[]>(
    () => loadCache<Notice[]>(NOTICES_CACHE_KEY) ?? []
  );
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // ✅ 상태 클릭 모달
  const [workModal, setWorkModal] = useState<null | 'checkin' | 'pause' | 'resume'>(null);

  // ✅ 업무중지 사유 (Attendance.tsx와 동일)  :contentReference[oaicite:3]{index=3}
  const [pauseReason, setPauseReason] = useState<'휴게' | '외출' | '퇴근' | '기타' | ''>('');
  const [pauseMemo, setPauseMemo] = useState('');
  const [workModalError, setWorkModalError] = useState('');

  // ✅ Logout 버튼과 동일 스타일(색상 포함)
  const modalBtnClass =
    'px-3 py-2 rounded-md text-sm font-medium text-white hover:opacity-80 transition duration-200';
  const modalBtnStyle = { backgroundColor: '#4b4d51' };

  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(
    () => loadCache<OrgConfig>(ORG_CACHE_KEY)
  );
  const [userExtra, setUserExtra] = useState<UserExtra | null>(null);

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
      .select('id, date, check_in')
      .eq('user_id', user.id)
      .eq('date', today)
      .is('check_out', null)
      .maybeSingle();

    if (!existing) {
      const r = await supabase
        .from('attendance')
        .select('id, date, check_in')
        .eq('user_id', user.id)
        .eq('date', y)
        .is('check_out', null)
        .maybeSingle();
      existing = r.data as any;
    }

    return existing as any;
  };

  const handleDashboardCheckIn = async () => {
    if (!user?.id) return;

    const today = getTodayDate();
    const nowIso = new Date().toISOString();

    await supabase.from('attendance').insert({
      user_id: user.id,
      date: today,
      check_in: nowIso,
      status: 'working',
      total_work_seconds: 0,
    });

    await supabase.from('users').update({ current_status: 'working' }).eq('id', user.id);

    setUserExtra((prev) => (prev ? { ...prev, current_status: 'working' } : prev));
  };

  const handleDashboardPauseConfirm = async () => {
    if (!pauseReason) throw new Error('사유를 선택해주세요');

    // ✅ Attendance.tsx와 동일: "퇴근" 선택이면 pause 저장 금지 -> 진짜 퇴근 처리
    if (pauseReason === '퇴근') {
      await handleDashboardCheckOut('퇴근', pauseMemo || null);
      return;
    }

    async function calcWorkSecondsUntil(attendanceId: string, checkInIso: string, nowIso: string) {
      const { data: pauseEvents, error: pauseError } = await supabase
        .from('attendance_events')
        .select('event_type, occurred_at')
        .eq('user_id', user!.id)
        .eq('attendance_id', attendanceId)
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

      const checkInTime = new Date(checkInIso).getTime();
      const checkOutTime = new Date(nowIso).getTime();
      const totalSeconds = Math.floor((checkOutTime - checkInTime) / 1000);
      const workSeconds = Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));

      return workSeconds;
    };

    async function handleDashboardCheckOut(reasonCategory: string = '퇴근', notes?: string) {
      const existing = await findOpenAttendance();
      if (!existing) throw new Error('출근 기록이 없습니다');

      const nowIso = new Date().toISOString();
      const workSeconds = await calcWorkSecondsUntil(existing.id, existing.check_in, nowIso);

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


    const existing = await findOpenAttendance();
    if (!existing) throw new Error('출근 기록이 없습니다');

    const nowIso = new Date().toISOString();

    await supabase.from('attendance_events').insert({
      user_id: user!.id,
      attendance_id: existing.id,
      event_type: 'pause',
      reason_category: pauseReason,
      notes: pauseMemo || null,
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

  useEffect(() => {
    const fetchNotices = async () => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('notices')
        .select('id, title, content, is_pinned, created_at')
        .gte('created_at', oneWeekAgo.toISOString())
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && data) {
        const next = data as Notice[];
        setNotices(next);
        saveCache(NOTICES_CACHE_KEY, next);
      }
    };

    fetchNotices();
  }, []);

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
          .from('users')
          .select('department, project, part, position, annual_leave_balance, monthly_leave_balance')
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
        return { label: statusLabel, wrap: 'bg-green-50 border-green-200', title: 'text-green-600', value: 'text-green-700', icon: 'text-green-500', iconPath: 'M5 13l4 4L19 7' };
      case '근무중단':
        return { label: statusLabel, wrap: 'bg-orange-50 border-orange-200', title: 'text-orange-600', value: 'text-orange-700', icon: 'text-orange-500', iconPath: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' };
      case '퇴근':
        return { label: statusLabel, wrap: 'bg-gray-50 border-gray-200', title: 'text-gray-600', value: 'text-gray-700', icon: 'text-gray-500', iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' };
      case '휴가':
        return { label: statusLabel, wrap: 'bg-blue-50 border-blue-200', title: 'text-blue-600', value: 'text-blue-700', icon: 'text-blue-500', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' };
      default:
        return { label: '미출근', wrap: 'bg-red-50 border-red-200', title: 'text-red-600', value: 'text-red-700', icon: 'text-red-500', iconPath: 'M12 8v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z' };
    }
  })();

  const getOrgName = (list: OrgItem[] | undefined, code: string) => {
    if (!code) return '';
    return list?.find((x) => x.code === code)?.name || code;
  };

  const deptCode = String((userExtra?.department ?? (user as any)?.department ?? '')).trim();
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
          <div className="p-6 flex-1">
            <div className="flex items-center space-x-6">
              {user?.profile_picture && (
                <img
                  src={user.profile_picture}
                  alt={user.name}
                  className="h-24 w-24 rounded-full border-4 border-blue-200"
                />
              )}
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-2xl font-bold text-gray-900">{user?.name}</h3>
                  <button
                    onClick={() => setShowProfileModal(true)}
                    className="text-sm text-gray-500 hover:text-gray-700 bg-transparent"
                  >
                    [편집]
                  </button>
                </div>
                <p className="text-gray-600 mt-1">{user?.email}</p>
                <div className="mt-3 flex items-center space-x-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {user?.role}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 sm:col-span-2">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-purple-600 whitespace-nowrap">소속</p>
                      <p className="text-lg font-semibold text-purple-700 mt-1 truncate">{affiliationText}</p>
                    </div>
                    <div className="text-purple-500 shrink-0">
                      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* ✅ 상태 */}
                <button
                  type="button"
                  onClick={() => {
                    setWorkModalError('');

                    if (statusMeta.label === '미출근') {
                      setWorkModal('checkin');
                      return;
                    }

                    if (statusMeta.label === '근무중') {
                      setPauseReason('');
                      setPauseMemo('');
                      setWorkModal('pause');
                      return;
                    }

                    if (statusMeta.label === '근무중단') {
                      setWorkModal('resume');
                      return;
                    }

                    // 퇴근/휴가 등은 무반응
                  }}

                  className={`rounded-lg p-4 border ${statusMeta.wrap} w-full text-left hover:brightness-95 transition`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-medium ${statusMeta.title}`}>상태</p>
                      <p className={`text-lg font-semibold mt-1 ${statusMeta.value}`}>{statusMeta.label}</p>
                    </div>
                    <div className={`${statusMeta.icon} shrink-0`}>
                      <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={statusMeta.iconPath} />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* ✅ 남은 휴가 */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-600">남은 휴가</p>
                      <p className="text-lg font-semibold text-blue-700 mt-1">
                        {remainingLeave}일
                      </p>
                    </div>
                    <div className="text-blue-500">
                      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notice Container */}
        <div className="bg-white shadow rounded-lg overflow-hidden h-full flex flex-col">
          <div className="bg-gradient-to-r from-[#5C5E66] to-[#4B4E51] px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">공지</h2>
            {notices.length > 0 && (
              <span className="text-xs text-yellow-100">
                최근 {notices.length}개 (7일 이내)
              </span>
            )}
          </div>
          <div className="p-6 space-y-3 flex-1 overflow-y-auto">
            {notices.length === 0 ? (
              <p className="text-gray-500 text-sm">최근 7일 이내 공지가 없습니다.</p>
            ) : (
              notices.map((notice) => (
                <button
                  key={notice.id}
                  type="button"
                  onClick={() => {
                    setSelectedNotice(notice);
                    setIsNoticeModalOpen(true);
                  }}
                  className="w-full text-left border-b last:border-b-0 pb-3 last:pb-0 hover:bg-yellow-50 rounded-md px-2 -mx-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {notice.title}
                    </h3>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
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
      {workModal === 'checkin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">출근</h2>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-gray-700">출근하시겠습니까?</p>
              {workModalError && <p className="mt-2 text-sm text-red-600">{workModalError}</p>}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button type="button" className={modalBtnClass} style={modalBtnStyle} onClick={async () => {
                try {
                  await handleDashboardCheckIn(); // 아래 4)에서 추가
                  setWorkModal(null);
                } catch (e: any) {
                  setWorkModalError(e?.message ?? '출근 처리 실패');
                }
              }}>예</button>

              <button type="button" className={modalBtnClass} style={modalBtnStyle} onClick={() => setWorkModal(null)}>
                아니오
              </button>
            </div>
          </div>
        </div>
      )}
      {workModal === 'pause' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">업무 중지 사유 선택</h3>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {['휴게', '외출', '퇴근', '기타'].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setPauseReason(reason as any)}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">사유 메모 (선택)</label>
                <textarea
                  value={pauseMemo}
                  onChange={(e) => setPauseMemo(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              {workModalError && <p className="text-sm text-red-600">{workModalError}</p>}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className={`flex-1 ${modalBtnClass}`}
                style={modalBtnStyle}
                onClick={async () => {
                  try {
                    await handleDashboardPauseConfirm(); // 아래 4)에서 추가
                    setWorkModal(null);
                  } catch (e: any) {
                    setWorkModalError(e?.message ?? '업무중지 처리 실패');
                  }
                }}
              >
                확인
              </button>

              <button
                type="button"
                className={`flex-1 ${modalBtnClass}`}
                style={modalBtnStyle}
                onClick={() => setWorkModal(null)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {workModal === 'resume' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">업무 재개</h2>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-gray-700">업무를 재개하시겠습니까?</p>
              {workModalError && <p className="mt-2 text-sm text-red-600">{workModalError}</p>}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button type="button" className={modalBtnClass} style={modalBtnStyle} onClick={async () => {
                try {
                  await handleDashboardResume(); // 아래 4)에서 추가
                  setWorkModal(null);
                } catch (e: any) {
                  setWorkModalError(e?.message ?? '업무재개 처리 실패');
                }
              }}>예</button>

              <button type="button" className={modalBtnClass} style={modalBtnStyle} onClick={() => setWorkModal(null)}>
                아니오
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/attendance')}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-blue-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">출퇴근 관리</h3>
          <p className="text-sm text-gray-500 mt-1">출근, 퇴근, 조퇴 기록</p>
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
    </div >
  );
};

export default Dashboard;
