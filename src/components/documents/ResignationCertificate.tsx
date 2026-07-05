// 퇴직증명서 발급
// 참고: DB에 퇴직일/퇴직사유 컬럼이 없어 발급 시 직접 입력받습니다 (별도로 저장되지 않고 발급 시점에만 사용).
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
};

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ResignationCertificate: React.FC = () => {
  const { user } = useAuth();
  const canUse = user?.role === 'Admin' || user?.role === 'Manager';

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [resignedAt, setResignedAt] = useState('');
  const [reason, setReason] = useState('');
  const [purpose, setPurpose] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayKey());
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      setError('');
      try {
        // 관리자 관점에서는 퇴직자 포함 전체(비활성 포함)를 대상으로 함
        const { data, error: uErr } = await supabase
          .from('users')
          .select('id, name, department, position, hire_date')
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

  const canGenerate = !!selectedUser && !!resignedAt;

  const infoRows = useMemo(() => {
    if (!selectedUser) return [];
    return [
      { label: '성명', value: selectedUser.name || '-' },
      { label: '소속', value: selectedUser.department || '-' },
      { label: '직급', value: selectedUser.position || '-' },
      { label: '입사일', value: selectedUser.hire_date || '-' },
      { label: '퇴직일', value: resignedAt || '-' },
      ...(reason ? [{ label: '퇴직 사유', value: reason }] : []),
    ];
  }, [selectedUser, resignedAt, reason]);

  const bodyText = selectedUser
    ? `위 사람은 ${selectedUser.hire_date || '(입사일 미등록)'}부터 ${resignedAt}까지 당사에 근무하였으며, ${resignedAt}부로 퇴직하였음을 증명합니다.`
    : '';

  const handlePrint = () => window.print();

  if (!user) return <ErrorMessage message="로그인이 필요합니다." />;
  if (!canUse) return <ErrorMessage message="권한이 없습니다. (Admin/Manager 전용)" />;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold">퇴직증명서 발급</h1>
        <p className="text-sm text-gray-600 mt-1">
          퇴직일/사유는 DB에 별도 저장되지 않아 발급할 때마다 직접 입력합니다.
        </p>
      </div>

      {loadingUsers && <Loading />}
      {error && <ErrorMessage message={error} />}

      <div className="no-print bg-white shadow rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <label className="block text-sm font-semibold text-gray-800 mb-1">퇴직일 *</label>
            <input
              type="date"
              value={resignedAt}
              onChange={(e) => setResignedAt(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">퇴직 사유 (선택)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 개인 사정에 의한 자진퇴사"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-800 mb-1">용도 (선택)</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="예: 실업급여 신청용"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {!canGenerate && <p className="text-xs text-red-600">직원과 퇴직일을 입력해주세요.</p>}

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
          titleText="퇴직증명서"
          issueDate={issueDate}
          infoRows={infoRows}
          bodyText={bodyText}
          purposeText={purpose || undefined}
        />
      )}
    </div>
  );
};

export default ResignationCertificate;
