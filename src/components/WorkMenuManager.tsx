import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';

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

const WorkMenuManager: React.FC = () => {
  const [menuItems, setMenuItems] = useState<WorkMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkMenuItem | null>(null);
  // 수정 후
  const [form, setForm] = useState({
    id: '',
    label: '',
    icon: 'briefcase',
    path: '',
    order: 1,
    show_to: [] as string[],
    parent_id: null as string | null,
    is_folder: false,
  });

  const [orgConfig, setOrgConfig] = useState({
    departments: [],
    projects: [],
    parts: [],
    positions: [],
  });

  useEffect(() => {
    fetchMenu();
    fetchOrgConfig();
  }, []);

  const fetchOrgConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('config')
        .single();

      if (!error && data) {
        setOrgConfig({
          departments: data.config.departments || [],
          projects: data.config.projects || [],
          parts: data.config.parts || [],
          positions: data.config.positions || [],
        });
      }
    } catch (e) {
      console.error('조직 설정 로드 실패:', e);
    }
  };

  const fetchMenu = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('config')
        .single();

      if (error) throw error;

      const menu = data.config.work_menu || [];
      setMenuItems(menu.sort((a: WorkMenuItem, b: WorkMenuItem) => a.order - b.order));
    } catch (e: any) {
      setError(e.message || 'メニュー読み込み失敗');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setForm({ 
      id: '', 
      label: '', 
      icon: 'briefcase', 
      path: '', 
      order: menuItems.length + 1,
      show_to: [],
      parent_id: null,
      is_folder: false
    });
    setShowModal(true);
  };

  const openEditModal = (item: WorkMenuItem) => {
    setEditingItem(item);
    setForm(item);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.label) {
      setError('메뉴명은 필수입니다');
      return;
    }
    if (!form.is_folder && !form.path) {
      setError('폴더가 아닌 경우 경로는 필수입니다');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('id, config')
        .single();

      if (error) throw error;

      let menu = data.config.work_menu || [];

      if (editingItem) {
        // 수정
        menu = menu.map((item: WorkMenuItem) =>
          item.id === editingItem.id ? { ...form } : item
        );
      } else {
        // 추가
        const newId = form.id || `menu_${Date.now()}`;
        menu.push({ ...form, id: newId });
      }

      const { error: updateError } = await supabase
        .from('org_settings')
        .update({
          config: { ...data.config, work_menu: menu },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updateError) throw updateError;

      setSuccess(editingItem ? '메뉴가 수정되었습니다' : '메뉴가 추가되었습니다');
      setShowModal(false);
      fetchMenu();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '저장 실패');
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('id, config')
        .single();

      if (error) throw error;

      const menu = data.config.work_menu.filter((item: WorkMenuItem) => item.id !== itemId);

      const { error: updateError } = await supabase
        .from('org_settings')
        .update({
          config: { ...data.config, work_menu: menu },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updateError) throw updateError;

      setSuccess('메뉴가 삭제되었습니다');
      fetchMenu();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '삭제 실패');
    }
  };

  const toggleRole = (role: string) => {
    // 'all' 선택 시 다른 권한 모두 제거
    if (role === 'all') {
      if (form.show_to.includes('all')) {
        setForm({ ...form, show_to: [] });
      } else {
        setForm({ ...form, show_to: ['all'] });
      }
      return;
    }

    // 다른 권한 선택 시 'all' 제거
    const newRoles = form.show_to.filter((r) => r !== 'all');
    if (newRoles.includes(role)) {
      setForm({ ...form, show_to: newRoles.filter((r) => r !== role) });
    } else {
      setForm({ ...form, show_to: [...newRoles, role] });
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Work 메뉴 관리</h2>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          메뉴 추가
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">순서</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">메뉴명</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">경로</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">권한</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {menuItems.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-sm">{item.order}</td>
                <td className="px-4 py-3 text-sm font-medium">{item.label}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{item.path}</td>
                <td className="px-4 py-3 text-sm">
                  {item.show_to.includes('all') ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">전체</span>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {item.show_to.map((role) => (
                        <span key={role} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {role}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button
                    onClick={() => openEditModal(item)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">
              {editingItem ? '메뉴 수정' : '메뉴 추가'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메뉴명</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="예: 패키징(빌드)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">경로</label>
                <input
                  type="text"
                  value={form.path}
                  onChange={(e) => setForm({ ...form, path: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="예: build (폴더인 경우 비워두기)"
                  disabled={form.is_folder}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상위 메뉴</label>
                <select
                  value={form.parent_id || ''}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">최상위</option>
                  {menuItems.filter(m => m.is_folder).map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={form.is_folder}
                  onChange={(e) => setForm({ ...form, is_folder: e.target.checked, path: e.target.checked ? '' : form.path })}
                  className="rounded"
                  id="is_folder"
                />
                <label htmlFor="is_folder" className="text-sm font-medium text-gray-700">
                  폴더(하위 메뉴 포함)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">아이콘</label>
                <div className="grid grid-cols-6 gap-2 p-3 border border-gray-300 rounded-md max-h-48 overflow-y-auto">
                  {[
                    { id: 'briefcase', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )},
                    { id: 'package', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    )},
                    { id: 'check', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )},
                    { id: 'users', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    )},
                    { id: 'user', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )},
                    { id: 'calendar', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )},
                    { id: 'chart', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    )},
                    { id: 'folder', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    )},
                    { id: 'document', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )},
                    { id: 'clipboard', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    )},
                    { id: 'settings', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )},
                    { id: 'bell', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    )},
                    { id: 'mail', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )},
                    { id: 'home', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                    )},
                    { id: 'star', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    )},
                    { id: 'heart', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    )},
                    { id: 'tag', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    )},
                    { id: 'clock', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )},
                    { id: 'code', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    )},
                    { id: 'database', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    )},
                    { id: 'cloud', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    )},
                    { id: 'lightning', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )},
                    { id: 'shield', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    )},
                    { id: 'globe', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )},
                    { id: 'fire', icon: (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                      </svg>
                    )},
                  ].map(({ id, icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setForm({ ...form, icon: id })}
                      className={`p-3 border-2 rounded-lg transition ${
                        form.icon === id
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">선택된 아이콘: {form.icon}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">순서</label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">권한 설정</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={form.show_to.includes('all')}
                      onChange={() => toggleRole('all')}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">전체</span>
                  </label>
                  <details className="border rounded p-2">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">부서별</summary>
                    <div className="mt-2 space-y-2 ml-2">
                      {orgConfig.departments.map((dept: any) => (
                        <label key={dept.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={form.show_to.includes(dept.code)}
                            onChange={() => toggleRole(dept.code)}
                            disabled={form.show_to.includes('all')}
                            className="rounded"
                          />
                          <span className="text-sm">{dept.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>

                  <details className="border rounded p-2">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">프로젝트별</summary>
                    <div className="mt-2 space-y-2 ml-2">
                      {orgConfig.projects.map((proj: any) => (
                        <label key={proj.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={form.show_to.includes(proj.code)}
                            onChange={() => toggleRole(proj.code)}
                            disabled={form.show_to.includes('all')}
                            className="rounded"
                          />
                          <span className="text-sm">{proj.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>

                  <details className="border rounded p-2">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">파트별</summary>
                    <div className="mt-2 space-y-2 ml-2">
                      {orgConfig.parts.map((part: any) => (
                        <label key={part.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={form.show_to.includes(part.code)}
                            onChange={() => toggleRole(part.code)}
                            disabled={form.show_to.includes('all')}
                            className="rounded"
                          />
                          <span className="text-sm">{part.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>

                  <details className="border rounded p-2">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">직급별</summary>
                    <div className="mt-2 space-y-2 ml-2">
                      {orgConfig.positions.map((pos: any) => (
                        <label key={pos.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={form.show_to.includes(pos.code)}
                            onChange={() => toggleRole(pos.code)}
                            disabled={form.show_to.includes('all')}
                            className="rounded"
                          />
                          <span className="text-sm">{pos.name}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </div>

            <div className="mt-6 flex space-x-2">
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {editingItem ? '수정' : '추가'}
              </button>
              <button
                onClick={() => setShowModal(false)}
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

export default WorkMenuManager;