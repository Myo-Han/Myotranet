import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import axios from 'axios';
import { supabase } from "../supabaseClient";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    console.log("=== [DEBUG] Step 1: 세션 체크 시작 ===");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("=== [DEBUG] Step 1-E: 세션 가져오기 에러 ===", sessionError);
        throw sessionError;
      }

      if (session?.user) {
        console.log("=== [DEBUG] Step 2: 세션 발견, DB 대조 시작 ===", session.user.id);
        const { data: existing, error: dbError } = await supabase
          .from("users")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        if (dbError) {
          console.error("=== [DEBUG] Step 2-E: DB 조회 실패 ===", dbError);
          throw dbError;
        }

        if (!existing || !existing.is_active) {
          console.warn("=== [DEBUG] Step 3: 미승인 유저 혹은 프로필 없음 ===");
          await supabase.auth.signOut();
          setUser(null);
          return;
        }

        console.log("=== [DEBUG] Step 4: 로그인 성공 ===");
        setUser({
          id: session.user.id,
          email: session.user.email || "",
          name: existing.name || (session.user.user_metadata as any)?.full_name || "",
          profile_picture: existing.profile_picture || (session.user.user_metadata as any)?.avatar_url || null,
          role: existing.role as any,
          is_active: existing.is_active,
          created_at: existing.created_at,
        });
      } else {
        console.log("=== [DEBUG] Step 1-F: 활성화된 세션 없음 ===");
        setUser(null);
      }
    } catch (err) {
      console.error("=== [DEBUG] CRITICAL ERROR ===", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. URL 에러 감지 및 즉시 상세 출력
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const errorCode = params.get('error_code');
    const errorDesc = params.get('error_description');

    if (error) {
      console.error("=== [AUTH ERROR DETECTED] ===");
      console.error("Error:", error);
      console.error("Code:", errorCode);
      console.error("Desc:", errorDesc);
      console.log("Current LocalStorage Keys:", Object.keys(localStorage));
      // 에러 파라미터가 있으면 URL 정리
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("=== [DEBUG] Auth Event 발생 ===", event);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') await fetchUser();
      if (event === 'SIGNED_OUT') setUser(null);
    });

    return () => subscription.unsubscribe();
  }, [fetchUser]);

  const login = async () => {
    console.log("=== [DEBUG] Login 시도 (Google) ===");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) console.error("=== [DEBUG] Login 함수 에러 ===", error);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth Error');
  return context;
};