import React, { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import type { ReactionAgg, ReactionEmoji } from './types';

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
  emojis: ReactionEmoji[];
  aggs: ReactionAgg[];
  onToggle: (emojiId: string, mine: boolean) => void;
};

const ReactionPickerPopover: React.FC<Props> = ({ open, onClose, anchorRect, emojis, aggs, onToggle }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const aggById = useMemo(() => {
    const m = new Map<string, ReactionAgg>();
    aggs.forEach((a) => m.set(a.emojiId, a));
    return m;
  }, [aggs]);

  const pos = useMemo(() => {
    if (!anchorRect) return { top: 0, left: 0 };
    const padding = 8;
    const width = 300;
    const height = 240;

    const left = Math.min(window.innerWidth - width - padding, Math.max(padding, anchorRect.left));
    const top = Math.min(window.innerHeight - height - padding, Math.max(padding, anchorRect.bottom + 8));
    return { top, left };
  }, [anchorRect]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="absolute bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
        style={{ top: pos.top, left: pos.left, width, height }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">리액션</div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-sm rounded-md hover:bg-gray-100"
          >
            닫기
          </button>
        </div>

        <div className="p-3 overflow-y-auto h-[calc(240px-52px)]">
          <div className="grid grid-cols-6 gap-2">
            {emojis.filter(e => e.is_active).map((e) => {
              const agg = aggById.get(e.id);
              const mine = !!agg?.mine;
              const count = agg?.count ?? 0;

              const icon =
                e.kind === 'unicode' ? (
                  <span className="text-lg">{e.unicode}</span>
                ) : e.storage_path ? (
                  <img
                    src={supabase.storage.from('emoji-assets').getPublicUrl(e.storage_path).data.publicUrl}
                    alt={e.key}
                    className="w-5 h-5 object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400">N/A</span>
                );

              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onToggle(e.id, mine)}
                  className={`relative w-12 h-12 rounded-md border flex items-center justify-center hover:bg-gray-50 ${mine ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'
                    }`}
                  title={e.key}
                >
                  {icon}
                  {count > 0 && (
                    <span className="absolute -right-1 -bottom-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-white">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReactionPickerPopover;
