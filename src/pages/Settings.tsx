// 설정: 결재관리/관리자와 동일한 좌측 사이드바 레이아웃.
// 개인설정 - 내 프로필 편집(기존 ProfileModal 재사용).
// 시스템 설정 - 자동 로그인(비활성 자동로그아웃 끄기), 화이트/다크 모드 선택(현재는 값 저장만, 화면 적용은 추후 작업 예정).
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import ProfileModal from '../components/ProfileModal';

type SettingsMenu = 'personal' | 'system';

const Settings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [menu, setMenu] = useState<SettingsMenu>('personal');
  const [profileOpen, setProfileOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const menuLabel = menu === 'personal' ? '개인설정' : '시스템 설정';

  const handleToggleAutoLogin = async (checked: boolean) => {
    if (!user?.id) return;
    setSaving(true);
    setError('');
    try {
      const { error: updErr } = await supabase
        .from('users')
        .update({ auto_login_enabled: checked })
        .eq('id', user.id);
      if (updErr) throw updErr;
      await refreshUser();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTheme = async (theme: 'light' | 'dark') => {
    if (!user?.id || user.theme_preference === theme) return;
    setSaving(true);
    setError('');
    try {
      const { error: updErr } = await supabase
        .from('users')
        .update({ theme_preference: theme })
        .eq('id', user.id);
      if (updErr) throw updErr;
      await refreshUser();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 왼쪽 메뉴 */}
      <div className="w-56 bg-white border-r border-gray-200">
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="text-base font-semibold text-gray-900">설정</h1>
        </div>
        <nav className="p-2 space-y-0.5">
          <button
            type="button"
            onClick={() => setMenu('personal')}
            className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition ${
              menu === 'personal' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            개인설정
          </button>
          <button
            type="button"
            onClick={() => setMenu('system')}
            className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition ${
              menu === 'system' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            시스템 설정
          </button>
        </nav>
      </div>

      {/* 오른쪽 컨텐츠 */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-4 border-b border-gray-100 bg-white">
          <h1 className="text-base font-semibold text-gray-900">{menuLabel}</h1>
        </div>

        <div className="p-4 space-y-4">
          {error && <p className="text-xs text-red-600">{error}</p>}

          {menu === 'personal' && (
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                  {user?.profile_picture ? (
                    <img src={user.profile_picture} alt={user?.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-gray-400 text-xs">No Image</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                  프로필 편집
                </button>
              </div>
            </div>
          )}

          {menu === 'system' && (
            <div className="bg-white border border-gray-200 rounded-md p-4 space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">자동 로그인</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      켜두면 일정 시간 활동이 없어도 자동으로 로그아웃되지 않습니다.
                    </p>
                  </div>
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!user?.auto_login_enabled}
                      disabled={saving}
                      onChange={(e) => handleToggleAutoLogin(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-900">화면 모드</p>
                <p className="mt-0.5 text-xs text-gray-500">설정만 저장되며, 전체 화면 적용은 추후 지원 예정입니다.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSelectTheme('light')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                      (user?.theme_preference ?? 'light') === 'light'
                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    화이트 모드
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSelectTheme('dark')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                      user?.theme_preference === 'dark'
                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    다크 모드
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {user?.id && (
        <ProfileModal
          isOpen={profileOpen}
          onClose={() => setProfileOpen(false)}
          userId={user.id}
          currentUserId={user.id}
        />
      )}
    </div>
  );
};

export default Settings;
