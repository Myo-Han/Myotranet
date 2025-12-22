// 출퇴근 직접수정
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';
import ProfileModal from './ProfileModal';
import { ATTENDANCE_STATUS_OPTIONS, CURRENT_STATUS_OPTIONS, EVENT_TYPE_OPTIONS, getEventTypeLabel, } from '../utils/attendanceLabels';

type UserRow = {
  id: string;
  name: string | null;
  profile_picture: string | null;
  role?: string | null;
  is_active?: boolean | null;
  current_status?: string | null;
};

type AttendanceRow = {
  id: string;
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  total_work_seconds: number | null;
};

type AttendanceEventRow = {
  id: string;
  attendance_id: string;
  user_id: string;
  event_type: string; // check_in | check_out | pause | resume | etc
  occurred_at: string;
  reason_category: string | null;
  notes: string | null;
};

const getTodayDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const isoToLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const localInputToIso = (localValue: string) => {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const secondsToHhmm = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const hhmmToSeconds = (hhmm: string) => {
  const raw = (hhmm || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mi)) return null;
  return h * 3600 + mi * 60;
};

const calcWorkSecondsFromEvents = (checkInIso: string, checkOutIso: string, events: AttendanceEventRow[]) => {
  const startMs = new Date(checkInIso).getTime();
  const endMs = new Date(checkOutIso).getTime();
  if (!(endMs > startMs)) return 0;

  const sorted = [...events]
    .filter((e) => e.event_type === 'pause' || e.event_type === 'resume')
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  let totalPauseSeconds = 0;
  let lastPauseMs: number | null = null;

  for (const ev of sorted) {
    const t = new Date(ev.occurred_at).getTime();
    if (ev.event_type === 'pause') {
      lastPauseMs = t;
      continue;
    }
    if (ev.event_type === 'resume' && lastPauseMs !== null) {
      const pauseStart = Math.max(lastPauseMs, startMs);
      const pauseEnd = Math.min(t, endMs);
      if (pauseEnd > pauseStart) totalPauseSeconds += (pauseEnd - pauseStart) / 1000;
      lastPauseMs = null;
    }
  }

  if (lastPauseMs !== null) {
    const pauseStart = Math.max(lastPauseMs, startMs);
    const pauseEnd = endMs;
    if (pauseEnd > pauseStart) totalPauseSeconds += (pauseEnd - pauseStart) / 1000;
  }

  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  return Math.max(0, totalSeconds - Math.floor(totalPauseSeconds));
};

const AttendanceAdminEditor: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'Admin' || user?.role === 'Manager';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [events, setEvents] = useState<AttendanceEventRow[]>([]);

  const [form, setForm] = useState({
    checkInLocal: '',
    checkOutLocal: '',
    status: 'working',
    totalHhmm: '00:00',
  });

  const [newEvent, setNewEvent] = useState({
    event_type: 'pause',
    occurredLocal: '',
    reason_category: '',
    notes: '',
  });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventEdit, setEventEdit] = useState({
    event_type: '',
    occurredLocal: '',
    reason_category: '',
    notes: '',
  });

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.name || '').toLowerCase();
      return name.includes(q);
    });
  }, [users, query]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find((u) => u.id === selectedUserId) ?? null;
  }, [users, selectedUserId]);

  const [currentStatusEdit, setCurrentStatusEdit] = useState<string>('');

  useEffect(() => {
    setCurrentStatusEdit(selectedUser?.current_status ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, selectedUser?.current_status]);

  const saveCurrentStatus = async () => {
    if (!selectedUserId) return;

    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('users')
        .update({ current_status: currentStatusEdit || null })
        .eq('id', selectedUserId);

      if (error) throw error;

      setSuccess('현재상태가 변경되었습니다.');
      await fetchUsers();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(e?.message || '현재상태 변경 실패');
    }
  };

  const openProfile = (uid: string) => {
    setSelectedProfileUserId(uid);
    setShowProfileModal(true);
  };

  const closeProfile = () => {
    setShowProfileModal(false);
    setSelectedProfileUserId(null);
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, profile_picture, role, is_active, current_status')
      .order('name', { ascending: true });

    if (error) throw error;

    setUsers((data ?? []) as any);
    if (!selectedUserId && (data ?? []).length) setSelectedUserId((data as any)[0].id);
  };

  const fetchAttendanceAndEvents = async (targetUserId: string, date: string) => {
    setError('');
    setSuccess('');

    const { data: aData, error: aErr } = await supabase
      .from('attendance')
      .select('id, user_id, date, check_in, check_out, status, total_work_seconds')
      .eq('user_id', targetUserId)
      .eq('date', date)
      .maybeSingle();

    if (aErr && aErr.code !== 'PGRST116') throw aErr;

    if (!aData) {
      setAttendance(null);
      setEvents([]);
      setForm({
        checkInLocal: '',
        checkOutLocal: '',
        status: 'working',
        totalHhmm: '00:00',
      });
      return;
    }

    const att = aData as any as AttendanceRow;
    setAttendance(att);

    const { data: eData, error: eErr } = await supabase
      .from('attendance_events')
      .select('id, attendance_id, user_id, event_type, occurred_at, reason_category, notes')
      .eq('attendance_id', att.id)
      .order('occurred_at', { ascending: true });

    if (eErr) throw eErr;

    const evs = (eData ?? []) as any as AttendanceEventRow[];
    setEvents(evs);

    setForm({
      checkInLocal: isoToLocalInput(att.check_in),
      checkOutLocal: isoToLocalInput(att.check_out),
      status: (att.status || 'working') as any,
      totalHhmm: secondsToHhmm(att.total_work_seconds ?? 0),
    });
  };

  const fetchAll = async () => {
    if (!canEdit) return;
    setLoading(true);
    setError('');
    try {
      await fetchUsers();
    } catch (e: any) {
      setError(e?.message || '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    if (!selectedUserId) return;
    fetchAttendanceAndEvents(selectedUserId, selectedDate).catch((e: any) => {
      setError(e?.message || '출근 데이터 로드 실패');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, selectedDate, canEdit]);

  const recalcAndApplyToForm = () => {
    if (!attendance) {
      setError('attendance 레코드가 없습니다.');
      return;
    }
    const ci = localInputToIso(form.checkInLocal);
    const co = localInputToIso(form.checkOutLocal);
    if (!ci || !co) {
      setError('출근/퇴근 시간을 모두 입력하세요.');
      return;
    }
    const sec = calcWorkSecondsFromEvents(ci, co, events);
    setForm((p) => ({ ...p, totalHhmm: secondsToHhmm(sec) }));
    setSuccess('누적시간을 재계산했습니다.');
    setTimeout(() => setSuccess(''), 2000);
  };

  const saveAttendance = async () => {
    if (!attendance) {
      setError('attendance 레코드가 없습니다.');
      return;
    }
    setError('');
    setSuccess('');

    try {
      const check_in = localInputToIso(form.checkInLocal);
      const check_out = localInputToIso(form.checkOutLocal);

      const sec = hhmmToSeconds(form.totalHhmm);
      if (sec === null) {
        setError('누적시간 형식이 올바르지 않습니다. (예: 08:30)');
        return;
      }

      const patch: any = {
        status: form.status || null,
        total_work_seconds: sec,
        check_in: check_in,
        check_out: check_out,
      };

      const { error: updErr } = await supabase.from('attendance').update(patch).eq('id', attendance.id);
      if (updErr) throw updErr;

      setSuccess('저장되었습니다.');
      await fetchAttendanceAndEvents(attendance.user_id, attendance.date);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    }
  };

  const createAttendance = async () => {
    if (!selectedUserId) return;

    setError('');
    setSuccess('');

    try {
      const check_in = localInputToIso(form.checkInLocal);
      const check_out = localInputToIso(form.checkOutLocal);

      const sec = hhmmToSeconds(form.totalHhmm);
      if (sec === null) {
        setError('누적시간 형식이 올바르지 않습니다. (예: 08:30)');
        return;
      }

      const payload: any = {
        user_id: selectedUserId,
        date: selectedDate,
        status: form.status || null,
        total_work_seconds: sec,
        check_in,
        check_out,
      };

      const { error: insErr } = await supabase.from('attendance').insert(payload);
      if (insErr) throw insErr;

      setSuccess('attendance 레코드가 생성되었습니다.');
      await fetchAttendanceAndEvents(selectedUserId, selectedDate);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e?.message || '생성 실패');
    }
  };

  const addEvent = async () => {
    if (!attendance || !selectedUserId) {
      setError('attendance 레코드가 없습니다.');
      return;
    }
    setError('');
    setSuccess('');

    try {
      const occurred_at = localInputToIso(newEvent.occurredLocal);
      if (!occurred_at) {
        setError('이벤트 시간을 입력하세요.');
        return;
      }

      const { error: insErr } = await supabase.from('attendance_events').insert({
        attendance_id: attendance.id,
        user_id: selectedUserId,
        event_type: newEvent.event_type,
        occurred_at,
        reason_category: newEvent.reason_category || null,
        notes: newEvent.notes || null,
      });

      if (insErr) throw insErr;

      setSuccess('이벤트가 추가되었습니다.');
      setNewEvent({ event_type: 'pause', occurredLocal: '', reason_category: '', notes: '' });
      await fetchAttendanceAndEvents(attendance.user_id, attendance.date);
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(e?.message || '이벤트 추가 실패');
    }
  };

  const startEditEvent = (ev: AttendanceEventRow) => {
    setEditingEventId(ev.id);
    setEventEdit({
      event_type: ev.event_type,
      occurredLocal: isoToLocalInput(ev.occurred_at),
      reason_category: ev.reason_category || '',
      notes: ev.notes || '',
    });
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEventEdit({ event_type: '', occurredLocal: '', reason_category: '', notes: '' });
  };

  const saveEditEvent = async () => {
    if (!editingEventId) return;
    setError('');
    setSuccess('');

    try {
      const occurred_at = localInputToIso(eventEdit.occurredLocal);
      if (!occurred_at) {
        setError('이벤트 시간을 입력하세요.');
        return;
      }

      const { error: updErr } = await supabase
        .from('attendance_events')
        .update({
          event_type: eventEdit.event_type,
          occurred_at,
          reason_category: eventEdit.reason_category || null,
          notes: eventEdit.notes || null,
        })
        .eq('id', editingEventId);

      if (updErr) throw updErr;

      setSuccess('이벤트가 수정되었습니다.');
      if (attendance) await fetchAttendanceAndEvents(attendance.user_id, attendance.date);
      cancelEditEvent();
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(e?.message || '이벤트 수정 실패');
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!attendance) return;
    setError('');
    setSuccess('');

    try {
      const { error: delErr } = await supabase.from('attendance_events').delete().eq('id', eventId);
      if (delErr) throw delErr;

      setSuccess('이벤트가 삭제되었습니다.');
      await fetchAttendanceAndEvents(attendance.user_id, attendance.date);
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(e?.message || '이벤트 삭제 실패');
    }
  };

  if (!canEdit) {
    return <div className="bg-white shadow rounded-lg p-6 text-sm text-gray-600">권한이 없습니다.</div>;
  }

  if (loading) return <Loading />;

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-semibold">출근 기록 관리자 수정</h2>
        <button
          onClick={fetchAll}
          className="text-sm px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          type="button"
        >
          새로고침
        </button>
      </div>

      <div className="p-4">
        {error && <ErrorMessage message={error} />}
        {success && <SuccessMessage message={success} />}
      </div>

      <div className="flex gap-4 p-4">
        {/* Left (30%): user list */}
        <div className="w-[30%] min-w-[280px] border rounded-lg overflow-hidden">
          <div className="p-3 border-b bg-gray-50">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 검색"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="max-h-[70vh] overflow-auto divide-y">
            {filteredUsers.map((u) => {
              const isSel = u.id === selectedUserId;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUserId(u.id)}
                  className={[
                    'w-full text-left px-4 py-3 hover:bg-gray-50',
                    isSel ? 'bg-blue-50' : 'bg-white',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3">
                    {u.profile_picture ? (
                      <img src={u.profile_picture} className="h-9 w-9 rounded-full object-cover" alt="profile" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                        {(u.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{u.name || '이름 없음'}</div>
                      <div className="text-xs text-gray-500">{u.role || '-'}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredUsers.length === 0 && <div className="p-4 text-sm text-gray-500">사용자가 없습니다.</div>}
          </div>
        </div>

        {/* Right (70%): editor */}
        <div className="flex-1 border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-700">편집</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              />
              {selectedUserId && (
                <button
                  type="button"
                  onClick={() => openProfile(selectedUserId)}
                  className="px-3 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50"
                >
                  프로필
                </button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="text-sm text-gray-700">
              대상: <span className="font-semibold">{selectedUser?.name || '선택 안 됨'}</span>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-800">현재상태</div>

              <select
                value={currentStatusEdit}
                onChange={(e) => setCurrentStatusEdit(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                {CURRENT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || '__empty__'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={saveCurrentStatus}
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              >
                현재상태 저장
              </button>
            </div>

            {!attendance ? (
              <div className="border rounded-lg p-4 space-y-4">
                <div className="text-sm text-gray-600">해당 날짜에 attendance 레코드가 없습니다.</div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-800">생성: 출퇴근/상태</div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">출근</label>
                      <input
                        type="datetime-local"
                        value={form.checkInLocal}
                        onChange={(e) => setForm((p) => ({ ...p, checkInLocal: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">퇴근</label>
                      <input
                        type="datetime-local"
                        value={form.checkOutLocal}
                        onChange={(e) => setForm((p) => ({ ...p, checkOutLocal: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      >
                        {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-800">생성: 누적시간</div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">누적 (HH:MM)</label>
                      <input
                        value={form.totalHhmm}
                        onChange={(e) => setForm((p) => ({ ...p, totalHhmm: e.target.value }))}
                        placeholder="예: 08:30"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={createAttendance}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      attendance 생성
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-800">출퇴근/상태</div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">출근</label>
                      <input
                        type="datetime-local"
                        value={form.checkInLocal}
                        onChange={(e) => setForm((p) => ({ ...p, checkInLocal: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">퇴근</label>
                      <input
                        type="datetime-local"
                        value={form.checkOutLocal}
                        onChange={(e) => setForm((p) => ({ ...p, checkOutLocal: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      >
                        {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-800">누적시간</div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">누적 (HH:MM)</label>
                      <input
                        value={form.totalHhmm}
                        onChange={(e) => setForm((p) => ({ ...p, totalHhmm: e.target.value }))}
                        placeholder="예: 08:30"
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={recalcAndApplyToForm}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                      >
                        이벤트 기준 재계산
                      </button>
                      <button
                        type="button"
                        onClick={saveAttendance}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800">이벤트(중단/재개 등)</div>
                    <div className="text-xs text-gray-500">
                      pause/resume 페어 기반으로 계산됩니다.
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Add new event */}
                    <div className="grid grid-cols-4 gap-3 items-end border rounded-lg p-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">타입</label>
                        <select
                          value={newEvent.event_type}
                          onChange={(e) => setNewEvent((p) => ({ ...p, event_type: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        >
                          {EVENT_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">시간</label>
                        <input
                          type="datetime-local"
                          value={newEvent.occurredLocal}
                          onChange={(e) => setNewEvent((p) => ({ ...p, occurredLocal: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">카테고리</label>
                        <input
                          value={newEvent.reason_category}
                          onChange={(e) => setNewEvent((p) => ({ ...p, reason_category: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={addEvent}
                          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                        >
                          추가
                        </button>
                      </div>

                      <div className="col-span-4">
                        <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                        <input
                          value={newEvent.notes}
                          onChange={(e) => setNewEvent((p) => ({ ...p, notes: e.target.value }))}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    {/* Events list */}
                    <div className="divide-y border rounded-lg overflow-hidden">
                      {events.length === 0 && (
                        <div className="p-4 text-sm text-gray-500">이벤트가 없습니다.</div>
                      )}

                      {events.map((ev) => {
                        const isEditing = editingEventId === ev.id;
                        return (
                          <div key={ev.id} className="p-4">
                            {!isEditing ? (
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {getEventTypeLabel(ev.event_type)}{' '}
                                    <span className="text-xs text-gray-500 ml-2">
                                      {new Date(ev.occurred_at).toLocaleString('ko-KR')}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1 truncate">
                                    {ev.reason_category || '-'} · {ev.notes || '-'}
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditEvent(ev)}
                                    className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50"
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteEvent(ev.id)}
                                    className="px-3 py-1 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50"
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-4 gap-3 items-end">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">타입</label>
                                  <select
                                    value={eventEdit.event_type}
                                    onChange={(e) => setEventEdit((p) => ({ ...p, event_type: e.target.value }))}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                  >
                                    {EVENT_TYPE_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">시간</label>
                                  <input
                                    type="datetime-local"
                                    value={eventEdit.occurredLocal}
                                    onChange={(e) => setEventEdit((p) => ({ ...p, occurredLocal: e.target.value }))}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">카테고리</label>
                                  <input
                                    value={eventEdit.reason_category}
                                    onChange={(e) => setEventEdit((p) => ({ ...p, reason_category: e.target.value }))}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                  />
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={saveEditEvent}
                                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                  >
                                    저장
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditEvent}
                                    className="flex-1 px-3 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 text-sm"
                                  >
                                    취소
                                  </button>
                                </div>

                                <div className="col-span-4">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">메모</label>
                                  <input
                                    value={eventEdit.notes}
                                    onChange={(e) => setEventEdit((p) => ({ ...p, notes: e.target.value }))}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {user && showProfileModal && selectedProfileUserId && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={closeProfile}
          userId={selectedProfileUserId}
          currentUserId={user.id}
          readOnly
        />
      )}
    </div>
  );
};

export default AttendanceAdminEditor;
