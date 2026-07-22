// 자유게시판.
// 왼쪽 사이드바에서 카테고리를 선택하는 구조: 전체 / 마음의 편지 / 건의함(버그제보·편의성개선·신규기능제안).
// 마음의 편지는 작성 시 "익명으로 작성" 체크박스를 제공하며(체크 시 익명, 기본은 실명),
// 건의함 하위 카테고리는 항상 실명으로 작성된다.
// 댓글/리액션은 기존 공지사항용 컴포넌트(CommentThread, ReactionBar)를 entityType='post'로 재사용한다.
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import ReactionBar from '../components/reactions/ReactionBar';
import CommentThread from '../components/comments/CommentThread';

// ✅ letter/suggestion_* 가 현재 쓰는 카테고리. notice/free/info/other는 과거 게시글 호환을 위한 라벨만 유지한다
// (사이드바나 글쓰기 화면에는 더 이상 노출되지 않음).
type Category = 'letter' | 'suggestion_bug' | 'suggestion_ux' | 'suggestion_feature' | 'notice' | 'free' | 'info' | 'other';

const CATEGORY_LABEL: Record<Category, string> = {
  letter: '마음의 편지',
  suggestion_bug: '버그제보',
  suggestion_ux: '편의성개선',
  suggestion_feature: '신규기능제안',
  notice: '공지',
  free: '자유',
  info: '정보공유',
  other: '기타',
};

// 글쓰기 화면에서 선택 가능한 카테고리 (신규 체계)
const WRITABLE_CATEGORIES: Category[] = ['letter', 'suggestion_bug', 'suggestion_ux', 'suggestion_feature'];

type SidebarKey = 'all' | 'letter' | 'suggestion_bug' | 'suggestion_ux' | 'suggestion_feature';

type Post = {
  id: number;
  title: string;
  content: string;
  category: Category;
  author_id: string;
  is_anonymous: boolean;
  is_pinned: boolean;
  allow_reactions: boolean;
  allow_comments: boolean;
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

const emptyDraft = () => ({
  title: '',
  content: '',
  category: 'letter' as Category,
  is_anonymous: false,
});

const getIcon = (key: SidebarKey | 'folder') => {
  if (key === 'all') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }
  if (key === 'letter') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    );
  }
  if (key === 'folder') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
};

const Board: React.FC = () => {
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>('list');
  const [posts, setPosts] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorMini>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarKey, setSidebarKey] = useState<SidebarKey>('all');
  const [suggestionExpanded, setSuggestionExpanded] = useState(true);

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
        .select('id,title,content,category,author_id,is_anonymous,is_pinned,allow_reactions,allow_comments,created_at,updated_at')
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
    const defaultCategory: Category = WRITABLE_CATEGORIES.includes(sidebarKey as Category)
      ? (sidebarKey as Category)
      : 'letter';
    setDraft({ ...emptyDraft(), category: defaultCategory });
    setView('write');
  };

  const openEdit = (post: Post) => {
    setEditingPost(post);
    setDraft({
      title: post.title,
      content: post.content,
      category: post.category,
      is_anonymous: post.is_anonymous,
    });
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
      // 익명 작성은 '마음의 편지'에서만 허용, 건의함 하위 카테고리는 항상 실명
      const effectiveIsAnonymous = draft.category === 'letter' ? draft.is_anonymous : false;

      if (editingPost) {
        const { error: updErr } = await supabase
          .from('posts')
          .update({
            title: draft.title.trim(),
            content: draft.content.trim(),
            category: draft.category,
            is_anonymous: effectiveIsAnonymous,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPost.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('posts').insert({
          title: draft.title.trim(),
          content: draft.content.trim(),
          category: draft.category,
          is_anonymous: effectiveIsAnonymous,
          is_pinned: false,
          allow_reactions: true,
          allow_comments: true,
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

  const filteredPosts = posts.filter((p) => sidebarKey === 'all' || p.category === sidebarKey);

  const authorLabel = (post: Post) => {
    if (post.category === 'letter' && post.is_anonymous) return '익명';
    const a = authors[post.author_id];
    return a?.name || '(이름 없음)';
  };

  const sidebarLabel =
    sidebarKey === 'all'
      ? '전체'
      : CATEGORY_LABEL[sidebarKey as Category];

  if (loading && view === 'list') return <Loading />;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 왼쪽 카테고리 패널 */}
      <div className="w-56 bg-white border-r border-gray-200">
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="text-base font-semibold text-gray-900">자유게시판</h1>
        </div>
        <nav className="p-2 space-y-0.5">
          <button
            type="button"
            onClick={() => setSidebarKey('all')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${sidebarKey === 'all' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            {getIcon('all')}
            <span>전체</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarKey('letter')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition ${sidebarKey === 'letter' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            {getIcon('letter')}
            <span>마음의 편지</span>
          </button>

          <div>
            <button
              type="button"
              onClick={() => setSuggestionExpanded((prev) => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-2.5">
                {getIcon('folder')}
                <span>건의함</span>
              </div>
              <svg
                className={`w-3.5 h-3.5 transition-transform ${suggestionExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {suggestionExpanded && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {(['suggestion_bug', 'suggestion_ux', 'suggestion_feature'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSidebarKey(key)}
                    className={`w-full flex items-center px-3 py-1.5 rounded-md text-sm transition ${sidebarKey === key ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    {CATEGORY_LABEL[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* 오른쪽 컨텐츠 */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900">{sidebarLabel}</h1>
          {view === 'list' && (
            <button
              type="button"
              onClick={openWrite}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              새 글쓰기
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          {error && <ErrorMessage message={error} />}

          {view === 'list' && (
            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              {filteredPosts.length === 0 ? (
                <p className="p-10 text-center text-xs text-gray-400">등록된 게시글이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredPosts.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => openDetail(p)}
                      className="px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {p.is_pinned && (
                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">
                              고정
                            </span>
                          )}
                          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {CATEGORY_LABEL[p.category] || p.category}
                          </span>
                          <span className="text-sm font-medium text-gray-900 truncate">{p.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {authorLabel(p)} · {new Date(p.created_at).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {view === 'write' && (
            <div className="bg-white border border-gray-200 rounded-md p-4 space-y-4">
              <h2 className="text-sm font-medium text-gray-900">{editingPost ? '글 수정' : '새 글쓰기'}</h2>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">카테고리</label>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
                  className="w-full rounded-md border-gray-300 text-xs"
                >
                  {WRITABLE_CATEGORIES.map((c) => (
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
                  className="w-full rounded-md border-gray-300 text-xs"
                  placeholder="제목을 입력하세요"
                />
              </div>

              {draft.category === 'letter' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="board-anonymous-checkbox"
                    checked={draft.is_anonymous}
                    onChange={(e) => setDraft({ ...draft, is_anonymous: e.target.checked })}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor="board-anonymous-checkbox" className="text-xs text-gray-600">
                    익명으로 작성 (체크하지 않으면 실명으로 등록됩니다)
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">내용</label>
                <textarea
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  rows={10}
                  className="w-full rounded-md border-gray-300 text-xs"
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
                  className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {editingPost ? '수정 완료' : '등록'}
                </button>
              </div>
            </div>
          )}

          {view === 'detail' && selectedPost && (
            <div className="bg-white border border-gray-200 rounded-md p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {CATEGORY_LABEL[selectedPost.category] || selectedPost.category}
                    </span>
                    <h2 className="text-sm font-medium text-gray-900">{selectedPost.title}</h2>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {authorLabel(selectedPost)} · {new Date(selectedPost.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setView('list');
                      setSelectedPost(null);
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    목록으로
                  </button>
                  {(isMine(selectedPost) || isAdmin) && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(selectedPost)}
                        className="px-2.5 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedPost)}
                        className="px-2.5 py-1 text-xs rounded-md border border-red-300 text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="text-xs text-gray-800 whitespace-pre-line border-t border-gray-100 pt-4">{selectedPost.content}</div>

              {selectedPost.allow_reactions ? (
                <div className="border-t border-gray-100 pt-4">
                  <ReactionBar noticeId={selectedPost.id} entityType="post" />
                </div>
              ) : (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-400">이 글은 리액션이 비활성화되어 있습니다.</p>
                </div>
              )}

              {selectedPost.allow_comments ? (
                <div className="border-t border-gray-100 pt-4">
                  <CommentThread noticeId={selectedPost.id} entityType="post" />
                </div>
              ) : (
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-400">이 글은 댓글이 비활성화되어 있습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Board;
