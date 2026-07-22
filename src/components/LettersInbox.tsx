// 마편수신함
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import ProfileModal from './ProfileModal';
import { markAsRead } from '../../api/readLog';

type LetterRow = {
  id: number | string;
  title: string;
  body: string;
  from_user_id: string | null;
  is_anonymous: boolean;
  created_at: string;
  from_name: string | null;
  from_profile_picture: string | null;
};

const LettersInbox: React.FC = () => {
  const { user } = useAuth();

  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [selected, setSelected] = useState<LetterRow | null>(null);
  const [readLetterIds, setReadLetterIds] = useState<Set<string>>(new Set()); // string으로 변경

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const openProfileModal = (targetUserId: string) => {
    setSelectedProfileUserId(targetUserId);
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
    setSelectedProfileUserId(null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return letters;
    return letters.filter((l) => {
      const label = l.is_anonymous ? '익명' : '실명';
      const name = l.from_name || '';
      return (
        (l.title || '').toLowerCase().includes(q) ||
        (l.body || '').toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q)
      );
    });
  }, [letters, query]);

  const fetchLetters = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('letters')
        .select('id, title, body, from_user_id, is_anonymous, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 내 읽음 로그 데이터 로드
      const { data: logData } = await supabase
        .from('user_read_logs')
        .select('target_id')
        .eq('user_id', user?.id)
        .eq('target_type', 'letter');

      if (logData) {
        setReadLetterIds(new Set(logData.map(log => String(log.target_id)))); // 읽은 ID들 저장
      }

      const base = (data ?? []) as Array<{
        id: number | string;
        title: string;
        body: string;
        from_user_id: string | null;
        is_anonymous: boolean;
        created_at: string;
      }>;

      const userIds = Array.from(
        new Set(base.map((x) => x.from_user_id).filter((v): v is string => !!v))
      );

      const nameMap = new Map<string, string>();
      const picMap = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, name, profile_picture')
          .in('id', userIds);

        if (usersError) throw usersError;

        (usersData ?? []).forEach((u: any) => {
          const id = u?.id ? String(u.id) : '';
          if (!id) return;
          if (u?.name) nameMap.set(id, String(u.name));
          if (u?.profile_picture) picMap.set(id, String(u.profile_picture));
        });
      }

      const next: LetterRow[] = base.map((l) => {
        const uid = l.from_user_id ? String(l.from_user_id) : '';
        return {
          ...l,
          from_name: uid ? (nameMap.get(uid) ?? null) : null,
          from_profile_picture: uid ? (picMap.get(uid) ?? null) : null,
        };
      });

      setLetters(next);

      // 선택 유지(가능하면)
      setSelected((prev) => {
        if (!prev) return next[0] ?? null;
        const still = next.find((x) => String(x.id) === String(prev.id));
        return still ?? next[0] ?? null;
      });
    } catch (e: any) {
      setError(e?.message || '편지 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchLetters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-gray-900">마음의 편지 열람</h2>
          <p className="text-xs text-gray-500 mt-1">제목/내용/작성자로 검색 가능합니다.</p>
        </div>

        <button
          type="button"
          onClick={fetchLetters}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="p-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="px-4 py-3 border-b border-gray-100">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs"
          placeholder="검색어 입력 (제목/내용/작성자)"
        />
      </div>

      {loading ? (
        <div className="p-4">
          <Loading />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row min-h-[520px]">
          {/* 리스트 */}
          <div className="border-r border-gray-100 lg:w-[30%]">
            {filtered.length === 0 ? (
              <div className="p-4 text-xs text-gray-400">표시할 편지가 없습니다.</div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto">
                {filtered.map((l) => {
                  const isActive = selected && String(selected.id) === String(l.id);
                  return (
                    <button
                      key={String(l.id)}
                      type="button"
                      onClick={async () => {
                        setSelected(l);

                        // 안 읽은 편지라면 즉시 DB에 읽음 처리 기록
                        if (user?.id && !readLetterIds.has(String(l.id))) {
                          await markAsRead(user.id, 'letter', String(l.id));
                          setReadLetterIds(prev => new Set(prev).add(String(l.id))); // UI 즉시 반영
                        }
                      }}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${isActive ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          {/* 고속 레드닷: 읽지 않은 경우에만 표시 */}
                          {!readLetterIds.has(String(l.id)) && (
                            <span className="w-2 h-2 bg-red-600 rounded-full shrink-0 animate-[pulse_0.7s_infinite] shadow-[0_0_5px_rgba(220,38,38,0.8)]"></span>
                          )}
                          <div className={`truncate text-xs ${!readLetterIds.has(String(l.id)) ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                            {l.title}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 shrink-0">
                          {new Date(l.created_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-gray-500 flex items-center gap-2">
                        <span>From:</span>
                        {l.is_anonymous ? (
                          <span>익명</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (l.from_user_id) openProfileModal(l.from_user_id);
                            }}
                            className="flex items-center gap-2 bg-transparent p-0 border-0 cursor-pointer"
                          >
                            {l.from_profile_picture ? (
                              <img
                                src={l.from_profile_picture}
                                className="h-5 w-5 rounded-full object-cover"
                                alt="profile"
                              />
                            ) : (
                              <div className="h-5 w-5 rounded-full bg-gray-300 flex items-center justify-center text-[10px] font-semibold text-gray-600">
                                {l.from_name?.charAt(0).toUpperCase() || '?'}
                              </div>
                            )}
                            <span className="underline underline-offset-2">{l.from_name || '이름없음'}</span>
                          </button>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-gray-500 line-clamp-1">{l.body}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 상세 */}
          <div className="p-4 lg:w-[70%]">
            {!selected ? (
              <div className="text-xs text-gray-400">왼쪽에서 편지를 선택하세요.</div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium text-gray-900">{selected.title}</h3>
                  <div className="text-xs text-gray-400 shrink-0">
                    {new Date(selected.created_at).toLocaleString('ko-KR')}
                  </div>
                </div>

                <div className="text-xs text-gray-600 flex items-center gap-2">
                  <span className="font-medium text-gray-800">From:</span>
                  {selected.is_anonymous ? (
                    <span>익명</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (selected.from_user_id) openProfileModal(selected.from_user_id);
                      }}
                      className="flex items-center gap-2 bg-transparent p-0 border-0 cursor-pointer"
                    >
                      {selected.from_profile_picture ? (
                        <img
                          src={selected.from_profile_picture}
                          className="h-6 w-6 rounded-full object-cover"
                          alt="profile"
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600">
                          {selected.from_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="underline underline-offset-2">{selected.from_name || '이름없음'}</span>
                    </button>
                  )}
                </div>

                <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
                  <p className="text-xs text-gray-800 whitespace-pre-line">{selected.body}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {user && showProfileModal && selectedProfileUserId && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={closeProfileModal}
          userId={selectedProfileUserId}
          currentUserId={user.id}
          readOnly
        />
      )}
    </div>
  );
};

export default LettersInbox;
