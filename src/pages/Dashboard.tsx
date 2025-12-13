import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { User } from '../types';

type Notice = {
  id: number;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
};

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);

  useEffect(() => {
    const fetchNotices = async () => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('notices')
        .select('id, title, content, is_pinned, created_at')
        .gte('created_at', oneWeekAgo.toISOString())
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && data) {
        setNotices(data as Notice[]);
      }
    };

    fetchNotices();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, annual_leave_balance, profile_picture')
        .or(
          `name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
        );

      if (error) throw error;

      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const viewProfile = (userId: string) => {
    navigate(`/search?userId=${userId}`);
  };

  return (
    <div className="space-y-6">
      {/* User Profile Card */}
      {/* Profile + Notice Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-600">남은 휴가</p>
                      <p className="text-lg font-semibold text-blue-700 mt-1">
                        {(user?.annual_leave_balance ?? 0) + (user?.monthly_leave_balance ?? 0)}일
                      </p>
                    </div>
                    <div className="text-blue-500">
                      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M4.5 19.5l15-15"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-600">계정 상태</p>
                      <p className="text-lg font-semibold text-green-700 mt-1">
                        {user?.is_active ? '활성' : '비활성'}
                      </p>
                    </div>
                    <div className="text-green-500">
                      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-600">권한 레벨</p>
                      <p className="text-lg font-semibold text-purple-700 mt-1">
                        {user?.role === 'Admin'
                          ? '전체 관리자'
                          : user?.role === 'Manager'
                            ? '매니저'
                            : '일반 사용자'}
                      </p>
                    </div>
                    <div className="text-purple-500">
                      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 12a5 5 0 100-10 5 5 0 000 10zm-7 9a7 7 0 0114 0H5z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notice Container */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">공지</h2>
            {notices.length > 0 && (
              <span className="text-xs text-yellow-100">
                최근 {notices.length}개 (7일 이내)
              </span>
            )}
          </div>
          <div className="p-6 space-y-3">
            {notices.length === 0 ? (
              <p className="text-gray-500 text-sm">최근 7일 이내 공지가 없습니다.</p>
            ) : (
              notices.map((notice) => (
                <button
                  key={notice.id}
                  type="button"
                  onClick={() => {
                    setSelectedNotice(notice);
                    setIsNoticeModalOpen(true);
                  }}
                  className="w-full text-left border-b last:border-b-0 pb-3 last:pb-0 hover:bg-yellow-50 rounded-md px-2 -mx-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {notice.title}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {new Date(notice.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {/* Notice Modal */}
      {isNoticeModalOpen && selectedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {selectedNotice.title}
              </h2>
              <span className="text-xs text-gray-400">
                {new Date(selectedNotice.created_at).toLocaleDateString('ko-KR')}
              </span>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 whitespace-pre-line">
                {selectedNotice.content}
              </p>
            </div>
            <div className="px-6 py-3 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setIsNoticeModalOpen(false)}
                className="px-4 py-1.5 rounded-md bg-gray-800 text-white text-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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
