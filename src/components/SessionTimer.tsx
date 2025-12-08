import React from 'react';
import { useAuth } from '../context/AuthContext';

const SessionTimer: React.FC = () => {
  const { timeRemaining, extendSession } = useAuth();

  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);

  const isWarning = timeRemaining <= 5 * 60 * 1000; // Last 5 minutes

  return (
    <div className="flex items-center space-x-3">
      <div
        className={`text-sm font-medium ${
          isWarning ? 'text-red-600' : 'text-gray-600'
        }`}
      >
        <span className="font-bold">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>{' '}
      </div>
      <button
        onClick={extendSession}
        className="px-3 py-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition duration-200"
      >
        연장하기
      </button>
    </div>
  );
};

export default SessionTimer;
