import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import LeaveWorkQueue from '../components/LeaveWorkQueue';
import UserManager from '../components/UserManager';
import UserInviteManager from '../components/UserInviteManager';
import NoticeManager from '../components/NoticeManager';
import BuildPackaging from '../components/BuildPackaging';
import TodoManager from '../components/TodoManager';
import MemoManager from '../components/MemoManager';
import LeaveEmployeeOverview from '../components/LeaveEmployeeOverview';
import LeaveBalanceAdjust from '../components/LeaveBalanceAdjust';
import LettersInbox from '../components/LettersInbox';
import AttendanceRevisionInbox from '../components/AttendanceRevisionInbox';
import AttendanceAdminEditor from '../components/AttendanceAdminEditor';

type WorkMenuItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  order: number;
  show_to: string[];
  parent_id: string | null;
  is_folder: boolean;
};

const Work: React.FC = () => {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<WorkMenuItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState('');
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [buildPassword, setBuildPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [version, setVersion] = useState('');
  const [memo, setMemo] = useState('');
  const [loadingBuildInfo, setLoadingBuildInfo] = useState(false);

  const canBuild = user && (user.role === 'Manager' || user.role === 'Admin');

  // 메뉴 로드
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const { data, error } = await supabase
          .from('org_settings')
          .select('config')
          .single();

        if (error) throw error;

        const menu = data.config.work_menu || [];

        // parent_id, is_folder 없는 기존 메뉴는 기본값 추가
        const normalizedMenu = menu.map((item: any) => ({
          ...item,
          parent_id: item.parent_id || null,
          is_folder: item.is_folder || false,
        }));

        const filtered = normalizedMenu.filter((item: WorkMenuItem) => {
          if (item.show_to.includes('all')) return true;

          // role 체크
          if (user?.role && item.show_to.includes(user.role)) return true;

          // position 체크
          if (user?.position && item.show_to.includes(user.position)) return true;

          // department 체크
          if (user?.department && item.show_to.includes(user.department)) return true;

          // project 체크
          if (user?.project && item.show_to.includes(user.project)) return true;

          return false;
        });

        const sorted = filtered.sort((a: WorkMenuItem, b: WorkMenuItem) => a.order - b.order);
        setMenuItems(sorted);

        // 첫 번째 메뉴를 기본 선택
        if (sorted.length > 0 && !selectedMenu) {
          const firstMenu = sorted.find(m => !m.is_folder) || sorted[0];
          setSelectedMenu(firstMenu.path);
        }
      } catch (e) {
        console.error('메뉴 로드 실패:', e);
      } finally {
        setLoadingMenu(false);
      }
    };

    fetchMenu();
  }, [user]);

  useEffect(() => {
    const fetchBuildInfo = async () => {
      try {
        setLoadingBuildInfo(true);
        setError('');

        // 브랜치 목록 + 현재 버전 가져오는 API (엔드포인트는 백엔드에서 맞추면 됨)
        const PROJECT_KEY = 'LDProject';

        const res = await fetch(`/api/build-info?projectKey=${PROJECT_KEY}`);
        if (!res.ok) throw new Error('빌드 정보를 불러오지 못했습니다.');

        const data = await res.json();
        // 예시: { branches: string[], currentVersion: string }
        setBranches(data.branches || []);
        setSelectedBranch(data.branches?.[0] || '');
        setVersion(data.currentVersion || '');
      } catch (e: any) {
        setError(e.message || '빌드 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoadingBuildInfo(false);
      }
    };

    fetchBuildInfo();
  }, []);

  const openBuildModal = () => {
    setError('');
    setSuccess('');
    setBuildPassword('');
    setShowBuildModal(true);
  };

  const handleBuild = async () => {
    if (!buildPassword) {
      setError('빌드 비밀번호를 입력해주세요.');
      return;
    }
    if (!selectedBranch) {
      setError('브랜치를 선택하세요.');
      return;
    }
    if (!version.trim()) {
      setError('버전을 입력하세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: buildPassword,
          branch: selectedBranch,
          version,
          memo,
          executorName: user?.name || user?.email || '알 수 없음',
        }),
      });

      if (!res.ok) {
        let message = '빌드 시작에 실패했습니다.';
        try {
          const data = await res.json();
          if (data && data.message) {
            message = data.message;
          }
        } catch {
          // ignore json parse error
        }
        throw new Error(message);
      }

      setSuccess('빌드가 시작되었습니다.');
      setShowBuildModal(false);
      setBuildPassword('');
      // 필요하면 메모도 초기화 가능
      // setMemo('');
    } catch (err: any) {
      setError(err.message || '빌드 시작에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6">
        <ErrorMessage message="로그인 후 이용 가능합니다." />
      </div>
    );
  }

  const getIcon = (iconName: string) => {
    const icons: Record<string, JSX.Element> = {
      briefcase: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      package: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      check: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      users: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      user: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      calendar: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      chart: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      folder: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
      document: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      clipboard: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      settings: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      bell: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
      mail: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      home: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      star: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      heart: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      tag: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
      clock: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      code: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
      database: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
      ),
      cloud: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      ),
      lightning: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      shield: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      globe: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      fire: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
        </svg>
      ),
    };
    return icons[iconName] || icons.briefcase;
  };

  if (!user) {
    return (
      <div className="p-6">
        <ErrorMessage message="로그인 후 이용 가능합니다." />
      </div>
    );
  }

  if (loadingMenu) {
    return <Loading />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 왼쪽 메뉴 */}
      <div className="w-64 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-gray-900">업무</h1>
          <p className="text-xs text-gray-500 mt-1">업무 관리</p>
        </div>
        <nav className="p-4 space-y-1">
          {menuItems.filter(item => !item.parent_id).map((item) => (
            <div key={item.id}>
              <button
                onClick={() => {
                  if (item.is_folder) {
                    const newExpanded = new Set(expandedFolders);
                    if (newExpanded.has(item.id)) {
                      newExpanded.delete(item.id);
                    } else {
                      newExpanded.add(item.id);
                    }
                    setExpandedFolders(newExpanded);
                  } else {
                    setSelectedMenu(item.path);
                  }
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition ${!item.is_folder && selectedMenu === item.path
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-center space-x-3">
                  {getIcon(item.icon)}
                  <span>{item.label}</span>
                </div>
                {item.is_folder && (
                  <svg
                    className={`w-4 h-4 transition-transform ${expandedFolders.has(item.id) ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>

              {item.is_folder && expandedFolders.has(item.id) && (
                <div className="ml-6 mt-1 space-y-1">
                  {menuItems.filter(child => child.parent_id === item.id).map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setSelectedMenu(child.path)}
                      className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition text-sm ${selectedMenu === child.path
                        ? 'bg-blue-50 text-blue-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      {getIcon(child.icon)}
                      <span>{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* 오른쪽 컨텐츠 */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-4">
          {error && <ErrorMessage message={error} />}
          {success && <SuccessMessage message={success} />}

          {selectedMenu === 'my' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-bold mb-2">내 업무</h2>
              <p className="text-sm text-gray-500">내 업무 대시보드 (개발 예정)</p>
            </div>
          )}

          {selectedMenu === 'leave-approval' && (
            <LeaveWorkQueue />
          )}

          {selectedMenu === 'user-manage' && (
            <UserManager currentUserId={user?.id} />
          )}

          {selectedMenu === 'user-invite' && (
            <UserInviteManager />
          )}

          {selectedMenu === 'notice-manager' && (
            <NoticeManager />
          )}

          {selectedMenu === 'My-work' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TodoManager />
              <MemoManager />
            </div>
          )}

          {selectedMenu === 'build' && (
            <BuildPackaging />
          )}

          {selectedMenu === 'leave_adjust' && (
            <LeaveBalanceAdjust />
          )}

          {selectedMenu === 'leave_overview' && (
            <LeaveEmployeeOverview />
          )}

          {selectedMenu === 'letters-inbox' && (
            <LettersInbox />
          )}

          {selectedMenu === 'attendance-revision-inbox' && (
            <AttendanceRevisionInbox />
          )}

          {selectedMenu === 'attendance-admin-editor' && (
            <AttendanceAdminEditor />
          )}

          {submitting && (
            <div className="mt-4">
              <Loading />
            </div>
          )}

          {showBuildModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
              <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
                <h2 className="text-xl font-semibold mb-4">빌드 정보 입력</h2>
                <p className="text-sm text-gray-600 mb-3">
                  브랜치와 버전을 확인하고, 메모와 비밀번호를 입력한 뒤 빌드를 실행하세요.
                </p>

                {/* 브랜치 선택 */}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  브랜치
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  disabled={loadingBuildInfo || submitting}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 mb-3"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                {/* 버전 입력 */}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  버전
                </label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  disabled={loadingBuildInfo || submitting}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 mb-3"
                  placeholder="예: 1.4.3"
                />

                {/* 메모 입력 */}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  메모
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  disabled={submitting}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 mb-3"
                  placeholder="이번 빌드 용도 / 변경 내용 메모"
                  rows={3}
                />

                {/* 비밀번호 입력 */}
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  빌드 비밀번호
                </label>
                <input
                  type="password"
                  value={buildPassword}
                  onChange={(e) => setBuildPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4"
                  placeholder="빌드 비밀번호"
                  disabled={submitting}
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleBuild}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={submitting || loadingBuildInfo}
                  >
                    {submitting ? '빌드 시작 중...' : '확인'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBuildModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                    disabled={submitting}
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Work;
