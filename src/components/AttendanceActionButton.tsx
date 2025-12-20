// 대시보드 출퇴근 버튼
import React from 'react';

export type AttendanceActionLabel = '출근' | '업무중지' | '업무재개';

type AttendanceActionButtonProps = {
  label: AttendanceActionLabel;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

const getVariantClass = (label: AttendanceActionLabel) => {
  if (label === '업무중지') return 'bg-orange-600 hover:bg-orange-700';
  if (label === '업무재개') return 'bg-green-600 hover:bg-green-700';
  return 'bg-blue-600 hover:bg-blue-700'; // '출근'
};

const AttendanceActionButton: React.FC<AttendanceActionButtonProps> = ({
  label,
  onClick,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-4 py-2 text-white rounded-lg',
        getVariantClass(label),
        disabled ? 'opacity-60 cursor-not-allowed hover:brightness-100' : '',
        className,
      ].join(' ')}
    >
      {label}
    </button>
  );
};

export default AttendanceActionButton;
