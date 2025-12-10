// Frontend type definitions

export interface User {
  id: string;
  email: string;
  name?: string;
  profile_picture?: string | null;
  role: 'Admin' | 'Manager' | 'User';
  annual_leave_balance?: number;
  monthly_leave_balance?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Attendance {
  id: string;
  user_id: string;
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
  id: string;
  user_id: string;
  attendance_id: string;
  requested_date: string;
  original_check_in: string | null;
  original_check_out: string | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
}

export interface Leave {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  type: 'annual' | 'half_day' | 'monthly_leave' | 'maternity_leave' | 'maternity_leave_multiple' | 'paternity_leave' | 'menstrual_leave' | 'family_care_leave' | 'event_leave_marriage_self' | 'event_leave_marriage_child' | 'event_leave_death_parent' | 'event_leave_death_grandparent';
  days_requested: number;
  paid_days: number;
  unpaid_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  name?: string;
  email?: string;
}

export interface LeaveBalanceHistory {
  id: string;
  user_id: string;
  policy_code: string;
  change_type: 'accrual' | 'used' | 'expired' | 'manual_add' | 'manual_subtract';
  change_amount: number;
  balance_after: number;
  reason: string | null;
  related_leave_id: string | null;
  created_at: string;
}

export interface Letter {
  id: string;
  user_id: string;
  is_anonymous: boolean;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_picture: string | null;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action_type: string;
  target_user_id: string | null;
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
