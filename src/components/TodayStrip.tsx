// 대시보드 최상단 "오늘" 스트립.
// 매일 쓰는 액션(출근/정지/퇴근)과 오늘 알아야 할 숫자를 한 줄에 모은다.
// 상태 계산과 실제 처리 로직은 전부 Dashboard가 갖고 있고, 이 컴포넌트는 표현만 담당한다.
import React from 'react';
import { formatHM } from '../hooks/useWorkHours';

type TodayStripProps = {
  statusLabel: string;
  busy: boolean;
  error?: string;
  /** null이면 아직 조회 중 */
  todaySeconds: number | null;
  weekSeconds: number | null;
  weeklyRequiredHours: number;
  remainingLeave: number;
  /** null이면 아직 조회 중 */
  pendingApprovals: number | null;
  onCheckIn: () => void;
  onTogglePause: () => void;
  onCheckOut: () => void;
  onGoApprovals: () => void;
};

const STATUS_STYLE: Record<string, { dot: string; ring: string; text: string }> = {
  근무중: { dot: 'bg-green-500', ring: 'ring-green-100', text: 'text-green-700' },
  근무중단: { dot: 'bg-amber-500', ring: 'ring-amber-100', text: 'text-amber-700' },
  퇴근: { dot: 'bg-gray-400', ring: 'ring-gray-100', text: 'text-gray-700' },
  휴가: { dot: 'bg-blue-500', ring: 'ring-blue-100', text: 'text-blue-700' },
  미출근: { dot: 'bg-red-500', ring: 'ring-red-100', text: 'text-red-700' },
};

const TodayStrip: React.FC<TodayStripProps> = ({
  statusLabel,
  busy,
  error,
  todaySeconds,
  weekSeconds,
  weeklyRequiredHours,
  remainingLeave,
  pendingApprovals,
  onCheckIn,
  onTogglePause,
  onCheckOut,
  onGoApprovals,
}) => {
  const style = STATUS_STYLE[statusLabel] ?? STATUS_STYLE['미출근'];

  const isPaused = statusLabel === '근무중단';
  const isWorking = statusLabel === '근무중' || isPaused;
  const canCheckIn = statusLabel === '미출근' || statusLabel === '퇴근';

  // 출근/퇴근은 동시에 가능한 적이 없어서 버튼 하나로 토글한다.
  // 미출근·퇴근 → "출근하기", 누르면 근무중이 되면서 "퇴근하기"로 바뀐다.
  // (휴가처럼 둘 다 안 되는 상태는 비활성)
  const mainLabel = isWorking ? '퇴근하기' : '출근하기';
  const mainAction = isWorking ? onCheckOut : onCheckIn;
  const mainDisabled = busy || (!isWorking && !canCheckIn);

  // 출근 전 파랑 / 근무 중 초록. 라벨을 읽기 전에도 지금 무엇을 누르는지 구분된다.
  const mainClass = isWorking
    ? 'rounded-[10px] bg-green-600 px-[26px] py-[11px] text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40'
    : 'rounded-[10px] bg-blue-600 px-[26px] py-[11px] text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40';
  const secondary =
    'rounded-[10px] border border-[#e8ebef] bg-white px-4 py-[11px] text-sm font-semibold text-[#5b6470] transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="rounded-xl border border-[#e8ebef] bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-[110px] items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ring-4 ${style.dot} ${style.ring}`} />
          <div>
            <p className="text-[11px] text-[#8c95a1]">현재 상태</p>
            <p className={`text-base font-bold ${style.text}`}>{statusLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 아이콘만 있으면 무엇을 누르는지 알 수 없어서 텍스트 버튼으로 둔다 */}
          <button type="button" onClick={mainAction} disabled={mainDisabled} className={mainClass}>
            {mainLabel}
          </button>
          <button type="button" onClick={onTogglePause} disabled={!isWorking || busy} className={secondary}>
            {isPaused ? '업무 재개' : '업무 정지'}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-8">
          <div className="text-right">
            <p className="mb-0.5 text-[11px] text-[#8c95a1]">오늘 근무</p>
            <p className="text-base font-bold tabular-nums text-gray-800">
              {todaySeconds === null ? '—' : formatHM(todaySeconds)}
            </p>
          </div>

          <div className="text-right">
            <p className="mb-0.5 text-[11px] text-[#8c95a1]">이번 주</p>
            <p className="text-base font-bold tabular-nums text-gray-800">
              {weekSeconds === null ? '—' : formatHM(weekSeconds)}
              <span className="ml-1 text-[11px] font-medium text-[#8c95a1]">/ {weeklyRequiredHours}</span>
            </p>
          </div>

          <div className="text-right">
            <p className="mb-0.5 text-[11px] text-[#8c95a1]">남은 연차</p>
            <p className="text-base font-bold tabular-nums text-gray-800">{remainingLeave}일</p>
          </div>

          <div className="text-right">
            <p className="mb-0.5 text-[11px] text-[#8c95a1]">결재 대기</p>
            {pendingApprovals === null ? (
              <p className="text-base font-bold text-gray-300">—</p>
            ) : pendingApprovals === 0 ? (
              <p className="text-base font-bold tabular-nums text-gray-400">0건</p>
            ) : (
              <button
                type="button"
                onClick={onGoApprovals}
                className="text-base font-bold tabular-nums text-blue-600 transition hover:text-blue-700"
              >
                {pendingApprovals}건 →
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
          {error}
        </p>
      )}

      {statusLabel === '휴가' && (
        <p className="mt-3 text-sm text-gray-400">오늘은 휴가일입니다.</p>
      )}
    </div>
  );
};

export default TodayStrip;
