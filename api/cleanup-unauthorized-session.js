import { createClient } from '@supabase/supabase-js';

// 초대 안 받은 사람이 (재도입된) 구글 로그인 버튼으로 인증을 시도하면
// Supabase가 auth.users에 계정을 자동 생성해버림 (OAuth의 기본 동작).
// 우리 앱은 public.users에 프로필이 없으면 즉시 로그아웃시키지만,
// 그것만으로는 auth.users에 '유령 계정'이 계속 쌓임.
// 이 엔드포인트는 방금 로그인 시도한 본인 세션에 한해서(관리자 권한 아님),
// public.users 프로필이 정말 없는 경우에만 자기 자신의 auth 계정을 즉시 삭제해서
// "완전히 처음 보는 사람"과 동일한 상태로 되돌린다.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: '인증 정보가 없습니다' });
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      return res.status(401).json({ error: '유효하지 않은 세션입니다' });
    }

    const callerId = callerData.user.id;

    // 안전장치: 실제로 초대받은(=프로필이 있는) 사람의 계정은 이 엔드포인트로 절대 못 지움
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', callerId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile) {
      return res.status(403).json({ error: '초대된 계정은 삭제할 수 없습니다' });
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(callerId);
    if (deleteError) throw deleteError;

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
