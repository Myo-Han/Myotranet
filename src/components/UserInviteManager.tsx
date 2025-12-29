import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { markAsRead } from '../../api/readLog'; // 읽음 처리 함수 추가
import { useAuth } from '../context/AuthContext'; // 현재 로그인한 관리자 정보용

type AuthUser = {
  id: string;
  email: string;
  user_metadata: {
    name?: string;
    picture?: string;
  };
  created_at: string;
};

type AssignmentForm = {
  department: string;
  position: string;
  project: string;
  part: string;
};

const UserInviteManager: React.FC = () => {
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [dbUserIds, setDbUserIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState<AssignmentForm>({
    department: '',
    position: '',
    project: '',
    part: '',
  });
  const [form, setForm] = useState({
    name: '',
    role: 'User',
    gender: '',
    hire_date: '',
    is_active: true,
  });
  const { user: admin } = useAuth(); // 관리자 정보 가져오기
  const [readInviteIds, setReadInviteIds] = useState<Set<string>>(new Set()); // 읽은 초대 시도자 ID 저장
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [orgConfig, setOrgConfig] = useState({
    departments: [],
    projects: [],
    parts: [],
    positions: [],
  });

  useEffect(() => {
    fetchData();
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

  const fetchData = async () => {
    setLoading(true);
    try {
      // API 호출로 변경
      const response = await fetch('/api/auth-users');
      if (!response.ok) throw new Error('API 호출 실패');
      const { users } = await response.json();

      const { data: dbUsers, error: dbError } = await supabase
        .from('users')
        .select('id');
      if (dbError) throw dbError;

      // 내 읽음 로그 데이터 로드
      const { data: logData } = await supabase
        .from('user_read_logs')
        .select('target_id')
        .eq('user_id', admin?.id)
        .eq('target_type', 'user-invite');

      if (logData) {
        setReadInviteIds(new Set(logData.map(log => String(log.target_id))));
      }

      const dbIds = new Set(dbUsers?.map(u => u.id) || []);

      setAuthUsers(users as AuthUser[]);
      setDbUserIds(dbIds);
    } catch (e: any) {
      setError(e.message || '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = authUsers.filter(user => {
    if (dbUserIds.has(user.id)) return false;

    const name = user.user_metadata?.name || '';
    const email = user.email || '';
    const query = searchQuery.toLowerCase();

    return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
  });

  const handleSelectUser = async (user: AuthUser) => {
    setSelectedUser(user);

    // ✅ 아직 읽지 않은 유저라면 DB에 읽음 처리 및 신호 발송
    if (admin?.id && !readInviteIds.has(user.id)) {
      await markAsRead(admin.id, 'user-invite', user.id);
      setReadInviteIds(prev => new Set(prev).add(user.id));
    }

    setForm({
      name: user.user_metadata?.name || '',
      role: 'User',
      gender: '',
      hire_date: '',
      is_active: true,
    });

    setAssignForm({
      department: '',
      position: '',
      project: '',
      part: '',
    });
  };

  const handleAddUser = async () => {
    if (!selectedUser) return;
    if (!form.name) {
      setError('이름은 필수입니다');
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .insert({
          id: selectedUser.id,
          email: selectedUser.email,
          name: form.name,
          role: form.role,
          gender: form.gender || null,
          hire_date: form.hire_date || null,
          is_active: form.is_active,
          profile_picture: selectedUser.user_metadata?.picture || null,
          annual_leave_balance: 0,
          department: assignForm.department || null,
          position: assignForm.position || null,
          project: assignForm.project || null,
          part: assignForm.part || null,
        });

      if (error) throw error;

      setSuccess('직원이 추가되었습니다');
      setSelectedUser(null);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '추가 실패');
    }
  };

  const handleDeleteAuthUser = async (userId: string) => {
    if (!confirm('정말 이 사용자를 삭제하시겠습니까?')) return;

    try {
      const response = await fetch('/api/delete-auth-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) throw new Error('삭제 실패');

      setSuccess('사용자가 삭제되었습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '삭제 실패');
    }
  };

  if (loading) {
    return <div className="text-center py-8">로딩 중...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">직원 초대</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="이름 또는 이메일로 검색..."
          className="w-full border border-gray-300 rounded-md px-4 py-2"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Google 로그인 시도자 ({filteredUsers.length}명)
          </h3>
          <div className="space-y-2 max-h-[600px] overflow-auto">
            {filteredUsers.map(user => (
              <div
                key={user.id}
                className={`border rounded-lg p-4 ${selectedUser?.id === user.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {user.user_metadata?.picture && (
                      <img
                        src={user.user_metadata.picture}
                        alt={user.user_metadata?.name}
                        className="h-12 w-12 rounded-full"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        {/* ✅ 고속 레드닷: 관리자가 아직 선택해보지 않은 새로운 유저일 때만 표시 */}
                        {!readInviteIds.has(user.id) && (
                          <span className="w-2 h-2 bg-red-600 rounded-full shrink-0 animate-[pulse_0.7s_infinite] shadow-[0_0_5px_rgba(220,38,38,0.8)]"></span>
                        )}
                        <p className={`font-medium ${!readInviteIds.has(user.id) ? 'text-gray-900' : 'text-gray-500'}`}>
                          {user.user_metadata?.name || '이름 없음'}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(user.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleSelectUser(user)}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      선택
                    </button>
                    <button
                      onClick={() => handleDeleteAuthUser(user.id)}
                      className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                추가 가능한 사용자가 없습니다.
              </p>
            )}
          </div>
        </div>

        <div>
          {selectedUser ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">직원 정보 입력</h3>

              <div className="flex justify-center">
                <div className="h-24 w-24 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
                  {selectedUser.user_metadata?.picture ? (
                    <img
                      src={selectedUser.user_metadata.picture}
                      alt={selectedUser.user_metadata?.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">No Image</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    이름
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-md border-gray-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    역할
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="User">User</option>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    성별
                  </label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">선택 안 함</option>
                    <option value="male">남성</option>
                    <option value="female">여성</option>
                    <option value="other">기타</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    입사일
                  </label>
                  <input
                    type="date"
                    value={form.hire_date}
                    onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                    className="w-full rounded-md border-gray-300 text-sm"
                  />
                </div>

                <div className="flex items-center space-x-2 col-span-2">
                  <input
                    id="is_active"
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="text-xs font-medium text-gray-600">
                    활성 계정
                  </label>
                </div>
              </div>

              <button
                onClick={() => setShowAssignModal(true)}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                부서/직급 배정
              </button>

              {(assignForm.department || assignForm.position || assignForm.project || assignForm.part) && (
                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">배정 정보</p>
                  <div className="space-y-1 text-xs text-gray-600">
                    {assignForm.department && <p>부서: {assignForm.department}</p>}
                    {assignForm.position && <p>직급: {assignForm.position}</p>}
                    {assignForm.project && <p>프로젝트: {assignForm.project}</p>}
                    {assignForm.part && <p>파트: {assignForm.part}</p>}
                  </div>
                </div>
              )}

              <button
                onClick={handleAddUser}
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                직원 추가
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">
              왼쪽에서 사용자를 선택하세요.
            </p>
          )}
        </div>
      </div>

      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">부서/직급 배정</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">부서</label>
                <select
                  value={assignForm.department}
                  onChange={(e) => setAssignForm({ ...assignForm, department: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">미지정</option>
                  {orgConfig.departments.map((dept: any) => (
                    <option key={dept.id} value={dept.code}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">프로젝트</label>
                <select
                  value={assignForm.project}
                  onChange={(e) => setAssignForm({ ...assignForm, project: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">미지정</option>
                  {orgConfig.projects.map((proj: any) => (
                    <option key={proj.id} value={proj.code}>{proj.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">파트</label>
                <select
                  value={assignForm.part}
                  onChange={(e) => setAssignForm({ ...assignForm, part: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">미지정</option>
                  {orgConfig.parts.map((part: any) => (
                    <option key={part.id} value={part.code}>{part.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">직급</label>
                <select
                  value={assignForm.position}
                  onChange={(e) => setAssignForm({ ...assignForm, position: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">미지정</option>
                  {orgConfig.positions.map((pos: any) => (
                    <option key={pos.id} value={pos.code}>{pos.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex space-x-2">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                확인
              </button>
              <button
                onClick={() => {
                  setAssignForm({ department: '', position: '', project: '', part: '' });
                  setShowAssignModal(false);
                }}
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

export default UserInviteManager;