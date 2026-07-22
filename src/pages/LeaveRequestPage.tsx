// 연차 신청/수정 풀페이지 (/leave/new, /leave/edit/:leaveId).
// 실제 폼 로직(결재라인 빌더 포함)은 components/attendance-dashboard/LeaveRequestFormBody.tsx로
// 옮겨서, 근태관리 탭 안의 인라인 신청/수정(LeaveAnnualPanel.tsx)과 함께 재사용한다.
// 이 페이지는 제목/취소 링크 같은 풀페이지 껍데기만 그린다.
// 다른 페이지(예: 나의 결재 > 휴가 신청 '수정' 버튼)가 여전히 이 라우트로 직접 이동하므로
// 라우트 자체는 유지한다.
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LeaveRequestFormBody from '../components/attendance-dashboard/LeaveRequestFormBody';

const LeaveRequestPage: React.FC = () => {
  const navigate = useNavigate();
  const { leaveId } = useParams<{ leaveId?: string }>();
  const isEditMode = Boolean(leaveId);

  const goBack = () => navigate('/attendance', { state: { category: 'leave' } });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{isEditMode ? '연차 신청 수정' : '연차 신청'}</h1>
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          취소하고 돌아가기
        </button>
      </div>

      <LeaveRequestFormBody leaveId={leaveId} onDone={goBack} />
    </div>
  );
};

export default LeaveRequestPage;
