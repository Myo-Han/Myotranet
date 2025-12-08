import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { User } from '../types';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await axios.get('/api/users/search', {
        params: { q: searchQuery },
      });
      setSearchResults(response.data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const viewProfile = (userId: number) => {
    navigate(`/search?userId=${userId}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

      {/* User Profile Card */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">프로필</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center space-x-6">
            {user?.profile_picture && (
              <img
                src={user.profile_picture}
                alt={user.name}
                className="h-24 w-24 rounded-full border-4 border-blue-200"
              />
            )}
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-gray-900">{user?.name}</h3>
              <p className="text-gray-600 mt-1">{user?.email}</p>
              <div className="mt-3 flex items-center space-x-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  {user?.role}
                </span>
                <span className="text-sm text-gray-500">
                  가입일: {user && new Date(user.created_at).toLocaleDateString('ko-KR')}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600">잔여 연차</p>
                    <p className="text-3xl font-bold text-green-700 mt-1">
                      {user?.annual_leave_balance}
                      <span className="text-lg font-normal text-green-600 ml-1">일</span>
                    </p>
                  </div>
                  <div className="text-green-500">
                    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600">계정 상태</p>
                    <p className="text-lg font-semibold text-blue-700 mt-1">
                      {user?.is_active ? '활성' : '비활성'}
                    </p>
                  </div>
                  <div className="text-blue-500">
                    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-600">권한 레벨</p>
                    <p className="text-lg font-semibold text-purple-700 mt-1">
                      {user?.role === 'Admin' ? '전체 관리자' : user?.role === 'Manager' ? '매니저' : '일반 사용자'}
                    </p>
                  </div>
                  <div className="text-purple-500">
                    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Search */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">직원 검색</h2>
        </div>
        <div className="p-6">
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 또는 이메일로 검색..."
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 px-4 py-2 border"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 transition duration-200"
              >
                {searching ? '검색 중...' : '검색'}
              </button>
            </div>
          </form>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((employee) => (
                <div
                  key={employee.id}
                  onClick={() => viewProfile(employee.id)}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition duration-200"
                >
                  <div className="flex items-center space-x-3">
                    {employee.profile_picture && (
                      <img
                        src={employee.profile_picture}
                        alt={employee.name}
                        className="h-10 w-10 rounded-full"
                      />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{employee.name}</p>
                      <p className="text-sm text-gray-500">{employee.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {employee.role}
                    </span>
                    <span className="text-sm text-gray-500">
                      연차: {employee.annual_leave_balance}일
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-center text-gray-500 py-4">검색 결과가 없습니다.</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/attendance')}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-blue-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">출퇴근 관리</h3>
          <p className="text-sm text-gray-500 mt-1">출근, 퇴근, 조퇴 기록</p>
        </button>

        <button
          onClick={() => navigate('/leave')}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-green-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">휴가 신청</h3>
          <p className="text-sm text-gray-500 mt-1">연차 및 반차 신청</p>
        </button>

        <button
          onClick={() => navigate('/letters')}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-purple-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">마음의 편지</h3>
          <p className="text-sm text-gray-500 mt-1">익명 또는 실명 편지</p>
        </button>

        <button
          onClick={() => navigate('/search')}
          className="bg-white p-6 rounded-lg shadow hover:shadow-md transition duration-200 text-left"
        >
          <div className="text-indigo-600 mb-3">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">직원 검색</h3>
          <p className="text-sm text-gray-500 mt-1">상세 프로필 조회</p>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
