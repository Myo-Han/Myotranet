// 휴가 지급/차감
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';
import ProfileModal from './ProfileModal';

type UserRow = {
  id: string;
  name: string | null;
  email?: string | null;
  profile_picture?: string | null;
  department: string | null;
  position: string | null;
  project: string | null;
  annual_leave_balance: number | null;
  monthly_leave_balance: number | null;
};

type BalanceHistoryRow = {
  id: string;
  user_id: string;
  created_at: string;
  policy_code: string;
  change_type: string;
  change_amount: number;
  balance_after: number | null;
  reason: string | null;
};

type BalanceType = 'annual_leave' | 'monthly_leave';
type ActionType = 'manual_add' | 'manual_subtract';

type OrgItem = { code: string; name: string };
type OrgConfig = {
  departments?: OrgItem[];
  positions?: OrgItem[];
  projects?: OrgItem[];
};

const LeaveBalanceAdjust: React.FC = () => {
  const { user } = useAuth();

  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);

  const getOrgName = (list: OrgItem[] | undefined, code: string | null) => {
    const c = String(code ?? '').trim();
    if (!c) return '';
    return list?.find(x => x.code === c)?.name || c;
  };

  const getAffiliationText = (u: Pick<UserRow, 'department' | 'position' | 'project'>) => {
    const deptName = getOrgName(orgConfig?.departments, u.department);
    const projName = getOrgName(orgConfig?.projects, u.project);
    const posName = getOrgName(orgConfig?.positions, u.position);

    const affiliationParts = [deptName, projName].filter(Boolean);
    return affiliationParts.length ? affiliationParts.join(' / ') : (posName || '');
  };

  const fetchOrgConfig = async () => {
    try {
      const { data, error } = await supabase.from('org_settings').select('config').single();
      if (error) throw error;
      setOrgConfig((data?.config || {}) as any);
    } catch {
      setOrgConfig(null);
    }
  };

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [showEmployeeHeader, setShowEmployeeHeader] = useState(false);
  const [showAdjustForm, setShowAdjustForm] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const openProfileModal = (targetUserId: string) => {
    setSelectedProfileUserId(targetUserId);
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
    setSelectedProfileUserId(null);
  };

  const selectedUser = useMemo(
    () => users.find(u => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const [balanceType, setBalanceType] = useState<BalanceType>('annual_leave');
  const [actionType, setActionType] = useState<ActionType>('manual_add');
  const [amount, setAmount] = useState<number>(1);
  const [reason, setReason] = useState<string>('');

  const [history, setHistory] = useState<BalanceHistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchOrgConfig();
  }, []);

  useEffect(() => {
    if (selectedUserId) fetchHistory(selectedUserId);
    else setHistory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const filteredCandidates = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users.slice(0, 20);
    return users
      .filter(u => {
        const aff = getAffiliationText(u);
        const hay = `${u.name || ''} ${u.email || ''} ${aff}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [users, userQuery, orgConfig]);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id,name,email,profile_picture,department,position,project,annual_leave_balance,monthly_leave_balance')
        .order('name', { ascending: true });

      if (error) throw error;
      setUsers((data || []) as any);
    } catch (err: any) {
      setError(err.message || '직원 목록 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (userId: string) => {
    setHistLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_balance_history')
        .select('id,user_id,created_at,policy_code,change_type,change_amount,balance_after,reason')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setHistory((data || []) as any);
    } catch (err) {
      // 상세 이력 실패는 치명적이지 않게 조용히 처리
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  };

  const currentBalance = (u: UserRow, bt: BalanceType) => {
    if (bt === 'annual_leave') return u.annual_leave_balance ?? 0;
    return u.monthly_leave_balance ?? 0;
  };

  const getBalanceField = (bt: BalanceType) =>
    bt === 'annual_leave' ? 'annual_leave_balance' : 'monthly_leave_balance';

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!selectedUser) {
      setError('대상 직원을 선택해주세요.');
      return;
    }
    if (!amount || amount <= 0) {
      setError('수량은 1 이상으로 입력해주세요.');
      return;
    }
    if (!reason.trim()) {
      setError('사유를 입력해주세요.');
      return;
    }

    setBusy(true);

    try {
      // 1) 최신 잔액 다시 조회 (동시 수정 대비)
      const { data: fresh, error: freshErr } = await supabase
        .from('users')
        .select('id,annual_leave_balance,monthly_leave_balance')
        .eq('id', selectedUser.id)
        .single();

      if (freshErr) throw freshErr;

      const before = currentBalance(fresh as any, balanceType);
      const delta = actionType === 'manual_add' ? amount : -amount;
      const after = before + delta;

      // 2) users 잔액 업데이트
      const field = getBalanceField(balanceType);
      const { error: upErr } = await supabase
        .from('users')
        .update({ [field]: after })
        .eq('id', selectedUser.id);

      if (upErr) throw upErr;

      // 3) 이력 기록
      const { error: histErr } = await supabase
        .from('leave_balance_history')
        .insert({
          user_id: selectedUser.id,
          policy_code: balanceType,          // 'annual_leave' | 'monthly_leave'
          change_type: actionType,           // 'manual_add' | 'manual_subtract'
          change_amount: delta,              // +/- 일수
          balance_after: after,              // 변동 후 잔액
          reason: reason.trim(),
        });

      if (histErr) throw histErr;

      // 4) 로컬 상태 갱신
      setUsers(prev =>
        prev.map(u => (u.id === selectedUser.id ? { ...u, [field]: after } as any : u))
      );

      setSuccess(`처리 완료: ${selectedUser.name || '직원'} ${actionType === 'manual_add' ? '지급' : '차감'} ${amount}일`);
      setReason('');
      setAmount(1);
      await fetchHistory(selectedUser.id);
    } catch (err: any) {
      setError(err.message || '처리 실패');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="bg-white shadow rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">휴가 지급/차감</h2>
        <p className="text-sm text-gray-500 mt-1">직원 선택 후 잔액을 조정하고 이력을 기록합니다.</p>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* left: form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">대상 직원 검색</label>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="이름/이메일/소속 검색"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />

            <div className="mt-2 border rounded-md max-h-56 overflow-auto">
              {filteredCandidates.map(u => {
                const aff = getAffiliationText(u);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setShowEmployeeHeader(true);
                      setShowAdjustForm(true);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedUserId === u.id ? 'bg-indigo-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      {u.profile_picture ? (
                        <img
                          src={u.profile_picture}
                          alt="profile"
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-700">
                          {(u.name?.charAt(0) || '?').toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{u.name || '(이름 없음)'}</div>
                        {aff ? <div className="text-xs text-gray-500 truncate">{aff}</div> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredCandidates.length === 0 && (
                <div className="px-3 py-6 text-sm text-gray-500 text-center">검색 결과가 없습니다.</div>
              )}
            </div>
          </div>

          {selectedUser && showAdjustForm && (
            <div className="mt-4 space-y-4 border border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">대상 잔액</label>
                  <select
                    value={balanceType}
                    onChange={(e) => setBalanceType(e.target.value as BalanceType)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="annual_leave">연차</option>
                    <option value="monthly_leave">월차</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">동작</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as ActionType)}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="manual_add">지급</option>
                    <option value="manual_subtract">차감</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">일수</label>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleSubmit}
                    disabled={busy}
                    className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm disabled:opacity-50"
                  >
                    {busy ? '처리 중...' : '적용'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="지급/차감 사유를 입력하세요"
                />
              </div>
            </div>
          )}

          {selectedUser && showEmployeeHeader && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => selectedUser && openProfileModal(selectedUser.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
              >
                <div>
                  <div className="font-semibold text-gray-900">{selectedUser.name || '이름'}</div>
                  {getAffiliationText(selectedUser) && (
                    <div className="text-xs text-gray-500 mt-0.5">{getAffiliationText(selectedUser)}</div>
                  )}
                  <div className="text-sm text-gray-600">
                    연차: {selectedUser.annual_leave_balance ?? 0}일 · 월차: {selectedUser.monthly_leave_balance ?? 0}일
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* right: history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">최근 조정/변동 이력</div>
            <button
              onClick={() => selectedUserId && fetchHistory(selectedUserId)}
              disabled={!selectedUserId || histLoading}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded text-xs disabled:opacity-50"
            >
              새로고침
            </button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">일자</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">변동</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">변동량</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">변동 후</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {histLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500">로딩 중...</td>
                    </tr>
                  ) : history.length > 0 ? (
                    history.map(h => (
                      <tr key={h.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {new Date(h.created_at).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{h.policy_code}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{h.change_type}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">
                          <span className={h.change_amount > 0 ? 'text-green-700' : 'text-red-700'}>
                            {h.change_amount > 0 ? '+' : ''}{h.change_amount}일
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">{h.balance_after ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{h.reason || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                        {selectedUserId ? '이력이 없습니다.' : '직원을 선택해주세요.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            * 잔액 업데이트와 이력 기록은 순차 처리입니다. (완전 원자성 필요하면 RPC로 묶는 방식이 가장 안전합니다.)
          </div>
        </div>
      </div>
      {user && showProfileModal && selectedProfileUserId && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={closeProfileModal}
          userId={selectedProfileUserId}
          currentUserId={user.id}
          readOnly
        />
      )}

    </div>
  );
};

export default LeaveBalanceAdjust;
