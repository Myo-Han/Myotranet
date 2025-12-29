import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

function getKstYesterday() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  kstNow.setDate(kstNow.getDate() - 1);
  return kstNow.toISOString().split('T')[0];
}

function calcNetWorkSeconds(events: any[], checkInIso: string, checkOutIso: string) {
  const startMs = new Date(checkInIso).getTime();
  const endMs = new Date(checkOutIso).getTime();
  
  const sorted = events
    .filter((e) => e.event_type === 'pause' || e.event_type === 'resume')
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  let totalPauseMs = 0;
  let lastPauseMs: number | null = null;

  for (const ev of sorted) {
    const t = new Date(ev.occurred_at).getTime();
    if (ev.event_type === 'pause') {
      lastPauseMs = t;
    } else if (ev.event_type === 'resume' && lastPauseMs !== null) {
      totalPauseMs += (t - lastPauseMs);
      lastPauseMs = null;
    }
  }

  if (lastPauseMs !== null) {
    totalPauseMs += (endMs - lastPauseMs);
  }

  const totalDurationSeconds = Math.floor((endMs - startMs) / 1000);
  const pauseSeconds = Math.floor(totalPauseMs / 1000);
  
  return Math.max(0, totalDurationSeconds - pauseSeconds);
}

export default async function handler(req: any, res: any) {
  try {
    const targetDate = getKstYesterday();

    const { data: pausedRecords, error: fetchError } = await supabaseAdmin
      .from('attendance')
      .select('id, user_id, date, check_in')
      .eq('status', 'paused')
      .eq('date', targetDate)
      .is('check_out', null);

    if (fetchError) throw fetchError;
    if (!pausedRecords || pausedRecords.length === 0) {
      return res.status(200).json({ status: 'success', count: 0, date: targetDate });
    }

    const processedIds = [];

    for (const record of pausedRecords) {
      const autoCheckOutAt = `${record.date}T23:59:59+09:00`;

      const { data: events } = await supabaseAdmin
        .from('attendance_events')
        .select('event_type, occurred_at')
        .eq('attendance_id', record.id)
        .order('occurred_at', { ascending: true });

      const netSeconds = calcNetWorkSeconds(events || [], record.check_in, autoCheckOutAt);

      await supabaseAdmin
        .from('attendance')
        .update({
          check_out: autoCheckOutAt,
          status: 'off',
          total_work_seconds: netSeconds
        })
        .eq('id', record.id);

      await supabaseAdmin
        .from('users')
        .update({ current_status: null })
        .eq('id', record.user_id);

      await supabaseAdmin
        .from('attendance_events')
        .insert({
          user_id: record.user_id,
          attendance_id: record.id,
          event_type: 'check_out',
          reason_category: '퇴근',
          notes: '[자동] 업무중지 상태 자정 퇴근 처리',
          occurred_at: autoCheckOutAt
        });

      processedIds.push(record.user_id);
    }

    res.status(200).json({ 
      status: 'success', 
      date: targetDate,
      count: processedIds.length,
      processed_users: processedIds
    });

  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
}