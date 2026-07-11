// 관리자 전용은 아니지만 "로그인한 앱 사용자"만 허용하는 API에서 쓰는 가벼운 인증 확인 헬퍼.
// requireAdmin.js와 달리 role 체크는 하지 않고, 유효한 Supabase 세션인지만 확인한다.
// 파일명이 _lib인 이유: Vercel이 api/ 하위 파일을 자동으로 라우트로 등록하지 않도록 하기 위함
export async function requireAuth(supabaseAdmin, req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: '인증 정보가 없습니다', status: 401 };
  }

  const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return { error: '유효하지 않은 세션입니다', status: 401 };
  }

  return { userId: callerData.user.id };
}
