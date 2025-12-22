// src/components/attendance-reports/AttendanceReportAdmin.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';

import Loading from '../Loading';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';

import type { ReportMode } from './reportTypes';
import ReportControls from './ReportControls';
import ReportPreview from './ReportPreview';
import { clampDateRangeMax31Days, getRangeForMode, getTodayKey } from './reportUtils';
import { fetchAttendanceWithEvents } from './supabaseReports';

type UserRow = {
  id: string;
  name: string | null;
  role?: string | null;
  is_active?: boolean | null;
};

type TargetScope = 'selected' | 'all';

type PreviewItem = {
  userId: string;
  userName: string;
  attendance: any[];
  events: any[];
};

const AttendanceReportAdmin: React.FC = () => {
  const { user } = useAuth();
  const canUse = user?.role === 'Admin' || user?.role === 'Manager';

  // 출력 종류/기간
  const [mode, setMode] = useState<ReportMode>('month_detail');

  const today = getTodayKey();
  const [dateStart, setDateStart] = useState<string>(today);
  const [dateEnd, setDateEnd] = useState<string>(today);

  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // 대상 선택
  const [scope, setScope] = useState<TargetScope>('single');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // 로드/미리보기 상태
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [loadedStartKey, setLoadedStartKey] = useState<string>(dateStart);
  const [loadedEndKey, setLoadedEndKey] = useState<string>(dateEnd);

  const [previews, setPreviews] = useState<PreviewItem[]>([]);

  // users 로드
  useEffect(() => {
    if (!canUse) return;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      setError('');

      try {
        const { data, error: uErr } = await supabase
          .from('users')
          .select('id, name, role, is_active')
          .order('name', { ascending: true });

        if (uErr) throw uErr;

        const list = (data ?? []) as any as UserRow[];
        setUsers(list);
      } catch (e: any) {
        setError(e?.message || '사용자 목록 로드 실패');
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.name || '').toLowerCase().includes(q));
  }, [users, query]);

  const selectedUsersLabel = useMemo(() => {
    if (scope === 'all') return '전체';
    // selected
    const names = users
      .filter((u) => selectedUserIds.includes(u.id))
      .map((u) => u.name || '이름없음');
    if (names.length === 0) return '선택 안 됨';
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}명`;
  }, [scope, users, singleUserId, selectedUserIds]);

  const canLoad = useMemo(() => {
    if (!canUse) return false;

    if (scope === 'selected') {
      if (selectedUserIds.length === 0) return false;
    }

    // 기간 조건
    if (mode === 'date_detail') {
      if (!dateStart || !dateEnd) return false;
      if (dateStart > dateEnd) return false;
      return clampDateRangeMax31Days(dateStart, dateEnd);
    }

    return !!month;
  }, [canUse, scope, singleUserId, selectedUserIds, mode, dateStart, dateEnd, month]);

  const hint = useMemo(() => {
    if (mode !== 'date_detail') return '';
    if (!dateStart || !dateEnd) return '날짜를 선택해주세요.';
    if (dateStart > dateEnd) return '시작일이 종료일보다 늦습니다.';
    if (!clampDateRangeMax31Days(dateStart, dateEnd)) return '최대 31일 범위만 가능합니다.';
    return '';
  }, [mode, dateStart, dateEnd]);

  const toggleSelectedUser = (uid: string) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(uid)) return prev.filter((x) => x !== uid);
      return [...prev, uid];
    });
  };

  const selectAllFiltered = () => {
    const ids = filteredUsers.map((u) => u.id);
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelected = () => {
    setSelectedUserIds([]);
  };

  const handleLoad = async () => {
    if (!canLoad) return;

    setError('');
    setSuccess('');
    setLoadingPreview(true);

    try {
      const { startKey, endKey } = getRangeForMode(mode, dateStart, dateEnd, month);
      setLoadedStartKey(startKey);
      setLoadedEndKey(endKey);

      let targetIds: string[] = [];
      if (scope === 'all') targetIds = users.map((u) => u.id);
      else targetIds = selectedUserIds;

      // 안전장치: 너무 많으면 미리보기만이라도 제한 (원하면 나중에 “전체 엑셀”은 서버로)
      const hardLimit = 30;
      const idsForPreview = targetIds.slice(0, hardLimit);

      const results: PreviewItem[] = [];
      for (const uid of idsForPreview) {
        const u = users.find((x) => x.id === uid);
        const userName = (u?.name || '').toString() || '사용자';

        const { attendance, events } = await fetchAttendanceWithEvents({ userId: uid, startKey, endKey });
        results.push({ userId: uid, userName, attendance, events });
      }

      setPreviews(results);

      if (targetIds.length > hardLimit) {
        setSuccess(`미리보기는 최대 ${hardLimit}명까지만 표시됩니다. (현재 ${targetIds.length}명 선택)`);
      } else {
        setSuccess('미리보기가 준비되었습니다.');
      }
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(e?.message || '미리보기 생성 실패');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!user) return <ErrorMessage message="로그인이 필요합니다." />;
  if (!canUse) return <ErrorMessage message="권한이 없습니다. (Admin/Manager 전용)" />;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold">서류발급(업무용)</h1>
        <p className="text-sm text-gray-600 mt-1">선택한 사원/전체/개인 증빙서를 미리보기 후 출력할 수 있습니다.</p>
      </div>

      {(loadingUsers || loadingPreview) && <Loading />}
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* 대상 선택 */}
      <div className="no-print bg-white shadow rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm font-semibold text-gray-800">대상</div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" checked={scope === 'selected'} onChange={() => setScope('selected')} />
            선택한 사원들
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
            전체 사원
          </label>

          <div className="ml-auto text-xs text-gray-500">현재 선택: {selectedUsersLabel}</div>
        </div>

        {/* selected */}
        {scope === 'selected' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름 검색"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-3 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
              >
                검색결과 전체선택
              </button>
              <button
                type="button"
                onClick={clearSelected}
                className="px-3 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
              >
                선택해제
              </button>
            </div>

            <div className="border border-gray-200 rounded p-2 max-h-48 overflow-y-auto">
              {filteredUsers.map((u) => {
                const checked = selectedUserIds.includes(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => toggleSelectedUser(u.id)} />
                    <span className="truncate">
                      {u.name || '이름없음'} {u.role ? `(${u.role})` : ''}
                    </span>
                  </label>
                );
              })}
              {filteredUsers.length === 0 && <div className="p-2 text-sm text-gray-500">사용자가 없습니다.</div>}
            </div>
          </div>
        )}
      </div>

      {/* 기간/모드 + 미리보기/출력 */}
      <ReportControls
        mode={mode}
        setMode={setMode}
        dateStart={dateStart}
        dateEnd={dateEnd}
        setDateStart={setDateStart}
        setDateEnd={setDateEnd}
        month={month}
        setMonth={setMonth}
        canLoad={canLoad}
        hint={hint}
        onLoad={handleLoad}
        onPrint={handlePrint}
        loading={loadingPreview}
      />

      {/* 미리보기들 */}
      <div className="space-y-6">
        {previews.map((p) => (
          <div key={p.userId} className="border border-gray-200 rounded-lg">
            <ReportPreview
              mode={mode}
              userName={p.userName}
              startKey={loadedStartKey}
              endKey={loadedEndKey}
              month={month}
              attendance={p.attendance}
              events={p.events}
            />
          </div>
        ))}

        {previews.length === 0 && (
          <div className="bg-white shadow rounded-lg p-6 text-sm text-gray-600">
            미리보기를 눌러 데이터를 불러오세요.
          </div>
        )}
      </div>

      <div className="no-print text-xs text-gray-500">
        {/* * 엑셀 다운로드는 다음 단계에서 붙이면 됩니다. (관리자 페이지에서만 제공) */}
      </div>
    </div>
  );
};

export default AttendanceReportAdmin;
