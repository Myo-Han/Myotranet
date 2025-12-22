// 업무 상태 유틸
// Attendance.tsx 기준에서 outside/meeting 분기 제거(구조상 안 나오는 값)

export type AttendanceStatusCode = 'working' | 'paused' | 'off' | 'vacation';
export type CurrentStatusCode = 'working' | 'pause';
export type EventTypeCode = 'check_in' | 'check_out' | 'pause' | 'resume';

export const STATUS_LABEL: Record<AttendanceStatusCode, string> = {
  working: '근무중',
  paused: '근무중단',
  off: '퇴근',
  vacation: '휴가',
};

export const EVENT_TYPE_LABEL: Record<EventTypeCode, string> = {
  check_in: '출근',
  check_out: '퇴근',
  pause: '업무중지',
  resume: '업무재개',
};

// Attendance.tsx getStatusLabel 로직(단, outside/meeting 제거)
export const getStatusLabel = (
  status: AttendanceStatusCode | string | null,
  currentStatus?: CurrentStatusCode | string | null,
  isToday?: boolean
): string => {
  if (!status) {
    if (isToday) {
      if (currentStatus === 'working') return '근무중';
      if (currentStatus === 'pause') return '근무중단';
    }
    return '미출근';
  }

  if (status === 'off') return '퇴근';
  if (status === 'vacation') return '휴가';
  if (status === 'paused') return '근무중단';
  if (status === 'working') return '근무중';
  return '미출근';
};

export const getStatusColor = (
  status: AttendanceStatusCode | string | null,
  currentStatus: CurrentStatusCode | string | null,
  isToday?: boolean
): string => {
  const label = getStatusLabel(status, currentStatus, isToday);
  if (label === '근무중') return 'bg-green-100 text-green-800';
  if (label === '근무중단') return 'bg-orange-100 text-orange-800';
  if (label === '퇴근') return 'bg-gray-100 text-gray-800';
  if (label === '미출근') return 'bg-red-100 text-red-800';
  if (label === '휴가') return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-800';
};

export const getEventTypeLabel = (eventType: EventTypeCode | string | null | undefined): string => {
  if (!eventType) return '';
  if (eventType === 'check_in') return '출근';
  if (eventType === 'check_out') return '퇴근';
  if (eventType === 'pause') return '업무중지';
  if (eventType === 'resume') return '업무재개';
  return String(eventType);
};

export const ATTENDANCE_STATUS_OPTIONS: ReadonlyArray<{ value: AttendanceStatusCode; label: string }> = [
  { value: 'working', label: '근무중' },
  { value: 'paused', label: '근무중단' },
  { value: 'off', label: '퇴근' },
  { value: 'vacation', label: '휴가' },
] as const;

export const CURRENT_STATUS_OPTIONS: ReadonlyArray<{ value: '' | CurrentStatusCode; label: string }> = [
  { value: '', label: '미설정' },
  { value: 'working', label: '근무중' },
  { value: 'pause', label: '근무중단' },
] as const;

export const EVENT_TYPE_OPTIONS: ReadonlyArray<{ value: EventTypeCode; label: string }> = [
  { value: 'check_in', label: '출근' },
  { value: 'check_out', label: '퇴근' },
  { value: 'pause', label: '업무중지' },
  { value: 'resume', label: '업무재개' },
] as const;
