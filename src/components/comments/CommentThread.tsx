import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import type { CommentNode, NoticeComment, UserMini } from './types';
import CommentEditor from './CommentEditor';
import CommentItem from './CommentItem';
import CommentThreadPanel from './CommentThreadPanel';

type Props = {
  noticeId: number;
};

function buildTree(comments: (NoticeComment & { author?: UserMini | null })[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  comments.forEach((c) => {
    byId.set(c.id, { ...c, author: (c as any).author ?? null, children: [] });
  });

  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortRec = (arr: CommentNode[]) => {
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
}

const CommentThread: React.FC<Props> = ({ noticeId }) => {
  const { user } = useAuth();
  const me = user?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [threadRoot, setThreadRoot] = useState<CommentNode | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);

  const fetchComments = async () => {
    setLoading(true);
    setErr(null);

    const { data: cRows, error: cErr } = await supabase
      .from('notice_comments')
      .select('*')
      .eq('notice_id', noticeId)
      .order('created_at', { ascending: true });

    if (cErr) {
      setErr(cErr.message);
      setLoading(false);
      return;
    }

    const rows = (cRows as NoticeComment[]) ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

    let users: UserMini[] = [];
    if (userIds.length > 0) {
      const { data: uRows } = await supabase
        .from('users')
        .select('id, name, profile_picture, department, project, part, position')
        .in('id', userIds);

      users = (uRows as any as UserMini[]) ?? [];
    }

    const byId = new Map(users.map((u) => [u.id, u]));
    const enriched = rows.map((r) => ({ ...r, author: byId.get(r.user_id) ?? null }));

    setComments(buildTree(enriched));
    setLoading(false);
  };

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId]);

  const totalCount = useMemo(() => {
    const flatten = (nodes: CommentNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + flatten(n.children), 0);
    return flatten(comments);
  }, [comments]);

  const addRoot = async (content: string) => {
    if (!me) return;

    await supabase.from('notice_comments').insert({
      notice_id: noticeId,
      user_id: me,
      parent_id: null,
      content,
    });

    await fetchComments();
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">댓글</div>
        <div className="text-xs text-gray-400">{totalCount}개</div>
      </div>

      <div className="mt-2">
        <CommentEditor placeholder="댓글을 입력하세요" submitLabel="등록" onSubmit={addRoot} />
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-gray-500">불러오는 중...</div>
        ) : err ? (
          <div className="text-sm text-red-600">{err}</div>
        ) : comments.length === 0 ? (
          <div className="text-sm text-gray-500">첫 댓글을 남겨보세요.</div>
        ) : (
          <>
            <div className="space-y-4">
              {comments.map((n) => (
                <CommentItem
                  key={n.id}
                  node={n}
                  onChanged={fetchComments}
                  onOpenThread={() => {
                    setThreadRoot(n);
                    setThreadOpen(true);
                  }}
                />
              ))}
            </div>

            {threadRoot && (
              <CommentThreadPanel
                open={threadOpen}
                onClose={() => setThreadOpen(false)}
                root={threadRoot}
                onChanged={fetchComments}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CommentThread;
