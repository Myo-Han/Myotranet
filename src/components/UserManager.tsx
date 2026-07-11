import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';

interface UserManagerProps {
  currentUserId?: string;
}

// ✅ 컴포넌트 함수 밖(모듈 최상위)에서 선언해야 함.
// UserManager 렌더 함수 안에서 선언하면 렌더될 때마다 VisibilityIcon/VisibilityRow가
// "새로운 컴포넌트 타입"이 되어(참조가 매번 바뀜) React가 매번 이 버튼들을
// 통째로 언마운트 후 재마운트한다. UserManager는 상위(Works.tsx)가 세션 타이머 때문에
// 1초마다 리렌더되므로, 실제 마우스 클릭(mousedown~mouseup 사이 텀이 있음)이
// 하필 그 재마운트 타이밍과 겹치면 클릭 이벤트 자체가 유실되어 "클릭은 되는데 토글 안 됨"
// 현상이 발생했다. 모듈 최상위로 빼서 컴포넌트 타입 참조를 고정시키면 해결된다.
const VisibilityIcon: React.FC<{ visible: boolean }> = ({ visible }) => (
  <span
    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
      visible
        ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
        : 'border-gray-200 bg-gray-50 text-gray-400'
    }`}
  >
    {visible ? (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ) : (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
      </svg>
    )}
  </span>
);

const VisibilityRow: React.FC<{
  field: string;
  label: string;
  visible: boolean;
  busy: boolean;
  onToggle: (field: string) => void;
}> = ({ field, label, visible, busy, onToggle }) => (
  <button
    type="button"
    disabled={busy}
    onClick={() => onToggle(field)}
    title={visible ? '전체 공개 중 (클릭 시 관리자 전용으로 전환)' : '관리자 전용 (클릭 시 전체 공개로 전환)'}
    className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50"
  >
    <span className="text-xs font-medium text-gray-600">{label}</span>
    <VisibilityIcon visible={visible} />
  </button>
);

const UserManager: React.FC<UserManagerProps> = ({ currentUserId }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
  const [visibilityError, setVisibilityError] = useState('');

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

  // ✅ 테이블을 직접 읽어 병합 후 저장하는 폴백 (RPC를 못 쓰는 경우 대비)
  const toggleFieldVisibilityViaTable = async (field: string, nextValue: boolean) => {
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
    return nextConfig.field_visibility;
  };

  const toggleFieldVisibility = async (field: string) => {
    console.log('[프로필 공개 설정] 토글 클릭됨:', field);
    setVisibilityError('');
    const nextValue = !(fieldVisibility[field] ?? true);
    const prev = fieldVisibility;
    setFieldVisibility({ ...fieldVisibility, [field]: nextValue });
    setSavingVisibility(field);
    try {
      // ✅ DB 함수(RPC)로 원자적으로 처리 (경합 상태 방지 + 관리자가 아닐 때 명확한 에러)
      const { data, error } = await supabase.rpc('set_field_visibility', {
        p_field: field,
        p_value: nextValue,
      });

      if (error) {
        // RPC를 찾을 수 없는 경우(PostgREST 스키마 캐시 지연 등)에는 테이블 직접 업데이트로 폴백
        const notFound =
          error.code === 'PGRST202' ||
          /could not find the function/i.test(error.message || '');
        if (notFound) {
          console.warn('set_field_visibility RPC를 찾을 수 없어 테이블 직접 업데이트로 대체합니다:', error);
          const updatedVisibility = await toggleFieldVisibilityViaTable(field, nextValue);
          setFieldVisibility({ ...FIELD_VISIBILITY_DEFAULTS, ...updatedVisibility });
          console.log('[프로필 공개 설정] 테이블 폴백으로 저장 성공:', updatedVisibility);
          return;
        }
        throw error;
      }

      console.log('[프로필 공개 설정] RPC 저장 성공:', data);
      // 서버가 반환한 최신 config 기준으로 동기화 (다른 관리자의 동시 변경도 함께 반영)
      if (data?.field_visibility) {
        setFieldVisibility({ ...FIELD_VISIBILITY_DEFAULTS, ...data.field_visibility });
      }
    } catch (e: any) {
      console.error('[프로필 공개 설정] 저장 실패:', e);
      const detail = e?.message || e?.error_description || e?.details || e?.hint || JSON.stringify(e);
      setVisibilityError(detail || '알 수 없는 오류');
      setFieldVisibility(prev);
    } finally {
      setSavingVisibility(null);
    }
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('users_with_employee_number')
      .select(
        'id, name, email, role, annual_leave_balance, profile_picture, is_active, employment_status, gender, hire_date, current_status, department, position, project, part, weekly_required_hours, weekly_max_hours, employee_number, phone, birth_date, status_message'
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
      | 'employment_status'
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
      | 'phone'
      | 'birth_date',
    value: any,
  ) => {
    if (!selectedUser) return;
    setSelectedUser({ ...(selectedUser as any), [field]: value });
  };

  const handleDeleteUser = async () => {
    if (!selectedUser?.id) return;
    if (!window.confirm('해당 직원을 삭제하시겠습니까? 로그인 계정까지 완전히 삭제되어, 다시 등록하려면 처음부터 새로 초대해야 합니다.')) return;

    setDeleteError('');
    setDeletingUser(true);
    try {
      // ✅ public.users만 지우면 auth.users에 계정이 남아 나중에 재초대 시
      //    "이미 가입된 이메일" 에러가 났음 -> 서버(service role)에서
      //    프로필 + 로그인 계정(auth.users)을 함께 완전히 삭제하도록 변경
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/api/delete-auth-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: selectedUser.id }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || '삭제 실패');
      }

      setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
      setSelectedUser(null);
    } catch (e: any) {
      setDeleteError(e?.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedUser?.id) return;

    const file = e.target.files[0];
    setUploadingPhoto(true);
    setPhotoError('');
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `profile-${selectedUser.id}-${Date.now()}.${fileExt}`;
      const oldPicture = (selectedUser as any).profile_picture as string | null;
      if (oldPicture) {
        const oldPath = oldPicture.split('/').pop();
        if (oldPath) {
          const { error: removeError } = await supabase.storage.from('avatars').remove([oldPath]);
          if (removeError) console.warn('기존 프로필 사진 삭제 실패(무시하고 계속):', removeError);
        }
      }

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      handleUserChange('profile_picture', publicUrl);
    } catch (err: any) {
      console.error('프로필 사진 업로드 실패:', err);
      setPhotoError(err?.message || '프로필 사진 업로드에 실패했습니다.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
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
          // ✅ is_active(로그인 허용 여부)는 DB 트리거(sync_is_active_from_employment_status)가
          // employment_status 값에 맞춰 자동으로 계산해준다 (퇴사=false, 그 외=true).
          employment_status: (selectedUser as any).employment_status ?? 'active',
          profile_picture: selectedUser.profile_picture || null,
          gender: (selectedUser as any).gender || null,
          hire_date: (selectedUser as any).hire_date || null,
          department: (selectedUser as any).department || null,
          position: (selectedUser as any).position || null,
          weekly_required_hours: (selectedUser as any).weekly_required_hours ?? 40,
          weekly_max_hours: (selectedUser as any).weekly_max_hours ?? 52,
          phone: (selectedUser as any).phone || null,
          birth_date: (selectedUser as any).birth_date || null,
        })
        .eq('id', selectedUser.id);

      if (!error) {
        // ✅ 사번(employee_number)은 hire_date/이름 기준으로 다시 계산되어야 하므로 뷰에서 전체를 재조회
        const { data: refreshed } = await supabase
          .from('users_with_employee_number')
          .select(
            'id, name, email, role, annual_leave_balance, profile_picture, is_active, employment_status, gender, hire_date, current_status, department, position, project, part, weekly_required_hours, weekly_max_hours, employee_number, phone, birth_date, status_message',
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

  const FieldLabel = ({ text }: { text: string }) => (
    <label className="mb-1 block text-xs font-medium text-gray-500">{text}</label>
  );

  const FIELD_VISIBILITY_LABELS: Record<string, string> = {
    employee_no: '사번',
    email: '이메일',
    affiliation: '부서(소속)',
    hire_date: '입사일',
    phone: '휴대폰 번호',
    birth_date: '생일',
    status_message: '상태 메시지',
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">프로필 공개 설정</h2>
        <p className="text-xs text-gray-400 mb-3">
          공개로 설정하면 모든 직원이 볼 수 있고, 관리자 전용으로 설정하면 관리자와 본인만 볼 수 있습니다.
        </p>
        {visibilityError && (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            저장 실패: {visibilityError}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(FIELD_VISIBILITY_LABELS).map(([field, label]) => (
            <VisibilityRow
              key={field}
              field={field}
              label={label}
              visible={fieldVisibility[field] ?? true}
              busy={savingVisibility === field}
              onToggle={toggleFieldVisibility}
            />
          ))}
        </div>
      </div>

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
                  <div className="text-xs text-gray-500">
                    {(u as any).employee_number || '사번 미지정'}
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
                재직 상태
                <select
                  id="employment_status"
                  value={(selectedUser as any).employment_status ?? 'active'}
                  onChange={e => handleUserChange('employment_status', e.target.value)}
                  className="rounded border-gray-300 text-xs py-1 pl-2 pr-7 focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="active">재직중</option>
                  <option value="on_leave">휴직중</option>
                  <option value="resigned">퇴사</option>
                </select>
              </label>
            </div>

            {/* 프로필 사진 */}
            <div className="flex flex-col items-center mb-4">
              <div className="relative h-24 w-24">
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
                <label
                  htmlFor="admin-profile-photo-upload"
                  className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-indigo-600 text-white flex items-center justify-center cursor-pointer shadow hover:bg-indigo-700"
                  title="프로필 사진 변경"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M2 5a2 2 0 012-2h1.5l.7-1.4A1 1 0 017.1 1h5.8a1 1 0 01.9.6L14.5 3H16a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
                    <circle cx="10" cy="10.5" r="3" fill="white" />
                  </svg>
                </label>
                <input
                  id="admin-profile-photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProfilePhotoUpload}
                  disabled={uploadingPhoto}
                />
              </div>
              {uploadingPhoto && (
                <p className="mt-1 text-[11px] text-gray-400">업로드 중...</p>
              )}
              {photoError && (
                <p className="mt-1 text-[11px] text-red-500">{photoError}</p>
              )}
            </div>

            <div className="space-y-4">
              {/* 사번 (자동 계산, 수정 불가) */}
              <div>
                <FieldLabel text="사번 (자동 계산)" />
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
                <FieldLabel text="이메일" />
                <input
                  type="email"
                  value={selectedUser.email || ''}
                  onChange={e => handleUserChange('email', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 휴대폰 번호 */}
              <div>
                <FieldLabel text="휴대폰 번호" />
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
                <FieldLabel text="입사일" />
                <input
                  type="date"
                  value={(selectedUser as any).hire_date || ''}
                  onChange={e => handleUserChange('hire_date', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              {/* 생일 */}
              <div>
                <FieldLabel text="생일" />
                <input
                  type="date"
                  value={(selectedUser as any).birth_date || ''}
                  onChange={e => handleUserChange('birth_date', e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
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
                <FieldLabel text="부서" />
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
                <FieldLabel text="상태 메시지 (본인 입력)" />
                <input
                  type="text"
                  value={(selectedUser as any).status_message || '상태 메시지가 없습니다.'}
                  readOnly
                  disabled
                  className="w-full rounded-md border-gray-200 bg-gray-50 text-sm text-gray-500"
                />
              </div>
            </div>

            {deleteError && (
              <p className="mt-3 text-xs text-red-600">{deleteError}</p>
            )}

            <div className="flex justify-between mt-4">
              {selectedUser.id && (
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={deletingUser}
                  className="px-4 py-2 text-xs font-semibold rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingUser ? '삭제 중...' : '삭제'}
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