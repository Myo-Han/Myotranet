import React from 'react';
import type { ReportMode } from './reportTypes';

type Props = {
  mode: ReportMode;
  setMode: (v: ReportMode) => void;

  dateStart: string;
  dateEnd: string;
  setDateStart: (v: string) => void;
  setDateEnd: (v: string) => void;

  month: string; // YYYY-MM
  setMonth: (v: string) => void;

  canLoad: boolean;
  hint?: string;
  onLoad: () => void;
  onPrint: () => void;
  loading?: boolean;
};

const ReportControls: React.FC<Props> = ({
  mode,
  setMode,
  dateStart,
  dateEnd,
  setDateStart,
  setDateEnd,
  month,
  setMonth,
  canLoad,
  hint,
  onLoad,
  onPrint,
  loading,
}) => {
  return (
    <div className="no-print bg-white shadow rounded-lg p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">출력 종류</label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reportMode"
              checked={mode === 'date_detail'}
              onChange={() => setMode('date_detail')}
            />
            날짜별 상세
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reportMode"
              checked={mode === 'month_detail'}
              onChange={() => setMode('month_detail')}
            />
            월별 상세
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reportMode"
              checked={mode === 'month_summary'}
              onChange={() => setMode('month_summary')}
            />
            월별 요약
          </label>
        </div>

        {mode === 'date_detail' ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">시작일</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="px-3 py-2 border rounded text-sm"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs text-gray-600">종료일</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="px-3 py-2 border rounded text-sm"
              />
            </div>

            <div className="flex-1 text-xs text-gray-500">{hint || '최대 31일 범위로 출력됩니다.'}</div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-gray-600">월 선택</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="px-3 py-2 border rounded text-sm"
              />
            </div>
            <div className="flex-1 text-xs text-gray-500">{hint || '선택한 월 기준으로 출력됩니다.'}</div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLoad}
            disabled={!canLoad || !!loading}
            className={`px-4 py-2 rounded text-sm font-medium ${
              !canLoad || loading ? 'bg-gray-300 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? '불러오는 중...' : '미리보기'}
          </button>

          <button
            type="button"
            onClick={onPrint}
            className="px-4 py-2 rounded text-sm font-medium bg-gray-800 text-white hover:bg-black"
          >
            PDF 출력
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportControls;