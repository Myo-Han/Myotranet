import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import axios from 'axios';
import { supabase } from "../supabaseClient";

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_TIME = 5 * 60 * 1000; // 5 minutes before logout

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

// Configure axios defaults
axios.defaults.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5173';
axios.defaults.withCredentials = true;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [timeRemaining, setTimeRemaining] = useState<number>(INACTIVITY_TIMEOUT);
  const [showWarning, setShowWarning] = useState(false);

  // Fetch current user
  const fetchUser = async () => {
    const { data } = await supabase.auth.getUser();

    if (data?.user) {
      // users 테이블에서 내 프로필 가져오기 (role, is_active 포함)
      const { data: existing, error } = await supabase
        .from("users")
        .select("id, name, profile_picture, role, is_active, created_at")
        .eq("id", data.user.id)
        .maybeSingle();

      let profile = existing;

      // 없으면 한 줄 생성 (처음 로그인은 is_active: false)
      if (!error && !existing) {
        await supabase.from("users").insert({
          id: data.user.id,
          email: data.user.email || "",
          name: (data.user.user_metadata as any)?.full_name || null,
          profile_picture: (data.user.user_metadata as any)?.avatar_url || null,
          role: "User",
          is_active: false,
        });
      }

      // 아직 승인 안 된 유저면 막기
      if (!profile || !profile.is_active) {
        alert("관리자에게 권한을 요청하세요.");
        await supabase.auth.signOut();
        setUser(null);
        setLoading(false);
        return;
      }

      // 승인된 유저만 앱에 입장
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
      setUser(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchUser();
  }, []);

  // Update last activity on user interaction
  const updateActivity = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
  }, []);

  // Extend session (reset timer)
  const extendSession = useCallback(() => {
    updateActivity();
  }, [updateActivity]);

  // Track user activity
  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    events.forEach(event => {
      document.addEventListener(event, updateActivity);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
    };
  }, [user, updateActivity]);

  // Auto-logout timer
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      const remaining = INACTIVITY_TIMEOUT - elapsed;

      setTimeRemaining(remaining);

      // Show warning when 5 minutes remaining
      if (remaining <= WARNING_TIME && remaining > 0) {
        setShowWarning(true);
      }

      // Auto logout when time expires
      if (remaining <= 0) {
        logout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user, lastActivity]);

  const login = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin
        }
      });

      if (error) {
        console.error('Login error:', error);
        alert('로그인 오류: ' + error.message);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
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
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        timeRemaining,
        showWarning,
        extendSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};