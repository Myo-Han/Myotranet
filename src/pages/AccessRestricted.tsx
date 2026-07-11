import React from 'react';
import { useAuth } from '../context/AuthContext';

const AccessRestricted: React.FC = () => {
  const { login } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#4A4D50] px-4">
      <div className="flex items-center gap-2 mb-8">
        <img src="/logo.svg" alt="묘트라넷 로고" className="h-10 w-10" />
        <span className="text-xl font-bold text-white tracking-tight">묘트라넷</span>
      </div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-10">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900">로그인</h2>
          <p className="text-sm text-gray-500 mt-2">
            이미 계정이 있다면 구글 계정으로 로그인해주세요
          </p>
        </div>

        <button
          onClick={() => login()}
          className="mt-8 group relative w-full flex justify-center items-center py-3 px-4 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition duration-200"
        >
          <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google 계정으로 로그인
        </button>

        <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-500 text-center">
          아직 계정이 없다면, 관리자에게 초대를 요청해주세요.
          <br />
          받은 메일의 링크를 클릭하면 별도 로그인 없이 바로 접속됩니다
        </div>
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        문의사항이 있다면 관리자에게 연락해주세요
      </p>
    </div>
  );
};

export default AccessRestricted;
