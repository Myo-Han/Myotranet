import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';
import ProfileModal from './ProfileModal';

// ✅ 기존 SearchModal(전체 화면 모달)을 대체하는 인라인 확장형 검색바.
// 돋보기 아이콘을 누르면 옆으로 입력창이 슬라이드 확장되고,
// 결과는 입력창 아래 드롭다운으로 애니메이션과 함께 나타난다.
const SearchBar: React.FC = () => {
  const { user: authUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [queriedFor, setQueriedFor] = useState<string | null>(null);
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setQueriedFor(null);
      return;
    }
    setSearching(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, annual_leave_balance, profile_picture')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`);

      if (error) throw error;
      setResults((data || []) as User[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
      setQueriedFor(q);
    }
  }, []);

  // 타이핑 후 350ms 지나면 자동 검색 (디바운스)
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => {
      void runSearch(query);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, isOpen, runSearch]);

  // 열릴 때 입력창에 포커스 (슬라이드 애니메이션 이후 자연스럽게)
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    setQueriedFor(null);
    setError('');
  }, []);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeSearch]);

  // Esc로 닫기
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, closeSearch]);

  const trimmed = query.trim();
  const hasFreshResult = queriedFor === query;
  const showEmptyState = !searching && trimmed.length > 0 && hasFreshResult && results.length === 0 && !error;
  const showDropdown = isOpen && (searching || !!error || results.length > 0 || showEmptyState);

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* 슬라이드 확장되는 입력창 */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          isOpen ? 'w-56 sm:w-64 opacity-100 mr-2' : 'w-0 opacity-0 mr-0'
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void runSearch(query);
            }
          }}
          placeholder="이름 또는 이메일 검색"
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
        />
      </div>

      {/* 돋보기 버튼 */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="검색"
        title="구성원 검색"
        className={`p-1.5 rounded-md transition hover:bg-gray-100 ${
          isOpen ? 'text-indigo-600 bg-gray-100' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {/* 결과 드롭다운 */}
      <div
        className={`absolute right-0 top-full mt-2 w-80 max-w-[90vw] origin-top-right rounded-lg bg-white shadow-2xl border border-gray-100 transition-all duration-200 ease-out z-50 ${
          showDropdown
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 -translate-y-1 scale-95 pointer-events-none'
        }`}
      >
        <div className="max-h-96 overflow-y-auto p-2">
          {searching && (
            <div className="flex items-center justify-center py-6 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2" />
              검색 중...
            </div>
          )}

          {!searching && error && <p className="px-2 py-4 text-sm text-red-600">{error}</p>}

          {showEmptyState && (
            <p className="px-2 py-4 text-sm text-gray-500 text-center">검색 결과가 없습니다.</p>
          )}

          {!searching &&
            results.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setSelectedUserId(u.id);
                  closeSearch();
                }}
                className="w-full flex items-center p-2 rounded-md hover:bg-gray-50 transition text-left"
              >
                <div className="h-9 w-9 rounded-full bg-gray-200 overflow-hidden mr-3 shrink-0">
                  {u.profile_picture ? (
                    <img src={u.profile_picture} alt={u.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-500 text-sm font-bold">
                      {u.name?.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{u.name}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
              </button>
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

export default SearchBar;
