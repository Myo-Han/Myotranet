import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    currentUserId: string;
    readOnly?: boolean;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, userId, currentUserId, readOnly = false }) => {
    const [user, setUser] = useState<any>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [phone, setPhone] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingStatus, setEditingStatus] = useState(false);
    const [editingPhone, setEditingPhone] = useState(false);

    const isOwnProfile = userId === currentUserId;
    const canEdit = isOwnProfile && !readOnly;

    type OrgItem = { code: string; name: string };
    type OrgConfig = {
        departments: OrgItem[];
        projects: OrgItem[];
        parts: OrgItem[];
        positions: OrgItem[];
    };

    const [todayStatus, setTodayStatus] = useState<string | null>(null);
    const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);

    const getOrgName = (list: OrgItem[] | undefined, code: any) => {
        const c = String(code ?? '').trim();
        if (!c) return '';
        return list?.find((x) => x.code === c)?.name || '';
    };

    const fetchOrgConfig = async () => {
        const { data, error } = await supabase.from('org_settings').select('config').single();
        if (error) return;

        setOrgConfig({
            departments: data?.config?.departments || [],
            projects: data?.config?.projects || [],
            parts: data?.config?.parts || [],
            positions: data?.config?.positions || [],
        });
    };

    const statusLabel =
        todayStatus === 'working'
            ? '근무중'
            : todayStatus === 'paused'
                ? '근무중단'
                : todayStatus === 'off'
                    ? '퇴근'
                    : todayStatus === 'vacation'
                        ? '휴가'
                        : '미출근';

    useEffect(() => {
        if (isOpen) {
            fetchOrgConfig();
            fetchUser();
        }
    }, [isOpen, userId]);

    const getTodayDate = () => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const fetchUser = async () => {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, email, profile_picture, banner_image, department, project, part, position, hire_date, current_status, status_message, phone')
            .eq('id', userId)
            .single();

        const today = getTodayDate();

        const { data: attendanceRow } = await supabase
            .from('attendance')
            .select('status')
            .eq('user_id', userId)
            .eq('date', today)
            .maybeSingle();

        if (!error && data) {
            setUser(data);
            setStatusMessage(data.status_message || '');
            setPhone(data.phone || '');
            setTodayStatus((attendanceRow?.status ?? null) as any);
        }
    };

    const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || !canEdit) return;

        const file = e.target.files[0];
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `banner-${userId}-${Date.now()}.${fileExt}`;
            if (user.banner_image) {
                const oldPath = user.banner_image.split('/').pop();
                await supabase.storage.from('banners').remove([oldPath]);
            }

            const { error: uploadError } = await supabase.storage
                .from('banners')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('banners')
                .getPublicUrl(fileName);

            const { error: updateError } = await supabase
                .from('users')
                .update({ banner_image: publicUrl })
                .eq('id', userId);

            if (updateError) throw updateError;

            setUser((prev: any) => ({ ...prev, banner_image: publicUrl }));
        } catch (error) {
            console.error('배너 업로드 실패:', error);
        } finally {
            setUploading(false);
        }
    };
    const handleDeleteBanner = async () => {
        if (!canEdit || !user?.banner_image) return;

        setUploading(true);
        try {
            const oldPath = user.banner_image.split('/').pop();
            if (oldPath) {
                await supabase.storage.from('banners').remove([oldPath]);
            }

            const { error: updateError } = await supabase
                .from('users')
                .update({ banner_image: null })
                .eq('id', userId);

            if (updateError) throw updateError;

            setUser((prev: any) => ({ ...prev, banner_image: null }));
        } catch (error) {
            console.error('배너 삭제 실패:', error);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteProfile = async () => {
        if (!canEdit || !user?.profile_picture) return;

        setUploading(true);
        try {
            const oldPath = user.profile_picture.split('/').pop();
            if (oldPath) {
                await supabase.storage.from('avatars').remove([oldPath]);
            }

            const { error: updateError } = await supabase
                .from('users')
                .update({ profile_picture: null })
                .eq('id', userId);

            if (updateError) throw updateError;

            setUser((prev: any) => ({ ...prev, profile_picture: null }));
        } catch (error) {
            console.error('프로필 사진 삭제 실패:', error);
        } finally {
            setUploading(false);
        }
    };

    const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || !canEdit) return;

        const file = e.target.files[0];
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `profile-${userId}-${Date.now()}.${fileExt}`;
            if (user.profile_picture) {
                const oldPath = user.profile_picture.split('/').pop();
                await supabase.storage.from('avatars').remove([oldPath]);
            }

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            const { error: updateError } = await supabase
                .from('users')
                .update({ profile_picture: publicUrl })
                .eq('id', userId);

            if (updateError) throw updateError;

            setUser((prev: any) => ({ ...prev, profile_picture: publicUrl }));
        } catch (error) {
            console.error('프로필 사진 업로드 실패:', error);
        } finally {
            setUploading(false);
        }
    };

    const handleSaveStatusMessage = async () => {
        if (!canEdit) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('users')
                .update({ status_message: statusMessage })
                .eq('id', userId);

            if (error) throw error;

            setEditingStatus(false);
            fetchUser();
        } catch (error) {
            console.error('상태 메시지 저장 실패:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleSavePhone = async () => {
        if (!canEdit) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('users')
                .update({ phone })
                .eq('id', userId);

            if (error) throw error;

            setEditingPhone(false);
            fetchUser();
        } catch (error) {
            console.error('휴대폰 번호 저장 실패:', error);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !user) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* 배너 이미지 */}
                <div className="relative h-48 bg-gradient-to-r from-blue-400 to-purple-500 rounded-t-lg overflow-hidden">
                    {user.banner_image ? (
                        <img src={user.banner_image} alt="배너" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-r from-blue-400 to-purple-500" />
                    )}
                    {canEdit && (
                        <div className="absolute top-4 right-4 flex gap-2">
                            <label className="bg-white bg-opacity-80 text-gray-700 px-3 py-2 rounded-lg cursor-pointer hover:bg-opacity-100 text-sm">
                                배너 변경
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleBannerUpload}
                                    className="hidden"
                                    disabled={uploading}
                                />
                            </label>

                            {user.banner_image && (
                                <button
                                    type="button"
                                    onClick={handleDeleteBanner}
                                    disabled={uploading}
                                    className="bg-white bg-opacity-80 text-red-600 px-3 py-2 rounded-lg hover:bg-opacity-100 text-sm disabled:opacity-50"
                                >
                                    배너 삭제
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* 프로필 사진 */}
                <div className="px-6 pb-6">
                    <div className="flex justify-center -mt-16 mb-4">
                        <div className="relative">
                            <div className="h-32 w-32 rounded-full bg-white border-4 border-white overflow-hidden flex items-center justify-center shadow-lg">
                                {user.profile_picture ? (
                                    <img src={user.profile_picture} alt={user.name} className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-gray-400">No Image</span>
                                )}
                            </div>
                            {canEdit && (
                                <div className="absolute bottom-0 right-0 flex gap-2">
                                    <label className="bg-blue-600 text-white p-2 rounded-full cursor-pointer hover:bg-blue-700 shadow-lg">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleProfileUpload}
                                            className="hidden"
                                            disabled={uploading}
                                        />
                                    </label>

                                    {user.profile_picture && (
                                        <button
                                            type="button"
                                            onClick={handleDeleteProfile}
                                            disabled={uploading}
                                            className="bg-white text-red-600 px-2 rounded-full shadow-lg hover:bg-gray-50 disabled:opacity-50"
                                            aria-label="프로필 삭제"
                                        >
                                            삭제
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="text-center mb-6">
                        <div className="flex items-center justify-center gap-2">
                            <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>

                            <span
                                className={[
                                    'px-2 py-0.5 text-xs rounded-full border',
                                    todayStatus === 'working'
                                        ? 'bg-green-100 text-green-700 border-green-200'
                                        : todayStatus === 'paused'
                                            ? 'bg-orange-100 text-orange-700 border-orange-200'
                                            : todayStatus === 'off'
                                                ? 'bg-gray-100 text-gray-700 border-gray-200'
                                                : todayStatus === 'vacation'
                                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                    : 'bg-red-100 text-red-700 border-red-200',
                                ].join(' ')}
                            >
                                {statusLabel}
                            </span>
                        </div>

                        <p className="text-sm text-gray-500">{user.email}</p>
                    </div>

                    {/* 정보 */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-500 mb-1">소속</label>
                                <p className="text-base text-gray-900">
                                    {[
                                        getOrgName(orgConfig?.departments, user.department),
                                        getOrgName(orgConfig?.projects, user.project),
                                        getOrgName(orgConfig?.parts, user.part),
                                        getOrgName(orgConfig?.positions, user.position),
                                    ]
                                        .filter(Boolean)
                                        .join(' ') || '미지정'}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">입사일</label>
                                <p className="text-base text-gray-900">
                                    {user.hire_date ? new Date(user.hire_date).toLocaleDateString('ko-KR') : '미지정'}
                                </p>
                            </div>
                        </div>

                        {/* 휴대폰 번호 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">휴대폰 번호</label>
                            {isOwnProfile && editingPhone ? (
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        placeholder="010-0000-0000"
                                    />
                                    <button
                                        onClick={handleSavePhone}
                                        disabled={saving}
                                        className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        저장
                                    </button>
                                    <button
                                        onClick={() => {
                                            setEditingPhone(false);
                                            setPhone(user.phone || '');
                                        }}
                                        className="px-3 py-2 bg-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-400"
                                    >
                                        취소
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <p className="text-base text-gray-900">{user.phone || '미지정'}</p>
                                    {canEdit && (
                                        <button
                                            onClick={() => setEditingPhone(true)}
                                            className="text-blue-600 hover:text-blue-700 text-sm"
                                        >
                                            수정
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 상태 메시지 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">상태 메시지</label>
                            {isOwnProfile && editingStatus ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={statusMessage}
                                        onChange={(e) => setStatusMessage(e.target.value)}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        placeholder="상태 메시지를 입력하세요..."
                                        rows={3}
                                        maxLength={100}
                                    />
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">{statusMessage.length}/100</span>
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={handleSaveStatusMessage}
                                                disabled={saving}
                                                className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                저장
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingStatus(false);
                                                    setStatusMessage(user.status_message || '');
                                                }}
                                                className="px-3 py-1 bg-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-400"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <p className="text-base text-gray-900 italic">{user.status_message || '상태 메시지가 없습니다.'}</p>
                                    {canEdit && (
                                        <button
                                            onClick={() => setEditingStatus(true)}
                                            className="text-blue-600 hover:text-blue-700 text-sm"
                                        >
                                            수정
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={() => {
                                onClose();
                                if (canEdit) window.location.reload();
                            }}
                            className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;