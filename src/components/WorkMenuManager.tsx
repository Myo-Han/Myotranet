import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';

type AuthRule = {
  dept: string | null;
  proj: string | null;
  part: string | null;
  pos: string | null;
  users: string[];
};

type WorkMenuItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  order: number;
  auth_rules: AuthRule[];
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
  const [draggedItem, setDraggedItem] = useState<WorkMenuItem | null>(null);
  const [dropPosition, setDropPosition] = useState<{ itemId: string; position: 'before' | 'after' } | null>(null);
  const [form, setForm] = useState({
    id: '',
    label: '',
    icon: 'briefcase',
    path: '',
    order: 1,
    auth_rules: [] as AuthRule[],
    parent_id: null as string | null,
    is_folder: false,
  });

  const [newRule, setNewRule] = useState<AuthRule>({
    dept: null,
    proj: null,
    part: null,
    pos: null,
    users: []
  });
  const [tempUserUuid, setTempUserUuid] = useState('');

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
      auth_rules: [],
      parent_id: null,
      is_folder: false
    });
    setShowModal(true);
  };

  const openEditModal = (item: WorkMenuItem) => {
    setEditingItem(item);
    setForm({
      ...item,
      auth_rules: item.auth_rules || [] // 기존 데이터에 필드가 없으면 빈 배열 강제 주입
    });
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

      // 캐시 강제 삭제 (다음 접근 시 최신 데이터 로드)
      localStorage.removeItem('work_menu_cache');

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

  const addAuthRule = () => {
    setForm({
      ...form,
      auth_rules: [...form.auth_rules, { ...newRule }]
    });
    setNewRule({ dept: null, proj: null, part: null, pos: null, users: [] });
  };

  const removeAuthRule = (index: number) => {
    setForm({
      ...form,
      auth_rules: form.auth_rules.filter((_, i) => i !== index)
    });
  };

  const addUserToRule = () => {
    if (!tempUserUuid.trim()) return;
    setNewRule({
      ...newRule,
      users: [...newRule.users, tempUserUuid.trim()]
    });
    setTempUserUuid('');
  };

  const removeUserFromRule = (uuid: string) => {
    setNewRule({
      ...newRule,
      users: newRule.users.filter(id => id !== uuid)
    });
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (e: React.DragEvent, item: WorkMenuItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, item: WorkMenuItem) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedItem || draggedItem.id === item.id) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const position = e.clientY < midPoint ? 'before' : 'after';

    setDropPosition({ itemId: item.id, position });
  };

  const handleDragLeave = () => {
    setDropPosition(null);
  };

  const handleDrop = async (e: React.DragEvent, targetItem: WorkMenuItem) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetItem.id || !dropPosition) {
      setDropPosition(null);
      setDraggedItem(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('id, config')
        .single();

      if (error) throw error;

      let menu = [...data.config.work_menu];

      // 같은 parent 내에서만 이동 가능하도록 체크
      if (draggedItem.parent_id !== targetItem.parent_id) {
        setError('같은 레벨 내에서만 순서를 변경할 수 있습니다');
        setDropPosition(null);
        setDraggedItem(null);
        setTimeout(() => setError(''), 3000);
        return;
      }

      // 드래그한 아이템 제거
      const draggedIndex = menu.findIndex((item: WorkMenuItem) => item.id === draggedItem.id);
      const [removed] = menu.splice(draggedIndex, 1);

      // 타겟 아이템의 새 위치 찾기
      const targetIndex = menu.findIndex((item: WorkMenuItem) => item.id === targetItem.id);
      const insertIndex = dropPosition.position === 'before' ? targetIndex : targetIndex + 1;

      // 새 위치에 삽입
      menu.splice(insertIndex, 0, removed);

      // order 재정렬
      menu = menu.map((item: WorkMenuItem, index: number) => ({
        ...item,
        order: index + 1
      }));

      const { error: updateError } = await supabase
        .from('org_settings')
        .update({
          config: { ...data.config, work_menu: menu },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updateError) throw updateError;

      setSuccess('순서가 변경되었습니다');
      fetchMenu();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(e.message || '순서 변경 실패');
    }

    setDraggedItem(null);
    setDropPosition(null);
  };

  // 아이콘 렌더링
  const getIcon = (iconName: string) => {
    const iconMap: Record<string, JSX.Element> = {
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
      mail: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      document: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      folder: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
      chart: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      cog: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
    return iconMap[iconName] || iconMap.briefcase;
  };

  // 트리 구조로 메뉴 렌더링
  const renderMenuItem = (item: WorkMenuItem, depth: number = 0) => {
    const children = menuItems.filter(m => m.parent_id === item.id);
    const hasChildren = children.length > 0;
    const isBeforeTarget = dropPosition?.itemId === item.id && dropPosition?.position === 'before';
    const isAfterTarget = dropPosition?.itemId === item.id && dropPosition?.position === 'after';

    return (
      <div key={item.id} className="select-none">
        <div className="relative">
          {/* 위쪽 드롭 인디케이터 */}
          {isBeforeTarget && (
            <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded-full z-10 shadow-lg">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
            </div>
          )}

          <div
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onDragOver={(e) => handleDragOver(e, item)}
            onDrop={(e) => handleDrop(e, item)}
            onDragLeave={handleDragLeave}
            className={`
              flex items-center justify-between p-3 mb-2 rounded-lg border-2 
              bg-white hover:bg-gray-50 cursor-move transition
              ${draggedItem?.id === item.id ? 'opacity-30 border-blue-400 scale-95' : 'border-gray-200'}
            `}
            style={{ marginLeft: `${depth * 24}px` }}
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              {/* 폴더 아이콘 또는 일반 메뉴 아이콘 */}
              <div className="text-gray-600 flex-shrink-0">
                {item.is_folder ? (
                  <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                ) : (
                  getIcon(item.icon)
                )}
              </div>

              {/* 메뉴명 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900 truncate">
                    {item.label}
                  </span>
                  {item.is_folder && (
                    <span className="text-xs text-gray-500">({children.length})</span>
                  )}
                </div>
                {!item.is_folder && item.path && (
                  <p className="text-xs text-gray-500 truncate">{item.path}</p>
                )}
              </div>

              {/* 권한 뱃지 */}
              <div className="flex gap-1 flex-wrap">
                {(!item.auth_rules || item.auth_rules.length === 0) ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs whitespace-nowrap">전체(설정없음)</span>
                ) : (
                  item.auth_rules.map((rule, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs whitespace-nowrap">
                      조합{idx + 1}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center space-x-2 ml-3">
              <button
                onClick={() => openEditModal(item)}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                수정
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                삭제
              </button>
            </div>
          </div>

          {/* 아래쪽 드롭 인디케이터 */}
          {isAfterTarget && (
            <div className="absolute -bottom-1 left-0 right-0 h-1 bg-blue-500 rounded-full z-10 shadow-lg">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
            </div>
          )}
        </div>

        {/* 하위 메뉴 렌더링 */}
        {hasChildren && (
          <div className="ml-6 border-l-2 border-gray-200 pl-2">
            {children.map(child => renderMenuItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <Loading />;

  // 최상위 메뉴만 필터링
  const rootItems = menuItems.filter(item => !item.parent_id);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Work 메뉴 관리</h2>
          <p className="text-sm text-gray-500 mt-1">드래그하여 순서를 변경할 수 있습니다</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          메뉴 추가
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* 메뉴 트리 */}
      <div className="bg-gray-50 rounded-lg p-4">
        {rootItems.length === 0 ? (
          <p className="text-center text-gray-500 py-8">메뉴가 없습니다. 메뉴를 추가해주세요.</p>
        ) : (
          rootItems.map(item => renderMenuItem(item))
        )}
      </div>

      {/* 모달 */}
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
                  {Object.keys({
                    briefcase: true, package: true, check: true, users: true, user: true,
                    calendar: true, mail: true, document: true, folder: true, chart: true,
                    cog: true, star: true, heart: true, tag: true, clock: true,
                    code: true, database: true, cloud: true, lightning: true, shield: true,
                    globe: true, fire: true
                  }).map((iconId) => (
                    <button
                      key={iconId}
                      type="button"
                      onClick={() => setForm({ ...form, icon: iconId })}
                      className={`p-3 border-2 rounded-lg transition ${form.icon === iconId
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      {getIcon(iconId)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">선택된 아이콘: {form.icon}</p>
              </div>

              <div className="space-y-4 border-t pt-4">
                <label className="block text-sm font-bold text-gray-900">권한 상세 설정 (AND 조합)</label>

                <div className="space-y-2">
                  {form.auth_rules.map((rule, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-md text-xs">
                      <div className="flex flex-wrap gap-1">
                        <span className="font-bold text-blue-700">#{idx + 1}</span>
                        {rule.dept && <span className="bg-white px-1 border rounded">부서:{rule.dept}</span>}
                        {rule.pos && <span className="bg-white px-1 border rounded">직급:{rule.pos}</span>}
                        {rule.proj && <span className="bg-white px-1 border rounded">프로젝트:{rule.proj}</span>}
                        {rule.part && <span className="bg-white px-1 border rounded">파트:{rule.part}</span>}
                        {rule.users.map(u => (
                          <span key={u} className="bg-white px-1 border rounded text-red-600">ID:{u.slice(0, 5)}</span>
                        ))}
                      </div>
                      <button type="button" onClick={() => removeAuthRule(idx)} className="text-red-500 hover:text-red-700">삭제</button>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-gray-50 border rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <select className="text-xs border rounded p-1" value={newRule.dept || ''} onChange={e => setNewRule({ ...newRule, dept: e.target.value || null })}>
                      <option value="">부서(전체)</option>
                      {orgConfig.departments.map((d: any) => <option key={d.code} value={d.code}>{d.name}</option>)}
                    </select>
                    <select className="text-xs border rounded p-1" value={newRule.pos || ''} onChange={e => setNewRule({ ...newRule, pos: e.target.value || null })}>
                      <option value="">직급(전체)</option>
                      {orgConfig.positions.map((p: any) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                    <select className="text-xs border rounded p-1" value={newRule.proj || ''} onChange={e => setNewRule({ ...newRule, proj: e.target.value || null })}>
                      <option value="">프로젝트(전체)</option>
                      {orgConfig.projects.map((p: any) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                    <select className="text-xs border rounded p-1" value={newRule.part || ''} onChange={e => setNewRule({ ...newRule, part: e.target.value || null })}>
                      <option value="">파트(전체)</option>
                      {orgConfig.parts.map((p: any) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                  </div>

                  <div className="flex gap-1">
                    <input type="text" placeholder="UUID 직접 입력" className="flex-1 text-xs border rounded px-2 py-1" value={tempUserUuid} onChange={e => setTempUserUuid(e.target.value)} />
                    <button type="button" onClick={addUserToRule} className="bg-gray-600 text-white px-2 py-1 rounded text-xs">ID추가</button>
                  </div>

                  {newRule.users.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {newRule.users.map(u => (
                        <span key={u} className="text-[10px] bg-white border px-1 rounded flex items-center">
                          {u.slice(0, 8)}... <button type="button" onClick={() => removeUserFromRule(u)} className="ml-1 text-red-500">x</button>
                        </span>
                      ))}
                    </div>
                  )}

                  <button type="button" onClick={addAuthRule} className="w-full py-2 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700">
                    현재 설정된 조합 추가 (AND)
                  </button>
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