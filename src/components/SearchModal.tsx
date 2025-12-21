import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User, UserProfile } from '../types';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, annual_leave_balance, profile_picture')
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const fetchProfile = async (userId: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_user_profile', { target_user_id: userId });
      if (error) throw error;
      setSelectedProfile(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">직원 검색</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름 또는 이메일 검색"
              className="flex-1 border border-gray-300 rounded-md px-4 py-2"
            />
            <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700">
              검색
            </button>
          </div>
        </form>

        {searching && <Loading />}
        {error && <ErrorMessage message={error} />}

        {!selectedProfile ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {searchResults.map((user) => (
              <div 
                key={user.id} 
                onClick={() => fetchProfile(user.id)}
                className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition"
              >
                <div className="h-12 w-12 rounded-full bg-gray-200 overflow-hidden mr-4">
                  {user.profile_picture ? (
                    <img src={user.profile_picture} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-500 text-xl font-bold">
                      {user.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{user.name}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <button onClick={() => setSelectedProfile(null)} className="mb-4 text-indigo-600 hover:underline">
              ← 검색 결과로 돌아가기
            </button>
            {loading ? <Loading /> : (
              <div className="space-y-6">
                 {/* 프로필 상세 정보 (기존 Search.tsx 상세 레이아웃 유지) */}
                 <div className="flex items-center space-x-4">
                    <div className="h-20 w-20 rounded-full bg-gray-200 overflow-hidden">
                        {selectedProfile.profile.profile_picture && <img src={selectedProfile.profile.profile_picture} alt="" />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">{selectedProfile.profile.name}</h3>
                        <p className="text-gray-500">{selectedProfile.profile.email}</p>
                    </div>
                 </div>
                 {/* 추가 정보 섹션들... */}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchModal;