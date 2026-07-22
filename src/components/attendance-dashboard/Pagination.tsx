// 공용 테이블 페이지네이션 (5개씩 노출 + 이전/다음 + 페이지 번호).
// 연차 신청/연장근무 신청 패널의 모든 테이블에서 재사용한다.
import React from 'react';

export const PAGE_SIZE = 5;

export function paginate<T>(rows: T[], page: number): T[] {
  const start = (page - 1) * PAGE_SIZE;
  return rows.slice(start, start + PAGE_SIZE);
}

export function totalPagesOf(count: number): number {
  return Math.max(1, Math.ceil(count / PAGE_SIZE));
}

const Pagination: React.FC<{
  page: number;
  totalCount: number;
  onChange: (page: number) => void;
}> = ({ page, totalCount, onChange }) => {
  const totalPages = totalPagesOf(totalCount);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-gray-100 bg-gray-50">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        이전
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`min-w-[26px] px-1.5 py-1 text-xs rounded ${p === page ? 'bg-blue-600 text-white font-medium' : 'border border-gray-200 text-gray-600 hover:bg-white'
            }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        다음
      </button>
    </div>
  );
};

export default Pagination;
