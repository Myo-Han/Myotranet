// 근태관리 허브 페이지.
// 결재관리(Works.tsx)/관리자(Admin.tsx)와 같은 좌측 사이드바 레이아웃으로 개편했다.
// 카테고리: 근태현황(기본) / 연차 신청 / 연장근무 신청.
// 연차 신청·연장근무 신청 카테고리는 기존에 "근태신청" 버튼을 눌렀을 때 나오던
// /leave 페이지(연차/연장근무 탭)의 내용을 그대로 가져와 나눈 것이다.
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AttendanceStatusPanel from '../components/attendance-dashboard/AttendanceStatusPanel';
import LeaveAnnualPanel from '../components/attendance-dashboard/LeaveAnnualPanel';
import OvertimePanel from '../components/attendance-dashboard/OvertimePanel';

type CategoryKey = 'status' | 'leave' | 'overtime';

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'status', label: '근태현황' },
  { key: 'leave', label: '연차 신청' },
  { key: 'overtime', label: '연장근무 신청' },
];

const getIcon = (key: CategoryKey) => {
  if (key === 'status') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (key === 'leave') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
};

const Attendance: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  // ✅ LeaveRequestPage(연차 신청/수정/삭제 폼)에서 돌아올 때 navigate('/attendance', { state: { category: 'leave' } })
  // 형태로 넘어오면, 기본값(근태현황)이 아니라 "연차 신청" 카테고리로 바로 진입한다.
  const initialCategory = (location.state as { category?: CategoryKey } | null)?.category;
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>(
    initialCategory && CATEGORIES.some((c) => c.key === initialCategory) ? initialCategory : 'status'
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 왼쪽 메뉴 */}
      <div className="w-56 bg-white border-r border-gray-200">
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="text-sm font-semibold text-gray-900">근태관리</h1>
          {user && (
            <p className="text-[11px] text-gray-400 mt-1 truncate">{user.email}</p>
          )}
        </div>
        <nav className="p-2 space-y-0.5">
          {CATEGORIES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedCategory(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${selectedCategory === item.key
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
                }`}
            >
              {getIcon(item.key)}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 오른쪽 컨텐츠 */}
      <div className="flex-1 overflow-auto">
        <div className="p-4">
          {selectedCategory === 'status' && <AttendanceStatusPanel />}
          {selectedCategory === 'leave' && <LeaveAnnualPanel />}
          {selectedCategory === 'overtime' && <OvertimePanel />}
        </div>
      </div>
    </div>
  );
};

export default Attendance;
