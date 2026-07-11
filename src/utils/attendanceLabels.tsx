// 업무 상태 유틸
export type AttendanceStatusCode = 'working' | 'paused' | 'off' | 'vacation';
export type CurrentStatusCode = 'working' | 'pause';
export type EventTypeCode = 'check_in' | 'check_out' | 'pause' | 'resume';

export const getStatusLabel = (
  status: string | null,
  currentStatus?: string | null,
  isTodayOverride?: boolean
): string => {
  if (!status) {
    if (isTodayOverride) {
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
  status: string | null,
  currentStatus: string | null,
  isTodayOverride?: boolean
): string => {
  const label = getStatusLabel(status, currentStatus, isTodayOverride);
  if (label === '근무중') return 'bg-green-100 text-green-800';
  if (label === '근무중단') return 'bg-orange-100 text-orange-800';
  if (label === '퇴근') return 'bg-gray-100 text-gray-800';
  if (label === '미출근') return 'bg-red-100 text-red-800';
  if (label === '휴가') return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-800';
};

export const getEventTypeLabel = (eventType: string | null | undefined): string => {
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

export const getRevisionStatusLabel = (status: string | null): { label: string; colorClass: string } => {
  if (status === 'approved') return { label: '승인', colorClass: 'bg-green-100 text-green-800' };
  if (status === 'rejected') return { label: '반려', colorClass: 'bg-red-100 text-red-800' };
  if (status === 'pending') return { label: '대기', colorClass: 'bg-yellow-100 text-yellow-800' };
  return { label: status || '-', colorClass: 'bg-gray-100 text-gray-800' };
};

// ✅ <input type="datetime-local">에서 나오는 "타임존 정보 없는" 로컬 문자열(예: "2026-07-06T18:30")을
// 절대시각 ISO(UTC) 문자열로 변환.
// 반드시 이 함수를 거쳐서 timestamptz 컬럼(attendance.check_in/check_out,
// attendance_revision_requests.requested_check_in_at/requested_check_out_at 등)에 저장해야 함.
// 이 변환 없이 datetime-local 원본 문자열을 그대로 insert/update하면, DB 세션 타임존(UTC)이
// 그 문자열을 곧바로 UTC 시각으로 해석해버려서 실제 사용자가 입력한 한국 시각과
// 9시간(KST=UTC+9)이 어긋난 채로 저장되는 버그가 발생한다.
export const localDateTimeInputToIso = (localValue: string): string | null => {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};