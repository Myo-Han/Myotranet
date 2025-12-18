import React, { useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import type { CommentNode } from './types';
import { buildAffiliation, formatKoreanDateTimeYY } from './utils';
import CommentEditor from './CommentEditor';
import CommentReactionBar from './CommentReactionBar';

type Props = {
  node: CommentNode;
  onChanged: () => void;
  onOpenThread?: () => void;
};

const CommentItem: React.FC<Props> = ({ node, onChanged, onOpenThread }) => {
  const { user } = useAuth();
  const me = user?.id ?? null;

  const [editing, setEditing] = useState(false);

  const isMine = useMemo(() => !!me && node.user_id === me, [me, node.user_id]);

  const authorName = node.author?.name ?? '(이름 없음)';
  const affiliation = buildAffiliation(node.author ?? {});
  const timeText = formatKoreanDateTimeYY(node.created_at);

  const hardDelete = async () => {
    if (!isMine) return;
    if (!window.confirm('삭제할까요?')) return;

    await supabase
      .from('notice_comments')
      .delete()
      .eq('id', node.id);

    onChanged();
  };

  const update = async (content: string) => {
    if (!isMine) return;

    await supabase
      .from('notice_comments')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', node.id);

    setEditing(false);
    onChanged();
  };

  return (
    <div className="w-full">
      <div className="flex gap-3">
        <div className="w-9 flex justify-center">
          <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
            {node.author?.profile_picture ? (
              <img src={node.author.profile_picture} alt={authorName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-gray-400">N/A</span>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <div className="text-sm font-semibold text-gray-900 truncate">{authorName}</div>
                {affiliation && <div className="text-xs text-gray-500 truncate">{affiliation}</div>}
                <div className="text-xs text-gray-400">{timeText}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!node.is_deleted && onOpenThread && (
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-800"
                  onClick={onOpenThread}
                >
                  답글 {node.children.length}개
                </button>
              )}

              {isMine && !node.is_deleted && (
                <>
                  <button
                    type="button"
                    className="text-xs text-gray-500 hover:text-gray-800"
                    onClick={() => setEditing((v) => !v)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:text-red-700"
                    onClick={hardDelete}
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-1 text-sm text-gray-800 whitespace-pre-line">
            {node.is_deleted ? <span className="text-gray-400">삭제된 댓글입니다.</span> : node.content}
          </div>

          {/* 댓글 리액션 */}
          {!node.is_deleted && (
            <div className="mt-1">
              <CommentReactionBar commentId={node.id} />
            </div>
          )}

          {/* 수정 */}
          {editing && !node.is_deleted && (
            <div className="mt-2">
              <CommentEditor
                initialValue={node.content}
                submitLabel="저장"
                cancelLabel="취소"
                onCancel={() => setEditing(false)}
                onSubmit={update}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommentItem;
