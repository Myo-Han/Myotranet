import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// 휴가 정책 타입 정의
// ✅ 정책관리는 회사 규정을 문서로 정리해두는 용도로만 쓰고, 실제 자동화(연차 자동 발생 등)는
// run_leave_accrual() DB 함수와 '휴가 지급/차감' 화면에서 별도로 처리한다. 그래서 config의
// 발생조건/부여일수/갱신소멸/사용제한/승인권한 등 세부 필드는 화면에서는 더 이상 입력받지 않고,
// 실제로 아직 코드에서 쓰이는 is_paid/deduction_priority만 내부적으로 기본값을 채워 넣는다.
export interface LeavePolicy {
  id: string;
  policy_name: string;
  policy_code: string;
  description?: string | null;
  enabled: boolean;
  config: {
    // 발생 조건 (더 이상 화면에서 편집하지 않음 - 과거 데이터 호환용으로만 타입 유지)
    accrual_basis?: 'hire_date' | 'calendar_year' | 'event_based' | 'one_time';
    accrual_period_value?: number;
    accrual_period_unit?: 'days' | 'months' | 'years';
    minimum_tenure_value?: number;
    minimum_tenure_unit?: 'days' | 'months' | 'years';

    // 부여 일수 (더 이상 화면에서 편집하지 않음)
    days_granted?: number;

    // 유급/무급 (휴가 신청 시 실제로 사용됨)
    is_paid?: boolean;
    paid_days?: number;
    unpaid_days?: number;

    // 갱신 주기 (더 이상 화면에서 편집하지 않음)
    renewal_type?: 'monthly' | 'yearly' | 'one_time' | 'unlimited';

    // 소멸 기간 (더 이상 화면에서 편집하지 않음)
    expiration_enabled?: boolean;
    expiration_value?: number;
    expiration_unit?: 'days' | 'months' | 'years';

    // 사용 제한 (더 이상 화면에서 편집하지 않음)
    min_usage_unit?: number;
    max_consecutive_days?: number;
    allow_split?: boolean;

    // 승인 권한 (더 이상 화면에서 편집하지 않음)
    approval_type?: 'auto' | 'manager' | 'admin';

    // 우선순위 (정책 목록/신청 폼 정렬에 실제로 사용됨, 낮을수록 먼저)
    deduction_priority?: number;

    // 추가 설정 (더 이상 화면에서 편집하지 않음)
    carries_over?: boolean;
    max_carryover_days?: number;
  };
  created_at: string;
  updated_at: string;
}

interface LeavePolicyManagerProps {
  canEdit?: boolean; // 편집 권한 (Admin은 true, Manager는 false)
}

const LeavePolicyManager: React.FC<LeavePolicyManagerProps> = ({ canEdit = true }) => {
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);

  // ✅ 정책 이름 드롭다운 옵션 (org_settings.config.leave_policy_names, 사용자가 직접 추가 가능)
  const [policyNameOptions, setPolicyNameOptions] = useState<string[]>([]);
  const [showAddName, setShowAddName] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');

  // 폼 상태 (기본 정보 + 설명만 입력받음)
  const [form, setForm] = useState<Partial<LeavePolicy>>({
    policy_name: '',
    policy_code: '',
    description: '',
    enabled: true,
    config: {
      is_paid: true,
      deduction_priority: 1,
    },
  });

  useEffect(() => {
    fetchPolicies();
    fetchPolicyNameOptions();
  }, []);

  const fetchPolicyNameOptions = async () => {
    try {
      const { data, error } = await supabase.from('org_settings').select('config').single();
      if (error) throw error;
      setPolicyNameOptions((data?.config?.leave_policy_names as string[]) || []);
    } catch {
      // 옵션 로딩 실패는 치명적이지 않음 (드롭다운이 비어있는 정도로 처리)
    }
  };

  const handleAddPolicyName = async () => {
    const name = newPolicyName.trim();
    if (!name) return;

    if (policyNameOptions.includes(name)) {
      setForm((prev) => ({ ...prev, policy_name: name }));
      setShowAddName(false);
      setNewPolicyName('');
      return;
    }

    try {
      const { data, error } = await supabase.from('org_settings').select('id, config').single();
      if (error) throw error;

      const next = [...((data.config.leave_policy_names as string[]) || []), name];

      const { error: updErr } = await supabase
        .from('org_settings')
        .update({
          config: { ...data.config, leave_policy_names: next },
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updErr) throw updErr;

      setPolicyNameOptions(next);
      setForm((prev) => ({ ...prev, policy_name: name }));
      setShowAddName(false);
      setNewPolicyName('');
    } catch (err: any) {
      setError(err.message || '정책 이름 추가 실패');
    }
  };

  const fetchPolicies = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('leave_policies')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      // 우선순위로 정렬
      const sorted = (data || []).sort((a, b) =>
        (a.config?.deduction_priority ?? 999) - (b.config?.deduction_priority ?? 999)
      );

      setPolicies(sorted);
    } catch (err: any) {
      setError(err.message || '정책 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (policy?: LeavePolicy) => {
    if (policy) {
      setEditingPolicy(policy);
      setForm(policy);
    } else {
      setEditingPolicy(null);
      setForm({
        policy_name: '',
        policy_code: '',
        description: '',
        enabled: true,
        config: {
          is_paid: true,
          // 기존 정책들 뒤에 이어지도록 다음 순번을 기본값으로 채워둠 (화면에는 노출하지 않음)
          deduction_priority: policies.length + 1,
        },
      });
    }
    setShowModal(true);
  };

  const handleSavePolicy = async () => {
    if (!form.policy_name || !form.policy_code) {
      setError('정책 이름과 코드를 입력해주세요');
      return;
    }

    try {
      if (editingPolicy) {
        // 수정 (기존 config는 그대로 유지 - 신청 폼 등에서 실제로 쓰는 값이라 덮어쓰지 않음)
        const { error } = await supabase
          .from('leave_policies')
          .update({
            policy_name: form.policy_name,
            description: form.description ?? null,
            enabled: form.enabled,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPolicy.id);

        if (error) throw error;
        setSuccess('정책이 수정되었습니다');
      } else {
        // 새로 추가
        const { error } = await supabase.from('leave_policies').insert({
          policy_name: form.policy_name,
          policy_code: form.policy_code,
          description: form.description ?? null,
          enabled: form.enabled,
          config: form.config,
        });

        if (error) throw error;
        setSuccess('정책이 추가되었습니다');
      }

      setShowModal(false);
      fetchPolicies();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '저장 실패');
    }
  };

  const handleDeletePolicy = async (id: string) => {
    if (!window.confirm('정책을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('leave_policies').delete().eq('id', id);

      if (error) throw error;

      setSuccess('정책이 삭제되었습니다');
      fetchPolicies();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '삭제 실패');
    }
  };

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('leave_policies')
        .update({ enabled: !currentEnabled })
        .eq('id', id);

      if (error) throw error;

      fetchPolicies();
    } catch (err: any) {
      setError(err.message || '활성화 변경 실패');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">휴가 정책 관리</h2>
          <p className="text-sm text-gray-500 mt-1">
            회사 휴가 규정을 정리해두는 곳입니다. 실제 연차 발생/지급·차감은 별도 화면에서 처리합니다.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            새 정책 추가
          </button>
        )}
      </div>

      {/* 에러/성공 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* 정책 목록 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  정책 이름
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  코드
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  설명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  상태
                </th>
                {canEdit && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    작업
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {policy.policy_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {policy.policy_code}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {policy.description || <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => canEdit && handleToggleEnabled(policy.id, policy.enabled)}
                      disabled={!canEdit}
                      className={`px-2 py-1 text-xs rounded-full ${policy.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                        } ${canEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}
                    >
                      {policy.enabled ? '활성' : '비활성'}
                    </button>
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => handleOpenModal(policy)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDeletePolicy(policy.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        삭제
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {policies.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-6 py-8 text-center text-gray-500">
                    등록된 정책이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 정책 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">
              {editingPolicy ? '정책 수정' : '새 정책 추가'}
            </h3>

            <div className="space-y-6">
              {/* 기본 정보 */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b pb-2">기본 정보</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      정책 이름 *
                    </label>
                    {!showAddName ? (
                      <div className="flex gap-2">
                        <select
                          value={form.policy_name}
                          onChange={(e) => setForm({ ...form, policy_name: e.target.value })}
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="">선택하세요</option>
                          {Array.from(
                            new Set([
                              ...policyNameOptions,
                              ...(form.policy_name ? [form.policy_name] : []),
                            ])
                          ).map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowAddName(true)}
                          className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                        >
                          + 새 이름
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newPolicyName}
                          onChange={(e) => setNewPolicyName(e.target.value)}
                          placeholder="새 정책 이름 입력"
                          className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleAddPolicyName}
                          className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 whitespace-nowrap"
                        >
                          추가
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddName(false);
                            setNewPolicyName('');
                          }}
                          className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 whitespace-nowrap"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      정책 코드 * {editingPolicy && '(수정 불가)'}
                    </label>
                    <input
                      type="text"
                      value={form.policy_code}
                      onChange={(e) => setForm({ ...form, policy_code: e.target.value })}
                      disabled={!!editingPolicy}
                      placeholder="예: monthly_leave, annual_leave"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    설명
                  </label>
                  <textarea
                    value={form.description || ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={8}
                    placeholder="이 정책의 발생/사용/소멸 규정을 자유롭게 적어주세요"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            </div>

            {/* 버튼 */}
            <div className="mt-6 flex justify-end space-x-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                취소
              </button>
              <button
                onClick={handleSavePolicy}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeavePolicyManager;
