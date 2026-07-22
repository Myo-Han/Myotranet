// 연장근무 신청 패널 (근태관리 탭의 "연장근무 신청" 카테고리).
// 연차 신청(LeaveAnnualPanel)과 동일한 패턴: "연장근무 신청" 버튼을 누르면 페이지 이동 없이
// 같은 영역 안에서 목록 <-> 폼(OvertimeRequestFormBody)으로 전환되고, 결재라인(결재자/참조)이 포함된다.
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import ErrorMessage from '../ErrorMessage';
import SuccessMessage from '../SuccessMessage';
import { isOvertimeEditable, deleteOvertimeRequest } from '../../hooks/useOvertimeRequest';
import { getRevisionStatusLabel } from '../../utils/attendanceLabels';
import OvertimeRequestFormBody from './OvertimeRequestFormBody';
import Pagination, { paginate } from './Pagination';

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

const formatDateTimeShort = (iso: string) => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.toLocaleDateString('ko-KR')} ${hh}:${mm}`;
};

const CardHeading: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div className="px-4 py-3 border-b border-gray-100">
    <h2 className="text-sm font-medium text-gray-900">{children}</h2>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const OvertimePanel: React.FC = () => {
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editOvertimeId, setEditOvertimeId] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [myOvertime, setMyOvertime] = useState<OvertimeRequestRow[]>([]);
  const [teamOvertime, setTeamOvertime] = useState<OvertimeRequestRow[]>([]);
  const [overtimeLoading, setOvertimeLoading] = useState(true);

  const [myPage, setMyPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);

  // ✅ 결재 진행 상세 모달 (LeaveAnnualPanel과 동일한 패턴)
  type OvertimeApprovalRow = {
    id: string;
    overtime_id: string;
    approval_line_id: string | null;
    status: string;
    current_step_order: number | null;
  };
  type StepRow = {
    id: string;
    step_order: number;
  };
  type ActionRow = {
    id: string;
    step_order: number;
    actor_user_id: string | null;
    action: string;
    notes: string | null;
    created_at: string;
  };

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailApproval, setDetailApproval] = useState<OvertimeApprovalRow | null>(null);
  const [detailSteps, setDetailSteps] = useState<StepRow[]>([]);
  const [detailActions, setDetailActions] = useState<ActionRow[]>([]);
  const [detailOvertime, setDetailOvertime] = useState<OvertimeRequestRow | null>(null);
  const [deletingOvertime, setDeletingOvertime] = useState(false);

  useEffect(() => {
    fetchOvertimeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const openNewForm = () => {
    setEditOvertimeId(null);
    setViewMode('form');
  };

  const handleEditOvertime = (ot: OvertimeRequestRow) => {
    setDetailOpen(false);
    setEditOvertimeId(ot.id);
    setViewMode('form');
  };

  const closeForm = () => {
    setViewMode('list');
    setEditOvertimeId(null);
    fetchOvertimeData();
    setMyPage(1);
  };

  const handleDeleteOvertime = async (ot: OvertimeRequestRow) => {
    if (!window.confirm('이 연장근무 신청을 삭제하시겠습니까?')) return;

    setDeletingOvertime(true);
    const result = await deleteOvertimeRequest(ot.id);
    setDeletingOvertime(false);

    if (result.ok) {
      setDetailOpen(false);
      setSuccess('연장근무 신청이 삭제되었습니다.');
      setTimeout(() => setSuccess(''), 3000);
      fetchOvertimeData();
    } else {
      setDetailError(result.error || '삭제에 실패했습니다');
    }
  };

  const openApprovalDetail = async (ot: OvertimeRequestRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailApproval(null);
    setDetailSteps([]);
    setDetailActions([]);
    setDetailOvertime(ot);

    try {
      const { data: approval, error: approvalErr } = await supabase
        .from('overtime_approvals')
        .select('*')
        .eq('overtime_id', ot.id)
        .maybeSingle();

      if (approvalErr) throw approvalErr;

      if (!approval) {
        setDetailApproval(null);
        return;
      }

      setDetailApproval(approval as any);

      if ((approval as any).approval_line_id) {
        const { data: steps, error: stepsErr } = await supabase
          .from('approval_line_steps')
          .select('id, step_order')
          .eq('approval_line_id', (approval as any).approval_line_id)
          .order('step_order', { ascending: true });

        if (stepsErr) throw stepsErr;
        setDetailSteps((steps || []) as any);
      } else {
        const { data: customSteps, error: customStepsErr } = await supabase
          .from('overtime_approval_custom_steps')
          .select('id, step_order')
          .eq('overtime_approval_id', (approval as any).id)
          .order('step_order', { ascending: true });

        if (customStepsErr) throw customStepsErr;
        setDetailSteps((customSteps || []) as any);
      }

      const { data: actions, error: actionsErr } = await supabase
        .from('overtime_approval_actions')
        .select('*')
        .eq('overtime_approval_id', (approval as any).id)
        .order('created_at', { ascending: true });

      if (actionsErr) throw actionsErr;
      setDetailActions(((actions || []) as any) as ActionRow[]);
    } catch (e: any) {
      setDetailError(e.message || '결재 진행 조회 실패');
    } finally {
      setDetailLoading(false);
    }
  };

  if (viewMode === 'form') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-900">{editOvertimeId ? '연장근무 신청 수정' : '새 연장근무 신청'}</h2>
          <button
            type="button"
            onClick={closeForm}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            목록으로
          </button>
        </div>
        <OvertimeRequestFormBody overtimeId={editOvertimeId ?? undefined} onDone={closeForm} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={openNewForm}
          className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-md hover:bg-amber-700"
        >
          연장근무 신청
        </button>
      </div>

      {/* 나의 연장근무 신청 내역 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <CardHeading>나의 연장근무 신청 내역</CardHeading>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">근무 일자</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">시작~종료</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">사유</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {!overtimeLoading && paginate(myOvertime, myPage).map((ot) => {
                const { label, colorClass } = getRevisionStatusLabel(ot.status);
                return (
                  <tr
                    key={ot.id}
                    onClick={() => openApprovalDetail(ot)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
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
        <Pagination page={myPage} totalCount={myOvertime.length} onChange={setMyPage} />
      </div>

      {/* 팀원 연장근무 신청 현황 */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <CardHeading sub="같은 프로젝트 소속 팀원들의 연장근무 신청 내역입니다.">
          팀원 연장근무 신청 현황
        </CardHeading>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">신청자</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">근무 일자</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">시작~종료</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {!overtimeLoading && paginate(teamOvertime, teamPage).map((ot) => {
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
        <Pagination page={teamPage} totalCount={teamOvertime.length} onChange={setTeamPage} />
      </div>

      {/* ✅ 결재 진행 현황 모달 */}
      {detailOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">결재 진행 현황</h3>
              <div className="flex items-center gap-2">
                {detailOvertime && isOvertimeEditable(detailOvertime.work_date) && (
                  <>
                    <button
                      onClick={() => handleEditOvertime(detailOvertime)}
                      disabled={deletingOvertime}
                      className="px-3 py-1 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteOvertime(detailOvertime)}
                      disabled={deletingOvertime}
                      className="px-3 py-1 text-sm bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
                    >
                      {deletingOvertime ? '삭제 중...' : '삭제'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDetailOpen(false)}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                >
                  닫기
                </button>
              </div>
            </div>

            {detailOvertime && !isOvertimeEditable(detailOvertime.work_date) && (
              <p className="text-xs text-gray-400 mb-3">이미 지난 연장근무 신청은 수정/삭제할 수 없습니다.</p>
            )}

            {detailLoading && (
              <div className="py-6 text-center text-sm text-gray-600">로딩중</div>
            )}

            {!detailLoading && detailError && (
              <div className="py-3 text-red-600 text-sm">{detailError}</div>
            )}

            {!detailLoading && !detailError && !detailApproval && (
              <div className="py-6 text-center text-sm text-gray-600">
                결재 인스턴스가 없습니다 (결재자를 지정하지 않고 신청한 건입니다)
              </div>
            )}

            {!detailLoading && !detailError && detailApproval && (
              <>
                {(() => {
                  const lastRejected = detailActions.slice().reverse().find((a) => a.action === 'rejected');
                  const rejectedStep = lastRejected?.step_order ?? null;
                  const current = detailApproval.current_step_order ?? null;

                  return (
                    <>
                      {detailApproval.status === 'rejected' && lastRejected?.notes && (
                        <div className="mb-4 p-3 rounded bg-red-50 text-sm text-red-700">
                          <div className="font-medium">반려 사유</div>
                          <div className="mt-1">{lastRejected.notes}</div>
                        </div>
                      )}

                      <div className="border border-gray-200 rounded-md overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">단계</div>
                        <div className="divide-y divide-gray-100">
                          {detailSteps.map((s) => {
                            const stepActions = detailActions.filter((a) => a.step_order === s.step_order);
                            const last = stepActions.length ? stepActions[stepActions.length - 1] : null;

                            let stateLabel = '대기';
                            if (detailApproval.status === 'rejected' && rejectedStep === s.step_order) {
                              stateLabel = '반려';
                            } else if (last?.action === 'approved') {
                              stateLabel = '완료';
                            } else if (detailApproval.status === 'pending' && current === s.step_order) {
                              stateLabel = '진행중';
                            } else if (current !== null && s.step_order < current) {
                              stateLabel = '완료';
                            }

                            const processedAt =
                              (stateLabel === '완료' || stateLabel === '반려') && last
                                ? new Date(last.created_at).toLocaleString('ko-KR')
                                : null;

                            return (
                              <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                <div className="text-sm text-gray-800">
                                  <div className="font-medium">{s.step_order}단계</div>
                                  {processedAt && <div className="text-xs text-gray-500 mt-1">{processedAt}</div>}
                                </div>

                                <span
                                  className={`px-2 py-0.5 text-xs rounded-full ${stateLabel === '완료'
                                    ? 'bg-green-100 text-green-800'
                                    : stateLabel === '반려'
                                      ? 'bg-red-100 text-red-800'
                                      : stateLabel === '진행중'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                >
                                  {stateLabel}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OvertimePanel;
