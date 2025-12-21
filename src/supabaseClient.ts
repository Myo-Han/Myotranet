import { createClient } from "@supabase/supabase-js";

// storageKey 옵션을 아예 삭제해서 Supabase 기본값을 사용하게 합니다.
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