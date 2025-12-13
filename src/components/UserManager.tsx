import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';

interface UserManagerProps {
  currentUserId?: string;
}

const UserManager: React.FC<UserManagerProps> = ({ currentUserId }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [currentUserId]);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from<User>('users')
      .select(
        'id, name, email, role, annual_leave_balance, profile_picture, is_active, gender, hire_date, current_status, department, position, project, part'
      )
      .order('name', { ascending: true });

    if (!error && data) {
      // 현재 사용자 제외
      setUsers(data.filter(u => u.id !== currentUserId));
    }
  };

  const handleUserChange = (
    field:
      | keyof User
      | 'annual_leave_balance'
      | 'is_active'
      | 'gender'
      | 'hire_date'
      | 'current_status'
      | 'profile_picture'
      | 'department'
      | 'position'
      | 'project'
      | 'part',
    value: any,
  ) => {
    if (!selectedUser) return;
    setSelectedUser({ ...(selectedUser as any), [field]: value });
  };

  const handleNewUser = () => {
    setSelectedUser({
      id: '',
      name: '',
      email: '',
      role: 'User',
      annual_leave_balance: 0,
      profile_picture: null,
      is_active: true,
      gender: '',
      hire_date: '',
      current_status: 'working',
      department: '',
      position: '',
      project: '',
      part: '',
    } as any);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser?.id) return;
    if (!window.confirm('해당 직원을 삭제하시겠습니까?')) return;

    await supabase.from('users').delete().eq('id', selectedUser.id);

    setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
    setSelectedUser(null);
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    setSavingUser(true);
    try {
      // 기존 직원 수정
      if (selectedUser.id) {
        const { data, error } = await supabase
          .from('users')
          .update({
            name: selectedUser.name,
            email: selectedUser.email,
            role: selectedUser.role,
            annual_leave_balance: (selectedUser as any).annual_leave_balance ?? 0,
            is_active: (selectedUser as any).is_active ?? true,
            profile_picture: selectedUser.profile_picture || null,
            gender: (selectedUser as any).gender || null,
            hire_date: (selectedUser as any).hire_date || null,
            current_status: (selectedUser as any).current_status || null,
            department: (selectedUser as any).department || null,
            position: (selectedUser as any).position || null,
            project: (selectedUser as any).project || null,
            part: (selectedUser as any).part || null,
          })
          .eq('id', selectedUser.id)
          .select(
            'id, name, email, role, annual_leave_balance, profile_picture, is_active, gender, hire_date, current_status, department, position, project, part',
          )
          .single();

        if (!error && data) {
          setUsers(prev => prev.map(u => (u.id === data.id ? (data as any) : u)));
          setSelectedUser(data as any);
        }
      } else {
        // 새 직원 추가
        const { data, error } = await supabase
          .from('users')
          .insert({
            name: selectedUser.name,
            email: selectedUser.email,
            role: selectedUser.role || 'User',
            annual_leave_balance: (selectedUser as any).annual_leave_balance ?? 0,
            is_active: (selectedUser as any).is_active ?? true,
            profile_picture: selectedUser.profile_picture || null,
            gender: (selectedUser as any).gender || null,
            hire_date: (selectedUser as any).hire_date || null,
            current_status: (selectedUser as any).current_status || null,
            department: (selectedUser as any).department || null,
            position: (selectedUser as any).position || null,
            project: (selectedUser as any).project || null,
            part: (selectedUser as any).part || null,
          })
          .select(
            'id, name, email, role, annual_leave_balance, profile_picture, is_active, gender, hire_date, current_status, department, position, project, part',
          )
          .single();

        if (!error && data) {
          setUsers(prev => [...prev, data as any]);
          setSelectedUser(data as any);
        }
      }
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 border-r border-gray-100 pr-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">직원 목록</h2>
          <button
            type="button"
            onClick={handleNewUser}
            className="px-2 py-1 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          >
            + 추가
          </button>
        </div>
        <div className="space-y-1 max-h-[420px] overflow-auto">
          {users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedUser(u)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                selectedUser?.id === u.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="flex items-center space-x-3">
                {u.profile_picture && (
                  <img
                    src={u.profile_picture}
                    alt={u.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                )}
                <div>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                  <div className="text-[11px] text-gray-400">
                    {(u as any).current_status || '상태 미지정'}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {users.length === 0 && (
            <p className="text-xs text-gray-400">직원 데이터가 없습니다.</p>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {selectedUser ? (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">선택된 직원 설정</h2>
            {/* 프로필 사진 */}
            <div className="flex justify-center mb-4">
              <div className="h-24 w-24 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
                {selectedUser.profile_picture ? (
                  <img
                    src={selectedUser.profile_picture}
                    alt={selectedUser.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-gray-400">No Image</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 이름 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={selectedUser.name || ''}
                  onChange={e => handleUserChange('name', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  value={selectedUser.email || ''}
                  onChange={e => handleUserChange('email', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 역할 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  역할(Role)
                </label>
                <select
                  value={selectedUser.role || ''}
                  onChange={e => handleUserChange('role', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="User">User</option>
                  <option value="Manager">Manager</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              {/* 성별 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  성별
                </label>
                <select
                  value={(selectedUser as any).gender || ''}
                  onChange={e => handleUserChange('gender', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">선택 안 함</option>
                  <option value="male">남성</option>
                  <option value="female">여성</option>
                  <option value="other">기타</option>
                </select>
              </div>

              {/* 입사일 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  입사일
                </label>
                <input
                  type="date"
                  value={(selectedUser as any).hire_date || ''}
                  onChange={e => handleUserChange('hire_date', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 활성 계정 */}
              <div className="flex items-center space-x-2">
                <input
                  id="is_active"
                  type="checkbox"
                  checked={(selectedUser as any).is_active ?? true}
                  onChange={e => handleUserChange('is_active', e.target.checked)}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <label
                  htmlFor="is_active"
                  className="text-xs font-medium text-gray-600"
                >
                  활성 계정
                </label>
              </div>

              {/* 부서 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  부서
                </label>
                <select
                  value={(selectedUser as any).department || ''}
                  onChange={e => handleUserChange('department', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  <option value="HR">인사팀</option>
                  <option value="Finance">재무팀</option>
                  <option value="Development">개발본부</option>
                </select>
              </div>

              {/* 직급 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  직급
                </label>
                <select
                  value={(selectedUser as any).position || ''}
                  onChange={e => handleUserChange('position', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  <option value="CEO">대표</option>
                  <option value="Team_Lead">팀장</option>
                  <option value="Part_Lead">파트장</option>
                  <option value="Staff">사원</option>
                </select>
              </div>

              {/* 프로젝트 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  프로젝트
                </label>
                <select
                  value={(selectedUser as any).project || ''}
                  onChange={e => handleUserChange('project', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  <option value="LDProject">LDProject</option>
                </select>
              </div>

              {/* 파트 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  파트
                </label>
                <select
                  value={(selectedUser as any).part || ''}
                  onChange={e => handleUserChange('part', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  <option value="Dev">개발</option>
                  <option value="Art">아트</option>
                  <option value="Design">기획</option>
                  <option value="QA">QA</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between mt-4">
              {selectedUser.id && (
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={savingUser}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingUser ? '저장 중...' : selectedUser.id ? '수정' : '추가'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">왼쪽에서 직원을 선택하세요.</p>
        )}
      </div>
    </div>
  );
};

export default UserManager;