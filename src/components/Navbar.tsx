import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SessionTimer from './SessionTimer';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const navLinkClass = (path: string) =>
    `px-3 py-2 text-sm font-medium transition-all duration-300 border-b-2 ${isActive(path)
      ? 'border-blue-600 text-blue-600'
      : 'border-transparent text-gray-700 hover:border-gray-400 hover:text-gray-900'
    }`;

  return (
    <nav className="shadow-lg sticky top-0 z-50" style={{ backgroundColor: '#fbfbfd' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Logo and nav links */}
          <div className="flex items-center">
            <Link to="/dashboard" className="flex-shrink-0 flex items-center space-x-2 transition-opacity duration-200 hover:opacity-70">
              <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
              <h1 className="text-black text-xl font-bold">묘한</h1>
            </Link>
            <div className="hidden md:block ml-10">
              <div className="flex items-baseline space-x-4">
                <Link to="/attendance" className={navLinkClass('/attendance')}>
                  출퇴근관리
                </Link>
                <Link to="/works" className={navLinkClass('/works')}>
                  업무
                </Link>
                <Link to="/leave" className={navLinkClass('/leave')}>
                  휴가관리
                </Link>
                {user?.role === 'Admin' && (
                  <Link to="/admin" className={navLinkClass('/admin')}>
                    관리자
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Right side - Session timer and user profile */}
          <div className="flex items-center space-x-4">
            <SessionTimer />

            <div className="flex items-center space-x-3">
              {user?.profile_picture && (
                <img
                  src={user.profile_picture}
                  alt={user.name}
                  className="h-8 w-8 rounded-full border-2 border-white"
                />
              )}
              <div className="hidden md:block text-right">
                <div className="text-sm font-medium text-gray-800">{user?.name}</div>
              </div>
              <button
                onClick={() => logout()}
                className="ml-3 px-3 py-2 rounded-md text-sm font-medium text-white hover:opacity-80 transition duration-200"
                style={{ backgroundColor: '#4b4d51' }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className="md:hidden px-2 pt-2 pb-3 space-y-1 sm:px-3">
        <Link to="/dashboard" className={`${navLinkClass('/dashboard')} block`}>
          Dashboard
        </Link>
        <Link to="/attendance" className={`${navLinkClass('/attendance')} block`}>
          Attendance
        </Link>
        <Link to="/leave" className={`${navLinkClass('/leave')} block`}>
          Leave
        </Link>
        <Link to="/letters" className={`${navLinkClass('/letters')} block`}>
          Letters
        </Link>
        <Link to="/search" className={`${navLinkClass('/search')} block`}>
          Search
        </Link>
        {user?.role === 'Admin' && (
          <Link to="/admin" className={`${navLinkClass('/admin')} block`}>
            Admin
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
