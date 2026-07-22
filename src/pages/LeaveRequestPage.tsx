// 연차 신청 전용 페이지 (기존에는 Leave.tsx 안의 모달이었음).
// 신청 폼 + "결재라인" 섹션(결재 순서/참조를 신청자가 직접 구성)을 가로로 나란히 보여준다.
// 결재 순서에 추가한 사람들은 기존 자동매칭 결재선 뒤에 "추가로" 붙는 결재 단계가 되고,
// 참조에 추가한 사람들은 결재와 무관하게 알림(알림벨)만 받는다.
//
// 주의: PersonCard는 반드시 이 파일의 모듈 스코프(컴포넌트 함수 밖)에 정의해야 한다.
// 예전에는 LeaveRequestPage 함수 안에서 정의했는데, 그러면 부모가 리렌더될 때마다
// PersonCard가 "새로운 컴포넌트 타입"으로 취급되어 React가 매번 그 서브트리 전체를
// 언마운트 후 재마운트한다. 사용자가 "+ 추가" 버튼을 눌러도 mousedown과 mouseup 사이에
// 리렌더가 끼면 클릭 이벤트 자체가 유실되어 "버튼이 눌리는 것 같은데 아무 반응이 없는"
// 증상이 나타난다.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useLeaveRequest, todayKey, deleteLeaveRequest } from '../hooks/useLeaveRequest';
import ErrorMessage from '../components/ErrorMessage';

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
  <div className="bg-white rounded-lg border border-gray-200 p-5">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <button
        type="button"
        onClick={() => onTogglePicker(target)}
        className="flex items-center gap-1 h-9 px-3 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
      >
        <span className="text-base leading-none">+</span> 추가
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
      <p className="text-sm text-gray-400 py-3">추가된 사람이 없습니다.</p>
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
            className={`flex items-center justify-between py-2.5 ${draggable ? 'cursor-move' : ''} ${draggedKey === p.key ? 'opacity-30' : ''
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
              className="text-gray-400 hover:text-red-600 px-2"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
);

const LeaveRequestPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { leaveId } = useParams<{ leaveId?: string }>();
  const isEditMode = Boolean(leaveId);
  const lr = useLeaveRequest(user);

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

        // ✅ 수정 모드면, 구성원 목록을 다 불러온 뒤 기존 신청 내용 + 결재라인(결재자/참조)을
        // 불러와서 폼과 PersonCard 상태를 채운다. 구성원 목록이 있어야 user_id로부터
        // 이름/소속 라벨(PersonEntry)을 만들 수 있어서, 이 안에서 순서대로 처리한다.
        if (isEditMode && leaveId) {
          const result = await lr.loadForEdit(leaveId);
          if (!result.ok) {
            setEditBlockedError(result.error || '휴가 신청을 불러올 수 없습니다');
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
  }, [leaveId]);

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

  // ✅ 수정 모드에서는 잔여일수 검증을 hook의 canSubmit(제출 시점 기준 잔액)에 맡기지 않는다.
  // 이미 승인 완료된 건을 수정할 때는 서버(update_leave_request RPC)가 차감분을 복구한 뒤에야
  // 정확한 잔액을 알 수 있어서, 프론트가 들고 있는 값은 낡은(복구 전) 잔액일 수 있기 때문이다.
  // 실제 잔액 검증은 RPC 안에서 이루어지고, 여기서는 폼 자체가 유효한지만 확인한다.
  const canSubmitForEdit = useMemo(() => {
    if (!user) return false;
    if (!lr.form.startDate || !lr.form.reason.trim()) return false;
    if (lr.isAnnual && !lr.form.endDate) return false;
    if (lr.isQuarterDay && !lr.form.quarterStartTime) return false;
    if (lr.daysRequested <= 0) return false;
    return true;
  }, [user, lr.form, lr.isAnnual, lr.isQuarterDay, lr.daysRequested]);

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

  const handleSubmit = async () => {
    setSubmitError('');
    const customApprovals = {
      approverIds: approvers.map((p) => p.userId),
      ccIds: ccUsers.map((p) => p.userId),
    };
    const ok = isEditMode && leaveId
      ? await lr.updateExisting(leaveId, customApprovals)
      : await lr.submit(customApprovals);
    if (ok) {
      navigate('/attendance', { state: { category: 'leave' } });
    } else {
      setSubmitError(lr.error || (isEditMode ? '수정에 실패했습니다' : '신청에 실패했습니다'));
    }
  };

  const handleDelete = async () => {
    if (!leaveId) return;
    if (!window.confirm('이 휴가 신청을 삭제하시겠습니까? 이미 승인된 건이라면 차감된 잔액도 함께 복구됩니다.')) return;

    setDeleting(true);
    setSubmitError('');
    const result = await deleteLeaveRequest(leaveId);
    setDeleting(false);
    if (result.ok) {
      navigate('/attendance', { state: { category: 'leave' } });
    } else {
      setSubmitError(result.error || '삭제에 실패했습니다');
    }
  };

  if (isEditMode && editLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-sm text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (isEditMode && editBlockedError) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <ErrorMessage message={editBlockedError} />
        <button
          type="button"
          onClick={() => navigate('/attendance', { state: { category: 'leave' } })}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{isEditMode ? '연차 신청 수정' : '연차 신청'}</h1>
        <button
          type="button"
          onClick={() => navigate('/attendance', { state: { category: 'leave' } })}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          취소하고 돌아가기
        </button>
      </div>

      {isEditMode && (
        <div className="text-sm bg-amber-50 border border-amber-100 rounded-md px-3 py-2 text-amber-800">
          내용을 수정하면 결재라인(결재자/참조)이 다시 구성되고, 결재는 처음 단계부터 다시 진행됩니다.
          이미 승인 완료된 건이었다면 차감된 잔액도 함께 복구된 뒤 다시 계산됩니다.
        </div>
      )}

      {(submitError || lr.error) && <ErrorMessage message={submitError || lr.error} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          {lr.balancePoolLabel && (
            <div className="text-sm bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-blue-800">
              현재 {lr.balancePoolLabel} 잔여일수: <span className="font-semibold">{lr.availableBalance}일</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">휴가 유형</label>
            {lr.policies.length === 0 ? (
              <p className="text-sm text-red-600">사용 가능한 휴가 정책이 없습니다. 관리자에게 문의하세요.</p>
            ) : (
              <select
                value={lr.form.leaveType}
                onChange={(e) => lr.setForm({ ...lr.form, leaveType: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                {lr.policies.map((policy) => (
                  <option key={policy.policy_code} value={policy.policy_code}>
                    {policy.policy_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {lr.isAnnual ? '시작일' : '사용일'}
            </label>
            <input
              type="date"
              value={lr.form.startDate}
              onChange={(e) => lr.setForm({ ...lr.form, startDate: e.target.value })}
              min={todayKey()}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>

          {lr.isAnnual && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
              <input
                type="date"
                value={lr.form.endDate}
                onChange={(e) => lr.setForm({ ...lr.form, endDate: e.target.value })}
                min={lr.form.startDate || todayKey()}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          )}

          {lr.isHalfDay && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">반차 구분</label>
              <select
                value={lr.form.halfDayPeriod}
                onChange={(e) => lr.setForm({ ...lr.form, halfDayPeriod: e.target.value as 'am' | 'pm' })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="am">오전 반차</option>
                <option value="pm">오후 반차</option>
              </select>
            </div>
          )}

          {lr.isQuarterDay && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작 시각</label>
              <input
                type="time"
                value={lr.form.quarterStartTime}
                onChange={(e) => lr.setForm({ ...lr.form, quarterStartTime: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">일수</label>
            <input
              type="number"
              value={lr.daysRequested}
              readOnly
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
            <textarea
              value={lr.form.reason}
              onChange={(e) => lr.setForm({ ...lr.form, reason: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="휴가 사유를 입력하세요"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">결재라인</h2>
            <p className="text-xs text-gray-500 mt-1">
              여기서 추가한 사람은 소속 기준으로 자동 매칭되는 결재선에 추가로 덧붙습니다. 비워두면 기존 자동매칭 결재선만 적용됩니다.
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

      <div className="flex gap-2 pb-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={(isEditMode ? !canSubmitForEdit : !lr.canSubmit) || lr.submitting || deleting}
          className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          {lr.submitting ? (isEditMode ? '수정 중...' : '제출 중...') : isEditMode ? '수정 완료' : '신청'}
        </button>
        {isEditMode && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || lr.submitting}
            className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/attendance', { state: { category: 'leave' } })}
          className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          취소
        </button>
      </div>
    </div>
  );
};

export default LeaveRequestPage;
