import React from 'react';
import { useAuth } from '../context/AuthContext';

const SessionTimer: React.FC = () => {
  const { timeRemaining, extendSession } = useAuth();

  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);

  const isWarning = timeRemaining <= 5 * 60 * 1000; // Last 5 minutes

  // 남은 시간이 넉넉할 때까지 카운트다운을 계속 띄워두면 시각적 노이즈만 된다.
  // 실제로 조치가 필요한 마지막 5분에만 노출한다.
  if (!isWarning) return null;

  return (
    <div className="flex items-center space-x-3">
      <div className="text-sm font-medium text-red-600">
        <span className="font-bold">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>{' '}
      </div>
      <button
        onClick={extendSession}
        className="px-3 py-1 text-sm font-medium text-gray-800 hover:opacity-80 rounded-md transition duration-200"
        style={{ backgroundColor: '#cccfd1' }}
      >
        연장하기
      </button>
    </div>
  );
};

export default SessionTimer;
