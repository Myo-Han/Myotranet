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
            점검중
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              로그인 방법
            </h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Google 계정으로만 로그인 가능합니다</li>
              <li>• 허가된 이메일만 접근할 수 있습니다</li>
              <li>• 15분 비활성 시 자동 로그아웃됩니다</li>
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
