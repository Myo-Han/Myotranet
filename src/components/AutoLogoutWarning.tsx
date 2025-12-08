import React from 'react';
import { useAuth } from '../context/AuthContext';

const AutoLogoutWarning: React.FC = () => {
  const { showWarning, timeRemaining, extendSession } = useAuth();

  if (!showWarning || timeRemaining <= 0) return null;

  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            <svg
              className="h-12 w-12 text-yellow-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-medium text-gray-900">세션 만료 경고</h3>
            <p className="text-sm text-gray-500 mt-1">
              비활성 상태가 지속되어 자동 로그아웃이 진행됩니다.
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
          <p className="text-center text-2xl font-bold text-yellow-800">
            {minutes}분 {seconds}초 후 자동 로그아웃
          </p>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          계속 작업하시려면 "연장하기" 버튼을 클릭해주세요.
        </p>

        <button
          onClick={extendSession}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
        >
          연장하기 (Stay Signed In)
        </button>
      </div>
    </div>
  );
};

export default AutoLogoutWarning;
