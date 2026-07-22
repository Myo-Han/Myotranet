// 구성원: 전체 직원을 검색하며 볼 수 있는 '전체' 뷰와, 프로젝트(팀) 기준으로 묶어서
// 보여주는 '팀' 뷰를 제공한다. 각 카드에는 사진/이름, 실시간 근무 상태점(초록=근무중/
// 노랑=중단/회색=그 외), 오늘 승인된 휴가가 있으면 하단에 휴가 배지를 표시한다.
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

type OrgItem = {
  id: string;
  name: string;
  code: string;
};

type MemberRow = {
  id: string;
  name: string;
  profile_picture: string | null;
  project: string | null;
  position: string | null;
  current_status: string | null;
};

const LEAVE_BADGE_LABEL: Record<string, string> = {
  annual_leave: '연차',
  half_day: '반차',
  quarter_day: '반반차',
  monthly_leave: '월차',
  maternity_leave: '출산휴가',
  maternity_leave_multiple: '출산휴가',
  paternity_leave: '배우자출산휴가',
  menstrual_leave: '생리휴가',
  family_care_leave: '가족돌봄휴가',
  event_leave_marriage_self: '경조사',
  event_leave_marriage_child: '경조사',
  event_leave_death_parent: '경조사',
  event_leave_death_grandparent: '경조사',
};

const getTodayDate = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const NO_PROJECT_KEY = '__none__';

const Members: React.FC = () => {
  const [view, setView] = useState<'all' | 'team'>('all');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [projects, setProjects] = useState<OrgItem[]>([]);
  const [leaveBadges, setLeaveBadges] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [orgRes, usersRes] = await Promise.all([
          supabase.from('org_settings').select('config').single(),
          supabase
            .from('users')
            .select('id, name, profile_picture, project, position, current_status')
            .eq('is_active', true)
            .order('name', { ascending: true }),
        ]);

        setProjects(((orgRes.data?.config?.projects as OrgItem[]) || []));
        setMembers((usersRes.data || []) as MemberRow[]);

        const today = getTodayDate();
        const { data: leaveRows } = await supabase
          .from('leaves')
          .select('user_id, type, half_day_period')
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today);

        const badgeMap: Record<string, string> = {};
        (leaveRows || []).forEach((l: any) => {
          const badge =
            l.type === 'half_day' && l.half_day_period
              ? `반차(${l.half_day_period === 'am' ? '오전' : '오후'})`
              : LEAVE_BADGE_LABEL[l.type] || '휴가중';
          badgeMap[l.user_id] = badge;
        });
        setLeaveBadges(badgeMap);
      } catch (e) {
        console.error('구성원 로딩 실패:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getProjectName = (code: string) => {
    return projects.find((p) => p.code === code)?.name || code;
  };

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.name || '').toLowerCase().includes(q));
  }, [members, search]);

  const groupedByProject = useMemo(() => {
    const groups: Record<string, MemberRow[]> = {};
    filteredMembers.forEach((m) => {
      const key = m.project || NO_PROJECT_KEY;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });

    const knownCodes = projects.map((p) => p.code).filter((c) => groups[c]);
    const unknownCodes = Object.keys(groups).filter(
      (k) => k !== NO_PROJECT_KEY && !projects.some((p) => p.code === k)
    );
    const orderedKeys = [...knownCodes, ...unknownCodes, ...(groups[NO_PROJECT_KEY] ? [NO_PROJECT_KEY] : [])];

    return orderedKeys.map((key) => ({
      key,
      label: key === NO_PROJECT_KEY ? '팀 없음' : getProjectName(key),
      members: groups[key],
    }));
  }, [filteredMembers, projects]);

  const MemberCard: React.FC<{ member: MemberRow }> = ({ member }) => {
    const dotColor =
      member.current_status === 'working'
        ? 'bg-green-500'
        : member.current_status === 'paused'
          ? 'bg-yellow-400'
          : 'bg-gray-300';
    const badge = leaveBadges[member.id];

    return (
      <div className="flex w-24 flex-col items-center gap-2">
        <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
          {member.profile_picture ? (
            <img src={member.profile_picture} alt={member.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-gray-400">
              {member.name?.charAt(0)}
            </div>
          )}
          <span className={`absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${dotColor}`} />
          {badge && (
            <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] font-medium text-white">
              {badge}
            </div>
          )}
        </div>
        <p className="w-full truncate text-center text-xs text-gray-700">{member.name}</p>
      </div>
    );
  };

  const currentViewLabel = view === 'all' ? '전체' : '팀';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 왼쪽 메뉴 */}
      <div className="w-56 bg-white border-r border-gray-200">
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="text-base font-semibold text-gray-900">구성원</h1>
        </div>
        <nav className="p-2 space-y-0.5">
          <button
            type="button"
            onClick={() => setView('all')}
            className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition ${view === 'all' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setView('team')}
            className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition ${view === 'team' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            팀
          </button>
        </nav>
      </div>

      {/* 오른쪽 컨텐츠 */}
      <div className="flex-1 overflow-auto">
        {/* ✅ 왼쪽 사이드바 헤더와 높이를 맞춘 콘텐츠 헤더 */}
        <div className="px-4 py-4 border-b border-gray-100 bg-white">
          <h1 className="text-base font-semibold text-gray-900">{currentViewLabel}</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">전체 {members.length}명</p>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 검색"
              className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-xs"
            />
          </div>

          {loading ? (
            <p className="text-xs text-gray-400">불러오는 중...</p>
          ) : view === 'all' ? (
            filteredMembers.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-md p-4">
                <p className="text-xs text-gray-400 text-center py-6">검색 결과가 없습니다.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-md p-4">
                <div className="flex flex-wrap gap-5">
                  {filteredMembers.map((m) => (
                    <MemberCard key={m.id} member={m} />
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {groupedByProject.map((group) => (
                <div key={group.key} className="bg-white border border-gray-200 rounded-md p-4">
                  <h3 className="mb-3 text-sm font-medium text-gray-900">
                    {group.label} <span className="text-gray-400 font-normal">({group.members.length})</span>
                  </h3>
                  {group.members.length === 0 ? (
                    <p className="text-xs text-gray-400">구성원이 없습니다.</p>
                  ) : (
                    <div className="flex flex-wrap gap-5">
                      {group.members.map((m) => (
                        <MemberCard key={m.id} member={m} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Members;
