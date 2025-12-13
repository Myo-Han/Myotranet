import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';
import LeaveWorkQueue from '../components/LeaveWorkQueue';

type WorkMenuItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  order: number;
  show_to: string[];
};

const Work: React.FC = () => {
  const { user } = useAuth();
  const [menuItems, setMenuItems] = useState<WorkMenuItem[]>([]);
  const [selectedMenu, setSelectedMenu] = useState('build');
  const [loadingMenu, setLoadingMenu] = useState(true);
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
        const filtered = menu.filter((item: WorkMenuItem) => {
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

        setMenuItems(filtered.sort((a: WorkMenuItem, b: WorkMenuItem) => a.order - b.order));
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
      package: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      briefcase: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      check: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedMenu(item.path)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${selectedMenu === item.path
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              {getIcon(item.icon)}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 오른쪽 컨텐츠 */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-4">
          {error && <ErrorMessage message={error} />}
          {success && <SuccessMessage message={success} />}

          {selectedMenu === 'build' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-bold mb-2">패키징(빌드)</h2>
              <p className="text-sm text-gray-600 mb-4">
                Jenkins 빌드를 트리거합니다. 관리자/매니저만 실행 가능합니다.
              </p>

              {!canBuild && (
                <p className="text-sm text-gray-500">
                  빌드 실행 권한이 없습니다.
                </p>
              )}

              {canBuild && (
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={openBuildModal}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={submitting}
                  >
                    빌드 시작
                  </button>
                  <span className="text-xs text-gray-500">
                    Jenkins 빌드 트리거
                  </span>
                </div>
              )}
            </div>
          )}

          {selectedMenu === 'my' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-bold mb-2">내 업무</h2>
              <p className="text-sm text-gray-500">내 업무 대시보드 (개발 예정)</p>
            </div>
          )}

          {selectedMenu === 'leave-approval' && (
            <LeaveWorkQueue />
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
