// 연차 신청 전용 페이지 (기존에는 Leave.tsx 안의 모달이었음).
// 신청 폼 + "결재라인" 섹션(결재 순서/참조를 신청자가 직접 구성)을 가로로 나란히 보여준다.
// 결재 순서에 추가한 사람들은 기존 자동매칭 결재선 뒤에 "추가로" 붙는 결재 단계가 되고,
// 참조에 추가한 사람들은 결재와 무관하게 알림(알림벨)만 받는다.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { useLeaveRequest, todayKey } from '../hooks/useLeaveRequest';
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

const LeaveRequestPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const lr = useLeaveRequest(user);

  const [users, setUsers] = useState<UserLite[]>([]);
  const [projects, setProjects] = useState<OrgItem[]>([]);
  const [departments, setDepartments] = useState<OrgItem[]>([]);

  const [approvers, setApprovers] = useState<PersonEntry[]>([]);
  const [ccUsers, setCcUsers] = useState<PersonEntry[]>([]);

  const [openPicker, setOpenPicker] = useState<'approver' | 'cc' | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, orgRes] = await Promise.all([
          supabase.from('users').select('id, name, department, project').eq('is_active', true).order('name', { ascending: true }),
          supabase.from('org_settings').select('config').single(),
        ]);

        setUsers((usersRes.data || []) as UserLite[]);
        setProjects(((orgRes.data?.config?.projects as OrgItem[]) || []));
        setDepartments(((orgRes.data?.config?.departments as OrgItem[]) || []));
      } catch (e) {
        console.error('구성원 목록 로딩 실패:', e);
      }
    };
    load();
  }, []);

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

  const addPerson = (target: 'approver' | 'cc', u: UserLite) => {
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

  const removePerson = (target: 'approver' | 'cc', key: string) => {
    if (target === 'approver') setApprovers((prev) => prev.filter((p) => p.key !== key));
    else setCcUsers((prev) => prev.filter((p) => p.key !== key));
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

  const handleSubmit = async () => {
    setSubmitError('');
    const ok = await lr.submit({
      approverIds: approvers.map((p) => p.userId),
      ccIds: ccUsers.map((p) => p.userId),
    });
    if (ok) {
      navigate('/leave');
    } else {
      setSubmitError(lr.error || '신청에 실패했습니다');
    }
  };

  const PersonCard: React.FC<{
    target: 'approver' | 'cc';
    title: string;
    entries: PersonEntry[];
    draggable?: boolean;
    stepLabel?: boolean;
  }> = ({ target, title, entries, draggable, stepLabel }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={() => {
            setOpenPicker((prev) => (prev === target ? null : target));
            setPickerQuery('');
          }}
          className="h-7 w-7 flex items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          +
        </button>
      </div>

      {openPicker === target && (
        <div className="mb-3 border border-gray-200 rounded-md p-2 bg-gray-50">
          <input
            type="text"
            autoFocus
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
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
                  onClick={() => addPerson(target, u)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-white text-sm flex items-center justify-between"
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
              onDragStart={() => draggable && handleDragStart(p.key)}
              onDragOver={(e) => draggable && handleDragOver(e, p.key)}
              onDragLeave={() => draggable && handleDragLeave()}
              onDrop={() => draggable && handleDrop(p.key)}
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
                onClick={() => removePerson(target, p.key)}
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

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">연차 신청</h1>
        <button
          type="button"
          onClick={() => navigate('/leave')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          취소하고 돌아가기
        </button>
      </div>

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

          <PersonCard target="approver" title="결재 순서" entries={approvers} draggable stepLabel />
          <PersonCard target="cc" title="참조" entries={ccUsers} />
        </div>
      </div>

      <div className="flex gap-2 pb-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!lr.canSubmit || lr.submitting}
          className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          {lr.submitting ? '제출 중...' : '신청'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/leave')}
          className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          취소
        </button>
      </div>
    </div>
  );
};

export default LeaveRequestPage;
