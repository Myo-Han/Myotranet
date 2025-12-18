export type UserMini = {
  id: string;
  name: string | null;
  profile_picture: string | null;
  department?: string | null;
  project?: string | null;
  part?: string | null;
  position?: string | null;
};

export type NoticeComment = {
  id: string;
  notice_id: number;
  user_id: string;
  parent_id: string | null;
  content: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentNode = NoticeComment & {
  author?: UserMini | null;
  children: CommentNode[];
};

export type ReactionEmoji = {
  id: string;
  key: string;
  kind: 'unicode' | 'image';
  unicode: string | null;
  storage_path: string | null;
  mime_type: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ReactionAgg = {
  emojiId: string;
  count: number;
  mine: boolean;
};
