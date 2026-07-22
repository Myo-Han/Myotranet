import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import LeaveRequestPage from './pages/LeaveRequestPage';
import Admin from './pages/Admin';
import Works from './pages/Works';
import Board from './pages/Board';
import Members from './pages/Members';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="works" element={<Works />} />
            <Route path="board" element={<Board />} />
            <Route path="attendance" element={<Attendance />} />
            {/* ✅ 근태신청 페이지(연차+연장근무 탭)는 근태관리 사이드바의 두 카테고리로 흡수되어
                더 이상 별도 페이지가 아니다. /leave로 직접 들어오거나 기존 링크를 누르면
                근태관리(연차 신청 카테고리)로 보낸다. */}
            <Route path="leave" element={<Navigate to="/attendance" state={{ category: 'leave' }} replace />} />
            <Route path="leave/new" element={<LeaveRequestPage />} />
            <Route path="leave/edit/:leaveId" element={<LeaveRequestPage />} />
            <Route path="members" element={<Members />} />
            <Route path="settings" element={<Settings />} />
            <Route
              path="admin/*"
              element={
                <ProtectedRoute requireAdmin>
                  <Admin />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
