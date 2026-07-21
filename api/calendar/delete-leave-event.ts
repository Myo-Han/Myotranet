// api/calendar/delete-leave-event.ts
// 사용자가 이미 승인 완료(구글 캘린더 일정 자동 생성됨)된 휴가 신청을 수정하거나 삭제할 때,
// 회사 구글 캘린더(GOOGLE_CALENDAR_ID_MYOHAN)에 남아있는 해당 일정을 취소한다.
//
// delete_leave_request / update_leave_request RPC가 처리를 마친 뒤, 그 RPC가 응답으로 돌려준
// calendar_event_id를 프론트(useLeaveRequest.ts)가 이 API로 넘겨서 호출한다.
// (update의 경우 leaves 행 자체는 남아있지만 calendar_event_id는 이미 RPC 안에서 null로
//  초기화되므로, 예전 이벤트 id는 RPC 응답 값으로만 알 수 있어 별도로 프론트에서 넘겨줘야 한다)
//
// 신뢰 경계: 이 API는 로그인 여부만 확인한다(requireAuth). eventId는 delete_leave_request/
// update_leave_request RPC가 auth.uid()로 소유권(본인 또는 관리자)을 이미 검증한 뒤에만
// 응답으로 내려주는 값이라, 이 API 레벨에서 leave 행 기준 권한을 다시 확인할 방법이 없다
// (delete의 경우 leave 행 자체가 이미 삭제된 뒤이기 때문). eventId는 추측 불가능한 구글
// 캘린더 내부 식별자이므로, RPC가 이미 정당한 소유자에게만 넘겨준 값을 그대로 전달하는
// 이 흐름은 create-leave-event.ts의 승인자/관리자 체크보다는 약하지만 실질적 위험은 낮다.
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { eventId } = req.body || {};
    if (!eventId) {
      res.status(400).json({ error: 'eventId가 필요합니다' });
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

    const calendarId = process.env.GOOGLE_CALENDAR_ID_MYOHAN;
    if (!calendarId) throw new Error('Missing env: GOOGLE_CALENDAR_ID_MYOHAN');

    const sa = getServiceAccountFromEnv();
    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    try {
      await calendar.events.delete({ calendarId, eventId });
    } catch (delErr: any) {
      // 이미 캘린더에서 수동으로 지워졌거나 존재하지 않는 이벤트면(410/404) 성공으로 간주 (멱등 처리)
      const code = delErr?.code || delErr?.response?.status;
      if (code !== 410 && code !== 404) throw delErr;
    }

    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('delete-leave-event error:', e);
    res.status(500).json({ error: e?.message ?? 'Internal Server Error' });
  }
}
