// api/calendar/myohancalendar.ts
import { google } from 'googleapis';

type GCalItem = {
  id?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

function getServiceAccountFromEnv() {
  const raw = process.env.CALENDAR_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing env: CALENDAR_SERVICE_ACCOUNT_JSON');

  const json = JSON.parse(raw);

  // env에 \n 이 \\n 로 들어가는 경우 보정
  if (typeof json.private_key === 'string') {
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }

  if (!json.client_email || !json.private_key) {
    throw new Error('Invalid service account json (missing client_email/private_key)');
  }

  return json as { client_email: string; private_key: string };
}

function toFullCalendarEvent(item: GCalItem) {
  const title = item.summary ?? '(제목 없음)';

  const allDay = !!item.start?.date && !item.start?.dateTime;

  if (allDay) {
    // start/end를 함께 넘겨야 여러 날에 걸친 일정(연차 등)이 그 기간 내내 표시된다.
    // 구글과 FullCalendar 모두 종일 이벤트의 end를 배타적으로 해석하므로 값을 그대로 전달한다.
    // (기존에는 date 하나만 넘겨서 시작일 하루만 보였다)
    return { id: item.id, title, start: item.start?.date, end: item.end?.date, allDay: true };
  }

  return {
    id: item.id,
    title,
    start: item.start?.dateTime,
    end: item.end?.dateTime,
    allDay: false,
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const calendarId = process.env.GOOGLE_CALENDAR_ID_MYOHAN;
    if (!calendarId) throw new Error('Missing env: GOOGLE_CALENDAR_ID_MYOHAN');

    const sa = getServiceAccountFromEnv();

    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // 기본: 오늘~+180일 (쿼리로 덮어쓰기 가능)
    const now = new Date();
    const timeMin = (req.query?.timeMin as string) || now.toISOString();
    const timeMax =
      (req.query?.timeMax as string) ||
      new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const r = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults: 2500,
    });

    const items = (r.data.items || []) as GCalItem[];
    const events = items
      .filter((it) => it.start?.date || it.start?.dateTime)
      .map(toFullCalendarEvent);

    res.status(200).json({ events });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Internal Server Error' });
  }
}
