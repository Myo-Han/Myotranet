import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import SuccessMessage from '../components/SuccessMessage';

const Work: React.FC = () => {
  const { user } = useAuth();
  const [showBuildModal, setShowBuildModal] = useState(false);
  const [buildPassword, setBuildPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canBuild = user && (user.role === 'Manager' || user.role === 'Admin');

  const openBuildModal = () => {
    setError('');
    setSuccess('');
    setBuildPassword('');
    setShowBuildModal(true);
  };

      const handleBuild = async () => {
    if (!buildPassword) {
      setError('빌드 비밀번호를 입력해주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: buildPassword }),
      });

      if (!res.ok) {
        let message = '빌드 시작에 실패했습니다.';
        try {
          const data = await res.json();
          if (data && data.message) {
            message = data.message;
          }
        } catch {
          // ignore json parse error
        }
        throw new Error(message);
      }

      setSuccess('빌드가 시작되었습니다.');
      setShowBuildModal(false);
      setBuildPassword('');
    } catch (err: any) {
      setError(err.message || '빌드 시작에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="p-6">
        <ErrorMessage message="로그인 후 이용 가능합니다." />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">Work</h1>
        <p className="text-sm text-gray-600 mb-4">
          중앙 빌드 관리 페이지입니다. 관리자/매니저만 빌드를 실행할 수 있습니다.
        </p>

        {!canBuild && (
          <p className="text-sm text-gray-500">
            빌드 실행 권한이 없습니다. (관리자/매니저만 가능)
          </p>
        )}

        {canBuild && (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={openBuildModal}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={submitting}
            >
              빌드 시작
            </button>
            <span className="text-xs text-gray-500">
              버튼 클릭 후 비밀 번호를 입력하면 Jenkins 빌드를 트리거합니다.
            </span>
          </div>
        )}
      </div>

      {submitting && (
        <div className="mt-4">
          <Loading />
        </div>
      )}

      {showBuildModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">빌드 비밀번호 확인</h2>
            <p className="text-sm text-gray-600 mb-3">
              빌드를 실행하려면 사전에 공유된 비밀 번호를 입력하세요.
            </p>
            <input
              type="password"
              value={buildPassword}
              onChange={(e) => setBuildPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4"
              placeholder="빌드 비밀번호"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBuild}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={submitting}
              >
                {submitting ? '빌드 시작 중...' : '확인'}
              </button>
              <button
                type="button"
                onClick={() => setShowBuildModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                disabled={submitting}
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

export default Work;
