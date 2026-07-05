// 원천징수영수증 발급 (샘플/모의 계산 - 실제 급여·세무 데이터가 DB에 없어 입력값 기준으로 간이 계산합니다)
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import WithholdingTemplate from '../../pages/document-template/WithholdingTemplate';

type UserRow = {
  id: string;
  name: string | null;
  department: string | null;
  position: string | null;
};

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const WithholdingManager: React.FC = () => {
  const { user } = useAuth();
  const canUse = user?.role === 'Admin' || user?.role === 'Manager';

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [issueDate, setIssueDate] = useState(getTodayKey());
  const [totalGross, setTotalGross] = useState<number>(0);
  const [paidTax, setPaidTax] = useState<number>(0);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setError('');
      try {
        const { data, error: uErr } = await supabase
          .from('users')
          .select('id, name, department, position')
          .order('name', { ascending: true });
        if (uErr) throw uErr;
        setUsers((data ?? []) as UserRow[]);
      } catch (e: any) {
        setError(e?.message || '사용자 목록 로드 실패');
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [canUse]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const canGenerate = !!selectedUser && totalGross > 0;

  // 아래 세율은 실제 종합소득세율표가 아닌 단순화된 샘플 계산입니다.
  const { incomeTax, localIncomeTax } = useMemo(() => {
    const incomeTax = Math.round(totalGross * 0.033);
    const localIncomeTax = Math.round(incomeTax * 0.1);
    return { incomeTax, localIncomeTax };
  }, [totalGross]);

  const handlePrint = () => window.print();

  if (!user) return <ErrorMessage message="로그인이 필요합니다." />;
  if (!canUse) return <ErrorMessage message="권한이 없습니다. (Admin/Manager 전용)" />;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold">원천징수영수증 발급 (샘플)</h1>
        <p className="text-sm text-gray-600 mt-1">
          실제 급여·세무 데이터가 DB에 없어, 입력한 연간 총급여를 기준으로 간이 계산합니다. 법적 효력이 없는 샘플 문서입니다.
        </p>
      </div>

      {loadingUsers && <Loading />}
      {error && <ErrorMessage message={error} />}

      <div className="no-print bg-white shadow rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">대상 직원</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">선택하세요</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || '이름없음'} {u.department ? `(${u.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">귀속연도</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">발급일</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">연간 총급여 (원) *</label>
            <input
              type="number"
              min={0}
              value={totalGross}
              onChange={(e) => setTotalGross(Number(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">기납부세액 (원)</label>
            <input
              type="number"
              min={0}
              value={paidTax}
              onChange={(e) => setPaidTax(Number(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {!canGenerate && <p className="text-xs text-red-600">직원 선택과 연간 총급여 입력(0보다 커야 함)이 필요합니다.</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => setShowPreview(true)}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-40"
          >
            미리보기
          </button>
          {showPreview && (
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
            >
              출력
            </button>
          )}
        </div>
      </div>

      {showPreview && selectedUser && (
        <WithholdingTemplate
          issueDate={issueDate}
          yearText={year}
          nameText={selectedUser.name || '-'}
          departmentText={selectedUser.department || '-'}
          positionText={selectedUser.position || '-'}
          totalGross={totalGross}
          incomeTax={incomeTax}
          localIncomeTax={localIncomeTax}
          paidTax={paidTax}
        />
      )}
    </div>
  );
};

export default WithholdingManager;
