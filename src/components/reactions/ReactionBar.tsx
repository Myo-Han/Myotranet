import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import type { ReactionAgg, ReactionEmoji } from './types';
import ReactionPickerPopover from './ReactionPickerPopover';
import ReactionDetailsModal from './ReactionDetailsModal';

const EMOJI_CACHE_KEY = 'reaction_emojis_active_v1';
const EMOJI_CACHE_TTL_MS = 1000 * 60 * 30; // 30분

type EmojiCachePayload = { ts: number; data: ReactionEmoji[] };

let inMemoryEmojiCache: EmojiCachePayload | null = null;

function loadEmojiCache(): ReactionEmoji[] | null {
    const now = Date.now();

    if (inMemoryEmojiCache && now - inMemoryEmojiCache.ts < EMOJI_CACHE_TTL_MS) {
        return inMemoryEmojiCache.data;
    }

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

type UserRow = { id: string; name: string | null };

type Props = {
    noticeId: number;
    limit?: number; // 기본 5
    currentUserId?: string; // 필요하면 외부에서 주입 가능
};

const ReactionBar: React.FC<Props> = ({ noticeId, limit = 5, currentUserId }) => {
    const { user } = useAuth();
    const me = currentUserId ?? user?.id ?? null;

    const [emojis, setEmojis] = useState<ReactionEmoji[]>([]);
    const [extraEmojis, setExtraEmojis] = useState<ReactionEmoji[]>([]);
    const [aggs, setAggs] = useState<ReactionAgg[]>([]);
    const [loading, setLoading] = useState(false);

    // hover tooltip
    const [hoverEmojiId, setHoverEmojiId] = useState<string | null>(null);
    const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null);
    const [hoverUsers, setHoverUsers] = useState<Record<string, { names: string[]; more: number }>>({});
    const hoverTimer = useRef<number | null>(null);
    const hoverCloseTimer = useRef<number | null>(null);

    // popover
    const [pickerOpen, setPickerOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const moreBtnRef = useRef<HTMLButtonElement | null>(null);

    // details modal
    const [detailsEmoji, setDetailsEmoji] = useState<ReactionEmoji | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);

        let activeList = loadEmojiCache();
        if (activeList) {
            setEmojis(activeList);
        } else {
            const { data: eData } = await supabase
                .from('reaction_emojis')
                .select('id, key, kind, unicode, storage_path, mime_type, sort_order, is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            activeList = (eData as ReactionEmoji[]) ?? [];
            setEmojis(activeList);
            saveEmojiCache(activeList);
        }

        setExtraEmojis([]);

        const { data: rData } = await supabase
            .from('notice_reactions')
            .select('emoji_id, user_id')
            .eq('notice_id', noticeId);

        const rows = (rData as any[]) ?? [];

        const usedIds = Array.from(new Set(rows.map((r) => r.emoji_id as string)));
        const activeIdSet = new Set(activeList.map((e) => e.id));
        const missingIds = usedIds.filter((id) => !activeIdSet.has(id));

        if (missingIds.length > 0) {
            const { data: mData } = await supabase
                .from('reaction_emojis')
                .select('id, key, kind, unicode, storage_path, mime_type, sort_order, is_active')
                .in('id', missingIds);

            setExtraEmojis((mData as ReactionEmoji[]) ?? []);
        }

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
    }, [noticeId, me]);

    useEffect(() => {
        fetchAll();

        if (typeof window === 'undefined') return;

        const onUpdated = () => {
            inMemoryEmojiCache = null;
            fetchAll();
        };

        const onStorage = (ev: StorageEvent) => {
            if (ev.key === EMOJI_CACHE_KEY) {
                inMemoryEmojiCache = null;
                fetchAll();
            }
        };

        window.addEventListener('reaction-emojis-updated', onUpdated);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener('reaction-emojis-updated', onUpdated);
            window.removeEventListener('storage', onStorage);
        };
    }, [fetchAll]);

    const emojiById = useMemo(() => {
        const m = new Map<string, ReactionEmoji>();
        [...emojis, ...extraEmojis].forEach((e) => m.set(e.id, e));
        return m;
    }, [emojis, extraEmojis]);

    const displayAggs = useMemo(() => {
        // count 내림차순, 동률이면 sort_order
        const sortOrder = (id: string) => emojiById.get(id)?.sort_order ?? 999999;

        return aggs
            .filter((a) => a.count > 0)
            .slice()
            .sort((a, b) => (b.count - a.count) || (sortOrder(a.emojiId) - sortOrder(b.emojiId)));
    }, [aggs, emojiById]);

    const visibleAggs = displayAggs.slice(0, limit);
    const hasOverflow = displayAggs.length > limit;

    const openPicker = () => {
        const rect = moreBtnRef.current?.getBoundingClientRect() ?? null;
        setAnchorRect(rect);
        setPickerOpen(true);
    };

    const toggleReaction = async (emojiId: string, mine: boolean) => {
        if (!me) return;

        // optimistic update
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
                .from('notice_reactions')
                .delete()
                .eq('notice_id', noticeId)
                .eq('emoji_id', emojiId)
                .eq('user_id', me);

            if (error) await fetchAll();
        } else {
            const { error } = await supabase
                .from('notice_reactions')
                .insert({ notice_id: noticeId, emoji_id: emojiId, user_id: me });

            if (error) await fetchAll();
        }
    };

    const ensureHoverUsers = async (emojiId: string) => {
        if (hoverUsers[emojiId]) return;

        const { data: rData, error: rErr } = await supabase
            .from('notice_reactions')
            .select('user_id')
            .eq('notice_id', noticeId)
            .eq('emoji_id', emojiId)
            .limit(11); // 10명 + overflow 감지

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

        const byId = new Map<string, UserRow>((uData as any[] ?? []).map((u) => [u.id, u]));
        const names = sliceIds.map((id) => byId.get(id)?.name ?? '(이름 없음)');

        setHoverUsers((prev) => ({
            ...prev,
            [emojiId]: { names, more: overflow ? Math.max(0, userIds.length - 10) : 0 },
        }));
    };

    const renderEmojiIcon = (e: ReactionEmoji) => {
        if (e.kind === 'unicode') return <span className="text-base">{e.unicode}</span>;
        if (!e.storage_path) return <span className="text-xs text-gray-400">N/A</span>;

        const url = supabase.storage.from('emoji-assets').getPublicUrl(e.storage_path).data.publicUrl;
        return <img src={url} alt={e.key} className="w-7 h-7 object-contain" />;
    };

    return (
        <div className="mt-0">
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
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs hover:bg-gray-50 ${a.mine ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-700'
                                    }`}
                            >
                                {renderEmojiIcon(e)}
                                <span className="tabular-nums">{a.count}</span>
                            </button>

                            {/* hover tooltip */}
                            {hover && hoverAnchorRect && (
                                <div
                                    className="fixed z-[80] min-w-[220px] max-w-[280px] rounded-lg border border-gray-200 bg-white shadow-lg p-3"
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
                                                        setDetailsEmoji(e);
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

                {/* overflow / picker */}
                <button
                    ref={moreBtnRef}
                    type="button"
                    onClick={openPicker}
                    className="inline-flex items-center justify-center px-2 py-1 rounded-full border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                    title={hasOverflow ? '더 보기' : '리액션 추가'}
                    disabled={loading}
                >
                    {hasOverflow ? '…' : '+'}
                </button>
            </div>

            <ReactionPickerPopover
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                anchorRect={anchorRect}
                emojis={emojis}
                aggs={aggs}
                onToggle={(emojiId, mine) => toggleReaction(emojiId, mine)}
            />

            {detailsEmoji && (
                <ReactionDetailsModal
                    open={!!detailsEmoji}
                    onClose={() => setDetailsEmoji(null)}
                    noticeId={noticeId}
                    emoji={detailsEmoji}
                />
            )}
        </div>
    );
};

export default ReactionBar;
