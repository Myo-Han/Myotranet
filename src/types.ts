// Frontend type definitions

export interface User {
  id: number;
  email: string;
  name: string;
  profile_picture: string | null;
  role: 'Admin' | 'Manager' | 'User';
  annual_leave_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: number;
  user_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  early_leave: string | null;
  status: 'present' | 'absent' | 'early_leave';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRevisionRequest {
  id: number;
  user_id: number;
  attendance_id: number;
  requested_date: string;
  original_check_in: string | null;
  original_check_out: string | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
}

export interface Leave {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  leave_type: 'annual' | 'half_day';
  days_requested: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  name?: string;
  email?: string;
  role?: string;
  annual_leave_balance?: number;
}

export interface Letter {
  id: number;
  user_id: number;
  is_anonymous: boolean;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_picture: string | null;
}

export interface AuditLog {
  id: number;
  actor_id: number;
  action_type: string;
  target_user_id: number | null;
  description: string;
  changes: any;
  ip_address: string | null;
  created_at: string;
  actor_name: string;
  actor_email: string;
  target_name: string | null;
  target_email: string | null;
}

export interface UserProfile {
  user: User;
  recentAttendance: Attendance[];
  pendingLeaves: Leave[];
}
