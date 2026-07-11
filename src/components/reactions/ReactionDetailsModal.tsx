import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import type { ReactionEmoji } from './types';

type UserRow = {
  id: string;
  name: string | null;
  profile_picture: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  noticeId: number;
  entityType?: 'notice' | 'post';
  emoji: ReactionEmoji;
};

const ReactionDetailsModal: React.FC<Props> = ({ open, onClose, noticeId, entityType = 'notice', emoji }) => {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const title = useMemo(() => {
    if (emoji.kind === 'unicode') return emoji.unicode ?? '이모지';
    return emoji.key;
  }, [emoji]);

  useEffect(() => {
    if (!open) return;

    const run = async () => {
      setLoading(true);
      setErr(null);
      setUsers([]);

      const { data: rows, error: rErr } = await supabase
        .from('notice_reactions')
        .select('user_id, created_at')
        .eq('notice_id', noticeId)
        .eq('entity_type', entityType)
        .eq('emoji_id', emoji.id)
        .order('created_at', { ascending: true });

      if (rErr) {
        setErr(rErr.message);
        setLoading(false);
        return;
      }

      const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
      if (userIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: uRows, error: uErr } = await supabase
        .from('users')
        .select('id, name, profile_picture')
        .in('id', userIds);

      if (uErr) {
        setErr(uErr.message);
        setLoading(false);
        return;
      }

      // 원래 반응 순서대로 정렬
      const byId = new Map((uRows ?? []).map((u: any) => [u.id, u]));
      const ordered = userIds.map((id) => byId.get(id)).filter(Boolean) as UserRow[];

      setUsers(ordered);
      setLoading(false);
    };

    run();
  }, [open, noticeId, entityType, emoji.id]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-lg">
              {emoji.kind === 'unicode' ? (
                <span>{emoji.unicode}</span>
              ) : emoji.storage_path ? (
                <img
                  src={supabase.storage.from('emoji-assets').getPublicUrl(emoji.storage_path).data.publicUrl}
                  alt={emoji.key}
                  className="w-5 h-5 object-contain"
                />
              ) : null}
            </div>
            <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-sm rounded-md hover:bg-gray-100"
          >
            닫기
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="text-sm text-gray-500">불러오는 중...</div>
          ) : err ? (
            <div className="text-sm text-red-600">{err}</div>
          ) : users.length === 0 ? (
            <div className="text-sm text-gray-500">아직 반응한 사람이 없습니다.</div>
          ) : (
            <ul className="space-y-2 max-h-[360px] overflow-y-auto">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
                    {u.profile_picture ? (
                      <img src={u.profile_picture} alt={u.name ?? 'user'} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-800">{u.name ?? '(이름 없음)'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReactionDetailsModal;
