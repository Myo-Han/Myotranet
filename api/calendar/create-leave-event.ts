// api/calendar/create-leave-event.ts
// 회사 구글 캘린더(GOOGLE_CALENDAR_ID_MYOHAN)에 일정을 쓰는 유일한 엔드포인트.
//
// 세 가지 일을 한 파일에서 분기 처리한다:
//   1) { leaveId }                  휴가 최종 승인 시 종일 일정 자동 생성
//   2) { deleteEventId }            휴가 수정/삭제 시 등록됐던 일정 취소
//   3) { action: 'createEvent' | 'deleteEvent' }  일반 일정 직접 등록/삭제 (관리자 전용)
//
// ⚠️ 왜 한 파일에 몰아넣었나: Vercel Hobby 플랜의 서버리스 함수 개수 제한(12개)에
// 이미 정확히 도달해 있어서 새 엔드포인트 파일을 만들 수 없다. 새 기능이 필요하면
// 여기에 action 분기를 추가하는 방식으로 확장할 것.
//
// ⚠️ 사전 준비: 이 서비스 계정(CALENDAR_SERVICE_ACCOUNT_JSON의 client_email)이
// 해당 구글 캘린더에 "일정 변경" 권한으로 공유되어 있어야 한다. 부족하면 403으로 실패한다.
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

/** 쓰기 스코프로 인증된 Calendar 클라이언트와 캘린더 ID를 함께 돌려준다. */
function getCalendarClient() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID_MYOHAN;
  if (!calendarId) throw new Error('Missing env: GOOGLE_CALENDAR_ID_MYOHAN');

  const sa = getServiceAccountFromEnv();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    // 읽기 전용 엔드포인트(calendar.readonly)와 달리 이 API는 이벤트를 생성/삭제하므로
    // 쓰기 권한이 필요한 calendar.events 스코프를 사용한다.
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });

  return { calendar: google.calendar({ version: 'v3', auth }), calendarId };
}

const TYPE_LABEL: Record<string, string> = {
  annual: '연차',
  half_day: '반차',
  quarter_day: '반반차',
};

const HALF_DAY_LABEL: Record<string, string> = { am: '오전', pm: '오후' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// 회사 캘린더 표준 시간대. 시간 지정 일정은 이 기준으로 해석된다.
const TIME_ZONE = 'Asia/Seoul';

// Google Calendar 종일 이벤트의 end.date는 "그 날짜를 포함하지 않는" 배타적 값이라
// 사용자가 고른 마지막 날에 하루를 더해야 캘린더에 마지막 날까지 정확히 표시된다.
function addOneDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

/** 존재하지 않는 이벤트 삭제(410/404)는 성공으로 간주해 멱등 처리한다. */
async function deleteEventIdempotent(
  calendar: ReturnType<typeof getCalendarClient>['calendar'],
  calendarId: string,
  eventId: string
) {
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch (delErr: any) {
    const code = delErr?.code || delErr?.response?.status;
    if (code !== 410 && code !== 404) throw delErr;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { leaveId, deleteEventId, action } = req.body || {};

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

    // ── 3) 일반 일정 직접 등록/삭제 (관리자 전용) ─────────────────────────
    // 회사 공용 캘린더라 아무나 쓰면 곤란해서 Admin으로 제한한다.
    if (action === 'createEvent' || action === 'deleteEvent') {
      const { data: callerProfile } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', callerId)
        .maybeSingle();

      if (callerProfile?.role !== 'Admin') {
        res.status(403).json({ error: '일정 등록/삭제는 관리자만 가능합니다' });
        return;
      }

      const { calendar, calendarId } = getCalendarClient();

      if (action === 'deleteEvent') {
        const eventId = req.body?.eventId;
        if (!eventId) {
          res.status(400).json({ error: 'eventId가 필요합니다' });
          return;
        }

        // 휴가 일정은 leaves 테이블과 연결돼 있어서 여기서 지우면 DB와 어긋난다.
        // 휴가 취소는 결재 화면(useLeaveRequest)의 정규 경로로만 처리해야 한다.
        const { data: linkedLeave } = await supabaseAdmin
          .from('leaves')
          .select('id')
          .eq('calendar_event_id', eventId)
          .maybeSingle();

        if (linkedLeave) {
          res.status(400).json({ error: '휴가 일정입니다. 결재 화면에서 취소해 주세요' });
          return;
        }

        await deleteEventIdempotent(calendar, calendarId, eventId);
        res.status(200).json({ ok: true });
        return;
      }

      // action === 'createEvent'
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const startDate = req.body?.startDate;
      const endDate = req.body?.endDate || startDate;
      const allDay = req.body?.allDay !== false;
      const description = req.body?.description;

      if (!title) {
        res.status(400).json({ error: '일정 제목이 필요합니다' });
        return;
      }
      if (!DATE_RE.test(startDate || '') || !DATE_RE.test(endDate || '')) {
        res.status(400).json({ error: '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)' });
        return;
      }
      if (endDate < startDate) {
        res.status(400).json({ error: '종료일이 시작일보다 빠릅니다' });
        return;
      }

      let start: any;
      let end: any;

      if (allDay) {
        start = { date: startDate };
        end = { date: addOneDay(endDate) };
      } else {
        const startTime = req.body?.startTime;
        const endTime = req.body?.endTime;
        if (!TIME_RE.test(startTime || '') || !TIME_RE.test(endTime || '')) {
          res.status(400).json({ error: '시간 형식이 올바르지 않습니다 (HH:mm)' });
          return;
        }
        if (startDate === endDate && endTime <= startTime) {
          res.status(400).json({ error: '종료 시각이 시작 시각보다 빠릅니다' });
          return;
        }
        // 로컬 시각 문자열 + timeZone 조합으로 넘기면 구글이 해당 시간대로 해석한다.
        // (UTC 오프셋을 직접 계산하지 않아 서머타임/서버 로케일 영향을 받지 않는다)
        start = { dateTime: `${startDate}T${startTime}:00`, timeZone: TIME_ZONE };
        end = { dateTime: `${endDate}T${endTime}:00`, timeZone: TIME_ZONE };
      }

      const created = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: title,
          description: typeof description === 'string' && description ? description : undefined,
          start,
          end,
        },
      });

      res.status(200).json({ eventId: created.data.id, htmlLink: created.data.htmlLink });
      return;
    }

    // ── 2) 휴가 일정 취소 ────────────────────────────────────────────────
    // 휴가 신청 수정/삭제(useLeaveRequest.ts) 시, 이미 승인 완료되어 캘린더에 등록된 일정이
    // 있었다면 그 일정을 취소해야 한다.
    // 신뢰 경계: leave 행을 다시 조회해 권한을 검증할 수 없는 경우도 있으므로(delete는 leave가
    // 이미 삭제된 뒤), 로그인 여부만 확인한다. eventId는 delete_leave_request/update_leave_request
    // RPC가 소유권(본인 또는 관리자)을 이미 검증한 뒤에만 프론트로 내려주는 값이라 실질적 위험은 낮다.
    if (deleteEventId) {
      const { calendar, calendarId } = getCalendarClient();
      await deleteEventIdempotent(calendar, calendarId, deleteEventId);
      res.status(200).json({ ok: true });
      return;
    }

    // ── 1) 휴가 최종 승인 → 종일 일정 생성 ───────────────────────────────
    if (!leaveId) {
      res.status(400).json({ error: 'leaveId가 필요합니다' });
      return;
    }

    const { data: leave, error: leaveErr } = await supabaseAdmin
      .from('leaves')
      .select(
        'id, user_id, start_date, end_date, type, half_day_period, reason, status, reviewed_by, calendar_event_id'
      )
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
    const periodSuffix =
      leave.type === 'half_day' && leave.half_day_period
        ? ` (${HALF_DAY_LABEL[leave.half_day_period] || leave.half_day_period})`
        : '';

    const { calendar, calendarId } = getCalendarClient();

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

    await supabaseAdmin.from('leaves').update({ calendar_event_id: eventId }).eq('id', leave.id);

    res.status(200).json({ eventId, htmlLink: insertRes.data.htmlLink });
  } catch (e: any) {
    console.error('create-leave-event error:', e);
    res.status(500).json({ error: e?.message ?? 'Internal Server Error' });
  }
}
