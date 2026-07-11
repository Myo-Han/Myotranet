// api/calendar/create-leave-event.ts
// 휴가가 최종 승인되면 회사 구글 캘린더(GOOGLE_CALENDAR_ID_MYOHAN)에 종일 일정을 자동 생성한다.
// 프론트(LeaveWorkQueue.tsx)가 approve_leave_step RPC로 최종 승인 처리에 성공한 직후 이 API를 호출한다.
//
// ⚠️ 사전 준비 필요: 이 서비스 계정(CALENDAR_SERVICE_ACCOUNT_JSON의 client_email)이
// 해당 구글 캘린더에 "일정 만들기" 이상의 권한(변경 권한)으로 공유되어 있어야 한다.
// 기존 읽기 전용(api/calendar/myohancalendar.ts)은 "세부 정보 보기" 권한으로도 충분했지만,
// 이 API는 캘린더에 실제로 이벤트를 추가하므로 권한이 부족하면 403으로 실패한다.
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '../_lib/requireAuth.js';

function getServiceAccountFromEnv() {
  const raw = process.env.CALENDAR_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing env: CALENDAR_SERVICE_ACCOUNT_JSON');

  const json = JSON.parse(raw);
  if (typeof json.private_key === 'string') {
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('Invalid service account json (missing client_email/private_key)');
  }
  return json as { client_email: string; private_key: string };
}

const TYPE_LABEL: Record<string, string> = {
  annual: '연차',
  half_day: '반차',
  quarter_day: '반반차',
};

const HALF_DAY_LABEL: Record<string, string> = { am: '오전', pm: '오후' };

// Google Calendar 종일 이벤트의 end.date는 "그 날짜를 포함하지 않는" 배타적 값이라
// leaves.end_date(포함)에 하루를 더해서 넣어야 캘린더에 마지막 날까지 정확히 표시된다.
function addOneDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { leaveId } = req.body || {};
    if (!leaveId) {
      res.status(400).json({ error: 'leaveId가 필요합니다' });
      return;
    }

    const supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL as string,
      process.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string
    );

    const authCheck = await requireAuth(supabaseAdmin, req);
    if ((authCheck as any).error) {
      res.status((authCheck as any).status).json({ error: (authCheck as any).error });
      return;
    }
    const callerId = (authCheck as any).userId as string;

    const { data: leave, error: leaveErr } = await supabaseAdmin
      .from('leaves')
      .select('id, user_id, start_date, end_date, type, half_day_period, reason, status, reviewed_by, calendar_event_id')
      .eq('id', leaveId)
      .single();

    if (leaveErr || !leave) {
      res.status(404).json({ error: '휴가 신청을 찾을 수 없습니다' });
      return;
    }

    if (leave.status !== 'approved') {
      res.status(400).json({ error: '아직 최종 승인되지 않은 휴가입니다' });
      return;
    }

    // 이미 캘린더 이벤트가 생성된 건이면 중복 생성하지 않고 그대로 반환 (멱등 처리)
    if (leave.calendar_event_id) {
      res.status(200).json({ eventId: leave.calendar_event_id, alreadyExists: true });
      return;
    }

    // 권한 확인: 관리자이거나, 방금 이 건을 최종 승인한 본인만 캘린더 등록을 트리거할 수 있음
    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('role, name')
      .eq('id', callerId)
      .maybeSingle();

    const isAdmin = callerProfile?.role === 'Admin';
    const isReviewer = leave.reviewed_by === callerId;
    if (!isAdmin && !isReviewer) {
      res.status(403).json({ error: '이 휴가 건의 캘린더 등록 권한이 없습니다' });
      return;
    }

    const { data: requester } = await supabaseAdmin
      .from('users')
      .select('name')
      .eq('id', leave.user_id)
      .maybeSingle();

    const requesterName = requester?.name || '(이름 없음)';
    const typeLabel = TYPE_LABEL[leave.type] || leave.type;
    const periodSuffix = leave.type === 'half_day' && leave.half_day_period
      ? ` (${HALF_DAY_LABEL[leave.half_day_period] || leave.half_day_period})`
      : '';

    const calendarId = process.env.GOOGLE_CALENDAR_ID_MYOHAN;
    if (!calendarId) throw new Error('Missing env: GOOGLE_CALENDAR_ID_MYOHAN');

    const sa = getServiceAccountFromEnv();
    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      // 읽기 전용 엔드포인트(calendar.readonly)와 달리 이 API는 이벤트를 생성해야 하므로
      // 쓰기 권한이 필요한 calendar.events 스코프를 사용한다.
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const insertRes = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `${requesterName} ${typeLabel}${periodSuffix}`,
        description: leave.reason || undefined,
        start: { date: leave.start_date },
        end: { date: addOneDay(leave.end_date) },
      },
    });

    const eventId = insertRes.data.id;

    await supabaseAdmin
      .from('leaves')
      .update({ calendar_event_id: eventId })
      .eq('id', leave.id);

    res.status(200).json({ eventId, htmlLink: insertRes.data.htmlLink });
  } catch (e: any) {
    console.error('create-leave-event error:', e);
    res.status(500).json({ error: e?.message ?? 'Internal Server Error' });
  }
}
