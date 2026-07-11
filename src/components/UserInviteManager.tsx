import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

type PendingInvite = {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  position: string | null;
  project: string | null;
  part: string | null;
  created_at: string;
};

type InviteForm = {
  email: string;
  name: string;
  role: string;
  gender: string;
  hire_date: string;
  department: string;
  position: string;
  project: string;
  part: string;
};

const EMPTY_FORM: InviteForm = {
  email: '',
  name: '',
  role: 'User',
  gender: '',
  hire_date: '',
  department: '',
  position: '',
  project: '',
  part: '',
};

const UserInviteManager: React.FC = () => {
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const authedFetch = async (url: string, options: RequestInit = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [dbRes, authRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, email, name, role, department, position, project, part, created_at'),
        authedFetch('/api/auth-users').then(res => res.json()),
      ]);

      if (dbRes.error) throw dbRes.error;
      if (authRes.error) throw new Error(authRes.error);

      const lastSignInById = new Map<string, string | null>(
        (authRes.users || []).map((au: any) => [au.id, au.last_sign_in_at])
      );

      // 아직 초대를 수락(첫 로그인)하지 않은 직원만 "초대 대기중"으로 표시
      const pending = (dbRes.data || []).filter(
        (u: any) => !lastSignInById.get(u.id)
      );

      setPendingInvites(pending as PendingInvite[]);
    } catch (e: any) {
      setError(e.message || '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    setError('');
    setSuccess('');

    if (!form.email || !form.name) {
      setError('이메일과 이름은 필수입니다');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authedFetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          gender: form.gender || undefined,
          hire_date: form.hire_date || undefined,
          origin: window.location.origin,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '초대 실패');

      setSuccess(
        data.linkedExisting
          ? `${form.email}은(는) 이미 로그인 이력이 있는 계정이라, 초대 메일 없이 바로 직원으로 등록했습니다. 기존처럼 Google 로그인으로 접속하면 됩니다.`
          : `${form.email} 주소로 초대 메일을 보냈습니다`
      );
      setForm(EMPTY_FORM);
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError(e.message || '초대 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async (invite: PendingInvite) => {
    setError('');
    setSuccess('');
    setBusyId(invite.id);
    try {
      const res = await authedFetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invite.email,
          name: invite.name,
          origin: window.location.origin,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '재초대 실패');

      setSuccess(`${invite.email} 주소로 초대 메일을 다시 보냈습니다`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError(e.message || '재초대 실패');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (invite: PendingInvite) => {
    if (!confirm(`${invite.name}(${invite.email}) 님에게 보낸 초대를 취소할까요? 계정 정보가 삭제됩니다.`)) return;

    setError('');
    setSuccess('');
    setBusyId(invite.id);
    try {
      const res = await authedFetch('/api/delete-auth-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: invite.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '취소 실패');
      }

      setSuccess('초대를 취소했습니다');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '취소 실패');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">직원 초대</h2>
        <p className="text-sm text-gray-500 mt-1">
          이메일로 초대를 보내면, 초대받은 사람이 메일의 링크를 클릭했을 때 바로 로그인됩니다.
          별도의 로그인 페이지는 없습니다.
        </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">새 직원 초대</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">이메일</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@gmail.com"
                className="w-full rounded-md border-gray-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border-gray-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">역할</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">성별</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">입사일</label>
              <input
                type="date"
                value={form.hire_date}
                onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                className="w-full rounded-md border-gray-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">부서</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full rounded-md border-gray-300 text-sm"
              >
                <option value="">미지정</option>
                {orgConfig.departments.map((dept: any) => (
                  <option key={dept.id} value={dept.code}>{dept.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">프로젝트</label>
              <select
                value={form.project}
                onChange={(e) => setForm({ ...form, project: e.target.value })}
                className="w-full rounded-md border-gray-300 text-sm"
              >
                <option value="">미지정</option>
                {orgConfig.projects.map((proj: any) => (
                  <option key={proj.id} value={proj.code}>{proj.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">파트</label>
              <select
                value={form.part}
                onChange={(e) => setForm({ ...form, part: e.target.value })}
                className="w-full rounded-md border-gray-300 text-sm"
              >
                <option value="">미지정</option>
                {orgConfig.parts.map((part: any) => (
                  <option key={part.id} value={part.code}>{part.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">직급</label>
              <select
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="w-full rounded-md border-gray-300 text-sm"
              >
                <option value="">미지정</option>
                {orgConfig.positions.map((pos: any) => (
                  <option key={pos.id} value={pos.code}>{pos.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleInvite}
            disabled={submitting}
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? '초대 보내는 중...' : '초대 메일 보내기'}
          </button>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            초대 대기중 ({pendingInvites.length}명)
          </h3>
          <div className="space-y-2 max-h-[600px] overflow-auto">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{invite.name}</p>
                    <p className="text-sm text-gray-500">{invite.email}</p>
                    <p className="text-xs text-gray-400">
                      초대일: {new Date(invite.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => handleResend(invite)}
                      disabled={busyId === invite.id}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      재초대
                    </button>
                    <button
                      onClick={() => handleCancel(invite)}
                      disabled={busyId === invite.id}
                      className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {pendingInvites.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                대기중인 초대가 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserInviteManager;
