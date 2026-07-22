import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

interface Memo {
    id: number;
    user_id: string;
    title: string;
    content: string;
    color: string;
    created_at: string;
    updated_at: string;
}

const MemoManager: React.FC = () => {
    const { user } = useAuth();
    const [memos, setMemos] = useState<Memo[]>([]);
    const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const colors = [
        { name: '노란색', value: 'bg-yellow-100', border: 'border-yellow-300' },
        { name: '분홍색', value: 'bg-pink-100', border: 'border-pink-300' },
        { name: '파란색', value: 'bg-blue-100', border: 'border-blue-300' },
        { name: '초록색', value: 'bg-green-100', border: 'border-green-300' },
        { name: '보라색', value: 'bg-purple-100', border: 'border-purple-300' },
        { name: '주황색', value: 'bg-orange-100', border: 'border-orange-300' },
    ];

    useEffect(() => {
        if (user?.id) {
            fetchMemos();
        }
    }, [user?.id]);

    const fetchMemos = async () => {
        if (!user?.id) return;

        const { data, error } = await supabase
            .from('memos')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (!error && data) {
            setMemos(data as Memo[]);
        }
    };

    const handleNewMemo = () => {
        setEditingMemo({
            id: 0,
            user_id: user?.id || '',
            title: '',
            content: '',
            color: 'bg-yellow-100',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        setIsModalOpen(true);
    };

    const handleEditMemo = (memo: Memo) => {
        setEditingMemo(memo);
        setIsModalOpen(true);
    };

    const handleSaveMemo = async () => {
        if (!editingMemo || !user?.id) return;
        if (!editingMemo.title.trim()) {
            alert('제목을 입력하세요');
            return;
        }

        if (editingMemo.id) {
            // 수정
            const { data, error } = await supabase
                .from('memos')
                .update({
                    title: editingMemo.title,
                    content: editingMemo.content,
                    color: editingMemo.color,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingMemo.id)
                .select()
                .single();

            if (!error && data) {
                setMemos(prev =>
                    prev.map(m => (m.id === data.id ? (data as Memo) : m)),
                );
                setIsModalOpen(false);
                setEditingMemo(null);
            }
        } else {
            // 새 메모
            const { data, error } = await supabase
                .from('memos')
                .insert({
                    user_id: user.id,
                    title: editingMemo.title,
                    content: editingMemo.content,
                    color: editingMemo.color,
                })
                .select()
                .single();

            if (!error && data) {
                setMemos(prev => [data as Memo, ...prev]);
                setIsModalOpen(false);
                setEditingMemo(null);
            }
        }
    };

    const handleDeleteMemo = async (id: number) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;

        const { error } = await supabase
            .from('memos')
            .delete()
            .eq('id', id);

        if (!error) {
            setMemos(prev => prev.filter(m => m.id !== id));
            if (editingMemo?.id === id) {
                setIsModalOpen(false);
                setEditingMemo(null);
            }
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-medium text-gray-900">메모</h2>
                    <p className="text-xs text-gray-500 mt-1">
                        간단한 메모를 작성하고 관리하세요
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleNewMemo}
                    className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                    + 새 메모
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {memos.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <p className="text-gray-400 text-xs">작성된 메모가 없습니다</p>
                    </div>
                ) : (
                    memos.map(memo => (
                        <div
                            key={memo.id}
                            className={`${memo.color} border-2 ${colors.find(c => c.value === memo.color)?.border || 'border-yellow-300'
                                } rounded-lg p-4 cursor-pointer hover:shadow-lg transition`}
                            onClick={() => handleEditMemo(memo)}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <h3 className="text-base font-semibold text-gray-800 flex-1 truncate">
                                    {memo.title}
                                </h3>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteMemo(memo.id);
                                    }}
                                    className="text-gray-400 hover:text-red-600 ml-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-4 whitespace-pre-wrap">
                                {memo.content}
                            </p>
                            <p className="text-xs text-gray-400 mt-3">
                                {new Date(memo.updated_at).toLocaleString('ko-KR')}
                            </p>
                        </div>
                    ))
                )}
            </div>

            {/* 메모 편집 모달 */}
            {isModalOpen && editingMemo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {editingMemo.id ? '메모 수정' : '새 메모'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingMemo(null);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    제목
                                </label>
                                <input
                                    type="text"
                                    value={editingMemo.title}
                                    onChange={(e) =>
                                        setEditingMemo({ ...editingMemo, title: e.target.value })
                                    }
                                    className="w-full rounded-md border-gray-300 text-sm"
                                    placeholder="메모 제목을 입력하세요"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    내용
                                </label>
                                <textarea
                                    value={editingMemo.content}
                                    onChange={(e) =>
                                        setEditingMemo({ ...editingMemo, content: e.target.value })
                                    }
                                    rows={10}
                                    className="w-full rounded-md border-gray-300 text-sm"
                                    placeholder="메모 내용을 입력하세요"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    색상
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {colors.map((color) => (
                                        <button
                                            key={color.value}
                                            type="button"
                                            onClick={() =>
                                                setEditingMemo({ ...editingMemo, color: color.value })
                                            }
                                            className={`w-12 h-12 rounded-md ${color.value} border-2 ${editingMemo.color === color.value
                                                ? 'border-gray-800 ring-2 ring-gray-800'
                                                : color.border
                                                }`}
                                            title={color.name}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-3 border-t flex justify-end space-x-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingMemo(null);
                                }}
                                className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 text-sm font-medium"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveMemo}
                                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium"
                            >
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MemoManager;