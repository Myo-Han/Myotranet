// 재직증명서 발급
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SimpleCertificateTemplate from '../../pages/document-template/SimpleCertificateTemplate';

type UserRow = {
  id: string;
  name: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  is_active: boolean | null;
};

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const EmploymentCertificate: React.FC = () => {
  const { user } = useAuth();
  const canUse = user?.role === 'Admin' || user?.role === 'Manager';

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayKey());
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setError('');
      try {
        const { data, error: uErr } = await supabase
          .from('users')
          .select('id, name, department, position, hire_date, is_active')
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

  const canGenerate = !!selectedUser;

  const infoRows = useMemo(() => {
    if (!selectedUser) return [];
    return [
      { label: '성명', value: selectedUser.name || '-' },
      { label: '소속', value: selectedUser.department || '-' },
      { label: '직급', value: selectedUser.position || '-' },
      { label: '입사일', value: selectedUser.hire_date || '-' },
      { label: '재직 상태', value: selectedUser.is_active ? '재직 중' : '비재직' },
    ];
  }, [selectedUser]);

  const bodyText = selectedUser
    ? `위 사람은 ${selectedUser.hire_date || '(입사일 미등록)'}부터 현재까지 당사에 ${selectedUser.is_active ? '재직 중임' : '재직하였음'}을 증명합니다.`
    : '';

  const handlePrint = () => window.print();

  if (!user) return <ErrorMessage message="로그인이 필요합니다." />;
  if (!canUse) return <ErrorMessage message="권한이 없습니다. (Admin/Manager 전용)" />;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold">재직증명서 발급</h1>
        <p className="text-sm text-gray-600 mt-1">직원을 선택하고 용도를 입력한 뒤 미리보기 후 출력할 수 있습니다.</p>
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
            <label className="block text-sm font-semibold text-gray-800 mb-1">발급일</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">용도 (선택)</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="예: 은행 제출용"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

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
        <SimpleCertificateTemplate
          titleText="재직증명서"
          issueDate={issueDate}
          infoRows={infoRows}
          bodyText={bodyText}
          purposeText={purpose || undefined}
        />
      )}
    </div>
  );
};

export default EmploymentCertificate;
