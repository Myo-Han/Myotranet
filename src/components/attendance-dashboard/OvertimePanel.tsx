// 연장근무 신청 패널 (근태관리 탭의 "연장근무 신청" 카테고리).
// 기존 pages/Leave.tsx의 "연장근무" 탭 내용을 그대로 옮겨왔다.
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';
import { todayKey } from '../../hooks/useLeaveRequest';
import { getRevisionStatusLabel, localDateTimeInputToIso } from '../../utils/attendanceLabels';

type OvertimeRequestRow = {
  id: string;
  user_id: string;
  work_date: string;
  requested_start_at: string;
  requested_end_at: string;
  reason: string | null;
  status: string;
  created_at: string;
  requester?: { name: string } | null;
};

const shiftDateStr = (yyyyMMdd: string, deltaDays: number) => {
  const [y, m, d] = yyyyMMdd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const formatDateTimeShort = (iso: string) => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.toLocaleDateString('ko-KR')} ${hh}:${mm}`;
};

const OvertimePanel: React.FC = () => {
  const { user } = useAuth();

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [myOvertime, setMyOvertime] = useState<OvertimeRequestRow[]>([]);
  const [teamOvertime, setTeamOvertime] = useState<OvertimeRequestRow[]>([]);
  const [overtimeLoading, setOvertimeLoading] = useState(true);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimeSubmitting, setOvertimeSubmitting] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState({
    workDate: todayKey(),
    startTime: '18:00',
    endTime: '20:00',
    reason: '',
  });

  useEffect(() => {
    fetchOvertimeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 나 + 같은 프로젝트 팀원의 연장근무 신청 현황
  const fetchOvertimeData = async () => {
    if (!user) return;
    setOvertimeLoading(true);
    try {
      const [mineRes, teamRes] = await Promise.all([
        supabase
          .from('overtime_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('overtime_requests')
          .select('*, requester:users!overtime_requests_user_id_fkey(name)')
          .neq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (mineRes.error) throw mineRes.error;
      if (teamRes.error) throw teamRes.error;

      setMyOvertime((mineRes.data || []) as any);
      setTeamOvertime((teamRes.data || []) as any);
    } catch (err: any) {
      console.error('연장근무 신청 로딩 실패:', err);
      setMyOvertime([]);
      setTeamOvertime([]);
    } finally {
      setOvertimeLoading(false);
    }
  };

  // ✅ 연장근무 신청 제출: 날짜+시작/종료 시각을 하나의 로컬 datetime 문자열로 합친 뒤
  // localDateTimeInputToIso로 변환해서 저장한다 (출퇴근 수정요청과 동일하게, 타임존 버그 재발 방지).
  // 종료 시각이 시작 시각보다 이르거나 같으면 자정을 넘긴 근무로 보고 종료일을 다음날로 계산한다.
  const submitOvertimeRequest = async () => {
    if (!user) return;
    if (!overtimeForm.workDate || !overtimeForm.startTime || !overtimeForm.endTime) {
      setError('날짜와 시간을 모두 입력해주세요');
      return;
    }
    if (!overtimeForm.reason.trim()) {
      setError('사유를 입력해주세요');
      return;
    }

    setOvertimeSubmitting(true);
    setError('');
    try {
      let endDateStr = overtimeForm.workDate;
      if (overtimeForm.endTime <= overtimeForm.startTime) {
        endDateStr = shiftDateStr(overtimeForm.workDate, 1);
      }

      const startIso = localDateTimeInputToIso(`${overtimeForm.workDate}T${overtimeForm.startTime}`);
      const endIso = localDateTimeInputToIso(`${endDateStr}T${overtimeForm.endTime}`);

      if (!startIso || !endIso) {
        setError('시간을 올바르게 입력해주세요');
        return;
      }

      const { error: insertError } = await supabase.from('overtime_requests').insert({
        user_id: user.id,
        work_date: overtimeForm.workDate,
        requested_start_at: startIso,
        requested_end_at: endIso,
        reason: overtimeForm.reason,
        status: 'pending',
      });

      if (insertError) throw insertError;

      setSuccess('연장근무 신청이 제출되었습니다');
      setShowOvertimeModal(false);
      setOvertimeForm({ workDate: todayKey(), startTime: '18:00', endTime: '20:00', reason: '' });
      fetchOvertimeData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '연장근무 신청 실패');
    } finally {
      setOvertimeSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowOvertimeModal(true)}
          className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-md hover:bg-amber-700"
        >
          연장근무 신청
        </button>
      </div>

      {/* 나의 연장근무 신청 내역 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">나의 연장근무 신청 내역</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">근무 일자</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">시작~종료</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">사유</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {!overtimeLoading && myOvertime.map((ot) => {
                const { label, colorClass } = getRevisionStatusLabel(ot.status);
                return (
                  <tr key={ot.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                      {new Date(`${ot.work_date}T00:00:00`).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                      {formatDateTimeShort(ot.requested_start_at)} ~ {formatDateTimeShort(ot.requested_end_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{ot.reason || '-'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 text-xs rounded ${colorClass}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
              {overtimeLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">불러오는 중...</td>
                </tr>
              )}
              {!overtimeLoading && myOvertime.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">신청 내역이 없습니다</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 팀원 연장근무 신청 현황 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">팀원 연장근무 신청 현황</h2>
          <p className="text-xs text-gray-400 mt-0.5">같은 프로젝트 소속 팀원들의 연장근무 신청 내역입니다.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">신청자</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">근무 일자</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">시작~종료</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {!overtimeLoading && teamOvertime.map((ot) => {
                const { label, colorClass } = getRevisionStatusLabel(ot.status);
                return (
                  <tr key={ot.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">{ot.requester?.name || '-'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                      {new Date(`${ot.work_date}T00:00:00`).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-700">
                      {formatDateTimeShort(ot.requested_start_at)} ~ {formatDateTimeShort(ot.requested_end_at)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 text-xs rounded ${colorClass}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
              {overtimeLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">불러오는 중...</td>
                </tr>
              )}
              {!overtimeLoading && teamOvertime.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">
                    같은 프로젝트 팀원의 연장근무 신청 내역이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 연장근무 신청 모달 */}
      {showOvertimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4">연장근무 신청</h3>
            <p className="text-xs text-gray-500 mb-4">
              사전 승인된 시간만 근태표의 "연장근무"에 반영됩니다. 승인된 시간보다 일찍 퇴근하면 실제 퇴근시각까지만 반영돼요.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">근무 일자</label>
                <input
                  type="date"
                  value={overtimeForm.workDate}
                  onChange={(e) => setOvertimeForm({ ...overtimeForm, workDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시작 시각</label>
                  <input
                    type="time"
                    value={overtimeForm.startTime}
                    onChange={(e) => setOvertimeForm({ ...overtimeForm, startTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">종료 시각</label>
                  <input
                    type="time"
                    value={overtimeForm.endTime}
                    onChange={(e) => setOvertimeForm({ ...overtimeForm, endTime: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유</label>
                <textarea
                  value={overtimeForm.reason}
                  onChange={(e) => setOvertimeForm({ ...overtimeForm, reason: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="연장근무 사유를 입력하세요"
                />
              </div>
            </div>
            <div className="mt-6 flex space-x-2">
              <button
                onClick={submitOvertimeRequest}
                disabled={overtimeSubmitting}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
              >
                {overtimeSubmitting ? '제출 중...' : '신청'}
              </button>
              <button
                onClick={() => setShowOvertimeModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OvertimePanel;
