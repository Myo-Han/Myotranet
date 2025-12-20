import type { VercelRequest, VercelResponse } from '@vercel/node';
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

  // Vercel env에서 \n 이 \\n 로 들어가는 경우가 많아서 보정
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

  // 종일: date, 시간: dateTime
  const start = item.start?.dateTime ?? item.start?.date;
  const end = item.end?.dateTime ?? item.end?.date;

  // FullCalendar는 종일 이벤트면 date가 깔끔
  const allDay = !!item.start?.date && !item.start?.dateTime;

  if (allDay) {
    return { title, date: item.start?.date, allDay: true };
  }

  return { title, start, end, allDay: false };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const calendarId =
      process.env.GOOGLE_CALENDAR_ID_HOLIDAY ||
      'ko.south_korea#holiday@group.v.calendar.google.com';

    const sa = getServiceAccountFromEnv();

    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // 기본: 오늘~+180일 (원하면 쿼리로 바꿀 수 있게)
    const now = new Date();
    const timeMin = (req.query.timeMin as string) || now.toISOString();
    const timeMax =
      (req.query.timeMax as string) ||
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

    const isUnwanted = (it: GCalItem) => {
      const s = (it.summary ?? '').replace(/\s+/g, ' ').trim();
      const d = (it.description ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

      // ✅ 지역 공휴일 제거 (대부분 제목에 이렇게 들어옵니다)
      if (s.includes('지역공휴일') || s.includes('지역 공휴일')) return true;

      // ✅ 기타 기념일/관측일 제거 (제목/설명에 흔하게 들어옵니다)
      if (s.includes('기념일')) return true;
      if (d.includes('observance')) return true; // 영문 설명 들어오는 케이스
      if (d.includes('기념일')) return true;

      return false;
    };

    const events = items
      .filter((it) => it.start?.date || it.start?.dateTime)
      .filter((it) => !isUnwanted(it))
      .map(toFullCalendarEvent);

    res.status(200).json({ events });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Internal Server Error' });
  }
}
