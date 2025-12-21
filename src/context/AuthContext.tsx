import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import axios from 'axios';
import { supabase } from "../supabaseClient";

const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
const WARNING_TIME = 5 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  timeRemaining: number;
  showWarning: boolean;
  extendSession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

axios.defaults.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5173';
axios.defaults.withCredentials = true;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [timeRemaining, setTimeRemaining] = useState<number>(INACTIVITY_TIMEOUT);
  const [showWarning, setShowWarning] = useState(false);

  const fetchUser = async () => {
    try {
      // 1. 현재 세션 강제 로드
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) throw sessionError;

      if (session?.user) {
        // 2. DB 유저 정보 대조
        const { data: existing, error: dbError } = await supabase
          .from("users")
          .select("id, name, profile_picture, role, is_active, created_at")
          .eq("id", session.user.id)
          .maybeSingle();

        if (dbError) throw dbError;

        if (!existing || !existing.is_active) {
          await supabase.auth.signOut();
          setUser(null);
          return;
        }

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
        setUser(null);
      }
    } catch (err) {
      console.error("Auth System Error:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    // 3. 인증 상태 변화 실시간 감지 (PKCE 대응)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await fetchUser();
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = '/login';
  };

  const updateActivity = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'keydown', 'click', 'scroll'];
    events.forEach(e => document.addEventListener(e, updateActivity));
    return () => events.forEach(e => document.removeEventListener(e, updateActivity));
  }, [user, updateActivity]);

  return (
    <AuthContext.Provider value={{ 
      user, loading, login, logout, 
      refreshUser: fetchUser, timeRemaining, showWarning, 
      extendSession: updateActivity 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth Error');
  return context;
};