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
  const [orgConfig, setOrgConfig] = useState({
    departments: [],
    projects: [],
    parts: [],
    positions: [],
  });

  // ✅ 프로필 필드별 공개 범위 설정 (true=전체 공개, false=관리자 전용)
  const FIELD_VISIBILITY_DEFAULTS: Record<string, boolean> = {
    employee_no: true,
    email: true,
    affiliation: true,
    hire_date: false,
    phone: true,
    birth_date: true,
    status_message: true,
  };
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, boolean>>(FIELD_VISIBILITY_DEFAULTS);
  const [savingVisibility, setSavingVisibility] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchOrgConfig();
  }, [currentUserId]);

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
        setFieldVisibility({ ...FIELD_VISIBILITY_DEFAULTS, ...(data.config.field_visibility || {}) });
      }
    } catch (e) {
      console.error('조직 설정 로드 실패:', e);
    }
  };

  const toggleFieldVisibility = async (field: string) => {
    const nextValue = !(fieldVisibility[field] ?? true);
    const prev = fieldVisibility;
    setFieldVisibility({ ...fieldVisibility, [field]: nextValue });
    setSavingVisibility(field);
    try {
      const { data: row, error: fetchError } = await supabase
        .from('org_settings')
        .select('id, config')
        .single();
      if (fetchError || !row) throw fetchError || new Error('설정을 불러올 수 없습니다');

      const nextConfig = {
        ...row.config,
        field_visibility: { ...(row.config.field_visibility || {}), [field]: nextValue },
      };

      const { error: updateError } = await supabase
        .from('org_settings')
        .update({ config: nextConfig })
        .eq('id', row.id);

      if (updateError) throw updateError;
    } catch (e) {
      console.error('공개 범위 설정 저장 실패:', e);
      setFieldVisibility(prev);
    } finally {
      setSavingVisibility(null);
    }
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('users_with_employee_number')
      .select(
        'id, name, email, role, annual_leave_balance, profile_picture, is_active, gender, hire_date, current_status, department, position, project, part, weekly_required_hours, weekly_max_hours, employee_number, phone, birth_date, status_message'
      )
      .order('name', { ascending: true });

    if (!error && data) {
      setUsers(data as any);
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
      | 'part'
      | 'weekly_required_hours'
      | 'weekly_max_hours'
      | 'phone',
    value: any,
  ) => {
    if (!selectedUser) return;
    setSelectedUser({ ...(selectedUser as any), [field]: value });
  };

  const handleDeleteUser = async () => {
    if (!selectedUser?.id) return;
    if (!window.confirm('해당 직원을 삭제하시겠습니까?')) return;

    await supabase.from('users').delete().eq('id', selectedUser.id);

    setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
    setSelectedUser(null);
  };

  const handleSaveUser = async () => {
    if (!selectedUser || !selectedUser.id) return;
    setSavingUser(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: selectedUser.name,
          email: selectedUser.email,
          role: selectedUser.role,
          is_active: (selectedUser as any).is_active ?? true,
          profile_picture: selectedUser.profile_picture || null,
          gender: (selectedUser as any).gender || null,
          hire_date: (selectedUser as any).hire_date || null,
          department: (selectedUser as any).department || null,
          position: (selectedUser as any).position || null,
          project: (selectedUser as any).project || null,
          part: (selectedUser as any).part || null,
          weekly_required_hours: (selectedUser as any).weekly_required_hours ?? 40,
          weekly_max_hours: (selectedUser as any).weekly_max_hours ?? 52,
          phone: (selectedUser as any).phone || null,
        })
        .eq('id', selectedUser.id);

      if (!error) {
        // ✅ 사번(employee_number)은 hire_date/이름 기준으로 다시 계산되어야 하므로 뷰에서 전체를 재조회
        const { data: refreshed } = await supabase
          .from('users_with_employee_number')
          .select(
            'id, name, email, role, annual_leave_balance, profile_picture, is_active, gender, hire_date, current_status, department, position, project, part, weekly_required_hours, weekly_max_hours, employee_number, phone, birth_date, status_message',
          )
          .order('name', { ascending: true });

        if (refreshed) {
          setUsers(refreshed as any);
          const updated = refreshed.find((u: any) => u.id === selectedUser.id);
          if (updated) setSelectedUser(updated as any);
        }
      }
    } finally {
      setSavingUser(false);
    }
  };

  const VisibilityToggle = ({ field }: { field: string }) => {
    const visible = fieldVisibility[field] ?? true;
    return (
      <button
        type="button"
        disabled={savingVisibility === field}
        onClick={() => toggleFieldVisibility(field)}
        title={visible ? '전체 공개 중 (클릭 시 관리자 전용으로 전환)' : '관리자 전용 (클릭 시 전체 공개로 전환)'}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ${
          visible
            ? 'border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
            : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
        }`}
      >
        {visible ? (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
          </svg>
        )}
      </button>
    );
  };

  const FieldLabel = ({ text, field }: { text: string; field?: string }) => (
    <div className="mb-1 flex items-center justify-between">
      <label className="block text-xs font-medium text-gray-500">{text}</label>
      {field && <VisibilityToggle field={field} />}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 border-r border-gray-100 pr-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">직원 목록</h2>
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
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">선택된 직원 설정</h2>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                <input
                  id="is_active"
                  type="checkbox"
                  checked={(selectedUser as any).is_active ?? true}
                  onChange={e => handleUserChange('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                활성 계정
              </label>
            </div>

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

            <div className="space-y-4">
              {/* 사번 (자동 계산, 수정 불가) */}
              <div>
                <FieldLabel text="사번 (자동 계산)" field="employee_no" />
                <input
                  type="text"
                  value={(selectedUser as any).employee_number || '입사일 미지정'}
                  readOnly
                  disabled
                  className="w-full rounded-md border-gray-200 bg-gray-50 text-sm text-gray-500"
                />
              </div>

              {/* 이름 */}
              <div>
                <FieldLabel text="이름" />
                <input
                  type="text"
                  value={selectedUser.name || ''}
                  onChange={e => handleUserChange('name', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 이메일 */}
              <div>
                <FieldLabel text="이메일" field="email" />
                <input
                  type="email"
                  value={selectedUser.email || ''}
                  onChange={e => handleUserChange('email', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 휴대폰 번호 */}
              <div>
                <FieldLabel text="휴대폰 번호" field="phone" />
                <input
                  type="tel"
                  value={(selectedUser as any).phone || ''}
                  onChange={e => handleUserChange('phone', e.target.value)}
                  placeholder="010-0000-0000"
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 성별 */}
              <div>
                <FieldLabel text="성별" />
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
                <FieldLabel text="입사일" field="hire_date" />
                <input
                  type="date"
                  value={(selectedUser as any).hire_date || ''}
                  onChange={e => handleUserChange('hire_date', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 생일 (본인만 프로필에서 입력 가능, 수정 불가) */}
              <div>
                <FieldLabel text="생일 (본인 입력)" field="birth_date" />
                <input
                  type="text"
                  value={
                    (selectedUser as any).birth_date
                      ? new Date((selectedUser as any).birth_date).toLocaleDateString('ko-KR')
                      : '미지정'
                  }
                  readOnly
                  disabled
                  className="w-full rounded-md border-gray-200 bg-gray-50 text-sm text-gray-500"
                />
              </div>

              {/* 역할 */}
              <div>
                <FieldLabel text="역할(Role)" />
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

              {/* 부서 */}
              <div>
                <FieldLabel text="부서" field="affiliation" />
                <select
                  value={(selectedUser as any).department || ''}
                  onChange={e => handleUserChange('department', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  {orgConfig.departments.map((dept: any) => (
                    <option key={dept.id} value={dept.code}>{dept.name}</option>
                  ))}
                </select>
              </div>

              {/* 프로젝트 */}
              <div>
                <FieldLabel text="프로젝트" />
                <select
                  value={(selectedUser as any).project || ''}
                  onChange={e => handleUserChange('project', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  {orgConfig.projects.map((proj: any) => (
                    <option key={proj.id} value={proj.code}>{proj.name}</option>
                  ))}
                </select>
              </div>

              {/* 파트 */}
              <div>
                <FieldLabel text="파트" />
                <select
                  value={(selectedUser as any).part || ''}
                  onChange={e => handleUserChange('part', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  {orgConfig.parts.map((part: any) => (
                    <option key={part.id} value={part.code}>{part.name}</option>
                  ))}
                </select>
              </div>

              {/* 직급 */}
              <div>
                <FieldLabel text="직급" />
                <select
                  value={(selectedUser as any).position || ''}
                  onChange={e => handleUserChange('position', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">미지정</option>
                  {orgConfig.positions.map((pos: any) => (
                    <option key={pos.id} value={pos.code}>{pos.name}</option>
                  ))}
                </select>
              </div>

              {/* 계약 근로시간(필수) */}
              <div>
                <FieldLabel text="주간 계약 근로시간(필수, 시간)" />
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={(selectedUser as any).weekly_required_hours ?? 40}
                  onChange={e => handleUserChange('weekly_required_hours', Number(e.target.value) || 0)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 최대 근무가능시간 */}
              <div>
                <FieldLabel text="주간 최대 근무가능시간(시간)" />
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={(selectedUser as any).weekly_max_hours ?? 52}
                  onChange={e => handleUserChange('weekly_max_hours', Number(e.target.value) || 0)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 상태 메시지 (본인만 프로필에서 입력 가능, 수정 불가) */}
              <div>
                <FieldLabel text="상태 메시지 (본인 입력)" field="status_message" />
                <input
                  type="text"
                  value={(selectedUser as any).status_message || '상태 메시지가 없습니다.'}
                  readOnly
                  disabled
                  className="w-full rounded-md border-gray-200 bg-gray-50 text-sm text-gray-500"
                />
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
                {savingUser ? '저장 중...' : '수정'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">왼쪽에서 직원을 선택하세요.</p>
        )}
      </div>
      </div>
    </div>
  );
};

export default UserManager;