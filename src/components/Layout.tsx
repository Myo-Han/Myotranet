import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import AutoLogoutWarning from './AutoLogoutWarning';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <Outlet />
        </div>
      </main>
      <AutoLogoutWarning />
    </div>
  );
};

export default Layout;
