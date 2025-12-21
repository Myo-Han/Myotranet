// 마편수신함
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';

type LetterRow = {
  id: number | string;
  title: string;
  body: string;
  to_user_id: string | null;
  created_at: string;
};

const LettersInbox: React.FC = () => {
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [selected, setSelected] = useState<LetterRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return letters;
    return letters.filter((l) => {
      return (
        (l.title || '').toLowerCase().includes(q) ||
        (l.body || '').toLowerCase().includes(q) ||
        (l.to_user_id || '').toLowerCase().includes(q)
      );
    });
  }, [letters, query]);

  const fetchLetters = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('letters')
        .select('id, title, body, to_user_id, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const next = (data ?? []) as LetterRow[];
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
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">마음의 편지 열람</h2>
          <p className="text-sm text-gray-500 mt-1">제목/내용/작성자로 검색 가능합니다.</p>
        </div>

        <button
          type="button"
          onClick={fetchLetters}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
        >
          새로고침
        </button>
      </div>

      {error && (
        <div className="p-6">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="px-6 py-4 border-b">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          placeholder="검색어 입력 (제목/내용/작성자)"
        />
      </div>

      {loading ? (
        <div className="p-6">
          <Loading />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[520px]">
          {/* 리스트 */}
          <div className="border-r">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">표시할 편지가 없습니다.</div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto">
                {filtered.map((l) => {
                  const isActive = selected && String(selected.id) === String(l.id);
                  return (
                    <button
                      key={String(l.id)}
                      type="button"
                      onClick={() => setSelected(l)}
                      className={`w-full text-left px-6 py-4 border-b hover:bg-gray-50 ${
                        isActive ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-gray-900 truncate">{l.title}</div>
                        <div className="text-xs text-gray-400 shrink-0">
                          {new Date(l.created_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        From: {l.to_user_id || '익명'}
                      </div>
                      <div className="mt-2 text-sm text-gray-600 line-clamp-2">{l.body}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 상세 */}
          <div className="p-6">
            {!selected ? (
              <div className="text-sm text-gray-500">왼쪽에서 편지를 선택하세요.</div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold text-gray-900">{selected.title}</h3>
                  <div className="text-xs text-gray-400 shrink-0">
                    {new Date(selected.created_at).toLocaleString('ko-KR')}
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  <span className="font-medium text-gray-800">From:</span>{' '}
                  {selected.to_user_id || '익명'}
                </div>

                <div className="border rounded-lg p-4 bg-gray-50">
                  <p className="text-sm text-gray-800 whitespace-pre-line">{selected.body}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LettersInbox;
