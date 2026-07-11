// src/components/comments/CommentThreadPanel.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import type { CommentNode, NoticeComment, UserMini } from './types';
import CommentEditor from './CommentEditor';
import CommentItem from './CommentItem';
import { buildAffiliation, formatKoreanDateTimeYY } from './utils';

type Props = {
  open: boolean;
  onClose: () => void;
  root: CommentNode;          // 메인 댓글(스레드 루트)
  onChanged: () => void;      // 외부(메인 리스트) 갱신
};

const CommentThreadPanel: React.FC<Props> = ({ open, onClose, root, onChanged }) => {
  const { user } = useAuth();
  const me = user?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rootNode, setRootNode] = useState<CommentNode | null>(null);
  const [replies, setReplies] = useState<CommentNode[]>([]);

  const rootId = root.id;

  const fetchThread = async () => {
    setLoading(true);
    setErr(null);

    // 루트 + 답글(1레벨)만 가져옵니다(슬랙 스레드 방식)
    const { data: rootRow, error: rErr } = await supabase
      .from('notice_comments')
      .select('*')
      .eq('id', rootId)
      .single();

    if (rErr) {
      setErr(rErr.message);
      setLoading(false);
      return;
    }

    const { data: replyRows, error: cErr } = await supabase
      .from('notice_comments')
      .select('*')
      .eq('parent_id', rootId)
      .order('created_at', { ascending: true });

    if (cErr) {
      setErr(cErr.message);
      setLoading(false);
      return;
    }

    const all = [rootRow, ...(replyRows ?? [])] as NoticeComment[];
    const userIds = Array.from(new Set(all.map((x) => x.user_id).filter(Boolean)));

    let users: UserMini[] = [];
    if (userIds.length > 0) {
      const { data: uRows, error: uErr } = await supabase
        .from('users')
        .select('id, name, profile_picture, department, project, part, position')
        .in('id', userIds);

      if (uErr) {
        setErr(uErr.message);
        setLoading(false);
        return;
      }

      users = (uRows as any as UserMini[]) ?? [];
    }

    const byId = new Map(users.map((u) => [u.id, u]));

    const toNode = (c: NoticeComment): CommentNode => ({
      ...c,
      author: byId.get(c.user_id) ?? null,
      children: [],
    });

    setRootNode(toNode(rootRow as NoticeComment));
    setReplies(((replyRows as NoticeComment[]) ?? []).map(toNode));
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;

    fetchThread();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rootId]);

  const replyCount = useMemo(() => replies.length, [replies]);

  const addReply = async (content: string) => {
    if (!me || !rootNode) return;

    const { error } = await supabase.from('notice_comments').insert({
      notice_id: rootNode.notice_id,
      entity_type: rootNode.entity_type,
      user_id: me,
      parent_id: rootNode.id,
      content,
    });

    if (error) {
      setErr(error.message);
      return;
    }

    await fetchThread();
    onChanged();
  };

  if (!open) return null;

  const rootTitle = rootNode?.author
    ? `${rootNode.author.name ?? '(이름 없음)'} · ${buildAffiliation(rootNode.author)}`
    : '스레드';

  const rootTime = rootNode ? formatKoreanDateTimeYY(rootNode.created_at) : '';

  return (
    <div className="fixed inset-0 z-[80]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/30" onMouseDown={onClose} />

      {/* right panel */}
      <div
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">스레드</div>
            <div className="mt-1 text-xs text-gray-500 truncate">{rootTitle}</div>
            {rootTime && <div className="mt-1 text-xs text-gray-400">{rootTime}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-sm rounded-md hover:bg-gray-100"
          >
            닫기
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-sm text-gray-500">불러오는 중...</div>
          ) : err ? (
            <div className="text-sm text-red-600">{err}</div>
          ) : !rootNode ? (
            <div className="text-sm text-gray-500">스레드 루트를 찾을 수 없습니다.</div>
          ) : (
            <>
              {/* root message */}
              <div className="pb-4 border-b">
                <CommentItem node={{ ...rootNode, children: [] }} onChanged={() => { fetchThread(); onChanged(); }} />
              </div>

              {/* replies */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">답글</div>
                <div className="text-xs text-gray-400">{replyCount}개</div>
              </div>

              <div className="mt-3 space-y-4">
                {replies.length === 0 ? (
                  <div className="text-sm text-gray-500">첫 답글을 남겨보세요.</div>
                ) : (
                  replies.map((r) => (
                    <CommentItem
                      key={r.id}
                      node={{ ...r, children: [] }}
                      onChanged={() => {
                        fetchThread();
                        onChanged();
                      }}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* composer */}
        <div className="px-5 py-4 border-t">
          <CommentEditor
            placeholder="답글을 입력하세요"
            submitLabel="등록"
            onSubmit={addReply}
            disabled={!me}
          />
        </div>
      </div>
    </div>
  );
};

export default CommentThreadPanel;
