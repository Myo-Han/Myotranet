import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';

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

const OrganizationManager: React.FC = () => {
  const [config, setConfig] = useState<OrgConfig>({
    departments: [],
    projects: [],
    parts: [],
    positions: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeSection, setActiveSection] = useState<'departments' | 'projects' | 'parts' | 'positions'>('departments');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<OrgItem | null>(null);
  const [form, setForm] = useState({
    id: '',
    name: '',
    code: '',
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('id, config')
        .single();

      if (error) throw error;

      setConfig({
        departments: data.config.departments || [],
        projects: data.config.projects || [],
        parts: data.config.parts || [],
        positions: data.config.positions || [],
      });
    } catch (e: any) {
      setError(e.message || '설정 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setForm({ id: '', name: '', code: '' });
    setShowModal(true);
  };

  const openEditModal = (item: OrgItem) => {
    setEditingItem(item);
    setForm(item);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.code) {
      setError('이름과 코드는 필수입니다');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('org_settings')
        .select('id, config')
        .single();

      if (error) throw error;

      let items = data.config[activeSection] || [];

      if (editingItem) {
        items = items.map((item: OrgItem) =>
          item.id === editingItem.id ? { ...form } : item
        );
      } else {
        const newId = form.id || `${activeSection}_${Date.now()}`;
        items.push({ ...form, id: newId });
      }

      const { error: updateError } = await supabase
        .from('org_settings')
        .update({
          config: { ...data.config, [activeSection]: items },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updateError) throw updateError;

      setSuccess(editingItem ? '수정되었습니다' : '추가되었습니다');
      setShowModal(false);
      fetchConfig();
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

      const items = data.config[activeSection].filter((item: OrgItem) => item.id !== itemId);

      const { error: updateError } = await supabase
        .from('org_settings')
        .update({
          config: { ...data.config, [activeSection]: items },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updateError) throw updateError;

      setSuccess('삭제되었습니다');
      fetchConfig();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '삭제 실패');
    }
  };

  const getSectionLabel = () => {
    switch (activeSection) {
      case 'departments': return '부서';
      case 'projects': return '프로젝트';
      case 'parts': return '파트';
      case 'positions': return '직급';
      default: return '';
    }
  };

  const currentItems = config[activeSection];

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">조직 관리</h2>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* 섹션 탭 */}
      <div className="flex space-x-2 border-b">
        <button
          onClick={() => setActiveSection('departments')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSection === 'departments'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          부서
        </button>
        <button
          onClick={() => setActiveSection('projects')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSection === 'projects'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          프로젝트
        </button>
        <button
          onClick={() => setActiveSection('parts')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSection === 'parts'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          파트
        </button>
        <button
          onClick={() => setActiveSection('positions')}
          className={`px-4 py-2 text-sm font-medium ${
            activeSection === 'positions'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          직급
        </button>
      </div>

      {/* 추가 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {getSectionLabel()} 추가
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">코드</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentItems.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{item.code}</td>
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
            {currentItems.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">
                  등록된 {getSectionLabel()}이(가) 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">
              {editingItem ? `${getSectionLabel()} 수정` : `${getSectionLabel()} 추가`}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="예: 인사팀"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">코드</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="예: HR"
                />
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

export default OrganizationManager;