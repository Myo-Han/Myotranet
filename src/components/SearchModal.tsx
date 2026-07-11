import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import ProfileModal from './ProfileModal';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  // ✅ Dashboard 우측 상단 검색창에서 입력된 검색어. 모달이 열릴 때 이 값으로 자동 검색을 실행함
  initialQuery?: string;
}

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, initialQuery }) => {
  const { user: authUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async (query: string) => {
    if (!query.trim()) return;

    setSearching(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, annual_leave_balance, profile_picture')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`);

      if (error) throw error;
      setSearchResults((data || []) as User[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  // ✅ 모달이 열릴 때 initialQuery가 있으면 검색창에 채운 뒤 바로 검색 실행 (우측 상단 검색창용)
  useEffect(() => {
    if (isOpen && initialQuery && initialQuery.trim()) {
      setSearchQuery(initialQuery);
      void runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialQuery]);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchQuery);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {searchResults.map((u) => (
            <div
              key={u.id}
              onClick={() => setSelectedUserId(u.id)}
              className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition"
            >
              <div className="h-12 w-12 rounded-full bg-gray-200 overflow-hidden mr-4">
                {u.profile_picture ? (
                  <img src={u.profile_picture} alt={u.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-500 text-xl font-bold">
                    {u.name?.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{u.name}</p>
                <p className="text-sm text-gray-500">{u.email}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {authUser && selectedUserId && (
        <ProfileModal
          isOpen={!!selectedUserId}
          onClose={() => setSelectedUserId(null)}
          userId={selectedUserId}
          currentUserId={authUser.id}
          readOnly={selectedUserId !== authUser.id}
        />
      )}
    </div>
  );
};

export default SearchModal;
