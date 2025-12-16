// 휴가 조회
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';

type UserRow = {
  id: string;
  name: string | null;
  email?: string | null;
  department: string | null;
  position: string | null;
  project: string | null;
  annual_leave_balance: number | null;
  monthly_leave_balance: number | null;
};

type LeaveRow = {
  id: string;
  user_id: string;
  start_date: string; // date
  end_date: string; // date
  leave_type: string;
  days_requested: number;
  reason: string | null;
  created_at: string;
  status?: string | null; // merged
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

type PeriodPreset = 'all' | '3months' | '6months' | '1year';

const PAGE_SIZE = 50;

const LeaveEmployeeOverview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [position, setPosition] = useState('all');
  const [project, setProject] = useState('all');

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [history, setHistory] = useState<BalanceHistoryRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [leaveStatus, setLeaveStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [period, setPeriod] = useState<PeriodPreset>('6months');
  const [historyChangeType, setHistoryChangeType] = useState<'all' | 'accrual' | 'used' | 'manual_add' | 'manual_subtract'>('all');

  const optionSets = useMemo(() => {
    const uniq = (vals: (string | null | undefined)[]) =>
      Array.from(new Set(vals.map(v => (v || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko-KR'));
    return {
      departments: uniq(users.map(u => u.department)),
      positions: uniq(users.map(u => u.position)),
      projects: uniq(users.map(u => u.project)),
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = users.filter(u => {
      if (department !== 'all' && (u.department || '') !== department) return false;
      if (position !== 'all' && (u.position || '') !== position) return false;
      if (project !== 'all' && (u.project || '') !== project) return false;

      if (!q) return true;
      const hay = `${u.name || ''} ${u.email || ''} ${u.department || ''} ${u.position || ''} ${u.project || ''}`.toLowerCase();
      return hay.includes(q);
    });

    // pagination (client-side)
    const start = (page - 1) * PAGE_SIZE;
    return base.slice(start, start + PAGE_SIZE);
  }, [users, search, department, position, project, page]);

  const totalFilteredCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (department !== 'all' && (u.department || '') !== department) return false;
      if (position !== 'all' && (u.position || '') !== position) return false;
      if (project !== 'all' && (u.project || '') !== project) return false;

      if (!q) return true;
      const hay = `${u.name || ''} ${u.email || ''} ${u.department || ''} ${u.position || ''} ${u.project || ''}`.toLowerCase();
      return hay.includes(q);
    }).length;
  }, [users, search, department, position, project]);

  const maxPage = Math.max(1, Math.ceil(totalFilteredCount / PAGE_SIZE));

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [maxPage, page]);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id,name,email,department,position,project,annual_leave_balance,monthly_leave_balance')
        .order('name', { ascending: true });

      if (error) throw error;

      setUsers((data || []) as any);
    } catch (err: any) {
      setError(err.message || '직원 목록 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  const calcStartDate = (preset: PeriodPreset) => {
    if (preset === 'all') return null;
    const now = new Date();
    const start = new Date(now);
    if (preset === '3months') start.setMonth(now.getMonth() - 3);
    if (preset === '6months') start.setMonth(now.getMonth() - 6);
    if (preset === '1year') start.setFullYear(now.getFullYear() - 1);
    return start.toISOString();
  };

  const fetchUserDetails = async (u: UserRow) => {
    setDetailLoading(true);
    setError('');
    setSuccess('');
    setLeaves([]);
    setHistory([]);

    try {
      const startISO = calcStartDate(period);

      // leaves
      let leaveQuery = supabase
        .from('leaves')
        .select('*')
        .eq('user_id', u.id)
        .order('start_date', { ascending: false });

      if (startISO) leaveQuery = leaveQuery.gte('created_at', startISO);

      const { data: leaveRows, error: leaveErr } = await leaveQuery;
      if (leaveErr) throw leaveErr;

      const list = (leaveRows || []) as any[];
      const leaveIds = list.map(l => l.id).filter(Boolean);

      // merge approvals status (optional)
      if (leaveIds.length) {
        const { data: apprRows, error: apprErr } = await supabase
          .from('leave_approvals')
          .select('leave_id,status')
          .in('leave_id', leaveIds);

        if (apprErr) throw apprErr;

        const statusById = new Map<string, string>();
        (apprRows || []).forEach((r: any) => {
          if (r.leave_id) statusById.set(r.leave_id, r.status);
        });

        const merged = list.map(l => {
          const s = statusById.get(l.id) || l.status || null;
          return { ...l, status: s };
        });

        setLeaves(merged as any);
      } else {
        setLeaves(list as any);
      }

      // history
      let histQuery = supabase
        .from('leave_balance_history')
        .select('id,user_id,created_at,policy_code,change_type,change_amount,balance_after,reason')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false });

      if (startISO) histQuery = histQuery.gte('created_at', startISO);
      if (historyChangeType !== 'all') histQuery = histQuery.eq('change_type', historyChangeType);

      const { data: histRows, error: histErr } = await histQuery;
      if (histErr) throw histErr;

      setHistory((histRows || []) as any);
    } catch (err: any) {
      setError(err.message || '상세 로딩 실패');
    } finally {
      setDetailLoading(false);
    }
  };

  const openUserModal = async (u: UserRow) => {
    setSelectedUser(u);
    setShowModal(true);
    await fetchUserDetails(u);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUser(null);
    setLeaves([]);
    setHistory([]);
  };

  const visibleLeaves = useMemo(() => {
    if (leaveStatus === 'all') return leaves;
    return leaves.filter(l => (l.status || 'pending') === leaveStatus);
  }, [leaves, leaveStatus]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">직원 휴가 조회</h2>
            <p className="text-sm text-gray-500 mt-1">검색/필터 후 직원별 잔액과 내역을 확인합니다.</p>
          </div>
          <button
            onClick={fetchUsers}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md text-sm"
          >
            새로고침
          </button>
        </div>

        {error && <div className="mt-4"><ErrorMessage message={error} /></div>}
        {success && <div className="mt-4"><SuccessMessage message={success} /></div>}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="이름/이메일/소속 검색"
            className="border rounded-md px-3 py-2 text-sm"
          />

          <select
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="all">부서: 전체</option>
            {optionSets.departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select
            value={position}
            onChange={(e) => { setPosition(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="all">직급: 전체</option>
            {optionSets.positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={project}
            onChange={(e) => { setProject(e.target.value); setPage(1); }}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="all">프로젝트: 전체</option>
            {optionSets.projects.map(pj => <option key={pj} value={pj}>{pj}</option>)}
          </select>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <div>총 {totalFilteredCount}명</div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              이전
            </button>
            <span>{page} / {maxPage}</span>
            <button
              disabled={page >= maxPage}
              onClick={() => setPage(p => Math.min(maxPage, p + 1))}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">부서</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">직급</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">프로젝트</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">연차</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">월차</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">상세</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{u.name || '(이름 없음)'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{u.department || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{u.position || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{u.project || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-blue-700">{u.annual_leave_balance ?? 0}일</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">{u.monthly_leave_balance ?? 0}일</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => openUserModal(u)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs"
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{selectedUser.name || '(이름 없음)'}</div>
                <div className="text-sm text-gray-500">
                  {selectedUser.department || '-'} · {selectedUser.position || '-'} · {selectedUser.project || '-'}
                </div>
              </div>
              <button onClick={closeModal} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
                닫기
              </button>
            </div>

            <div className="px-6 py-4 border-b">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as PeriodPreset)}
                  className="border rounded-md px-3 py-2 text-sm"
                >
                  <option value="all">기간: 전체</option>
                  <option value="3months">기간: 3개월</option>
                  <option value="6months">기간: 6개월</option>
                  <option value="1year">기간: 1년</option>
                </select>

                <select
                  value={leaveStatus}
                  onChange={(e) => setLeaveStatus(e.target.value as any)}
                  className="border rounded-md px-3 py-2 text-sm"
                >
                  <option value="all">휴가 상태: 전체</option>
                  <option value="pending">대기</option>
                  <option value="approved">승인</option>
                  <option value="rejected">반려</option>
                </select>

                <select
                  value={historyChangeType}
                  onChange={(e) => setHistoryChangeType(e.target.value as any)}
                  className="border rounded-md px-3 py-2 text-sm"
                >
                  <option value="all">증감 유형: 전체</option>
                  <option value="accrual">발생</option>
                  <option value="used">사용</option>
                  <option value="manual_add">수동 지급</option>
                  <option value="manual_subtract">수동 차감</option>
                </select>

                <button
                  onClick={() => fetchUserDetails(selectedUser)}
                  disabled={detailLoading}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md text-sm disabled:opacity-50"
                >
                  {detailLoading ? '로딩...' : '적용/새로고침'}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-8 max-h-[75vh] overflow-auto">
              {detailLoading ? (
                <Loading />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                      <div className="text-sm text-blue-700">연차 잔액</div>
                      <div className="text-2xl font-bold text-blue-800 mt-1">{selectedUser.annual_leave_balance ?? 0}일</div>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                      <div className="text-sm text-green-700">월차 잔액</div>
                      <div className="text-2xl font-bold text-green-800 mt-1">{selectedUser.monthly_leave_balance ?? 0}일</div>
                    </div>
                  </div>

                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b font-semibold">휴가 신청 내역</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">기간</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">일수</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {visibleLeaves.map(l => (
                            <tr key={l.id}>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {l.start_date} ~ {l.end_date}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">{l.leave_type}</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold">{l.days_requested}일</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{l.status || 'pending'}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">{l.reason || '-'}</td>
                            </tr>
                          ))}
                          {visibleLeaves.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                                내역이 없습니다.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b font-semibold">잔액 증감 이력</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">일자</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">정책/유형</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">변동</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">변동량</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">변동 후</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {history.map(h => (
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
                          ))}
                          {history.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                                이력이 없습니다.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveEmployeeOverview;
