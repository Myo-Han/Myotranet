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
};

const WorkMenuManager: React.FC = () => {
  const [menuItems, setMenuItems] = useState<WorkMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkMenuItem | null>(null);
  const [form, setForm] = useState({
    id: '',
    label: '',
    icon: 'briefcase',
    path: '',
    order: 1,
    show_to: [] as string[],
  });

  useEffect(() => {
    fetchMenu();
  }, []);

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
    });
    setShowModal(true);
  };

  const openEditModal = (item: WorkMenuItem) => {
    setEditingItem(item);
    setForm(item);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.label || !form.path) {
      setError('메뉴명과 경로는 필수입니다');
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
                  placeholder="예: build"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">아이콘</label>
                <select
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="briefcase">briefcase</option>
                  <option value="package">package</option>
                  <option value="check">check</option>
                </select>
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
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">직급별</summary>
                    <div className="mt-2 space-y-2 ml-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('CEO')}
                          onChange={() => toggleRole('CEO')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">대표</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('Team_Lead')}
                          onChange={() => toggleRole('Team_Lead')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">팀장</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('Part_Lead')}
                          onChange={() => toggleRole('Part_Lead')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">파트장</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('Staff')}
                          onChange={() => toggleRole('Staff')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">사원</span>
                      </label>
                    </div>
                  </details>

                  <details className="border rounded p-2">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">부서별</summary>
                    <div className="mt-2 space-y-2 ml-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('HR')}
                          onChange={() => toggleRole('HR')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">인사팀</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('Finance')}
                          onChange={() => toggleRole('Finance')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">재무팀</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('Development')}
                          onChange={() => toggleRole('Development')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">개발본부</span>
                      </label>
                    </div>
                  </details>

                  <details className="border rounded p-2">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">프로젝트별</summary>
                    <div className="mt-2 space-y-2 ml-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.show_to.includes('LDProject')}
                          onChange={() => toggleRole('LDProject')}
                          disabled={form.show_to.includes('all')}
                          className="rounded"
                        />
                        <span className="text-sm">LDProject</span>
                      </label>
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