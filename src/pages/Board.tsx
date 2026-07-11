// 자유게시판. 전 직원이 실명으로 자유롭게 글을 작성하고, 카테고리(자유/정보공유/기타)로 구분한다.
// 댓글/리액션은 기존 공지사항용 컴포넌트(CommentThread, ReactionBar)를 entityType='post'로 재사용한다.
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import ReactionBar from '../components/reactions/ReactionBar';
import CommentThread from '../components/comments/CommentThread';

type Category = 'free' | 'info' | 'other';

const CATEGORY_LABEL: Record<Category, string> = {
  free: '자유',
  info: '정보공유',
  other: '기타',
};

type Post = {
  id: number;
  title: string;
  content: string;
  category: Category;
  author_id: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

type AuthorMini = {
  id: string;
  name: string | null;
  profile_picture: string | null;
  department: string | null;
};

type ViewMode = 'list' | 'write' | 'detail';

const emptyDraft = () => ({ title: '', content: '', category: 'free' as Category });

const Board: React.FC = () => {
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>('list');
  const [posts, setPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorMini>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: postsErr } = await supabase
        .from('posts')
        .select('id,title,content,category,author_id,is_pinned,created_at,updated_at')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (postsErr) throw postsErr;

      const rows = (data || []) as Post[];
      setPosts(rows);

      const authorIds = Array.from(new Set(rows.map((p) => p.author_id).filter(Boolean)));
      if (authorIds.length > 0) {
        const { data: uRows } = await supabase
          .from('users')
          .select('id, name, profile_picture, department')
          .in('id', authorIds);

        const map: Record<string, AuthorMini> = {};
        (uRows || []).forEach((u: any) => {
          map[u.id] = u;
        });
        setAuthors(map);
      } else {
        setAuthors({});
      }
    } catch (e: any) {
      setError(e?.message || '게시글 목록 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const openWrite = () => {
    setEditingPost(null);
    setDraft(emptyDraft());
    setView('write');
  };

  const openEdit = (post: Post) => {
    setEditingPost(post);
    setDraft({ title: post.title, content: post.content, category: post.category });
    setView('write');
  };

  const openDetail = (post: Post) => {
    setSelectedPost(post);
    setView('detail');
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('제목과 내용을 입력하세요');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingPost) {
        const { error: updErr } = await supabase
          .from('posts')
          .update({
            title: draft.title.trim(),
            content: draft.content.trim(),
            category: draft.category,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPost.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('posts').insert({
          title: draft.title.trim(),
          content: draft.content.trim(),
          category: draft.category,
          author_id: user.id,
        });
        if (insErr) throw insErr;
      }

      setView('list');
      setEditingPost(null);
      setDraft(emptyDraft());
      await fetchPosts();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: Post) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    setError('');
    try {
      const { error: delErr } = await supabase.from('posts').delete().eq('id', post.id);
      if (delErr) throw delErr;
      setView('list');
      setSelectedPost(null);
      await fetchPosts();
    } catch (e: any) {
      setError(e?.message || '삭제 실패');
    }
  };

  const isMine = (post: Post) => !!user?.id && post.author_id === user.id;
  const isAdmin = user?.role === 'Admin';

  const filteredPosts = posts.filter((p) => filterCategory === 'all' || p.category === filterCategory);

  const authorLabel = (id: string) => {
    const a = authors[id];
    return a?.name || '(이름 없음)';
  };

  if (loading && view === 'list') return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">자유게시판</h1>
        {view === 'list' && (
          <button
            type="button"
            onClick={openWrite}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            새 글쓰기
          </button>
        )}
      </div>

      {error && <ErrorMessage message={error} />}

      {view === 'list' && (
        <>
          <div className="flex gap-2">
            {(['all', 'free', 'info', 'other'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilterCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filterCategory === c
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
              >
                {c === 'all' ? '전체' : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="bg-white shadow rounded-lg overflow-hidden">
            {filteredPosts.length === 0 ? (
              <p className="p-10 text-center text-sm text-gray-500">등록된 게시글이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {filteredPosts.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => openDetail(p)}
                    className="px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {p.is_pinned && (
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                            고정
                          </span>
                        )}
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {CATEGORY_LABEL[p.category]}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 truncate">{p.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {authorLabel(p.author_id)} · {new Date(p.created_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {view === 'write' && (
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">{editingPost ? '글 수정' : '새 글쓰기'}</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">카테고리</label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
              className="w-full rounded-md border-gray-300 text-sm"
            >
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">제목</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full rounded-md border-gray-300 text-sm"
              placeholder="제목을 입력하세요"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">내용</label>
            <textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              rows={10}
              className="w-full rounded-md border-gray-300 text-sm"
              placeholder="내용을 입력하세요"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setView(editingPost ? 'detail' : 'list');
                setEditingPost(null);
              }}
              className="px-3 py-2 rounded-md bg-gray-200 text-gray-700 text-sm font-medium"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {editingPost ? '수정 완료' : '등록'}
            </button>
          </div>
        </div>
      )}

      {view === 'detail' && selectedPost && (
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {CATEGORY_LABEL[selectedPost.category]}
                </span>
                <h2 className="text-lg font-bold text-gray-900">{selectedPost.title}</h2>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {authorLabel(selectedPost.author_id)} · {new Date(selectedPost.created_at).toLocaleString('ko-KR')}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setView('list');
                  setSelectedPost(null);
                }}
                className="px-3 py-1.5 text-xs rounded-md bg-gray-200 text-gray-700"
              >
                목록으로
              </button>
              {(isMine(selectedPost) || isAdmin) && (
                <>
                  <button
                    type="button"
                    onClick={() => openEdit(selectedPost)}
                    className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedPost)}
                    className="px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-800 whitespace-pre-line border-t pt-4">{selectedPost.content}</div>

          <div className="border-t pt-4">
            <ReactionBar noticeId={selectedPost.id} entityType="post" />
          </div>

          <div className="border-t pt-4">
            <CommentThread noticeId={selectedPost.id} entityType="post" />
          </div>
        </div>
      )}
    </div>
  );
};

export default Board;
