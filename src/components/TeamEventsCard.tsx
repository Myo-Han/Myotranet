// 메인 홈 - 구성원 소식(생일/경조사) 카드
// 좌측 좁은 컬럼에 놓이므로 얼굴 나열 대신 목록 형태로 보여준다.
// 생일은 "이번 달"이 아니라 "다가오는 순"이라 월말에 다음 달 생일을 놓치지 않는다.
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

type BirthdayUser = {
  id: string;
  name: string | null;
  profile_picture: string | null;
  birth_date: string;
};

type UpcomingBirthday = BirthdayUser & { daysLeft: number };

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

// 한 번에 보여줄 다가오는 생일 수
const BIRTHDAY_LIMIT = 5;

/** 오늘 기준으로 다음 생일까지 남은 일수 (오늘이면 0) */
function daysUntilBirthday(birthDate: string, today: Date): number {
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return Number.MAX_SAFE_INTEGER;

  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(base.getFullYear(), b.getMonth(), b.getDate());
  if (next < base) next = new Date(base.getFullYear() + 1, b.getMonth(), b.getDate());

  return Math.round((next.getTime() - base.getTime()) / 86400000);
}

function ddayLabel(daysLeft: number): string {
  if (daysLeft === 0) return '오늘';
  if (daysLeft === 1) return '내일';
  return `D-${daysLeft}`;
}

/** 임박할수록 눈에 띄게 (오늘 빨강 / 일주일 이내 앰버 / 그 외 회색) */
function ddayClass(daysLeft: number): string {
  if (daysLeft === 0) return 'bg-[#fdeced] text-[#b91c1c]';
  if (daysLeft <= 7) return 'bg-[#fef3c7] text-[#b45309]';
  return 'bg-[#f1f4f7] text-[#5b6470]';
}

function monthDay(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

const TeamEventsCard: React.FC = () => {
  const [tab, setTab] = useState<'birthday' | 'events'>('birthday');
  const [birthdays, setBirthdays] = useState<UpcomingBirthday[]>([]);
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

        const now = new Date();
        const upcoming = ((userRows || []) as BirthdayUser[])
          .filter((u) => !!u.birth_date)
          .map((u) => ({ ...u, daysLeft: daysUntilBirthday(u.birth_date, now) }))
          .sort((a, b) => a.daysLeft - b.daysLeft)
          .slice(0, BIRTHDAY_LIMIT);

        setBirthdays(upcoming);
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

  const tabClass = (active: boolean) =>
    `flex-1 py-[11px] text-[13px] font-semibold transition ${
      active
        ? 'text-[#1f2328] shadow-[inset_0_-2px_0_#2563eb]'
        : 'text-[#8c95a1] hover:text-[#5b6470]'
    }`;

  return (
    <div className="overflow-hidden rounded-xl border border-[#e8ebef] bg-white shadow-sm">
      {/* 다른 카드(프로필·게시판·캘린더)와 같은 헤더 형식 */}
      <div className="flex items-center justify-between bg-gradient-to-r from-[#6D6F72] to-[#4A4D50] px-[18px] py-[13px]">
        <h2 className="text-[15px] font-semibold text-white">구성원 소식</h2>
        {tab === 'birthday' && <span className="text-[11px] text-white/70">다가오는 순</span>}
      </div>

      <div className="flex border-b border-[#e8ebef]">
        <button type="button" onClick={() => setTab('birthday')} className={tabClass(tab === 'birthday')}>
          🎂 생일
        </button>
        <button type="button" onClick={() => setTab('events')} className={tabClass(tab === 'events')}>
          🎗 경조사
        </button>
      </div>

      <div className="min-h-[120px] px-[18px] pb-3.5 pt-2">
        {loading ? (
          <p className="py-2 text-[13px] text-[#8c95a1]">불러오는 중...</p>
        ) : tab === 'birthday' ? (
          birthdays.length === 0 ? (
            <p className="py-2 text-[13px] text-[#8c95a1]">등록된 생일 정보가 없습니다.</p>
          ) : (
            <ul>
              {birthdays.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-[11px] border-b border-[#f3f5f8] py-2 last:border-0"
                >
                  <div className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-full bg-[#cfd6de]">
                    {u.profile_picture ? (
                      <img src={u.profile_picture} alt={u.name || ''} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-white">
                        {u.name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1f2328]">
                    {u.name}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[#8c95a1]">
                    {monthDay(u.birth_date)}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-[7px] py-0.5 text-[10px] font-bold ${ddayClass(u.daysLeft)}`}
                  >
                    {ddayLabel(u.daysLeft)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : events.length === 0 ? (
          <p className="py-2 text-[13px] text-[#8c95a1]">등록된 경조사 소식이 없습니다.</p>
        ) : (
          <ul>
            {events.map((e) => (
              <li key={e.id} className="border-b border-[#f3f5f8] py-2 last:border-0">
                <div className="flex items-center gap-[11px]">
                  <span className="shrink-0 rounded-full bg-[#f1f4f7] px-[7px] py-0.5 text-[10px] font-bold text-[#5b6470]">
                    {EVENT_TYPE_LABEL[e.event_type] || e.event_type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1f2328]">
                    {e.title}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[#8c95a1]">{e.event_date}</span>
                </div>
                <p className="mt-0.5 pl-[45px] text-[11px] text-[#8c95a1]">
                  {e.name_snapshot}
                  {getDeptName(e.department_snapshot) ? ` · ${getDeptName(e.department_snapshot)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TeamEventsCard;
