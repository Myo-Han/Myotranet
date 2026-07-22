import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

interface Todo {
    id: number;
    user_id: string;
    title: string;
    description: string;
    is_completed: boolean;
    priority: 'low' | 'medium' | 'high';
    due_date: string | null;
    created_at: string;
    updated_at: string;
}

const TodoManager: React.FC = () => {
    const { user } = useAuth();
    const [todos, setTodos] = useState<Todo[]>([]);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

    useEffect(() => {
        if (user?.id) {
            fetchTodos();
        }
    }, [user?.id]);

    const fetchTodos = async () => {
        if (!user?.id) return;

        const { data, error } = await supabase
            .from('todos')
            .select('*')
            .eq('user_id', user.id)
            .order('is_completed', { ascending: true })
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (!error && data) {
            setTodos(data as Todo[]);
        }
    };

    const handleNewTodo = () => {
        setEditingTodo({
            id: 0,
            user_id: user?.id || '',
            title: '',
            description: '',
            is_completed: false,
            priority: 'medium',
            due_date: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        setIsModalOpen(true);
    };

    const handleEditTodo = (todo: Todo) => {
        setEditingTodo(todo);
        setIsModalOpen(true);
    };

    const handleSaveTodo = async () => {
        if (!editingTodo || !user?.id) return;
        if (!editingTodo.title.trim()) {
            alert('제목을 입력하세요');
            return;
        }

        if (editingTodo.id) {
            // 수정
            const { data, error } = await supabase
                .from('todos')
                .update({
                    title: editingTodo.title,
                    description: editingTodo.description,
                    priority: editingTodo.priority,
                    due_date: editingTodo.due_date,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingTodo.id)
                .select()
                .single();

            if (!error && data) {
                setTodos(prev =>
                    prev.map(t => (t.id === data.id ? (data as Todo) : t)),
                );
                setIsModalOpen(false);
                setEditingTodo(null);
            }
        } else {
            // 새 할 일
            const { data, error } = await supabase
                .from('todos')
                .insert({
                    user_id: user.id,
                    title: editingTodo.title,
                    description: editingTodo.description,
                    priority: editingTodo.priority,
                    due_date: editingTodo.due_date,
                })
                .select()
                .single();

            if (!error && data) {
                setTodos(prev => [data as Todo, ...prev]);
                setIsModalOpen(false);
                setEditingTodo(null);
            }
        }
    };

    const handleToggleComplete = async (todo: Todo) => {
        const { data, error } = await supabase
            .from('todos')
            .update({
                is_completed: !todo.is_completed,
                updated_at: new Date().toISOString(),
            })
            .eq('id', todo.id)
            .select()
            .single();

        if (!error && data) {
            setTodos(prev =>
                prev.map(t => (t.id === data.id ? (data as Todo) : t)),
            );
        }
    };

    const handleDeleteTodo = async (id: number) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;

        const { error } = await supabase
            .from('todos')
            .delete()
            .eq('id', id);

        if (!error) {
            setTodos(prev => prev.filter(t => t.id !== id));
            if (editingTodo?.id === id) {
                setIsModalOpen(false);
                setEditingTodo(null);
            }
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high':
                return 'bg-red-100 text-red-800 border-red-300';
            case 'medium':
                return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            case 'low':
                return 'bg-green-100 text-green-800 border-green-300';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'high':
                return '높음';
            case 'medium':
                return '보통';
            case 'low':
                return '낮음';
            default:
                return '보통';
        }
    };

    const filteredTodos = todos.filter(todo => {
        if (filter === 'active') return !todo.is_completed;
        if (filter === 'completed') return todo.is_completed;
        return true;
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-medium text-gray-900">할 일 목록</h2>
                    <p className="text-xs text-gray-500 mt-1">
                        할 일을 추가하고 완료 상태를 관리하세요
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleNewTodo}
                    className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                    + 새 할 일
                </button>
            </div>

            {/* 필터 탭 */}
            <div className="flex items-center space-x-2 border-b border-gray-200">
                <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition ${filter === 'all'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    전체 ({todos.length})
                </button>
                <button
                    type="button"
                    onClick={() => setFilter('active')}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition ${filter === 'active'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    진행 중 ({todos.filter(t => !t.is_completed).length})
                </button>
                <button
                    type="button"
                    onClick={() => setFilter('completed')}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition ${filter === 'completed'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    완료됨 ({todos.filter(t => t.is_completed).length})
                </button>
            </div>

            <div className="space-y-2">
                {filteredTodos.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-400 text-xs">
                            {filter === 'all' && '할 일이 없습니다'}
                            {filter === 'active' && '진행 중인 할 일이 없습니다'}
                            {filter === 'completed' && '완료된 할 일이 없습니다'}
                        </p>
                    </div>
                ) : (
                    filteredTodos.map(todo => (
                        <div
                            key={todo.id}
                            className={`bg-white border border-gray-200 rounded-md p-3.5 hover:shadow-sm transition ${todo.is_completed ? 'opacity-60' : ''
                                }`}
                        >
                            <div className="flex items-start space-x-3">
                                <input
                                    type="checkbox"
                                    checked={todo.is_completed}
                                    onChange={() => handleToggleComplete(todo)}
                                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h3
                                                className={`text-sm font-medium ${todo.is_completed
                                                    ? 'line-through text-gray-400'
                                                    : 'text-gray-800'
                                                    }`}
                                            >
                                                {todo.title}
                                            </h3>
                                            {todo.description && (
                                                <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">
                                                    {todo.description}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-2 mt-2">
                                                <span
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${getPriorityColor(
                                                        todo.priority,
                                                    )}`}
                                                >
                                                    {getPriorityLabel(todo.priority)}
                                                </span>
                                                {todo.due_date && (
                                                    <span className="text-xs text-gray-500">
                                                        마감: {new Date(todo.due_date).toLocaleDateString('ko-KR')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-1 ml-2">
                                            <button
                                                type="button"
                                                onClick={() => handleEditTodo(todo)}
                                                className="text-gray-400 hover:text-blue-600"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                    />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteTodo(todo.id)}
                                                className="text-gray-400 hover:text-red-600"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                    />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 할 일 편집 모달 */}
            {isModalOpen && editingTodo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-md shadow-xl max-w-2xl w-full mx-4">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-sm font-medium text-gray-900">
                                {editingTodo.id ? '할 일 수정' : '새 할 일'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingTodo(null);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    제목 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editingTodo.title}
                                    onChange={(e) =>
                                        setEditingTodo({ ...editingTodo, title: e.target.value })
                                    }
                                    className="w-full rounded-md border-gray-300 text-sm"
                                    placeholder="할 일 제목을 입력하세요"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    설명
                                </label>
                                <textarea
                                    value={editingTodo.description}
                                    onChange={(e) =>
                                        setEditingTodo({ ...editingTodo, description: e.target.value })
                                    }
                                    rows={4}
                                    className="w-full rounded-md border-gray-300 text-sm"
                                    placeholder="상세 설명을 입력하세요"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        우선순위
                                    </label>
                                    <select
                                        value={editingTodo.priority}
                                        onChange={(e) =>
                                            setEditingTodo({
                                                ...editingTodo,
                                                priority: e.target.value as 'low' | 'medium' | 'high',
                                            })
                                        }
                                        className="w-full rounded-md border-gray-300 text-sm"
                                    >
                                        <option value="low">낮음</option>
                                        <option value="medium">보통</option>
                                        <option value="high">높음</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        마감일
                                    </label>
                                    <input
                                        type="date"
                                        value={editingTodo.due_date || ''}
                                        onChange={(e) =>
                                            setEditingTodo({
                                                ...editingTodo,
                                                due_date: e.target.value || null,
                                            })
                                        }
                                        className="w-full rounded-md border-gray-300 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-3 border-t border-gray-100 flex justify-end space-x-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingTodo(null);
                                }}
                                className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveTodo}
                                className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
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

export default TodoManager;