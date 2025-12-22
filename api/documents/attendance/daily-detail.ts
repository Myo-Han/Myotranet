import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

type AttendanceRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  total_work_seconds: number | null;
};

type AttendanceEventRow = {
  id: string;
  attendance_id: string;
  user_id: string;
  event_type: string; // check_in/check_out/pause/resume...
  occurred_at: string; // ISO
  reason_category: string | null;
  notes: string | null;
};

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const supabaseAdmin = createClient(
  getEnv('VITE_SUPABASE_URL'),
  // ⚠️ 서버 전용(Service Role) 권장: SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY || getEnv('VITE_SUPABASE_ANON_KEY'),
  { auth: { persistSession: false } }
);

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function listDatesInclusive(startKey: string, endKey: string) {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const end = new Date(ey, em - 1, ed, 0, 0, 0, 0);
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function hhmmFromIso(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function durHhMmFromSeconds(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
}

function eventLabelKo(t: string) {
  switch (t) {
    case 'check_in':
      return '출근';
    case 'check_out':
      return '퇴근';
    case 'pause':
      return '업무중지';
    case 'resume':
      return '업무재개';
    default:
      return t;
  }
}

function groupByAttendanceId(events: AttendanceEventRow[]) {
  const map: Record<string, AttendanceEventRow[]> = {};
  for (const e of events) {
    const k = String(e.attendance_id);
    if (!map[k]) map[k] = [];
    map[k].push(e);
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  }
  return map;
}

// pause/resume 누적(출근~퇴근 구간)
function calcPauseSeconds(events: AttendanceEventRow[], rangeStartIso: string, rangeEndIso: string) {
  const startMs = new Date(rangeStartIso).getTime();
  const endMs = new Date(rangeEndIso).getTime();
  if (!(endMs > startMs)) return 0;

  const sorted = events
    .filter((e) => e.event_type === 'pause' || e.event_type === 'resume')
    .slice()
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  let total = 0;
  let lastPause: number | null = null;

  for (const ev of sorted) {
    const t = new Date(ev.occurred_at).getTime();
    if (ev.event_type === 'pause') {
      lastPause = t;
      continue;
    }
    if (ev.event_type === 'resume' && lastPause !== null) {
      const ps = Math.max(lastPause, startMs);
      const pe = Math.min(t, endMs);
      if (pe > ps) total += (pe - ps) / 1000;
      lastPause = null;
    }
  }

  if (lastPause !== null) {
    const ps = Math.max(lastPause, startMs);
    const pe = endMs;
    if (pe > ps) total += (pe - ps) / 1000;
  }

  return Math.max(0, Math.floor(total));
}

async function fetchUserName(userId: string) {
  const { data, error } = await supabaseAdmin.from('users').select('name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data?.name || '사용자') as string;
}

async function fetchAttendanceWithEvents(userId: string, startKey: string, endKey: string) {
  const { data: attendance, error: aErr } = await supabaseAdmin
    .from('attendance')
    .select('id, user_id, date, check_in, check_out, status, total_work_seconds')
    .eq('user_id', userId)
    .gte('date', startKey)
    .lte('date', endKey)
    .order('date', { ascending: true });

  if (aErr) throw aErr;

  const attRows: AttendanceRow[] = (attendance ?? []).map((r: any) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    date: String(r.date),
    check_in: r.check_in ?? null,
    check_out: r.check_out ?? null,
    status: r.status ?? null,
    total_work_seconds: typeof r.total_work_seconds === 'number' ? r.total_work_seconds : null,
  }));

  const ids = attRows.map((r) => r.id).filter(Boolean);
  if (!ids.length) return { attendance: attRows, events: [] as AttendanceEventRow[] };

  const { data: events, error: eErr } = await supabaseAdmin
    .from('attendance_events')
    .select('id, attendance_id, user_id, event_type, occurred_at, reason_category, notes')
    .in('attendance_id', ids)
    .order('occurred_at', { ascending: true });

  if (eErr) throw eErr;

  const evRows: AttendanceEventRow[] = (events ?? []).map((e: any) => ({
    id: String(e.id),
    attendance_id: String(e.attendance_id),
    user_id: String(e.user_id),
    event_type: String(e.event_type),
    occurred_at: String(e.occurred_at),
    reason_category: e.reason_category ?? null,
    notes: e.notes ?? null,
  }));

  return { attendance: attRows, events: evRows };
}

type Row = { date: string; time: string; event: string; memo: string };

function buildRowsAndTotals(att: AttendanceRow[], events: AttendanceEventRow[], startKey: string, endKey: string, userName: string) {
  const dateKeys = listDatesInclusive(startKey, endKey);
  const attByDate: Record<string, AttendanceRow> = {};
  for (const a of att) attByDate[a.date] = a;

  const evByAttId = groupByAttendanceId(events);

  const rows: Row[] = [];
  let totalSecondsSum = 0;
  let pauseSecondsSum = 0;
  let netSecondsSum = 0;

  for (const d of dateKeys) {
    const a = attByDate[d];
    if (!a) {
      rows.push({ date: d, time: '', event: '미출근', memo: '' });
      continue;
    }

    const ev = (evByAttId[a.id] ?? []).slice();

    if (!ev.length) {
      rows.push({ date: d, time: '', event: '미출근', memo: '' });
    } else {
      for (const e of ev) {
        const memo = [e.reason_category, e.notes].filter(Boolean).join(' / ');
        rows.push({
          date: d,
          time: hhmmFromIso(e.occurred_at),
          event: eventLabelKo(e.event_type),
          memo,
        });
      }
    }

    if (a.check_in && a.check_out) {
      const totalSeconds = Math.max(
        0,
        Math.floor((new Date(a.check_out).getTime() - new Date(a.check_in).getTime()) / 1000)
      );
      const pauseSeconds = calcPauseSeconds(ev, a.check_in, a.check_out);
      const netSeconds =
        typeof a.total_work_seconds === 'number' ? Math.max(0, Math.floor(a.total_work_seconds)) : Math.max(0, totalSeconds - pauseSeconds);

      totalSecondsSum += totalSeconds;
      pauseSecondsSum += pauseSeconds;
      netSecondsSum += netSeconds;
    }
  }

  return {
    rows,
    totals: {
      totalText: durHhMmFromSeconds(totalSecondsSum),
      breakText: durHhMmFromSeconds(pauseSecondsSum),
      netText: durHhMmFromSeconds(netSecondsSum),
      noteText: '',
    },
    meta: {
      departmentText: '-', // 필요하면 users.profile/department 등에서 조회해서 채우세요.
      nameText: userName,
    },
  };
}

function drawBoxTable(doc: PDFKit.PDFDocument, x: number, y: number, w: number, rowH: number, rows: Array<[string, string]>) {
  const labelW = 22 * 2.9; // 대략 64pt
  doc.lineWidth(1).rect(x, y, w, rowH * rows.length).stroke();
  for (let i = 0; i < rows.length; i++) {
    const yy = y + i * rowH;
    doc.rect(x, yy, labelW, rowH).stroke();
    doc.rect(x + labelW, yy, w - labelW, rowH).stroke();

    doc.fontSize(10).text(rows[i][0], x, yy + 8, { width: labelW, align: 'center' });
    doc.fontSize(10).text(rows[i][1], x + labelW + 6, yy + 8, { width: w - labelW - 12, align: 'left' });
  }
}

function drawApprovalBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.lineWidth(1).rect(x, y, w, h).stroke();
  const colW = w / 2;

  // header row
  doc.rect(x, y, colW, 24).stroke();
  doc.rect(x + colW, y, colW, 24).stroke();
  doc.fontSize(10).text('승인', x, y + 7, { width: colW, align: 'center' });
  doc.fontSize(10).text('결재', x + colW, y + 7, { width: colW, align: 'center' });

  // stamp row
  doc.rect(x, y + 24, colW, h - 24).stroke();
  doc.rect(x + colW, y + 24, colW, h - 24).stroke();
}

function drawTableHeader(doc: PDFKit.PDFDocument, x: number, y: number, colWs: number[], h: number) {
  const headers = ['No', '날짜', '시간', '이벤트', '사유/메모'];
  let xx = x;
  for (let i = 0; i < colWs.length; i++) {
    doc.rect(xx, y, colWs[i], h).stroke();
    doc.fontSize(11).text(headers[i], xx, y + 8, { width: colWs[i], align: 'center' });
    xx += colWs[i];
  }
}

function drawRows(doc: PDFKit.PDFDocument, x: number, y: number, colWs: number[], rowH: number, startNo: number, rows: Row[]) {
  let yy = y;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cells = [
      String(startNo + i),
      r.date || '',
      r.time || '',
      r.event || '',
      r.memo || '',
    ];

    let xx = x;
    for (let c = 0; c < colWs.length; c++) {
      doc.rect(xx, yy, colWs[c], rowH).stroke();
      const align = c === 4 ? 'left' : 'center';
      const padX = c === 4 ? 6 : 0;
      doc.fontSize(10).text(cells[c], xx + padX, yy + 7, {
        width: colWs[c] - padX * 2,
        align,
        ellipsis: true,
      });
      xx += colWs[c];
    }
    yy += rowH;
  }
}

function drawFooter(doc: PDFKit.PDFDocument, pageNo: number, totalPages: number) {
  doc.fontSize(11).text(`페이지 ${pageNo}/${totalPages}`, 0, 800, { width: 595.28, align: 'center' }); // A4 width in pt
}

function setKoreanFontIfExists(doc: PDFKit.PDFDocument) {
  try {
    const fontPath = path.join(process.cwd(), 'api', 'fonts', 'NotoSansKR-Regular.otf');
    if (fs.existsSync(fontPath)) {
      doc.registerFont('NotoSansKR', fontPath);
      doc.font('NotoSansKR');
    }
  } catch {
    // 폰트 없으면 기본 폰트(한글 깨질 수 있음)
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.end('Method Not Allowed');
      return;
    }

    const input =
      req.method === 'POST'
        ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
        : req.query;

    const userId = String(input.userId || '');
    const mode = String(input.mode || 'date_detail');
    const startKey = String(input.startKey || '');
    const endKey = String(input.endKey || '');

    if (!userId) {
      res.statusCode = 400;
      res.end('userId required');
      return;
    }
    if (mode !== 'date_detail') {
      res.statusCode = 400;
      res.end('Only mode=date_detail supported for this endpoint');
      return;
    }
    if (!isYmd(startKey) || !isYmd(endKey) || startKey > endKey) {
      res.statusCode = 400;
      res.end('Invalid date range');
      return;
    }

    const issueDate = new Date();
    const issueDateText = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}-${String(issueDate.getDate()).padStart(2, '0')}`;
    const periodText = `${startKey} - ${endKey}`;

    const userName = await fetchUserName(userId);
    const { attendance, events } = await fetchAttendanceWithEvents(userId, startKey, endKey);
    const built = buildRowsAndTotals(attendance, events, startKey, endKey, userName);

    const ROWS_PER_PAGE = 25;
    const pagesData: Row[][] = [];
    for (let i = 0; i < built.rows.length; i += ROWS_PER_PAGE) {
      pagesData.push(built.rows.slice(i, i + ROWS_PER_PAGE));
    }
    if (pagesData.length === 0) pagesData.push([]);

    const totalPages = pagesData.length + 1; // 마지막 요약 페이지

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="attendance_daily_detail_${startKey}_${endKey}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    setKoreanFontIfExists(doc);

    doc.pipe(res);

    // A4 in points: 595.28 x 841.89
    const pageW = 595.28;
    const marginX = 40; // ~14mm
    const topY = 48; // 상단 여백

    // 1) 데이터 페이지들
    for (let p = 0; p < pagesData.length; p++) {
      if (p > 0) doc.addPage();

      const pageNo = p + 1;
      const isFirst = p === 0;

      let cursorY = topY;

      if (isFirst) {
        doc.fontSize(20).text('묘한 출퇴근 증빙서 (일일 상세)', 0, cursorY, { width: pageW, align: 'center' });
        cursorY += 36;

        const leftX = marginX;
        const rightW = 180;
        const leftW = pageW - marginX * 2 - 16 - rightW;
        const rightX = leftX + leftW + 16;

        drawBoxTable(doc, leftX, cursorY, leftW, 28, [
          ['발급일', issueDateText],
          ['조회기간', periodText],
          ['소속', built.meta.departmentText],
          ['성명', built.meta.nameText],
        ]);

        drawApprovalBox(doc, rightX, cursorY, rightW, 28 * 2); // 대략 2행 높이로
        cursorY += 28 * 4 + 18;
      } else {
        cursorY += 8;
      }

      // 표
      const tableX = marginX;
      const tableW = pageW - marginX * 2;
      const colWs = [50, 140, 90, 110, tableW - (50 + 140 + 90 + 110)];
      const headerH = isFirst ? 30 : 0;
      const rowH = 26;

      if (isFirst) {
        drawTableHeader(doc, tableX, cursorY, colWs, headerH);
        cursorY += headerH;
      }

      // 페이지당 25행 고정(빈칸 채움)
      const padded: Row[] = [...pagesData[p]];
      while (padded.length < ROWS_PER_PAGE) padded.push({ date: '', time: '', event: '', memo: '' });

      drawRows(doc, tableX, cursorY, colWs, rowH, p * ROWS_PER_PAGE + 1, padded);

      drawFooter(doc, pageNo, totalPages);
    }

    // 2) 마지막 요약 페이지
    doc.addPage();
    const summaryPageNo = totalPages;

    const sumX = marginX;
    const sumY = 220;
    const sumW = pageW - marginX * 2;
    const sumH = 54;

    // 4칸 요약표
    const cols = 4;
    const colW = sumW / cols;
    doc.lineWidth(1).rect(sumX, sumY, sumW, sumH * 2).stroke();

    const headers = ['총 근무', '휴게', '순수 근무', '비고'];
    const values = [built.totals.totalText, built.totals.breakText, built.totals.netText, built.totals.noteText];

    for (let i = 0; i < cols; i++) {
      doc.rect(sumX + colW * i, sumY, colW, sumH).stroke();
      doc.rect(sumX + colW * i, sumY + sumH, colW, sumH).stroke();
      doc.fontSize(12).text(headers[i], sumX + colW * i, sumY + 18, { width: colW, align: 'center' });
      doc.fontSize(12).text(values[i] || ' ', sumX + colW * i, sumY + sumH + 18, { width: colW, align: 'center' });
    }

    drawFooter(doc, summaryPageNo, totalPages);

    doc.end();
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(e?.message || 'Server Error');
  }
}