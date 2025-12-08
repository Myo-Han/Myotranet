import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { User, UserProfile } from '../types';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';

const Search: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const userId = searchParams.get('userId');
    if (userId) {
      fetchProfile(parseInt(userId));
    }
  }, [searchParams]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, annual_leave_balance, profile_picture')
        .or(
          `name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
        );

      if (error) throw error;

      setSearchResults(data || []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    setLoading(true);
    setError('');
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      const since = new Date();
      since.setDate(since.getDate() - 7);
      const sinceDate = since.toISOString().slice(0, 10);

      const { data: attendanceData, error: attError } = await supabase
        .from('attendance')
        .select('id, date, check_in, check_out, status')
        .eq('user_id', userId)
        .gte('date', sinceDate)
        .order('date', { ascending: false });

      if (attError) throw attError;

      const { data: pendingLeaves, error: leavesError } = await supabase
        .from('leaves')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending');

      if (leavesError) throw leavesError;

      setSelectedProfile({
        user: userData,
        recentAttendance: attendanceData || [],
        pendingLeaves: pendingLeaves || [],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ko-KR');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">직원 검색</h1>

      {error && <ErrorMessage message={error} />}

      <div className="bg-white shadow rounded-lg p-6">
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
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              {searching ? '검색 중...' : '검색'}
            </button>
          </div>
        </form>

        {searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.map((user) => (
              <div
                key={user.id}
                onClick={() => fetchProfile(user.id)}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  {user.profile_picture && (
                    <img src={user.profile_picture} alt={user.name} className="h-10 w-10 rounded-full" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {user.role}
                  </span>
                  <span className="text-sm text-gray-500">연차: {user.annual_leave_balance}일</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && <Loading />}

      {selectedProfile && !loading && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center space-x-6 mb-6">
            {selectedProfile.user.profile_picture && (
              <img
                src={selectedProfile.user.profile_picture}
                alt={selectedProfile.user.name}
                className="h-24 w-24 rounded-full border-4 border-blue-200"
              />
            )}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{selectedProfile.user.name}</h2>
              <p className="text-gray-600">{selectedProfile.user.email}</p>
              <div className="mt-2 flex items-center space-x-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  {selectedProfile.user.role}
                </span>
                <span className="text-sm text-gray-500">
                  연차: {selectedProfile.user.annual_leave_balance}일
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">최근 출퇴근 기록 (7일)</h3>
              {selectedProfile.recentAttendance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">출근</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">퇴근</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedProfile.recentAttendance.map((record) => (
                        <tr key={record.id}>
                          <td className="px-4 py-2 text-sm">{new Date(record.date).toLocaleDateString('ko-KR')}</td>
                          <td className="px-4 py-2 text-sm">{formatTime(record.check_in)}</td>
                          <td className="px-4 py-2 text-sm">{formatTime(record.check_out)}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              record.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {record.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">최근 출퇴근 기록이 없습니다.</p>
              )}
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">대기 중인 휴가 신청</h3>
              {selectedProfile.pendingLeaves.length > 0 ? (
                <div className="space-y-2">
                  {selectedProfile.pendingLeaves.map((leave) => (
                    <div key={leave.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">
                            {new Date(leave.start_date).toLocaleDateString('ko-KR')} ~{' '}
                            {new Date(leave.end_date).toLocaleDateString('ko-KR')}
                          </p>
                          <p className="text-sm text-gray-600">{leave.reason}</p>
                        </div>
                        <span className="text-sm font-medium text-yellow-800">
                          {leave.days_requested}일
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">대기 중인 휴가 신청이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
