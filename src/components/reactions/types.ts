export type ReactionEmoji = {
  id: string;
  key: string;
  kind: 'unicode' | 'image';
  unicode: string | null;
  storage_path: string | null;
  mime_type: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ReactionAgg = {
  emojiId: string;
  count: number;
  mine: boolean;
};
