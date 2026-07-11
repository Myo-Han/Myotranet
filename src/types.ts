// Frontend type definitions

export interface User {
  id: string;
  email: string;
  name?: string;
  profile_picture?: string | null;
  role: 'Admin' | 'Manager' | 'User';
  department?: string | null;
  position?: string | null;
  project?: string | null;
  part?: string | null;
  annual_leave_balance?: number;
  monthly_leave_balance?: number;
  hire_date?: string | null;
  is_active?: boolean;
  employment_status?: 'active' | 'on_leave' | 'resigned';
  gender?: 'male' | 'female' | 'other' | null;
  birth_date?: string | null;
  employee_number?: string | null;
  weekly_required_hours?: number;
  weekly_max_hours?: number;
  created_at?: string;
  updated_at?: string;
}

export type AttendanceStatus = 'working' | 'paused' | 'off' | 'vacation';

export interface Attendance {
  id: string;
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;

  // ✅ DB status
  status: AttendanceStatus | null;

  // ✅ 누적 근무시간(초)
  total_work_seconds?: number | null;

  created_at?: string;
  updated_at?: string;

  // ✅ 화면 조인용(Attendance.tsx에서 records에 넣는 값)
  current_status?: string | null;
  users?: { name?: string; profile_picture?: string | null } | null;
}

export type AttendanceEventType = 'pause' | 'resume' | 'check_out' | 'check_in';

export interface AttendanceEvent {
  id: string;
  user_id: string;
  attendance_id: string;
  event_type: AttendanceEventType;
  occurred_at: string;
  reason_category?: string | null;
  notes?: string | null;
  created_at?: string;
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

  // ✅ Attendance.tsx가 쓰는 컬럼명(reviewer_id)
  reviewer_id: string | null;

  // ✅ (기존/레거시가 남아있을 수 있어서 optional로 유지)
  reviewed_by?: string | null;

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
  type: 'annual' | 'half_day' | 'quarter_day' | 'monthly_leave' | 'maternity_leave' | 'maternity_leave_multiple' | 'paternity_leave' | 'menstrual_leave' | 'family_care_leave' | 'event_leave_marriage_self' | 'event_leave_marriage_child' | 'event_leave_death_parent' | 'event_leave_death_grandparent';
  // ✅ 반차(half_day) 신청 시 오전/오후 구분 (annual/quarter_day 등에는 null)
  half_day_period?: 'am' | 'pm' | null;
  // ✅ 반반차(quarter_day) 신청 시 사용 시작 시각 (그 외 유형에는 null), "HH:MM:SS" 형식
  quarter_start_time?: string | null;
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
