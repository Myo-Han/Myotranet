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
          <h2 className="text-xl font-bold text-gray-900">초대받은 분만 이용할 수 있어요</h2>
          <p className="text-sm text-gray-500 mt-2">
            관리자에게 초대를 요청한 뒤, 받은 메일의 링크로 접속해주세요
          </p>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm text-gray-500 text-center">
          별도의 로그인 절차 없이, 초대 메일의 링크를 클릭하면 바로 접속됩니다
        </div>

        <div className="mt-6 flex items-center justify-center">
          <button
            onClick={() => login()}
            className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
          >
            이미 계정이 있으신가요? Google로 로그인
          </button>
        </div>
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        문의사항이 있다면 관리자에게 연락해주세요
      </p>
    </div>
  );
};

export default AccessRestricted;
