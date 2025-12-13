import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { User } from '../types';
import LeavePolicyManager from '../components/LeavePolicyManager';
import WorkMenuManager from '../components/WorkMenuManager';
import OrganizationManager from '../components/OrganizationManager';
import UserManager from '../components/UserManager';

type AdminTab = 'users' | 'notices' | 'layout' | 'leave-policy' | 'work-menu' | 'organization';
type PageKey = 'dashboard' | 'attendance' | 'leave' | 'letters' | 'search';

interface ContainerConfig {
    id: string;
    label: string;
    enabled: boolean;
    order: number;
}

interface PageLayoutConfig {
    page: PageKey;
    containers: ContainerConfig[];
}

interface Notice {
    id: number;
    title: string;
    content: string;
    is_pinned: boolean;
    created_at: string;
}

const Admin: React.FC = () => {
    const { user } = useAuth();

    const [activeTab, setActiveTab] = useState<AdminTab>('users');

    // 공지 관리
    const [notices, setNotices] = useState<Notice[]>([]);
    const [editingNotice, setEditingNotice] = useState<Notice | null>(null);

    // 페이지 레이아웃 관리
    const [selectedPage, setSelectedPage] = useState<PageKey>('dashboard');
    const [layouts, setLayouts] = useState<Record<PageKey, PageLayoutConfig>>(() => ({
        dashboard: {
            page: 'dashboard',
            containers: [
                { id: 'profile', label: '프로필 카드', enabled: true, order: 0 },
                { id: 'notice', label: '공지 카드', enabled: true, order: 1 },
                { id: 'quick-actions', label: '빠른 액션', enabled: true, order: 2 },
                { id: 'stats', label: '통계 / 그래프', enabled: true, order: 3 },
            ],
        },
        attendance: {
            page: 'attendance',
            containers: [
                { id: 'summary', label: '요약 카드', enabled: true, order: 0 },
                { id: 'calendar', label: '캘린더', enabled: true, order: 1 },
                { id: 'list', label: '목록', enabled: true, order: 2 },
            ],
        },
        leave: {
            page: 'leave',
            containers: [
                { id: 'balance', label: '연차 잔여량', enabled: true, order: 0 },
                { id: 'request-form', label: '휴가 신청 폼', enabled: true, order: 1 },
                { id: 'history', label: '신청 내역', enabled: true, order: 2 },
            ],
        },
        letters: {
            page: 'letters',
            containers: [
                { id: 'inbox', label: '받은 문서', enabled: true, order: 0 },
                { id: 'sent', label: '보낸 문서', enabled: true, order: 1 },
            ],
        },
        search: {
            page: 'search',
            containers: [
                { id: 'filters', label: '검색 필터', enabled: true, order: 0 },
                { id: 'results', label: '결과 목록', enabled: true, order: 1 },
            ],
        },
    }));

    const currentLayout = layouts[selectedPage];

    useEffect(() => {
        // 공지 목록 로딩
        const fetchNotices = async () => {
            const { data, error } = await supabase
                .from<Notice>('notices')
                .select('id, title, content, is_pinned, created_at')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (!error && data) {
                setNotices(data);
            }
        };

        fetchNotices();
    }, [user?.id]);

    // 공지 관리
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

        // 수정
        if (editingNotice.id) {
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

    // 레이아웃 관리
    const updateLayout = (
        page: PageKey,
        updater: (layout: PageLayoutConfig) => PageLayoutConfig,
    ) => {
        setLayouts(prev => ({
            ...prev,
            [page]: updater(prev[page]),
        }));
    };

    const handleToggleContainer = (index: number) => {
        updateLayout(selectedPage, layout => {
            const containers = [...layout.containers];
            containers[index] = {
                ...containers[index],
                enabled: !containers[index].enabled,
            };
            return { ...layout, containers };
        });
    };

    const handleMoveContainer = (index: number, direction: 'up' | 'down') => {
        updateLayout(selectedPage, layout => {
            const containers = [...layout.containers].sort((a, b) => a.order - b.order);
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= containers.length) return layout;

            const tmp = containers[index].order;
            containers[index].order = containers[targetIndex].order;
            containers[targetIndex].order = tmp;

            containers.sort((a, b) => a.order - b.order);
            return { ...layout, containers };
        });
    };

    const handleRemoveContainer = (index: number) => {
        updateLayout(selectedPage, layout => {
            const containers = [...layout.containers];
            containers.splice(index, 1);
            return {
                ...layout,
                containers: containers.map((c, i) => ({ ...c, order: i })),
            };
        });
    };

    const handleAddContainer = () => {
        updateLayout(selectedPage, layout => {
            const nextOrder = layout.containers.length;
            return {
                ...layout,
                containers: [
                    ...layout.containers,
                    {
                        id: `custom-${Date.now()}`,
                        label: '새 컨테이너',
                        enabled: true,
                        order: nextOrder,
                    },
                ],
            };
        });
    };

    const handleChangeContainerLabel = (index: number, label: string) => {
        updateLayout(selectedPage, layout => {
            const containers = [...layout.containers];
            containers[index] = { ...containers[index], label };
            return { ...layout, containers };
        });
    };

    return (
        <div className="space-y-6">
            {/* 헤더 */}
            <div className="bg-white shadow rounded-lg px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">관리자 설정</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        직원 정보, 공지, 페이지 레이아웃을 한 곳에서 관리합니다.
                    </p>
                </div>
                {user && (
                    <div className="text-right text-xs text-gray-500">
                        로그인: <span className="font-medium">{user.email}</span>
                        <div>권한: {user.role}</div>
                    </div>
                )}
            </div>

            {/* 탭 컨테이너 */}
            <div className="bg-white shadow rounded-lg">
                {/* 탭 버튼 */}
                <div className="border-b border-gray-200 flex">
                    <button
                        type="button"
                        onClick={() => setActiveTab('users')}
                        className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'users'
                            ? 'border-b-2 border-indigo-500 text-indigo-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        직원 관리
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('notices')}
                        className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'notices'
                            ? 'border-b-2 border-indigo-500 text-indigo-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        공지 관리
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('layout')}
                        className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'layout'
                            ? 'border-b-2 border-indigo-500 text-indigo-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        페이지 레이아웃
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('leave-policy')}
                        className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'leave-policy'
                            ? 'border-b-2 border-indigo-500 text-indigo-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        휴가 정책
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('work-menu')}
                        className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'work-menu'
                            ? 'border-b-2 border-indigo-500 text-indigo-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Work 메뉴
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('organization')}
                        className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'organization'
                            ? 'border-b-2 border-indigo-500 text-indigo-600'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        조직 관리
                    </button>
                </div>

                {/* 탭 내용 */}
                <div className="p-6">
                    {/* 직원 관리 탭 */}
                    {activeTab === 'users' && (
                        <UserManager currentUserId={user?.id} />
                    )}

                    {/* 공지 관리 탭 */}
                    {activeTab === 'notices' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-3">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm font-semibold text-gray-700">공지 목록</h2>
                                    <button
                                        type="button"
                                        onClick={handleNewNotice}
                                        className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                                    >
                                        새 공지
                                    </button>
                                </div>
                                <div className="space-y-2 max-h-[420px] overflow-auto">
                                    {notices.map(notice => (
                                        <div
                                            key={notice.id}
                                            className="border rounded-md px-3 py-2 flex items-start justify-between"
                                        >
                                            <div>
                                                <div className="flex items-center space-x-2">
                                                    {notice.is_pinned && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-yellow-100 text-yellow-700">
                                                            상단 고정
                                                        </span>
                                                    )}
                                                    <h3 className="text-sm font-semibold text-gray-800">
                                                        {notice.title}
                                                    </h3>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                    {notice.content}
                                                </p>
                                            </div>
                                            <div className="flex items-center space-x-1 ml-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingNotice(notice)}
                                                    className="text-xs text-indigo-600 hover:underline"
                                                >
                                                    수정
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteNotice(notice.id)}
                                                    className="text-xs text-red-500 hover:underline"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {notices.length === 0 && (
                                        <p className="text-xs text-gray-400">
                                            등록된 공지가 없습니다. &quot;새 공지&quot; 버튼으로 추가하세요.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="lg:col-span-1">
                                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                                    {editingNotice ? '공지 수정' : '공지 미리보기'}
                                </h2>
                                {editingNotice ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">
                                                제목
                                            </label>
                                            <input
                                                type="text"
                                                value={editingNotice.title}
                                                onChange={e =>
                                                    setEditingNotice({
                                                        ...editingNotice,
                                                        title: e.target.value,
                                                    })
                                                }
                                                className="w-full rounded-md border-gray-300 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">
                                                내용
                                            </label>
                                            <textarea
                                                rows={6}
                                                value={editingNotice.content}
                                                onChange={e =>
                                                    setEditingNotice({
                                                        ...editingNotice,
                                                        content: e.target.value,
                                                    })
                                                }
                                                className="w-full rounded-md border-gray-300 text-sm"
                                            />
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <input
                                                id="pin"
                                                type="checkbox"
                                                checked={editingNotice.is_pinned}
                                                onChange={e =>
                                                    setEditingNotice({
                                                        ...editingNotice,
                                                        is_pinned: e.target.checked,
                                                    })
                                                }
                                                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                            />
                                            <label
                                                htmlFor="pin"
                                                className="text-xs font-medium text-gray-600"
                                            >
                                                대시보드 상단에 고정
                                            </label>
                                        </div>
                                        <div className="flex justify-end space-x-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditingNotice(null)}
                                                className="px-3 py-1.5 rounded-md border border-gray-300 text-xs text-gray-600"
                                            >
                                                취소
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveNotice}
                                                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium"
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
                    )}

                    {/* 페이지 레이아웃 탭 */}
                    {activeTab === 'layout' && currentLayout && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-semibold text-gray-700">
                                        페이지별 레이아웃 구성
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1">
                                        컨테이너의 노출 여부와 순서를 자유롭게 조정할 수 있습니다.
                                    </p>
                                </div>
                                <select
                                    value={selectedPage}
                                    onChange={e => setSelectedPage(e.target.value as PageKey)}
                                    className="rounded-md border-gray-300 text-sm"
                                >
                                    <option value="dashboard">대시보드</option>
                                    <option value="attendance">근태</option>
                                    <option value="leave">휴가</option>
                                    <option value="letters">서류</option>
                                    <option value="search">검색</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-semibold text-gray-600">
                                            컨테이너 목록
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={handleAddContainer}
                                            className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                                        >
                                            컨테이너 추가
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {currentLayout.containers
                                            .slice()
                                            .sort((a, b) => a.order - b.order)
                                            .map((c, index) => (
                                                <div
                                                    key={c.id}
                                                    className="flex items-center justify-between border rounded-md px-3 py-2"
                                                >
                                                    <div className="flex items-center space-x-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={c.enabled}
                                                            onChange={() => handleToggleContainer(index)}
                                                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={c.label}
                                                            onChange={e =>
                                                                handleChangeContainerLabel(index, e.target.value)
                                                            }
                                                            className={`text-xs font-medium bg-transparent border-none focus:ring-0 ${c.enabled
                                                                ? 'text-gray-800'
                                                                : 'text-gray-400 line-through'
                                                                }`}
                                                        />
                                                    </div>
                                                    <div className="flex items-center space-x-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMoveContainer(index, 'up')}
                                                            className="text-xs text-gray-400 hover:text-gray-700"
                                                        >
                                                            ↑
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleMoveContainer(index, 'down')}
                                                            className="text-xs text-gray-400 hover:text-gray-700"
                                                        >
                                                            ↓
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveContainer(index)}
                                                            className="text-xs text-red-400 hover:text-red-600"
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-gray-600">
                                        미리보기 (개념상 레이아웃)
                                    </h3>
                                    <div className="border border-dashed rounded-lg p-4 grid grid-cols-1 gap-3">
                                        {currentLayout.containers
                                            .slice()
                                            .sort((a, b) => a.order - b.order)
                                            .filter(c => c.enabled)
                                            .map(c => (
                                                <div
                                                    key={c.id}
                                                    className="h-16 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs text-indigo-700"
                                                >
                                                    {c.label}
                                                </div>
                                            ))}
                                        {currentLayout.containers.filter(c => c.enabled).length === 0 && (
                                            <p className="text-xs text-gray-400">
                                                활성화된 컨테이너가 없습니다. 왼쪽에서 컨테이너를 추가하거나
                                                체크박스를 켜세요.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <p className="text-[11px] text-gray-400">
                                현재는 화면에서만 적용되는 설정 예시입니다. 실제로 반영하려면 이
                                설정을 DB(예: page_layouts 테이블)에 저장하고 각 페이지 컴포넌트에서
                                불러와서 렌더링하도록 연결하면 됩니다.
                            </p>
                        </div>
                    )}

                    {/* 휴가 정책 탭 */}
                    {activeTab === 'leave-policy' && (
                        <LeavePolicyManager canEdit={true} />
                    )}

                    {/* Work 메뉴 탭 */}
                    {activeTab === 'work-menu' && (
                        <WorkMenuManager />
                    )}

                    {/* 조직 관리 탭 */}
                    {activeTab === 'organization' && (
                        <OrganizationManager />
                    )}
                </div>
            </div >
        </div >
    );
};

export default Admin;
