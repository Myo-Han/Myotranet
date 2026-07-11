import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import axios from 'axios';
import { supabase } from "../supabaseClient";

const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
const WARNING_TIME = 5 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  loading: boolean;
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
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error('Supabase Auth Error Detail:');
        console.dir(error); // 에러 객체 전체 구조 파악용
        
        // 특정 에러 코드 발생 시 상세 메시지
        if (error.message.includes('exchange')) {
          console.error('CRITICAL: Code exchange failed. Check if PKCE verifier exists in storage.');
        }
      }

      if (data?.user) {
        const { data: existing, error: dbError } = await supabase
          .from("users")
          .select("id, name, profile_picture, role, is_active, created_at, weekly_required_hours, weekly_max_hours")
          .eq("id", data.user.id)
          .maybeSingle();

        if (dbError) {
          console.error('Database Profile Fetch Error:');
          console.dir(dbError);
        }

        if (!dbError && !existing) {
          console.warn('No profile found in users table for this ID');
          alert("초대받지 않은 계정입니다. 관리자에게 문의하세요.");
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return;
        }

        if (!existing || !existing.is_active) {
          alert("비활성화된 계정입니다. 관리자에게 문의하세요.");
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return;
        }

        setUser({
          id: data.user.id,
          email: data.user.email || "",
          name: existing?.name || (data.user.user_metadata as any)?.full_name || "",
          profile_picture: existing?.profile_picture || (data.user.user_metadata as any)?.avatar_url || null,
          role: (existing?.role as "Admin" | "Manager" | "User") || "User",
          is_active: existing?.is_active ?? false,
          created_at: existing?.created_at || undefined,
          weekly_required_hours: (existing as any)?.weekly_required_hours ?? 40,
          weekly_max_hours: (existing as any)?.weekly_max_hours ?? 52,
        });
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Unexpected Global Error in fetchUser:');
      console.dir(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const updateActivity = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
  }, []);

  const extendSession = useCallback(() => {
    updateActivity();
  }, [updateActivity]);

  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => document.addEventListener(event, updateActivity));
    return () => events.forEach(event => document.removeEventListener(event, updateActivity));
  }, [user, updateActivity]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      const remaining = INACTIVITY_TIMEOUT - elapsed;
      setTimeRemaining(remaining);
      if (remaining <= WARNING_TIME && remaining > 0) setShowWarning(true);
      if (remaining <= 0) logout();
    }, 1000);
    return () => clearInterval(interval);
  }, [user, lastActivity]);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = '/';
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser, timeRemaining, showWarning, extendSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};