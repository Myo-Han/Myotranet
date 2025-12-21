import { createClient } from "@supabase/supabase-js";

// 배포 환경 변수 디버깅 로그
console.log('--- Supabase Client Initialization ---');
console.log('URL Check:', import.meta.env.VITE_SUPABASE_URL ? 'Loaded' : 'MISSING');
console.log('Anon Key Check:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Loaded' : 'MISSING');

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  }
);