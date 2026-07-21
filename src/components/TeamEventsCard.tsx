// 메인 홈 - 생일/경조사 탭 카드
// 생일: 이번 달 생일인 직원의 프로필 사진 + 이름만 노출
// 경조사: 관리자가 등록한 결혼/부고 등 소식. 프로필 사진 없이 날짜/이름/부서만 노출
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

type BirthdayUser = {
  id: string;
  name: string | null;
  profile_picture: string | null;
  birth_date: string;
};

type CompanyEvent = {
  id: string;
  event_type: 'marriage' | 'condolence' | 'childbirth' | 'other';
  title: string;
  event_date: string;
  name_snapshot: string;
  department_snapshot: string | null;
};

type OrgItem = { code: string; name: string };
type OrgConfig = { departments?: OrgItem[] };

const EVENT_TYPE_LABEL: Record<string, string> = {
  marriage: '결혼',
  condolence: '부고',
  childbirth: '출산',
  other: '기타',
};

const TeamEventsCard: React.FC = () => {
  const [tab, setTab] = useState<'birthday' | 'events'>('birthday');
  const [birthdayUsers, setBirthdayUsers] = useState<BirthdayUser[]>([]);
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const getDeptName = (code: string | null) => {
    const c = (code || '').trim();
    if (!c) return '';
    return orgConfig?.departments?.find((d) => d.code === c)?.name || c;
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: userRows }, { data: eventRows }, { data: orgRow }] = await Promise.all([
          supabase.from('users').select('id,name,profile_picture,birth_date').not('birth_date', 'is', null),
          supabase
            .from('company_events')
            .select('id,event_type,title,event_date,name_snapshot,department_snapshot')
            .eq('is_active', true)
            .order('event_date', { ascending: false })
            .limit(20),
          supabase.from('org_settings').select('config').single(),
        ]);

        const thisMonth = new Date().getMonth() + 1;
        const filtered = ((userRows || []) as any[])
          .filter((u) => u.birth_date && new Date(u.birth_date).getMonth() + 1 === thisMonth)
          .sort((a, b) => new Date(a.birth_date).getDate() - new Date(b.birth_date).getDate());

        setBirthdayUsers(filtered as BirthdayUser[]);
        setEvents((eventRows || []) as CompanyEvent[]);
        setOrgConfig((orgRow?.config || {}) as OrgConfig);
      } catch {
        // 홈 화면 부가 위젯이라 실패해도 조용히 무시
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('birthday')}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition ${tab === 'birthday'
            ? 'text-indigo-600 border-b-2 border-indigo-600'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          🎂 생일
        </button>
        <button
          type="button"
          onClick={() => setTab('events')}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition ${tab === 'events'
            ? 'text-indigo-600 border-b-2 border-indigo-600'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          💐 경조사
        </button>
      </div>

      <div className="p-6 min-h-[140px]">
        {loading ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : tab === 'birthday' ? (
          birthdayUsers.length === 0 ? (
            <p className="text-sm text-gray-500">이번 달 생일인 직원이 없습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {birthdayUsers.map((u) => (
                <div key={u.id} className="flex w-20 flex-col items-center gap-1.5">
                  <div className="h-14 w-14 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                    {u.profile_picture ? (
                      <img src={u.profile_picture} alt={u.name || ''} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-gray-400">
                        {u.name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <p className="w-full truncate text-center text-xs text-gray-700">{u.name}</p>
                  <p className="text-[11px] text-gray-400">{new Date(u.birth_date).getMonth() + 1}월 {new Date(u.birth_date).getDate()}일</p>
                </div>
              ))}
            </div>
          )
        ) : events.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 경조사 소식이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {EVENT_TYPE_LABEL[e.event_type] || e.event_type}
                  </span>
                  <span className="text-sm text-gray-900 truncate">{e.title}</span>
                </div>
                <div className="shrink-0 text-xs text-gray-500 text-right ml-3">
                  <div>{e.name_snapshot}{getDeptName(e.department_snapshot) ? ` · ${getDeptName(e.department_snapshot)}` : ''}</div>
                  <div>{e.event_date}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamEventsCard;
