import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import axios from 'axios';
import { createClient } from "@supabase/supabase-js";

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
axios.defaults.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
      setUser({
        id: data.user.id,
        email: data.user.email || "",
        role: "user",   // 필요하면 나중에 DB에서 가져오면 됩니다
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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });

    if (error) console.error(error);
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

const supabase = createClient("https://hqpgdsykmrtsnxobopbf.supabase.co", "sb_publishable_heS9UtYS5PZ8YuDYi6XbeQ_lY4X-cjd");

export { supabase };