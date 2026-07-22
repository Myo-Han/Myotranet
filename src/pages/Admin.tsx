import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import Loading from '../components/Loading';
import LeavePolicyManager from '../components/LeavePolicyManager';
import WorkMenuManager from '../components/WorkMenuManager';
import OrganizationManager from '../components/OrganizationManager';
import ReactionEmojiManager from '../components/ReactionEmojiManager';

type AdminMenuItem = {
    id: string;
    label: string;
    icon: string;
    path: string;
    order: number;
    parent_id: string | null;
    is_folder: boolean;
};

// 서버에 admin_menu 설정이 아직 없을 때 사용할 기본값 (기존 4개 관리자 기능과 동일)
const DEFAULT_ADMIN_MENU: AdminMenuItem[] = [
    { id: 'leave-policy', label: '휴가 정책', icon: 'calendar', path: 'leave-policy', order: 1, parent_id: null, is_folder: false },
    { id: 'page-layout', label: '페이지 레이아웃', icon: 'folder', path: 'page-layout', order: 2, parent_id: null, is_folder: false },
    { id: 'organization', label: '조직 관리', icon: 'users', path: 'organization', order: 3, parent_id: null, is_folder: false },
    { id: 'emoji', label: '이모지 관리', icon: 'star', path: 'emoji', order: 4, parent_id: null, is_folder: false },
];

const Admin: React.FC = () => {
    const { user } = useAuth();
    const [menuItems, setMenuItems] = useState<AdminMenuItem[]>([]);
    const [selectedMenu, setSelectedMenu] = useState('');
    const [loadingMenu, setLoadingMenu] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    // '페이지 레이아웃' 섹션 내부에서 결재관리(work_menu)/관리자(admin_menu) 중 어느 것을 편집할지
    const [layoutTarget, setLayoutTarget] = useState<'work_menu' | 'admin_menu'>('work_menu');

    useEffect(() => {
        const fetchMenu = async () => {
            try {
                setLoadingMenu(true);
                const CACHE_KEY = 'admin_menu_cache';
                const cached = localStorage.getItem(CACHE_KEY);
                let menu: AdminMenuItem[] = [];
                let needsFetch = true;

                const { data: serverInfo, error } = await supabase
                    .from('org_settings')
                    .select('updated_at, config')
                    .single();
                if (error) throw error;

                const serverUpdatedAt = new Date(serverInfo.updated_at).getTime();

                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed.serverTs === serverUpdatedAt) {
                        menu = parsed.data;
                        needsFetch = false;
                    }
                }

                if (needsFetch) {
                    menu = (serverInfo.config.admin_menu && serverInfo.config.admin_menu.length > 0)
                        ? serverInfo.config.admin_menu
                        : DEFAULT_ADMIN_MENU;
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ serverTs: serverUpdatedAt, data: menu }));
                }

                const sorted = [...menu].sort((a, b) => a.order - b.order);
                setMenuItems(sorted);

                setSelectedMenu(prev => {
                    if (prev) return prev;
                    const firstMenu = sorted.find(m => !m.is_folder) || sorted[0];
                    return firstMenu ? firstMenu.path : prev;
                });
            } catch (e) {
                console.error('관리자 메뉴 로드 실패:', e);
                setMenuItems(DEFAULT_ADMIN_MENU);
                setSelectedMenu(prev => prev || DEFAULT_ADMIN_MENU[0].path);
            } finally {
                setLoadingMenu(false);
            }
        };

        fetchMenu();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // WorkMenuManager와 동일한 아이콘 세트 (관리자가 페이지 레이아웃에서 자유롭게 아이콘을 고를 수 있으므로 전체 세트 포함)
    const getIcon = (iconName: string) => {
        const iconMap: Record<string, JSX.Element> = {
            briefcase: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            ),
            package: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            ),
            check: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            ),
            users: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            ),
            user: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            ),
            calendar: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            ),
            mail: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            ),
            document: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            folder: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
            ),
            chart: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
            cog: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            star: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
            ),
            heart: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
            ),
            tag: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
            ),
            clock: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            code: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
            ),
            database: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
            ),
            cloud: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
            ),
            lightning: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
            shield: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
            ),
            globe: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            fire: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                </svg>
            ),
        };
        return iconMap[iconName] || iconMap.briefcase;
    };

    if (loadingMenu) {
        return <Loading />;
    }

    const currentMenuLabel = menuItems.find((m) => m.path === selectedMenu)?.label || '관리자';

    return (
        <div className="flex h-screen bg-gray-50">
            {/* 왼쪽 메뉴 */}
            <div className="w-56 bg-white border-r border-gray-200">
                <div className="px-4 py-4 border-b border-gray-100">
                    <h1 className="text-base font-semibold text-gray-900">관리자</h1>
                    {user && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{user.email} · {user.role}</p>
                    )}
                </div>
                <nav className="p-2 space-y-0.5">
                    {menuItems.filter(item => !item.parent_id).map((item) => (
                        <div key={item.id}>
                            <button
                                onClick={() => {
                                    if (item.is_folder) {
                                        const next = new Set(expandedFolders);
                                        if (next.has(item.id)) {
                                            next.delete(item.id);
                                        } else {
                                            next.add(item.id);
                                        }
                                        setExpandedFolders(next);
                                    } else {
                                        setSelectedMenu(item.path);
                                    }
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition ${!item.is_folder && selectedMenu === item.path
                                    ? 'bg-blue-50 text-blue-600 font-medium'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    {getIcon(item.icon)}
                                    <span>{item.label}</span>
                                </div>
                                {item.is_folder && (
                                    <svg
                                        className={`w-3.5 h-3.5 transition-transform ${expandedFolders.has(item.id) ? 'rotate-90' : ''}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                )}
                            </button>

                            {item.is_folder && expandedFolders.has(item.id) && (
                                <div className="ml-5 mt-0.5 space-y-0.5">
                                    {menuItems.filter(child => child.parent_id === item.id).map((child) => (
                                        <button
                                            key={child.id}
                                            onClick={() => setSelectedMenu(child.path)}
                                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md transition text-sm ${selectedMenu === child.path
                                                ? 'bg-blue-50 text-blue-600 font-medium'
                                                : 'text-gray-600 hover:bg-gray-50'
                                                }`}
                                        >
                                            {getIcon(child.icon)}
                                            <span>{child.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </nav>
            </div>

            {/* 오른쪽 컨텐츠 */}
            <div className="flex-1 overflow-auto">
                {/* ✅ 왼쪽 사이드바 헤더(px-4 py-4 border-b)와 높이를 맞춘 콘텐츠 헤더 */}
                <div className="px-4 py-4 border-b border-gray-100 bg-white">
                    <h1 className="text-base font-semibold text-gray-900">{currentMenuLabel}</h1>
                </div>
                <div className="p-4">
                    {/* 휴가 정책 */}
                    {selectedMenu === 'leave-policy' && (
                        <LeavePolicyManager canEdit={true} />
                    )}

                    {/* 페이지 레이아웃 (결재관리 페이지 / 관리자 페이지) */}
                    {selectedMenu === 'page-layout' && (
                        <div className="space-y-4">
                            <div className="flex gap-2 border-b border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setLayoutTarget('work_menu')}
                                    className={`px-4 py-2 text-sm font-medium ${layoutTarget === 'work_menu'
                                        ? 'border-b-2 border-indigo-500 text-indigo-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    결재관리 페이지
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLayoutTarget('admin_menu')}
                                    className={`px-4 py-2 text-sm font-medium ${layoutTarget === 'admin_menu'
                                        ? 'border-b-2 border-indigo-500 text-indigo-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    관리자 페이지
                                </button>
                            </div>
                            <WorkMenuManager
                                key={layoutTarget}
                                menuKey={layoutTarget}
                                title={layoutTarget === 'work_menu' ? '결재관리 페이지 메뉴 관리' : '관리자 페이지 메뉴 관리'}
                            />
                        </div>
                    )}

                    {/* 조직 관리 */}
                    {selectedMenu === 'organization' && (
                        <OrganizationManager />
                    )}

                    {/* 이모지 관리 */}
                    {selectedMenu === 'emoji' && (
                        <ReactionEmojiManager />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Admin;
