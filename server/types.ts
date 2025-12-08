// Type definitions for the HR Management System

export interface User {
  id: number;
  email: string;
  name: string;
  profile_picture: string | null;
  role: 'Admin' | 'Manager' | 'User';
  annual_leave_balance: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Attendance {
  id: number;
  user_id: number;
  date: Date;
  check_in: Date | null;
  check_out: Date | null;
  early_leave: Date | null;
  status: 'present' | 'absent' | 'early_leave';
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AttendanceRevisionRequest {
  id: number;
  user_id: number;
  attendance_id: number;
  requested_date: Date;
  original_check_in: Date | null;
  original_check_out: Date | null;
  requested_check_in: Date | null;
  requested_check_out: Date | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  review_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Leave {
  id: number;
  user_id: number;
  start_date: Date;
  end_date: Date;
  leave_type: 'annual' | 'half_day';
  days_requested: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  review_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Letter {
  id: number;
  user_id: number;
  is_anonymous: boolean;
  title: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: number;
  actor_id: number;
  action_type: string;
  target_user_id: number | null;
  description: string;
  changes: any;
  ip_address: string | null;
  created_at: Date;
}

// Express session user type
declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

// Passport user type
export interface PassportUser {
  id: number;
  email: string;
  name: string;
  profile_picture: string;
}
