// requireAuth.js는 순수 JS라 타입 선언이 없어서 이를 import하는 API 파일마다
// Vercel 빌드 로그에 TS7016이 남는다. 런타임 동작에는 영향이 없지만
// 실제 문제를 가리지 않도록 선언만 따로 둔다.
export declare function requireAuth(
  supabaseAdmin: any,
  req: any
): Promise<{ userId: string } | { error: string; status: number }>;
