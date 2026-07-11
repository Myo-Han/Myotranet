// 관리자 전용 API에서 공용으로 사용하는 인증 확인 헬퍼
// 파일명이 _lib인 이유: Vercel이 api/ 하위 파일을 자동으로 라우트로 등록하지 않도록 하기 위함
export async function requireAdmin(supabaseAdmin, req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: '인증 정보가 없습니다', status: 401 };
  }

  const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return { error: '유효하지 않은 세션입니다', status: 401 };
  }

  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();

  if (profileError || callerProfile?.role !== 'Admin') {
    return { error: '관리자만 이용할 수 있습니다', status: 403 };
  }

  return { adminId: callerData.user.id };
}
