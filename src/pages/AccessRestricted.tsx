import React from 'react';
import { useAuth } from '../context/AuthContext';

const AccessRestricted: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-xl shadow-2xl text-center">
        <h2 className="text-2xl font-extrabold text-gray-900">묘트라넷</h2>

        <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
          <p className="text-sm text-blue-900">
            묘트라넷은 초대받은 사람만 이용할 수 있습니다.
          </p>
          <p className="text-sm text-blue-900 mt-1">
            관리자에게 초대를 요청한 뒤, 받은 메일의 링크로 접속해주세요.
          </p>
        </div>

        <button
          onClick={() => logout()}
          className="text-xs text-gray-500 underline hover:text-gray-700"
        >
          다른 계정으로 다시 시도
        </button>
      </div>
    </div>
  );
};

export default AccessRestricted;
