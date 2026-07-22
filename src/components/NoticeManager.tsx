import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface Notice {
    id: number;
    title: string;
    content: string;
    is_pinned: boolean;
    created_at: string;
}

const NoticeManager: React.FC = () => {
    const [notices, setNotices] = useState<Notice[]>([]);
    const [editingNotice, setEditingNotice] = useState<Notice | null>(null);

    useEffect(() => {
        fetchNotices();
    }, []);

    const fetchNotices = async () => {
        const { data, error } = await supabase
            .from('notices')
            .select('id, title, content, is_pinned, created_at')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (!error && data) {
            setNotices(data as Notice[]);
        }
    };

    const handleNewNotice = () => {
        setEditingNotice({
            id: 0,
            title: '',
            content: '',
            is_pinned: false,
            created_at: new Date().toISOString(),
        });
    };

    const handleSaveNotice = async () => {
        if (!editingNotice) return;
        if (!editingNotice.title.trim()) return;

        if (editingNotice.id) {
            // 수정
            const { data, error } = await supabase
                .from('notices')
                .update({
                    title: editingNotice.title,
                    content: editingNotice.content,
                    is_pinned: editingNotice.is_pinned,
                })
                .eq('id', editingNotice.id)
                .select('id, title, content, is_pinned, created_at')
                .single();

            if (!error && data) {
                setNotices(prev =>
                    prev.map(n => (n.id === data.id ? (data as Notice) : n)),
                );
                setEditingNotice(null);
            }
        } else {
            // 새 공지
            const { data, error } = await supabase
                .from('notices')
                .insert({
                    title: editingNotice.title,
                    content: editingNotice.content,
                    is_pinned: editingNotice.is_pinned,
                })
                .select('id, title, content, is_pinned, created_at')
                .single();

            if (!error && data) {
                setNotices(prev => [data as Notice, ...prev]);
                setEditingNotice(null);
            }
        }
    };

    const handleDeleteNotice = async (id: number) => {
        const { error } = await supabase
            .from('notices')
            .delete()
            .eq('id', id);

        if (!error) {
            setNotices(prev => prev.filter(n => n.id !== id));
            if (editingNotice?.id === id) {
                setEditingNotice(null);
            }
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-medium text-gray-900">공지 관리</h2>
                    <p className="text-xs text-gray-500 mt-1">
                        공지를 생성, 수정, 삭제하고 상단 고정을 설정할 수 있습니다.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleNewNotice}
                    className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                    새 공지
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 공지 목록 */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-600">공지 목록</h3>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                        {notices.length === 0 ? (
                            <p className="text-xs text-gray-400">등록된 공지가 없습니다.</p>
                        ) : (
                            notices.map(notice => (
                                <div
                                    key={notice.id}
                                    onClick={() => setEditingNotice(notice)}
                                    className={`border rounded-md px-4 py-3 cursor-pointer transition ${editingNotice?.id === notice.id
                                        ? 'bg-blue-50 border-blue-300'
                                        : 'bg-white hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-semibold text-gray-900 truncate">
                                                    {notice.title}
                                                </h4>
                                                {notice.is_pinned && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                                        고정
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                {notice.content}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {new Date(notice.created_at).toLocaleDateString('ko-KR')}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={e => {
                                                e.stopPropagation();
                                                handleDeleteNotice(notice.id);
                                            }}
                                            className="ml-2 text-xs text-red-500 hover:text-red-700"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 공지 편집기 */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-600">
                        {editingNotice?.id ? '공지 수정' : '새 공지 작성'}
                    </h3>
                    {editingNotice ? (
                        <div className="border border-gray-200 rounded-md p-4 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    제목
                                </label>
                                <input
                                    type="text"
                                    value={editingNotice.title}
                                    onChange={e =>
                                        setEditingNotice({ ...editingNotice, title: e.target.value })
                                    }
                                    className="w-full rounded-md border-gray-300 text-sm"
                                    placeholder="공지 제목을 입력하세요"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    내용
                                </label>
                                <textarea
                                    value={editingNotice.content}
                                    onChange={e =>
                                        setEditingNotice({ ...editingNotice, content: e.target.value })
                                    }
                                    rows={8}
                                    className="w-full rounded-md border-gray-300 text-sm"
                                    placeholder="공지 내용을 입력하세요"
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    checked={editingNotice.is_pinned}
                                    onChange={e =>
                                        setEditingNotice({
                                            ...editingNotice,
                                            is_pinned: e.target.checked,
                                        })
                                    }
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                />
                                <label className="text-xs text-gray-600">상단 고정</label>
                            </div>
                            <div className="flex items-center justify-end space-x-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingNotice(null)}
                                    className="px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 text-xs font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveNotice}
                                    className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium"
                                >
                                    저장
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400">
                            왼쪽에서 공지를 선택하거나 &quot;새 공지&quot; 버튼으로 작성하면
                            여기에서 내용을 편집할 수 있습니다.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NoticeManager;