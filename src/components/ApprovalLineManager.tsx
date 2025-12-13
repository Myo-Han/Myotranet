// 결재관리
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';

type OrgItem = { id: string; name: string; code: string };
type OrgConfig = {
  departments: OrgItem[];
  projects: OrgItem[];
  parts: OrgItem[];
  positions: OrgItem[];
};

type UserLite = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  position?: string | null;
  department?: string | null;
  project?: string | null;
};

type ApprovalLine = {
  id: string;
  name: string;
  request_type: string;
  project_code: string | null;
  part_code: string | null;
  department_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type StepAssigneeType = 'user' | 'role' | 'position';

type ApprovalLineStep = {
  id: string;
  approval_line_id: string;
  step_order: number;

  // 담당자
  assignee_user_id: string | null;
  assignee_role: string | null;
  assignee_position: string | null;

  // ✅ 단계별 승인 범위(프로젝트/파트/부서)
  assignee_project_code: string | null;
  assignee_part_code: string | null;
  assignee_department_code: string | null;

  required: boolean;
  created_at: string;
};

type StepForm = {
  _key: string;
  step_order: number;
  _assigneeType: StepAssigneeType;

  // 담당자
  assignee_user_id: string | null;
  assignee_role: string | null;
  assignee_position: string | null;

  // ✅ 단계별 승인 범위(프로젝트/파트/부서)
  assignee_project_code: string;    // ''이면 전체
  assignee_part_code: string;       // ''이면 전체
  assignee_department_code: string; // ''이면 전체

  required: boolean;
};

const requestTypeLabel: Record<string, string> = {
  leave: '휴가',
  finance: '재무',
};

const ApprovalLineManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [orgConfig, setOrgConfig] = useState<OrgConfig>({
    departments: [],
    projects: [],
    parts: [],
    positions: [],
  });

  const [users, setUsers] = useState<UserLite[]>([]);
  const [lines, setLines] = useState<ApprovalLine[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingLine, setEditingLine] = useState<ApprovalLine | null>(null);

  const [form, setForm] = useState({
    name: '',
    request_type: 'leave',
    project_code: '',
    part_code: '',
    department_code: '',
    is_active: true,
  });

  const [steps, setSteps] = useState<StepForm[]>([]);

  const roles = useMemo(() => {
    const s = new Set<string>();
    users.forEach((u) => {
      if (u.role && u.role.trim()) s.add(u.role.trim());
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const codeToName = useMemo(() => {
    const map = new Map<string, string>();
    [...orgConfig.departments, ...orgConfig.projects, ...orgConfig.parts, ...orgConfig.positions].forEach((i) => {
      map.set(i.code, i.name);
    });
    return map;
  }, [orgConfig]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([fetchOrgConfig(), fetchUsers(), fetchLines()]);
    } catch (e: any) {
      setError(e.message || '로드 실패');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgConfig = async () => {
    const { data, error } = await supabase.from('org_settings').select('config').single();
    if (error) throw error;

    setOrgConfig({
      departments: data?.config?.departments || [],
      projects: data?.config?.projects || [],
      parts: data?.config?.parts || [],
      positions: data?.config?.positions || [],
    });
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, position, department, project')
      .order('name', { ascending: true })
      .limit(1000);

    if (error) throw error;
    setUsers((data || []) as UserLite[]);
  };

  const fetchLines = async () => {
    const { data, error } = await supabase
      .from('approval_lines')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setLines((data || []) as ApprovalLine[]);
  };

  const fetchSteps = async (approvalLineId: string) => {
    const { data, error } = await supabase
      .from('approval_line_steps')
      .select('*')
      .eq('approval_line_id', approvalLineId)
      .order('step_order', { ascending: true });

    if (error) throw error;

    const list = (data || []) as ApprovalLineStep[];
    const toForm = list.map((s) => {
      let type: StepAssigneeType = 'role';
      if (s.assignee_user_id) type = 'user';
      else if (s.assignee_position) type = 'position';
      else type = 'role';

      return {
        _key: `step_${s.id}`,
        step_order: s.step_order,
        _assigneeType: type,
        assignee_user_id: s.assignee_user_id,
        assignee_role: s.assignee_role,
        assignee_position: s.assignee_position,

        // ✅ 단계별 승인 범위
        assignee_project_code: s.assignee_project_code || '',
        assignee_part_code: s.assignee_part_code || '',
        assignee_department_code: s.assignee_department_code || '',

        required: s.required,
      } as StepForm;
    });

    // ✅ 이 2줄 추가
    setSteps(list.length ? toForm : getDefaultSteps());
  };

  const getDefaultSteps = (): StepForm[] => [
    {
      _key: `step_${Date.now()}_1`,
      step_order: 1,
      _assigneeType: 'position',
      assignee_user_id: null,
      assignee_role: null,
      assignee_position: '',

      // ✅ 단계별 승인 범위(기본: 전체)
      assignee_project_code: '',
      assignee_part_code: '',
      assignee_department_code: '',

      required: true,
    },
    {
      _key: `step_${Date.now()}_2`,
      step_order: 2,
      _assigneeType: 'role',
      assignee_user_id: null,
      assignee_role: '',
      assignee_position: null,

      // ✅ 단계별 승인 범위(기본: 전체)
      assignee_project_code: '',
      assignee_part_code: '',
      assignee_department_code: '',

      required: true,
    },
  ];

  const openAddModal = () => {
    setError('');
    setSuccess('');
    setEditingLine(null);
    setForm({
      name: '',
      request_type: 'leave',
      project_code: '',
      part_code: '',
      department_code: '',
      is_active: true,
    });
    setSteps(getDefaultSteps());
    setShowModal(true);
  };

  const openEditModal = async (line: ApprovalLine) => {
    setError('');
    setSuccess('');
    setEditingLine(line);

    setForm({
      name: line.name,
      request_type: line.request_type,
      project_code: line.project_code || '',
      part_code: line.part_code || '',
      department_code: line.department_code || '',
      is_active: line.is_active,
    });

    await fetchSteps(line.id);
    setShowModal(true);
  };

  const normalizeScope = (v: string) => (v && v.trim() ? v.trim() : null);

  const normalizeSteps = (list: StepForm[]): StepForm[] => {
    const sorted = [...list].sort((a, b) => a.step_order - b.step_order);
    return sorted.map((s, idx) => ({ ...s, step_order: idx + 1 }));
  };

  const setStepField = (key: string, patch: Partial<StepForm>) => {
    setSteps((prev) => prev.map((s) => (s._key === key ? { ...s, ...patch } : s)));
  };

  const addStep = () => {
    setSteps((prev) => {
      const next = normalizeSteps(prev);
      const order = next.length + 1;
      return [
        ...next,
        {
          _key: `step_${Date.now()}_${order}`,
          step_order: order,
          _assigneeType: 'role',
          assignee_user_id: null,
          assignee_role: '',
          assignee_position: null,

          // ✅ 단계별 승인 범위(기본: 전체)
          assignee_project_code: '',
          assignee_part_code: '',
          assignee_department_code: '',

          required: true,
        },
      ];
    });
  };

  const removeStep = (key: string) => {
    setSteps((prev) => normalizeSteps(prev.filter((s) => s._key !== key)));
  };

  const moveStep = (key: string, dir: 'up' | 'down') => {
    setSteps((prev) => {
      const list = normalizeSteps(prev);
      const idx = list.findIndex((s) => s._key === key);
      if (idx < 0) return list;

      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= list.length) return list;

      const swapped = [...list];
      const tmp = swapped[idx];
      swapped[idx] = swapped[target];
      swapped[target] = tmp;

      return normalizeSteps(swapped);
    });
  };

  const validate = () => {
    if (!form.name.trim()) return '결재 라인 이름을 입력해주세요.';
    if (!form.request_type.trim()) return '요청 유형을 선택해주세요.';
    const s = normalizeSteps(steps);

    if (s.length === 0) return '결재 단계를 1개 이상 추가해주세요.';

    for (const step of s) {
      if (step._assigneeType === 'user' && !step.assignee_user_id) {
        return `${step.step_order}단계: 담당 사용자 선택이 필요합니다.`;
      }
      if (step._assigneeType === 'role' && !step.assignee_role) {
        return `${step.step_order}단계: 담당 권한(role) 선택이 필요합니다.`;
      }
      if (step._assigneeType === 'position' && !step.assignee_position) {
        return `${step.step_order}단계: 담당 직급(position) 선택이 필요합니다.`;
      }
    }
    return '';
  };

  const handleSave = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        name: form.name.trim(),
        request_type: form.request_type.trim(),
        project_code: normalizeScope(form.project_code),
        part_code: normalizeScope(form.part_code),
        department_code: normalizeScope(form.department_code),
        is_active: !!form.is_active,
        updated_at: new Date().toISOString(),
      };

      let lineId = editingLine?.id;

      if (editingLine) {
        const { error } = await supabase.from('approval_lines').update(payload).eq('id', editingLine.id);
        if (error) throw error;
        lineId = editingLine.id;
      } else {
        const { data, error } = await supabase
          .from('approval_lines')
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select('id')
          .single();

        if (error) throw error;
        lineId = data.id as string;
      }

      // steps 재저장(간단하게 전체 삭제 후 재삽입)
      const { error: delErr } = await supabase.from('approval_line_steps').delete().eq('approval_line_id', lineId);
      if (delErr) throw delErr;

      const normalized = normalizeSteps(steps);
      const insertSteps = normalized.map((s) => {
        const base = {
          approval_line_id: lineId!,
          step_order: s.step_order,
          required: !!s.required,

          // ✅ 단계별 승인 범위
          assignee_project_code: normalizeScope(s.assignee_project_code) as any,
          assignee_part_code: normalizeScope(s.assignee_part_code) as any,
          assignee_department_code: normalizeScope(s.assignee_department_code) as any,
        };

        if (s._assigneeType === 'user') {
          return { ...base, assignee_user_id: s.assignee_user_id, assignee_role: null, assignee_position: null };
        }
        if (s._assigneeType === 'position') {
          return { ...base, assignee_user_id: null, assignee_role: null, assignee_position: s.assignee_position };
        }
        return { ...base, assignee_user_id: null, assignee_role: s.assignee_role, assignee_position: null };
      });

      const { error: insErr } = await supabase.from('approval_line_steps').insert(insertSteps);
      if (insErr) throw insErr;

      setSuccess(editingLine ? '수정되었습니다' : '추가되었습니다');
      await fetchLines();
      setShowModal(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (line: ApprovalLine) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    setError('');
    setSuccess('');
    try {
      const { error } = await supabase.from('approval_lines').delete().eq('id', line.id);
      if (error) throw error;

      setSuccess('삭제되었습니다');
      await fetchLines();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message || '삭제 실패');
    }
  };

  const renderScope = (line: ApprovalLine) => {
    const p = line.project_code ? (codeToName.get(line.project_code) || line.project_code) : '전체';
    const t = line.part_code ? (codeToName.get(line.part_code) || line.part_code) : '전체';
    const d = line.department_code ? (codeToName.get(line.department_code) || line.department_code) : '전체';
    return `${p} / ${t} / ${d}`;
  };

  const userLabel = (u: UserLite) => {
    const base = u.name || u.email || u.id;
    const role = u.role ? ` (${u.role})` : '';
    return `${base}${role}`;
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">결재 라인 관리</h2>
        <button onClick={openAddModal} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          결재 라인 추가
        </button>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">범위</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">활성</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{line.name}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {requestTypeLabel[line.request_type] || line.request_type}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{renderScope(line)}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${line.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                      }`}
                  >
                    {line.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  <button onClick={() => openEditModal(line)} className="text-blue-600 hover:text-blue-800">
                    수정
                  </button>
                  <button onClick={() => handleDelete(line)} className="text-red-600 hover:text-red-800">
                    삭제
                  </button>
                </td>
              </tr>
            ))}

            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  등록된 결재 라인이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[85vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">{editingLine ? '결재 라인 수정' : '결재 라인 추가'}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="예: A프로젝트-아트팀 휴가 결재라인"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">요청 유형</label>
                <select
                  value={form.request_type}
                  onChange={(e) => setForm({ ...form, request_type: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="leave">휴가</option>
                  <option value="finance">재무</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">프로젝트 범위</label>
                <select
                  value={form.project_code}
                  onChange={(e) => setForm({ ...form, project_code: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">전체</option>
                  {orgConfig.projects.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">파트 범위</label>
                <select
                  value={form.part_code}
                  onChange={(e) => setForm({ ...form, part_code: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">전체</option>
                  {orgConfig.parts.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">부서 범위</label>
                <select
                  value={form.department_code}
                  onChange={(e) => setForm({ ...form, department_code: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">전체</option>
                  {orgConfig.departments.map((d) => (
                    <option key={d.id} value={d.code}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <label className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-700">활성</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <h4 className="text-lg font-semibold">결재 단계</h4>
              <button onClick={addStep} className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200">
                단계 추가
              </button>
            </div>

            <div className="mt-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">순서</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">담당 타입</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">담당자</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">단계 범위</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">필수</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {normalizeSteps(steps).map((s) => (
                    <tr key={s._key}>
                      <td className="px-4 py-3 text-sm text-gray-900">{s.step_order}</td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={s._assigneeType}
                          onChange={(e) => {
                            const t = e.target.value as StepAssigneeType;
                            if (t === 'user') {
                              setStepField(s._key, {
                                _assigneeType: 'user',
                                assignee_user_id: '',
                                assignee_role: null,
                                assignee_position: null,
                              });
                            } else if (t === 'position') {
                              setStepField(s._key, {
                                _assigneeType: 'position',
                                assignee_user_id: null,
                                assignee_role: null,
                                assignee_position: '',
                              });
                            } else {
                              setStepField(s._key, {
                                _assigneeType: 'role',
                                assignee_user_id: null,
                                assignee_role: '',
                                assignee_position: null,
                              });
                            }
                          }}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                        >
                          <option value="user">사용자</option>
                          <option value="role">권한(Role)</option>
                          <option value="position">직급(Position)</option>
                        </select>
                      </td>

                      <td className="px-4 py-3 text-sm">
                        {s._assigneeType === 'user' && (
                          <select
                            value={s.assignee_user_id || ''}
                            onChange={(e) => setStepField(s._key, { assignee_user_id: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="">선택</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {userLabel(u)}
                              </option>
                            ))}
                          </select>
                        )}

                        {s._assigneeType === 'role' && (
                          <select
                            value={s.assignee_role || ''}
                            onChange={(e) => setStepField(s._key, { assignee_role: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="">선택</option>
                            {roles.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        )}

                        {s._assigneeType === 'position' && (
                          <select
                            value={(s.assignee_position as string) || ''}
                            onChange={(e) => setStepField(s._key, { assignee_position: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="">선택</option>
                            {orgConfig.positions.map((p) => (
                              <option key={p.id} value={p.code}>
                                {p.name} ({p.code})
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* ✅ 단계 범위 셀 추가 */}
                      <td className="px-4 py-3 text-sm">
                        <div className="grid grid-cols-1 gap-2">
                          <select
                            value={s.assignee_project_code || ''}
                            onChange={(e) => setStepField(s._key, { assignee_project_code: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="">프로젝트: 전체</option>
                            {orgConfig.projects.map((p) => (
                              <option key={p.id} value={p.code}>
                                {p.name} ({p.code})
                              </option>
                            ))}
                          </select>

                          <select
                            value={s.assignee_part_code || ''}
                            onChange={(e) => setStepField(s._key, { assignee_part_code: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="">파트: 전체</option>
                            {orgConfig.parts.map((p) => (
                              <option key={p.id} value={p.code}>
                                {p.name} ({p.code})
                              </option>
                            ))}
                          </select>

                          <select
                            value={s.assignee_department_code || ''}
                            onChange={(e) => setStepField(s._key, { assignee_department_code: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="">부서: 전체</option>
                            {orgConfig.departments.map((d) => (
                              <option key={d.id} value={d.code}>
                                {d.name} ({d.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-sm">
                        <label className="inline-flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={!!s.required}
                            onChange={(e) => setStepField(s._key, { required: e.target.checked })}
                            className="h-4 w-4"
                          />
                          <span className="text-sm text-gray-700">필수</span>
                        </label>
                      </td>

                      <td className="px-4 py-3 text-sm space-x-2">
                        <button
                          onClick={() => moveStep(s._key, 'up')}
                          className="text-gray-700 hover:text-gray-900"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveStep(s._key, 'down')}
                          className="text-gray-700 hover:text-gray-900"
                        >
                          ↓
                        </button>
                        <button onClick={() => removeStep(s._key)} className="text-red-600 hover:text-red-800">
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}

                  {steps.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                        단계가 없습니다. “단계 추가”로 추가해주세요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex space-x-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex-1 px-4 py-2 text-white rounded ${saving ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
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

export default ApprovalLineManager;
