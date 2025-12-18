import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import type { ReactionAgg, ReactionEmoji } from './types';
import CommentReactionDetailsModal from './CommentReactionDetailsModal';

const EMOJI_CACHE_KEY = 'reaction_emojis_active_v1';
const EMOJI_CACHE_TTL_MS = 1000 * 60 * 30; // 30분
type EmojiCachePayload = { ts: number; data: ReactionEmoji[] };
let inMemoryEmojiCache: EmojiCachePayload | null = null;

function loadEmojiCache(): ReactionEmoji[] | null {
  const now = Date.now();
  if (inMemoryEmojiCache && now - inMemoryEmojiCache.ts < EMOJI_CACHE_TTL_MS) return inMemoryEmojiCache.data;
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(EMOJI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EmojiCachePayload;
    if (!parsed?.ts || !Array.isArray(parsed.data)) return null;
    if (now - parsed.ts >= EMOJI_CACHE_TTL_MS) return null;
    inMemoryEmojiCache = parsed;
    return parsed.data;
  } catch {
    return null;
  }
}

function saveEmojiCache(data: ReactionEmoji[]) {
  const payload: EmojiCachePayload = { ts: Date.now(), data };
  inMemoryEmojiCache = payload;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EMOJI_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

type Props = {
  commentId: string;
  limit?: number; // 기본 5
};

const CommentReactionBar: React.FC<Props> = ({ commentId, limit = 5 }) => {
  const { user } = useAuth();
  const me = user?.id ?? null;

  const [emojis, setEmojis] = useState<ReactionEmoji[]>([]);
  const [aggs, setAggs] = useState<ReactionAgg[]>([]);
  const [loading, setLoading] = useState(false);

  // hover tooltip
  const [hoverEmojiId, setHoverEmojiId] = useState<string | null>(null);
  const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null);
  const [hoverUsers, setHoverUsers] = useState<Record<string, { names: string[]; more: number }>>({});
  const hoverTimer = useRef<number | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);

  // details modal
  const [detailsEmoji, setDetailsEmoji] = useState<ReactionEmoji | null>(null);

  const fetchAll = async () => {
    setLoading(true);

    const cached = loadEmojiCache();
    if (cached) {
      setEmojis(cached);
    } else {
      const { data: eData } = await supabase
        .from('reaction_emojis')
        .select('id, key, kind, unicode, storage_path, mime_type, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const list = (eData as ReactionEmoji[]) ?? [];
      setEmojis(list);
      saveEmojiCache(list);
    }

    const { data: rData } = await supabase
      .from('comment_reactions')
      .select('emoji_id, user_id')
      .eq('comment_id', commentId);

    const rows = (rData as any[]) ?? [];

    const cnt = new Map<string, number>();
    const mine = new Set<string>();

    for (const r of rows) {
      const eid = r.emoji_id as string;
      cnt.set(eid, (cnt.get(eid) ?? 0) + 1);
      if (me && r.user_id === me) mine.add(eid);
    }

    const nextAggs: ReactionAgg[] = Array.from(cnt.entries()).map(([emojiId, count]) => ({
      emojiId,
      count,
      mine: mine.has(emojiId),
    }));

    setAggs(nextAggs);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentId, me]);

  const emojiById = useMemo(() => {
    const m = new Map<string, ReactionEmoji>();
    emojis.forEach((e) => m.set(e.id, e));
    return m;
  }, [emojis]);

  const displayAggs = useMemo(() => {
    const sortOrder = (id: string) => emojiById.get(id)?.sort_order ?? 999999;
    return aggs
      .filter((a) => a.count > 0 && emojiById.has(a.emojiId))
      .slice()
      .sort((a, b) => (b.count - a.count) || (sortOrder(a.emojiId) - sortOrder(b.emojiId)));
  }, [aggs, emojiById]);

  const visibleAggs = displayAggs.slice(0, limit);
  const hasOverflow = displayAggs.length > limit;

  const toggleReaction = async (emojiId: string, mine: boolean) => {
    if (!me) return;

    setAggs((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((x) => x.emojiId === emojiId);
      if (idx >= 0) {
        const cur = next[idx];
        const nextCount = mine ? Math.max(0, cur.count - 1) : cur.count + 1;
        next[idx] = { ...cur, count: nextCount, mine: !mine };
      } else {
        next.push({ emojiId, count: 1, mine: true });
      }
      return next.filter((x) => x.count > 0);
    });

    if (mine) {
      const { error } = await supabase
        .from('comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('emoji_id', emojiId)
        .eq('user_id', me);

      if (error) await fetchAll();
    } else {
      const { error } = await supabase
        .from('comment_reactions')
        .insert({ comment_id: commentId, emoji_id: emojiId, user_id: me });

      if (error) await fetchAll();
    }
  };

  const ensureHoverUsers = async (emojiId: string) => {
    if (hoverUsers[emojiId]) return;

    const { data: rData, error: rErr } = await supabase
      .from('comment_reactions')
      .select('user_id')
      .eq('comment_id', commentId)
      .eq('emoji_id', emojiId)
      .limit(11);

    if (rErr) return;

    const userIds = Array.from(new Set(((rData as any[]) ?? []).map((r) => r.user_id).filter(Boolean)));
    const overflow = userIds.length > 10;
    const sliceIds = userIds.slice(0, 10);

    if (sliceIds.length === 0) {
      setHoverUsers((prev) => ({ ...prev, [emojiId]: { names: [], more: 0 } }));
      return;
    }

    const { data: uData } = await supabase
      .from('users')
      .select('id, name')
      .in('id', sliceIds);

    const byId = new Map<string, any>((uData as any[] ?? []).map((u) => [u.id, u]));
    const names = sliceIds.map((id) => byId.get(id)?.name ?? '(이름 없음)');

    setHoverUsers((prev) => ({
      ...prev,
      [emojiId]: { names, more: overflow ? Math.max(0, userIds.length - 10) : 0 },
    }));
  };

  const renderEmojiIcon = (e: ReactionEmoji) => {
    if (e.kind === 'unicode') return <span className="text-sm">{e.unicode}</span>;
    if (!e.storage_path) return <span className="text-[10px] text-gray-400">N/A</span>;
    const url = supabase.storage.from('emoji-assets').getPublicUrl(e.storage_path).data.publicUrl;
    return <img src={url} alt={e.key} className="w-4 h-4 object-contain" />;
  };

  const openDetails = (emojiId: string) => {
    const e = emojiById.get(emojiId);
    if (!e) return;
    setDetailsEmoji(e);
  };

  return (
    <div className="mt-1">
      <div className="flex items-center flex-wrap gap-2">
        {visibleAggs.map((a) => {
          const e = emojiById.get(a.emojiId);
          if (!e) return null;

          const hover = hoverEmojiId === a.emojiId;
          const hoverData = hoverUsers[a.emojiId];

          return (
            <div key={a.emojiId} className="relative">
              <button
                type="button"
                onClick={() => toggleReaction(a.emojiId, a.mine)}
                onMouseEnter={(ev) => {
                  if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                  if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
                  setHoverEmojiId(a.emojiId);
                  setHoverAnchorRect((ev.currentTarget as HTMLButtonElement).getBoundingClientRect());
                  hoverTimer.current = window.setTimeout(() => ensureHoverUsers(a.emojiId), 120);
                }}
                onMouseLeave={() => {
                  if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                  if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
                  hoverCloseTimer.current = window.setTimeout(() => {
                    setHoverEmojiId(null);
                    setHoverAnchorRect(null);
                  }, 150);
                }}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] hover:bg-gray-50 ${
                  a.mine ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {renderEmojiIcon(e)}
                <span className="tabular-nums">{a.count}</span>
              </button>

              {hover && hoverAnchorRect && (
                <div
                  className="fixed z-[95] min-w-[220px] max-w-[280px] rounded-lg border border-gray-200 bg-white shadow-lg p-3"
                  style={{
                    top: Math.min(window.innerHeight - 8, hoverAnchorRect.bottom + 8),
                    left: Math.min(window.innerWidth - 288 - 8, Math.max(8, hoverAnchorRect.left)),
                  }}
                  onMouseEnter={() => {
                    if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
                  }}
                  onMouseLeave={() => {
                    if (hoverCloseTimer.current) window.clearTimeout(hoverCloseTimer.current);
                    hoverCloseTimer.current = window.setTimeout(() => {
                      setHoverEmojiId(null);
                      setHoverAnchorRect(null);
                    }, 150);
                  }}
                >
                  {!hoverData ? (
                    <div className="text-xs text-gray-500">불러오는 중...</div>
                  ) : hoverData.names.length === 0 ? (
                    <div className="text-xs text-gray-500">아직 없음</div>
                  ) : (
                    <>
                      <div className="text-xs text-gray-700 break-words">
                        {hoverData.names.join(', ')}
                        {hoverData.more > 0 ? ` 외 ${hoverData.more}명` : ''}
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openDetails(a.emojiId);
                          }}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          모두 보기
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* 간단형: overflow면 …, 아니면 + (전체 피커는 다음 단계에서 추가) */}
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            // 여기서 전체 피커 붙이고 싶으면 ReactionPickerPopover 재사용하시면 됩니다.
          }}
          className="inline-flex items-center justify-center px-2 py-1 rounded-full border border-gray-200 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          title={hasOverflow ? '더 보기' : '리액션 추가'}
        >
          {hasOverflow ? '…' : '+'}
        </button>
      </div>

      {detailsEmoji && (
        <CommentReactionDetailsModal
          open={!!detailsEmoji}
          onClose={() => setDetailsEmoji(null)}
          commentId={commentId}
          emoji={detailsEmoji}
        />
      )}
    </div>
  );
};

export default CommentReactionBar;
