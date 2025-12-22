// 서류발급
import React, { useEffect, useState } from 'react';
import AttendanceReportSelf from './attendance-reports/AttendanceReportSelf';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type TabKey = 'attendance' | 'coming_soon';

const EvidenceIssueModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<TabKey>('attendance');

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setTab('attendance');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="evidence-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        // 바깥 클릭 닫기
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
  @media print {
  @page { size: A4; margin: 10mm; }

  /* ✅ 1) 모달 제외 전부 제거(레이아웃도 제거) */
body > :not(.evidence-modal-overlay) {
  display: none !important;
}

/* ✅ 2) 모달은 출력되게 */
.evidence-modal-overlay {
  display: block !important;
  position: static !important;
  background: transparent !important;
}

/* ✅ 3) 상단바/좌측탭 숨김 */
.evidence-modal-chrome { display: none !important; }

/* ✅ 4) 내용은 스크롤 없이 */
.evidence-modal-shell,
.evidence-modal-content {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
}

  /* ✅ 3) 모달을 출력 시작 위치로 고정 */
  .evidence-modal-overlay {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    right: 0 !important;
    bottom: auto !important;
    inset: auto !important;
    background: transparent !important;
    display: block !important;
  }

  html, body {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .evidence-modal-shell {
    max-height: none !important;
    height: auto !important;
    overflow: visible !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    max-width: none !important;
    width: 100% !important;
    margin: 0 !important;
  }

  .evidence-modal-chrome {
    display: none !important;
  }

  .evidence-modal-content {
    max-height: none !important;
    overflow: visible !important;
  }
}
`}</style>

      <div className="evidence-modal-shell bg-white rounded-lg shadow-xl w-full max-w-6xl mx-4 h-[85vh] overflow-hidden border border-gray-200 flex flex-col">
        {/* 상단바 */}
        <div className="evidence-modal-chrome px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">증빙서 발급</h2>
            <p className="text-xs text-gray-500 mt-1">필요한 서류를 선택해서 출력/발급하세요.</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md text-sm font-medium bg-gray-100 hover:bg-gray-200"
          >
            닫기
          </button>
        </div>

        {/* 본문 */}
        <div className="flex flex-1 min-h-0">
          {/* 좌측 탭 */}
          <div className="evidence-modal-chrome w-52 border-r bg-gray-50 p-3">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setTab('attendance')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${tab === 'attendance'
                  ? 'bg-white border border-gray-200 shadow-sm'
                  : 'hover:bg-white/70'
                  }`}
              >
                출퇴근
              </button>

              <button
                type="button"
                onClick={() => setTab('coming_soon')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${tab === 'coming_soon'
                  ? 'bg-white border border-gray-200 shadow-sm'
                  : 'hover:bg-white/70'
                  }`}
              >
                기타 서류(추가 예정)
              </button>
            </div>
          </div>

          {/* 우측 내용 */}
          <div className="evidence-modal-content flex-1 min-h-0 overflow-y-auto bg-white">
            {tab === 'attendance' && (
              <div className="p-4">
                <AttendanceReportSelf />
              </div>
            )}

            {tab === 'coming_soon' && (
              <div className="p-6">
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
                  추후 서류가 추가될 예정입니다.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvidenceIssueModal;
