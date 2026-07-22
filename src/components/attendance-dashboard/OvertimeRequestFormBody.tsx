// 연장근무 신청/수정 폼 본문 (공용 컴포넌트).
// LeaveRequestFormBody.tsx와 동일한 패턴: 폼 필드 + 결재라인(결재자/참조) 빌더 + 제출/삭제/취소 버튼.
// OvertimePanel.tsx(근태관리 탭 안에서의 인라인 신청/수정)가 이 컴포넌트를 사용한다.
//
// 주의: PersonCard는 반드시 이 파일의 모듈 스코프(컴포넌트 함수 밖)에 정의해야 한다.
// 컴포넌트 함수 안에서 정의하면 부모가 리렌더될 때마다 새 컴포넌트 타입으로 취급되어
// React가 매번 서브트리를 통째로 언마운트/재마운트한다 -> "+ 추가" 버튼 클릭이 씹히는 버그.
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { useOvertimeRequest, todayKeyOt, deleteOvertimeRequest } from '../../hooks/useOvertimeRequest';
import ErrorMessage from '../ErrorMessage';

type OrgItem = { id: string; name: string; code: string };
type UserLite = {
  id: string;
  name: string | null;
  department: string | null;
  project: string | null;
};

type PersonEntry = {
  key: string;
  userId: string;
  name: string;
  teamLabel: string;
};

type PickerTarget = 'approver' | 'cc';

const PersonCard: React.FC<{
  target: PickerTarget;
  title: string;
  entries: PersonEntry[];
  draggable?: boolean;
  stepLabel?: boolean;
  openPicker: PickerTarget | null;
  pickerQuery: string;
  filteredPickerUsers: UserLite[];
  draggedKey: string | null;
  dropTargetKey: string | null;
  getTeamLabel: (u: UserLite) => string;
  onTogglePicker: (target: PickerTarget) => void;
  onQueryChange: (q: string) => void;
  onAddPerson: (target: PickerTarget, u: UserLite) => void;
  onRemovePerson: (target: PickerTarget, key: string) => void;
  onDragStart: (key: string) => void;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDragLeave: () => void;
  onDrop: (key: string) => void;
}> = ({
  target,
  title,
  entries,
  draggable,
  stepLabel,
  openPicker,
  pickerQuery,
  filteredPickerUsers,
  draggedKey,
  dropTargetKey,
  getTeamLabel,
  onTogglePicker,
  onQueryChange,
  onAddPerson,
  onRemovePerson,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}) => (
  <div className="bg-white rounded-md border border-gray-200 p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <button
        type="button"
        onClick={() => onTogglePicker(target)}
        className="flex items-center gap-1 h-8 px-2.5 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50 active:bg-gray-100"
      >
        <span className="text-sm leading-none">+</span> 추가
      </button>
    </div>

    {openPicker === target && (
      <div className="mb-3 border border-gray-200 rounded-md p-2 bg-gray-50">
        <input
          type="text"
          autoFocus
          value={pickerQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filteredPickerUsers.length > 0) {
              e.preventDefault();
              onAddPerson(target, filteredPickerUsers[0]);
            }
          }}
          placeholder="이름으로 검색"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mb-2"
        />
        <div className="max-h-48 overflow-y-auto space-y-1">
          {filteredPickerUsers.length === 0 ? (
            <p className="text-xs text-gray-400 px-1 py-2">검색 결과가 없습니다.</p>
          ) : (
            filteredPickerUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onAddPerson(target, u)}
                className="w-full text-left px-3 py-2.5 rounded hover:bg-white active:bg-gray-100 text-sm flex items-center justify-between"
              >
                <span className="font-medium text-gray-800">{u.name}</span>
                <span className="text-xs text-gray-400">{getTeamLabel(u)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    )}

    {entries.length === 0 ? (
      <p className="text-sm text-gray-400 py-2.5">추가된 사람이 없습니다.</p>
    ) : (
      <div className="divide-y divide-gray-100">
        {entries.map((p, idx) => (
          <div
            key={p.key}
            draggable={draggable}
            onDragStart={() => draggable && onDragStart(p.key)}
            onDragOver={(e) => draggable && onDragOver(e, p.key)}
            onDragLeave={() => draggable && onDragLeave()}
            onDrop={() => draggable && onDrop(p.key)}
            className={`flex items-center justify-between py-2 ${draggable ? 'cursor-move' : ''} ${draggedKey === p.key ? 'opacity-30' : ''
              } ${dropTargetKey === p.key ? 'bg-blue-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              {draggable && <span className="text-gray-300 select-none">⠿⠿</span>}
              <div>
                {stepLabel && (
                  <div className="text-xs font-medium text-blue-600">{idx + 1}. 결재</div>
                )}
                <div className="text-sm text-gray-800">
                  {p.name} <span className="text-gray-400">/ {p.teamLabel}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemovePerson(target, p.key)}
              className="text-gray-400 hover:text-red-600 px-2 text-xs"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
);

type Props = {
  overtimeId?: string;
  onDone: () => void;
};

const OvertimeRequestFormBody: React.FC<Props> = ({ overtimeId, onDone }) => {
  const { user } = useAuth();
  const isEditMode = Boolean(overtimeId);
  const ot = useOvertimeRequest(user);

  const [users, setUsers] = useState<UserLite[]>([]);
  const [projects, setProjects] = useState<OrgItem[]>([]);
  const [departments, setDepartments] = useState<OrgItem[]>([]);

  const [approvers, setApprovers] = useState<PersonEntry[]>([]);
  const [ccUsers, setCcUsers] = useState<PersonEntry[]>([]);

  const [openPicker, setOpenPicker] = useState<PickerTarget | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState('');
  const [editLoading, setEditLoading] = useState(isEditMode);
  const [editBlockedError, setEditBlockedError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, orgRes] = await Promise.all([
          supabase.from('users').select('id, name, department, project').eq('is_active', true).order('name', { ascending: true }),
          supabase.from('org_settings').select('config').single(),
        ]);

        const loadedUsers = (usersRes.data || []) as UserLite[];
        setUsers(loadedUsers);
        setProjects(((orgRes.data?.config?.projects as OrgItem[]) || []));
        setDepartments(((orgRes.data?.config?.departments as OrgItem[]) || []));

        if (!isEditMode) {
          ot.setForm((prev) => ({ ...prev, workDate: prev.workDate || todayKeyOt() }));
        }

        if (isEditMode && overtimeId) {
          const result = await ot.loadForEdit(overtimeId);
          if (!result.ok) {
            setEditBlockedError(result.error || '연장근무 신청을 불러올 수 없습니다');
          } else {
            const findEntry = (target: PickerTarget, uid: string): PersonEntry => {
              const u = loadedUsers.find((x) => x.id === uid);
              const projList = (orgRes.data?.config?.projects as OrgItem[]) || [];
              const deptList = (orgRes.data?.config?.departments as OrgItem[]) || [];
              const teamLabel = (() => {
                if (u?.project) {
                  const p = projList.find((x) => x.code === u.project);
                  if (p) return p.name;
                }
                if (u?.department) {
                  const d = deptList.find((x) => x.code === u.department);
                  if (d) return d.name;
                }
                return '소속 없음';
              })();
              return {
                key: `${target}_${uid}_${Date.now()}_${Math.random()}`,
                userId: uid,
                name: u?.name || uid,
                teamLabel,
              };
            };
            setApprovers((result.approverUserIds || []).map((uid) => findEntry('approver', uid)));
            setCcUsers((result.ccUserIds || []).map((uid) => findEntry('cc', uid)));
          }
        }
      } catch (e) {
        console.error('구성원 목록 로딩 실패:', e);
      } finally {
        if (isEditMode) setEditLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overtimeId]);

  const getTeamLabel = (u: UserLite) => {
    if (u.project) {
      const p = projects.find((x) => x.code === u.project);
      if (p) return p.name;
    }
    if (u.department) {
      const d = departments.find((x) => x.code === u.department);
      if (d) return d.name;
    }
    return '소속 없음';
  };

  const addPerson = (target: PickerTarget, u: UserLite) => {
    const entry: PersonEntry = {
      key: `${target}_${u.id}_${Date.now()}`,
      userId: u.id,
      name: u.name || u.id,
      teamLabel: getTeamLabel(u),
    };
    if (target === 'approver') {
      setApprovers((prev) => (prev.some((p) => p.userId === u.id) ? prev : [...prev, entry]));
    } else {
      setCcUsers((prev) => (prev.some((p) => p.userId === u.id) ? prev : [...prev, entry]));
    }
    setOpenPicker(null);
    setPickerQuery('');
  };

  const removePerson = (target: PickerTarget, key: string) => {
    if (target === 'approver') setApprovers((prev) => prev.filter((p) => p.key !== key));
    else setCcUsers((prev) => prev.filter((p) => p.key !== key));
  };

  const togglePicker = (target: PickerTarget) => {
    setOpenPicker((prev) => (prev === target ? null : target));
    setPickerQuery('');
  };

  const handleDragStart = (key: string) => setDraggedKey(key);
  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    if (draggedKey && draggedKey !== key) setDropTargetKey(key);
  };
  const handleDragLeave = () => setDropTargetKey(null);
  const handleDrop = (targetKey: string) => {
    setDropTargetKey(null);
    const sourceKey = draggedKey;
    setDraggedKey(null);
    if (!sourceKey || sourceKey === targetKey) return;

    setApprovers((prev) => {
      const list = [...prev];
      const fromIdx = list.findIndex((p) => p.key === sourceKey);
      const toIdx = list.findIndex((p) => p.key === targetKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list;
    });
  };

  const filteredPickerUsers = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const excludeIds = new Set(
      openPicker === 'approver' ? approvers.map((p) => p.userId) : ccUsers.map((p) => p.userId)
    );
    return users
      .filter((u) => u.id !== user?.id)
      .filter((u) => !excludeIds.has(u.id))
      .filter((u) => !q || (u.name || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [users, pickerQuery, openPicker, approvers, ccUsers, user?.id]);

  const durationLabel = useMemo(() => {
    if (!ot.form.startTime || !ot.form.endTime) return '';
    const [sh, sm] = ot.form.startTime.split(':').map(Number);
    const [eh, em] = ot.form.endTime.split(':').map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes <= 0) minutes += 24 * 60;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}시간 ${m}분`;
  }, [ot.form.startTime, ot.form.endTime]);

  const handleSubmit = async () => {
    setSubmitError('');
    const customApprovals = {
      approverIds: approvers.map((p) => p.userId),
      ccIds: ccUsers.map((p) => p.userId),
    };
    const ok = isEditMode && overtimeId
      ? await ot.updateExisting(overtimeId, customApprovals)
      : await ot.submit(customApprovals);
    if (ok) {
      onDone();
    } else {
      setSubmitError(ot.error || (isEditMode ? '수정에 실패했습니다' : '신청에 실패했습니다'));
    }
  };

  const handleDelete = async () => {
    if (!overtimeId) return;
    if (!window.confirm('이 연장근무 신청을 삭제하시겠습니까?')) return;

    setDeleting(true);
    setSubmitError('');
    const result = await deleteOvertimeRequest(overtimeId);
    setDeleting(false);
    if (result.ok) {
      onDone();
    } else {
      setSubmitError(result.error || '삭제에 실패했습니다');
    }
  };

  if (isEditMode && editLoading) {
    return <p className="text-sm text-gray-500">불러오는 중...</p>;
  }

  if (isEditMode && editBlockedError) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={editBlockedError} />
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isEditMode && (
        <div className="text-sm bg-amber-50 border border-amber-100 rounded-md px-3 py-2 text-amber-800">
          내용을 수정하면 결재라인(결재자/참조)이 다시 구성되고, 결재는 처음 단계부터 다시 진행됩니다.
        </div>
      )}

      {(submitError || ot.error) && <ErrorMessage message={submitError || ot.error} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="bg-white rounded-md border border-gray-200 p-4 space-y-3">
          <div className="text-sm bg-amber-50 border border-amber-100 rounded-md px-3 py-2 text-amber-800">
            사전 승인된 시간만 근태표의 "연장근무"에 반영됩니다. 승인된 시간보다 일찍 퇴근하면 실제 퇴근시각까지만 반영돼요.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">근무 일자</label>
            <input
              type="date"
              value={ot.form.workDate}
              onChange={(e) => ot.setForm({ ...ot.form, workDate: e.target.value })}
              min={todayKeyOt()}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">시작 시각</label>
              <input
                type="time"
                value={ot.form.startTime}
                onChange={(e) => ot.setForm({ ...ot.form, startTime: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">종료 시각</label>
              <input
                type="time"
                value={ot.form.endTime}
                onChange={(e) => ot.setForm({ ...ot.form, endTime: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">예상 근무시간</label>
            <input
              type="text"
              value={durationLabel}
              readOnly
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">사유</label>
            <textarea
              value={ot.form.reason}
              onChange={(e) => ot.setForm({ ...ot.form, reason: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="연장근무 사유를 입력하세요"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-gray-900">결재라인</h2>
            <p className="text-xs text-gray-500 mt-1">
              여기서 추가한 결재자가 순서대로 승인해야 최종 승인됩니다. 아무도 추가하지 않으면 결재 대기열에 표시되지 않습니다.
            </p>
          </div>

          <PersonCard
            target="approver"
            title="결재 라인"
            entries={approvers}
            draggable
            stepLabel
            openPicker={openPicker}
            pickerQuery={pickerQuery}
            filteredPickerUsers={filteredPickerUsers}
            draggedKey={draggedKey}
            dropTargetKey={dropTargetKey}
            getTeamLabel={getTeamLabel}
            onTogglePicker={togglePicker}
            onQueryChange={setPickerQuery}
            onAddPerson={addPerson}
            onRemovePerson={removePerson}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
          <PersonCard
            target="cc"
            title="참조"
            entries={ccUsers}
            openPicker={openPicker}
            pickerQuery={pickerQuery}
            filteredPickerUsers={filteredPickerUsers}
            draggedKey={draggedKey}
            dropTargetKey={dropTargetKey}
            getTeamLabel={getTeamLabel}
            onTogglePicker={togglePicker}
            onQueryChange={setPickerQuery}
            onAddPerson={addPerson}
            onRemovePerson={removePerson}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        </div>
      </div>

      <div className="flex gap-2 pb-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!ot.canSubmit || ot.submitting || deleting}
          className="flex-1 px-4 py-2 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700 disabled:opacity-40"
        >
          {ot.submitting ? (isEditMode ? '수정 중...' : '제출 중...') : isEditMode ? '수정 완료' : '신청'}
        </button>
        {isEditMode && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || ot.submitting}
            className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-sm rounded-md hover:bg-red-100 disabled:opacity-40"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
        >
          취소
        </button>
      </div>
    </div>
  );
};

export default OvertimeRequestFormBody;
