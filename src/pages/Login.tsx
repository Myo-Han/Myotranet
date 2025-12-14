import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-2xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            묘한 운영툴
          </h2>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <p className="text-sm text-red-800 text-center">
              {error === 'auth_failed'
                ? '로그인에 실패했습니다. 다시 시도해주세요.'
                : error === 'no_user'
                  ? '사용자 정보를 가져올 수 없습니다.'
                  : '접근 권한이 없습니다. 관리자에게 문의하세요.'}
            </p>
          </div>
        )}

        <div className="mt-8 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-h-40 overflow-y-auto">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              25.12.15 06:07 패치노트
            </h3>

            <p className="text-xs font-semibold text-blue-900 mb-1">기능 추가</p>
            <ul className="text-sm text-blue-700 space-y-1 mb-3">
              <li>• [대시보드] 캘린더 / 운영툴 제안 추가</li>
              <li>• [출퇴근관리] 근무시간 실시간 확인 기능 추가</li>
              <li>• [관리자] → [업무 메뉴] 커스텀 기능 확장</li>
              <li>• [업무] → [내 업무] 할 일 목록 / 메모 기능 추가</li>
            </ul>

            <p className="text-xs font-semibold text-blue-900 mb-1">버그 수정</p>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• [대시보드] 소속 / 상태 출력 오류 수정</li>
              <li>• [출퇴근관리] 근무시간 표기 오류 수정</li>
              <li>• [출퇴근관리] 업무 중지/재개 시 화면 미갱신 문제 수정</li>
            </ul>
          </div>

          <button
            onClick={login}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-200"
          >
            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
              <svg className="h-5 w-5 text-blue-300" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                />
              </svg>
            </span>
            Google 계정으로 로그인
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            로그인 시 회사의 정보보안 정책에 동의하는 것으로 간주됩니다
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
