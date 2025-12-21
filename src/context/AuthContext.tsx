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
    console.log('--- Fetching User Start ---');
    console.log('Current URL:', window.location.href);

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
        console.log('Auth User Found:', data.user.email);
        const { data: existing, error: dbError } = await supabase
          .from("users")
          .select("id, name, profile_picture, role, is_active, created_at")
          .eq("id", data.user.id)
          .maybeSingle();

        if (dbError) {
          console.error('Database Profile Fetch Error:');
          console.dir(dbError);
        }

        if (!dbError && !existing) {
          console.warn('No profile found in users table for this ID');
          alert("관리자에게 권한을 요청하세요.");
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return;
        }

        if (!existing || !existing.is_active) {
          alert("관리자에게 권한을 요청하세요.");
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
        });
      } else {
        console.log('No active session found.');
        setUser(null);
      }
    } catch (err) {
      console.error('Unexpected Global Error in fetchUser:');
      console.dir(err);
    } finally {
      setLoading(false);
      console.log('--- Fetching User End ---');
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

  const login = async () => {
    console.log('--- Login Triggered ---');
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        console.error('OAuth Sign-In Error:');
        console.dir(error);
        alert('로그인 오류: ' + error.message);
      }
      console.log('OAuth Redirect Data:', data);
    } catch (err) {
      console.error('Login Unexpected Error:');
      console.dir(err);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, timeRemaining, showWarning, extendSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};