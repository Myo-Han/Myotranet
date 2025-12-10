import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// 휴가 정책 타입 정의
export interface LeavePolicy {
  id: string;
  policy_name: string;
  policy_code: string;
  enabled: boolean;
  config: {
    // 발생 조건
    accrual_basis: 'hire_date' | 'calendar_year' | 'event_based' | 'one_time';
    accrual_period_value?: number; // 몇 개월/년마다
    accrual_period_unit?: 'days' | 'months' | 'years';
    minimum_tenure_value?: number; // 최소 근속 기간
    minimum_tenure_unit?: 'days' | 'months' | 'years';
    
    // 부여 일수
    days_granted: number;
    
    // 유급/무급
    is_paid: boolean;
    paid_days?: number;
    unpaid_days?: number;
    
    // 갱신 주기
    renewal_type: 'monthly' | 'yearly' | 'one_time' | 'unlimited';
    
    // 소멸 기간
    expiration_enabled: boolean;
    expiration_value?: number;
    expiration_unit?: 'days' | 'months' | 'years';
    
    // 사용 제한
    min_usage_unit: number; // 0.5, 1
    max_consecutive_days?: number;
    allow_split?: boolean;
    
    // 승인 권한
    approval_type: 'auto' | 'manager' | 'admin';
    
    // 우선순위 (낮을수록 먼저 차감)
    deduction_priority: number;
    
    // 추가 설정
    carries_over?: boolean; // 이월 가능 여부
    max_carryover_days?: number; // 최대 이월 일수
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

  // 폼 상태
  const [form, setForm] = useState<Partial<LeavePolicy>>({
    policy_name: '',
    policy_code: '',
    enabled: true,
    config: {
      accrual_basis: 'hire_date',
      accrual_period_value: 1,
      accrual_period_unit: 'months',
      minimum_tenure_value: 0,
      minimum_tenure_unit: 'months',
      days_granted: 1,
      is_paid: true,
      paid_days: 1,
      unpaid_days: 0,
      renewal_type: 'monthly',
      expiration_enabled: true,
      expiration_value: 12,
      expiration_unit: 'months',
      min_usage_unit: 1,
      max_consecutive_days: 365,
      allow_split: true,
      approval_type: 'manager',
      deduction_priority: 1,
      carries_over: false,
      max_carryover_days: 0,
    },
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('leave_policies')
        .select('*')
        .order('deduction_priority', { ascending: true });

      if (error) throw error;
      setPolicies(data || []);
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
        enabled: true,
        config: {
          accrual_basis: 'hire_date',
          accrual_period_value: 1,
          accrual_period_unit: 'months',
          minimum_tenure_value: 0,
          minimum_tenure_unit: 'months',
          days_granted: 1,
          is_paid: true,
          paid_days: 1,
          unpaid_days: 0,
          renewal_type: 'monthly',
          expiration_enabled: true,
          expiration_value: 12,
          expiration_unit: 'months',
          min_usage_unit: 1,
          max_consecutive_days: 365,
          allow_split: true,
          approval_type: 'manager',
          deduction_priority: 1,
          carries_over: false,
          max_carryover_days: 0,
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
        // 수정
        const { error } = await supabase
          .from('leave_policies')
          .update({
            policy_name: form.policy_name,
            enabled: form.enabled,
            config: form.config,
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

  const updateConfig = (key: string, value: any) => {
    setForm({
      ...form,
      config: {
        ...form.config!,
        [key]: value,
      },
    });
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
            휴가 종류별 발생, 소멸, 사용 규칙을 관리합니다
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
                  발생 조건
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  부여 일수
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  유급/무급
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  우선순위
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
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {policy.config.accrual_basis === 'hire_date' && (
                      <>
                        입사 후 {policy.config.accrual_period_value}
                        {policy.config.accrual_period_unit === 'months' ? '개월' : '년'}마다
                      </>
                    )}
                    {policy.config.accrual_basis === 'calendar_year' && '연 1회'}
                    {policy.config.accrual_basis === 'event_based' && '이벤트 발생 시'}
                    {policy.config.accrual_basis === 'one_time' && '1회성'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {policy.config.days_granted}일
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {policy.config.is_paid ? (
                      <span className="text-green-600">
                        유급 {policy.config.paid_days}일
                        {policy.config.unpaid_days ? ` / 무급 ${policy.config.unpaid_days}일` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-500">무급</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {policy.config.deduction_priority}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => canEdit && handleToggleEnabled(policy.id, policy.enabled)}
                      disabled={!canEdit}
                      className={`px-2 py-1 text-xs rounded-full ${
                        policy.enabled
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
                  <td colSpan={canEdit ? 8 : 7} className="px-6 py-8 text-center text-gray-500">
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
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
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
                    <input
                      type="text"
                      value={form.policy_name}
                      onChange={(e) => setForm({ ...form, policy_name: e.target.value })}
                      placeholder="예: 월차, 연차, 리프레시 휴가"
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
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
              </div>

              {/* 발생 조건 */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b pb-2">발생 조건</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    발생 기준
                  </label>
                  <select
                    value={form.config?.accrual_basis}
                    onChange={(e) => updateConfig('accrual_basis', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="hire_date">입사일 기준</option>
                    <option value="calendar_year">회계연도 기준</option>
                    <option value="event_based">이벤트 발생 시</option>
                    <option value="one_time">1회성</option>
                  </select>
                </div>

                {form.config?.accrual_basis === 'hire_date' && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          발생 주기
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="1"
                            value={form.config?.accrual_period_value}
                            onChange={(e) =>
                              updateConfig('accrual_period_value', parseInt(e.target.value))
                            }
                            className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                          />
                          <select
                            value={form.config?.accrual_period_unit}
                            onChange={(e) => updateConfig('accrual_period_unit', e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2"
                          >
                            <option value="days">일</option>
                            <option value="months">개월</option>
                            <option value="years">년</option>
                          </select>
                          <span className="flex items-center text-sm text-gray-600">마다</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          최소 근속 기간 (선택)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            value={form.config?.minimum_tenure_value}
                            onChange={(e) =>
                              updateConfig('minimum_tenure_value', parseInt(e.target.value))
                            }
                            className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                          />
                          <select
                            value={form.config?.minimum_tenure_unit}
                            onChange={(e) => updateConfig('minimum_tenure_unit', e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2"
                          >
                            <option value="days">일</option>
                            <option value="months">개월</option>
                            <option value="years">년</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 부여 일수 */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b pb-2">부여 일수</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    1회 부여 일수
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.config?.days_granted}
                    onChange={(e) => updateConfig('days_granted', parseFloat(e.target.value))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={form.config?.is_paid}
                      onChange={(e) => updateConfig('is_paid', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">유급 휴가</span>
                  </label>

                  {form.config?.is_paid && (
                    <div className="grid grid-cols-2 gap-4 ml-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          유급 일수
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={form.config?.paid_days}
                          onChange={(e) => updateConfig('paid_days', parseFloat(e.target.value))}
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          무급 일수 (선택)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={form.config?.unpaid_days || 0}
                          onChange={(e) => updateConfig('unpaid_days', parseFloat(e.target.value))}
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 갱신 및 소멸 */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b pb-2">갱신 및 소멸</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    갱신 주기
                  </label>
                  <select
                    value={form.config?.renewal_type}
                    onChange={(e) => updateConfig('renewal_type', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="monthly">매월</option>
                    <option value="yearly">매년</option>
                    <option value="one_time">1회성</option>
                    <option value="unlimited">무제한</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={form.config?.expiration_enabled}
                      onChange={(e) => updateConfig('expiration_enabled', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">소멸 기간 설정</span>
                  </label>

                  {form.config?.expiration_enabled && (
                    <div className="ml-6 flex gap-2 items-center">
                      <span className="text-sm text-gray-600">발생 후</span>
                      <input
                        type="number"
                        min="1"
                        value={form.config?.expiration_value}
                        onChange={(e) =>
                          updateConfig('expiration_value', parseInt(e.target.value))
                        }
                        className="w-24 border border-gray-300 rounded-md px-3 py-2"
                      />
                      <select
                        value={form.config?.expiration_unit}
                        onChange={(e) => updateConfig('expiration_unit', e.target.value)}
                        className="border border-gray-300 rounded-md px-3 py-2"
                      >
                        <option value="days">일</option>
                        <option value="months">개월</option>
                        <option value="years">년</option>
                      </select>
                      <span className="text-sm text-gray-600">후 소멸</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={form.config?.carries_over}
                      onChange={(e) => updateConfig('carries_over', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">이월 가능</span>
                  </label>

                  {form.config?.carries_over && (
                    <div className="ml-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        최대 이월 일수 (0 = 무제한)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.config?.max_carryover_days}
                        onChange={(e) =>
                          updateConfig('max_carryover_days', parseInt(e.target.value))
                        }
                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 사용 제한 */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b pb-2">사용 제한</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      최소 사용 단위 (일)
                    </label>
                    <select
                      value={form.config?.min_usage_unit}
                      onChange={(e) => updateConfig('min_usage_unit', parseFloat(e.target.value))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="0.5">0.5일 (반차)</option>
                      <option value="1">1일</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      최대 연속 사용 일수
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.config?.max_consecutive_days}
                      onChange={(e) =>
                        updateConfig('max_consecutive_days', parseInt(e.target.value))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={form.config?.allow_split}
                    onChange={(e) => updateConfig('allow_split', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">분할 사용 허용</span>
                </label>
              </div>

              {/* 승인 및 우선순위 */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-700 border-b pb-2">승인 및 우선순위</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      승인 권한
                    </label>
                    <select
                      value={form.config?.approval_type}
                      onChange={(e) => updateConfig('approval_type', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="auto">자동 승인</option>
                      <option value="manager">매니저 승인</option>
                      <option value="admin">관리자 승인</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      차감 우선순위 (낮을수록 먼저)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form.config?.deduction_priority}
                      onChange={(e) =>
                        updateConfig('deduction_priority', parseInt(e.target.value))
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
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