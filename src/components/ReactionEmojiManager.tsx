import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

type ReactionEmoji = {
  id: string;
  key: string;
  kind: 'unicode' | 'image';
  unicode: string | null;
  storage_path: string | null;
  mime_type: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif']);

function getExtFromMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/jpeg') return 'jpg';
  return 'bin';
}

function safeRandomId() {
  // 브라우저 대부분 지원
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const ReactionEmojiManager: React.FC = () => {
  const [items, setItems] = useState<ReactionEmoji[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [newKind, setNewKind] = useState<'unicode' | 'image'>('unicode');
  const [newKey, setNewKey] = useState('');
  const [newUnicode, setNewUnicode] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);

  const maxOrder = useMemo(() => {
    return items.reduce((m, it) => Math.max(m, it.sort_order), 0);
  }, [items]);

  const fetchItems = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from('reaction_emojis')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) setErrorMsg(error.message);
    setItems((data as ReactionEmoji[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('emoji-assets').getPublicUrl(path);
    return data.publicUrl;
  };

  const addEmoji = async () => {
    setErrorMsg(null);

    const key = newKey.trim();
    if (!key) {
      setErrorMsg('key를 입력해주세요.');
      return;
    }

    const nextOrder = items.length === 0 ? 0 : maxOrder + 1;

    setSaving(true);
    try {
      if (newKind === 'unicode') {
        const unicode = newUnicode.trim();
        if (!unicode) {
          setErrorMsg('유니코드 이모지를 입력해주세요.');
          return;
        }

        const { error } = await supabase.from('reaction_emojis').insert({
          key,
          kind: 'unicode',
          unicode,
          storage_path: null,
          mime_type: null,
          sort_order: nextOrder,
          is_active: true,
        });

        if (error) throw error;
      } else {
        if (!newFile) {
          setErrorMsg('이미지 파일을 선택해주세요.');
          return;
        }
        if (!ALLOWED_MIME.has(newFile.type)) {
          setErrorMsg('허용 타입: PNG / JPG(JPEG) / GIF');
          return;
        }

        const ext = getExtFromMime(newFile.type);
        const storagePath = `emoji/${safeRandomId()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('emoji-assets')
          .upload(storagePath, newFile, {
            contentType: newFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from('reaction_emojis').insert({
          key,
          kind: 'image',
          unicode: null,
          storage_path: storagePath,
          mime_type: newFile.type,
          sort_order: nextOrder,
          is_active: true,
        });

        if (insertError) throw insertError;
      }

      setNewKey('');
      setNewUnicode('');
      setNewFile(null);
      await fetchItems();
    } catch (e: any) {
      setErrorMsg(e?.message ?? '추가 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (it: ReactionEmoji) => {
    setErrorMsg(null);
    const next = !it.is_active;

    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, is_active: next } : x)));

    const { error } = await supabase
      .from('reaction_emojis')
      .update({ is_active: next })
      .eq('id', it.id);

    if (error) {
      setErrorMsg(error.message);
      await fetchItems();
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    setErrorMsg(null);
    const j = index + dir;
    if (j < 0 || j >= items.length) return;

    const a = items[index];
    const b = items[j];

    // UI 먼저 반영
    const nextItems = [...items];
    nextItems[index] = { ...b, sort_order: a.sort_order };
    nextItems[j] = { ...a, sort_order: b.sort_order };
    // sort_order 기준 다시 정렬
    nextItems.sort((x, y) => x.sort_order - y.sort_order);
    setItems(nextItems);

    const { error: e1 } = await supabase
      .from('reaction_emojis')
      .update({ sort_order: b.sort_order })
      .eq('id', a.id);

    const { error: e2 } = await supabase
      .from('reaction_emojis')
      .update({ sort_order: a.sort_order })
      .eq('id', b.id);

    if (e1 || e2) {
      setErrorMsg((e1 || e2)?.message ?? '순서 변경 실패');
      await fetchItems();
    }
  };

  const remove = async (it: ReactionEmoji) => {
    if (!window.confirm(`삭제할까요? (${it.key})`)) return;

    setErrorMsg(null);
    setSaving(true);
    try {
      // 이미지면 스토리지도 같이 삭제(권한 있어야 성공)
      if (it.kind === 'image' && it.storage_path) {
        await supabase.storage.from('emoji-assets').remove([it.storage_path]);
      }

      const { error } = await supabase.from('reaction_emojis').delete().eq('id', it.id);
      if (error) throw error;

      await fetchItems();
    } catch (e: any) {
      setErrorMsg(e?.message ?? '삭제 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">리액션 이모지 관리</h2>
          <p className="text-xs text-gray-500 mt-1">추가/삭제/활성/순서만 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={fetchItems}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-300 hover:bg-gray-50"
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      {/* Add */}
      <div className="border rounded-lg p-3 mb-4 bg-gray-50">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newKind}
            onChange={e => {
              const v = e.target.value as 'unicode' | 'image';
              setNewKind(v);
              setErrorMsg(null);
            }}
            className="rounded-md border-gray-300 text-sm"
          >
            <option value="unicode">유니코드</option>
            <option value="image">이미지(PNG/JPG/GIF)</option>
          </select>

          <input
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="key (unique)"
            className="rounded-md border-gray-300 text-sm px-3 py-2 w-56"
          />

          {newKind === 'unicode' ? (
            <input
              value={newUnicode}
              onChange={e => setNewUnicode(e.target.value)}
              placeholder="이모지 (예: 👍)"
              className="rounded-md border-gray-300 text-sm px-3 py-2 w-40"
            />
          ) : (
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif"
              onChange={e => setNewFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          )}

          <button
            type="button"
            onClick={addEmoji}
            disabled={saving}
            className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            추가
          </button>
        </div>

        {errorMsg && <div className="mt-2 text-xs text-red-600">{errorMsg}</div>}
      </div>

      {/* List */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-white">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">불러오는 중...</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">등록된 이모지가 없습니다.</div>
          ) : (
            <ul className="divide-y">
              {items
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((it, idx) => (
                  <li key={it.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
                        {it.kind === 'unicode' ? (
                          <span className="text-2xl">{it.unicode}</span>
                        ) : it.storage_path ? (
                          <img
                            src={getPublicUrl(it.storage_path)}
                            alt={it.key}
                            className="w-8 h-8 object-contain"
                          />
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{it.key}</div>
                        <div className="text-xs text-gray-500">
                          {it.kind}
                          {it.kind === 'image' && it.mime_type ? ` · ${it.mime_type}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(it)}
                        className={`px-2 py-1 rounded-md text-xs border ${
                          it.is_active
                            ? 'border-green-300 text-green-700 bg-green-50'
                            : 'border-gray-300 text-gray-600 bg-white'
                        }`}
                      >
                        {it.is_active ? '활성' : '비활성'}
                      </button>

                      <button
                        type="button"
                        onClick={() => move(idx, -1)}
                        className="px-2 py-1 rounded-md text-xs border border-gray-300 hover:bg-gray-50"
                        disabled={idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(idx, 1)}
                        className="px-2 py-1 rounded-md text-xs border border-gray-300 hover:bg-gray-50"
                        disabled={idx === items.length - 1}
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(it)}
                        className="px-2 py-1 rounded-md text-xs border border-red-300 text-red-700 hover:bg-red-50"
                        disabled={saving}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReactionEmojiManager;
