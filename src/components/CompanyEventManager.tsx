// 경조사(결혼/부고 등) 관리자 등록 화면.
// company_events RLS: INSERT/UPDATE/DELETE는 is_admin()만 허용, SELECT는 로그인 사용자 전체 허용.
// 메인 홈 TeamEventsCard의 "경조사" 탭이 이 테이블을 읽어서 프로필 사진 없이
// event_date/title/name_snapshot/department_snapshot만 노출한다.
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

type EventType = 'marriage' | 'condolence' | 'childbirth' | 'other';

interface CompanyEvent {
  id: string;
  event_type: EventType;
  title: string;
  event_date: string; // date
  detail: string | null;
  name_snapshot: string;
  department_snapshot: string | null;
  is_active: boolean;
  created_at: string;
}

type UserLite = {
  id: string;
  name: string | null;
  department: string | null;
};

type OrgItem = { code: string; name: string };

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  marriage: '결혼',
  condolence: '부고',
  childbirth: '출산',
  other: '기타',
};

const emptyDraft = (): Omit<CompanyEvent, 'id' | 'created_at'> => ({
  event_type: 'marriage',
  title: '',
  event_date: new Date().toISOString().split('T')[0],
  detail: '',
  name_snapshot: '',
  department_snapshot: null,
  is_active: true,
});

const CompanyEventManager: React.FC = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [departments, setDepartments] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState<CompanyEvent | (Omit<CompanyEvent, 'id' | 'created_at'> & { id?: undefined }) | null>(null);
  const [saving, setSaving] = useState(false);

  const getDeptName = (code: string | null) => {
    const c = (code || '').trim();
    if (!c) return '';
    return departments.find((d) => d.code === c)?.name || c;
  };

  const fetchAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: eventRows, error: eventErr }, { data: userRows }, { data: orgRow }] = await Promise.all([
        supabase
          .from('company_events')
          .select('id,event_type,title,event_date,detail,name_snapshot,department_snapshot,is_active,created_at')
          .order('event_date', { ascending: false }),
        supabase.from('users').select('id,name,department').order('name', { ascending: true }),
        supabase.from('org_settings').select('config').single(),
      ]);

      if (eventErr) throw eventErr;

      setEvents((eventRows || []) as CompanyEvent[]);
      setUsers((userRows || []) as UserLite[]);
      setDepartments(((orgRow?.config?.departments || []) as OrgItem[]));
    } catch (e: any) {
      setError(e?.message || '경조사 목록 로딩 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleNew = () => setEditing(emptyDraft());

  const handlePickUser = (userId: string) => {
    if (!editing) return;
    const u = users.find((x) => x.id === userId);
    if (!u) return;
    setEditing({ ...editing, name_snapshot: u.name || '', department_snapshot: u.department || null });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.name_snapshot.trim() || !editing.event_date) {
      setError('제목, 대상자 이름, 날짜는 필수입니다');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        event_type: editing.event_type,
        title: editing.title.trim(),
        event_date: editing.event_date,
        detail: editing.detail?.trim() || null,
        name_snapshot: editing.name_snapshot.trim(),
        department_snapshot: editing.department_snapshot,
        is_active: editing.is_active,
      };

      if ((editing as CompanyEvent).id) {
        const { data, error: updErr } = await supabase
          .from('company_events')
          .update(payload)
          .eq('id', (editing as CompanyEvent).id)
          .select('id,event_type,title,event_date,detail,name_snapshot,department_snapshot,is_active,created_at')
          .single();
        if (updErr) throw updErr;
        setEvents((prev) => prev.map((ev) => (ev.id === data.id ? (data as CompanyEvent) : ev)));
      } else {
        const { data, error: insErr } = await supabase
          .from('company_events')
          .insert({ ...payload, created_by: user?.id ?? null })
          .select('id,event_type,title,event_date,detail,name_snapshot,department_snapshot,is_active,created_at')
          .single();
        if (insErr) throw insErr;
        setEvents((prev) => [data as CompanyEvent, ...prev]);
      }
      setSuccess('저장되었습니다.');
      setEditing(null);
      setTimeout(() => setSuccess(''), 2000);
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    setError('');
    try {
      const { error: delErr } = await supabase.from('company_events').delete().eq('id', id);
      if (delErr) throw delErr;
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
      if ((editing as CompanyEvent)?.id === id) setEditing(null);
    } catch (e: any) {
      setError(e?.message || '삭제 실패');
    }
  };

  const toggleActive = async (ev: CompanyEvent) => {
    setError('');
    try {
      const { data, error: updErr } = await supabase
        .from('company_events')
        .update({ is_active: !ev.is_active })
        .eq('id', ev.id)
        .select('id,event_type,title,event_date,detail,name_snapshot,department_snapshot,is_active,created_at')
        .single();
      if (updErr) throw updErr;
      setEvents((prev) => prev.map((e) => (e.id === data.id ? (data as CompanyEvent) : e)));
    } catch (e: any) {
      setError(e?.message || '상태 변경 실패');
    }
  };

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">경조사 관리</h2>
          <p className="text-xs text-gray-500 mt-1">
            결혼/부고/출산 등 경조사 소식을 등록하면 메인 홈 &quot;경조사&quot; 탭에 노출됩니다. (프로필 사진 없이 날짜·이름·부서만 노출)
          </p>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          새 경조사 등록
        </button>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 목록 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-600">등록된 경조사</h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-xs text-gray-400">등록된 경조사가 없습니다.</p>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => setEditing(ev)}
                  className={`border rounded-md px-4 py-3 cursor-pointer transition ${(editing as CompanyEvent)?.id === ev.id
                    ? 'bg-indigo-50 border-indigo-300'
                    : 'bg-white hover:bg-gray-50'
                    } ${!ev.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {EVENT_TYPE_LABEL[ev.event_type]}
                        </span>
                        <h4 className="text-sm font-semibold text-gray-900 truncate">{ev.title}</h4>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {ev.name_snapshot}
                        {getDeptName(ev.department_snapshot) ? ` · ${getDeptName(ev.department_snapshot)}` : ''} · {ev.event_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActive(ev);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        {ev.is_active ? '숨기기' : '노출'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(ev.id);
                        }}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 편집기 */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-600">
            {(editing as CompanyEvent)?.id ? '경조사 수정' : editing ? '새 경조사 등록' : ''}
          </h3>
          {editing ? (
            <div className="border rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유형</label>
                <select
                  value={editing.event_type}
                  onChange={(e) => setEditing({ ...editing, event_type: e.target.value as EventType })}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  {Object.entries(EVENT_TYPE_LABEL).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">제목</label>
                <input
                  type="text"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full rounded-md border-gray-300 text-sm"
                  placeholder="예: OOO님 결혼을 축하합니다"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">직원에서 선택 (선택 입력)</label>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && handlePickUser(e.target.value)}
                  className="w-full rounded-md border-gray-300 text-sm"
                >
                  <option value="">직접 입력</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">대상자 이름</label>
                  <input
                    type="text"
                    value={editing.name_snapshot}
                    onChange={(e) => setEditing({ ...editing, name_snapshot: e.target.value })}
                    className="w-full rounded-md border-gray-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">부서</label>
                  <select
                    value={editing.department_snapshot || ''}
                    onChange={(e) => setEditing({ ...editing, department_snapshot: e.target.value || null })}
                    className="w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">-</option>
                    {departments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">날짜</label>
                <input
                  type="date"
                  value={editing.event_date}
                  onChange={(e) => setEditing({ ...editing, event_date: e.target.value })}
                  className="w-full rounded-md border-gray-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">상세 내용 (선택, 관리자만 조회)</label>
                <textarea
                  value={editing.detail || ''}
                  onChange={(e) => setEditing({ ...editing, detail: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border-gray-300 text-sm"
                  placeholder="장례식장 위치 등 내부 참고용 메모"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={editing.is_active}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <label className="text-xs text-gray-600">메인 홈에 노출</label>
              </div>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 text-xs font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium disabled:opacity-50"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              왼쪽에서 경조사를 선택하거나 &quot;새 경조사 등록&quot; 버튼으로 작성하면 여기에서 편집할 수 있습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanyEventManager;
