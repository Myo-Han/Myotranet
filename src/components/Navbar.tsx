import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SessionTimer from './SessionTimer';
import NotificationBell from './NotificationBell';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const [activeTab, setActiveTab] = React.useState('/dashboard');
  const navRef = React.useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = React.useState({ left: 0, width: 0 });

  const navItems = [
    { path: '/dashboard', label: '묘한', isLogo: true },
    { path: '/board', label: '게시판' },
    { path: '/attendance', label: '근태관리' },
    { path: '/works', label: '결재관리' },
    { path: '/members', label: '구성원' },
    ...(user?.role === 'Admin' ? [{ path: '/admin', label: '관리자' }] : []),
  ];

  React.useEffect(() => {
    const currentPath = location.pathname;
    const activeItem = navItems.find(item => 
      currentPath === item.path || currentPath.startsWith(item.path + '/')
    );
    if (activeItem) {
      setActiveTab(activeItem.path);
    }
  }, [location.pathname, user?.role]);

  React.useEffect(() => {
    if (navRef.current) {
      const activeLink = navRef.current.querySelector(`[data-path="${activeTab}"]`) as HTMLElement;
      if (activeLink) {
        setIndicatorStyle({
          left: activeLink.offsetLeft,
          width: activeLink.offsetWidth,
        });
      }
    }
  }, [activeTab, user?.role]);

  const navLinkClass = (path: string) =>
    `px-3 py-2 text-sm font-medium transition-colors duration-200 ${
      activeTab === path
        ? 'text-black'
        : 'text-gray-600 hover:text-gray-900'
    }`;

  return (
    <nav className="shadow-lg sticky top-0 z-50" style={{ backgroundColor: '#fbfbfd' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Logo and nav links */}
          <div className="flex items-center relative" ref={navRef}>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                data-path={item.path}
                className={`${navLinkClass(item.path)} ${item.isLogo ? 'flex items-center space-x-2 mr-6' : ''}`}
              >
                {item.isLogo ? (
                  <>
                    <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
                    <span className="text-xl font-bold">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
              </Link>
            ))}
            
            {/* Animated underline indicator */}
            <div
              className="absolute bottom-0 h-0.5 bg-black transition-all duration-300 ease-out"
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
              }}
            />
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
              <Link
                to="/settings"
                aria-label="설정"
                title="설정"
                className={`p-1.5 rounded-md transition ${isActive('/settings') ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
              <NotificationBell />
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
        {navItems.filter(item => !item.isLogo).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`${navLinkClass(item.path)} block`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default Navbar;
