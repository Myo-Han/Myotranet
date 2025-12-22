// 출근 일일 상세 템플릿
import React, { useMemo } from 'react';

export type AttendanceDailyDetailRow = {
  date: string;        // YYYY-MM-DD
  timeText: string;    // 예: "오전 07:30"
  eventText: string;   // 예: "출근"
  memo?: string | null;
};

type Props = {
  issueDate: string;      // 발급일
  periodText: string;     // 조회기간 텍스트 (예: "2025-12-01 - 2025-12-07")
  departmentText: string; // 소속
  nameText: string;       // 성명
  rows: AttendanceDailyDetailRow[]; // 일일 상세 rows

  totalWorkText?: string; // 예: "8h30m"
  breakText?: string;     // 예: "1h00m"
  netWorkText?: string;   // 예: "7h30m"
  noteText?: string;      // 비고

  titleText?: string;     // 기본: "묘한 출퇴근 증빙서 (일일 상세)"
};

const ROWS_PER_PAGE = 25;

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const padRows = (pageRows: AttendanceDailyDetailRow[]) => {
  if (pageRows.length >= ROWS_PER_PAGE) return pageRows;
  const blanks: AttendanceDailyDetailRow[] = Array.from({ length: ROWS_PER_PAGE - pageRows.length }).map(() => ({
    date: '',
    timeText: '',
    eventText: '',
    memo: '',
  }));
  return [...pageRows, ...blanks];
};

const AttendanceDailyDetailTemplate: React.FC<Props> = ({
  issueDate,
  periodText,
  departmentText,
  nameText,
  rows,
  totalWorkText,
  breakText,
  netWorkText,
  noteText,
  titleText = '묘한 출퇴근 증빙서 (일일 상세)',
}) => {
  const dataPages = useMemo(() => {
    const chunks = chunk(rows ?? [], ROWS_PER_PAGE);
    return chunks.length ? chunks : [[]];
  }, [rows]);

  const totalPages = dataPages.length + 1; // 마지막 1장은 요약(총 근무/휴게/순수근무/비고)

  return (
    <div className="att-ddt-root">
      <style>{`
        .att-ddt-root {
          background: #f3f4f6;
          padding: 16px;
        }

        .att-ddt-page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 16px auto;
          background: #fff;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          padding: 18mm 16mm 16mm 16mm;
          position: relative;
        }

        .att-ddt-title {
          text-align: center;
          font-weight: 800;
          font-size: 26px;
          letter-spacing: 0.5px;
          margin-top: 0;
          margin-bottom: 18px;
        }

        .att-ddt-top {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .att-ddt-box-table {
          border-collapse: collapse;
          font-size: 14px;
        }
        .att-ddt-box-table th,
        .att-ddt-box-table td {
          border: 1px solid #111;
          padding: 8px 10px;
          vertical-align: middle;
        }
        .att-ddt-box-table th {
          font-weight: 700;
          text-align: center;
          white-space: nowrap;
          width: 78px;
        }
        .att-ddt-box-table td {
          min-width: 260px;
        }

        .att-ddt-approval {
          border-collapse: collapse;
          font-size: 14px;
          width: 260px;
          height: 86px;
        }
        .att-ddt-approval th,
        .att-ddt-approval td {
          border: 1px solid #111;
          text-align: center;
          padding: 6px 8px;
        }
        .att-ddt-approval th {
          font-weight: 700;
          height: 30px;
        }
        .att-ddt-approval td {
          height: 56px;
        }

        .att-ddt-main-table {
          border-collapse: collapse;
          width: 100%;
          font-size: 16px;
        }
        .att-ddt-main-table th,
        .att-ddt-main-table td {
          border: 1px solid #111;
          padding: 6px 8px;
          text-align: center;
          height: 32px;
        }
        .att-ddt-main-table th {
          font-weight: 800;
        }
        .att-ddt-col-no { width: 10%; }
        .att-ddt-col-date { width: 22%; }
        .att-ddt-col-time { width: 18%; }
        .att-ddt-col-event { width: 20%; }
        .att-ddt-col-memo { width: 30%; }

        .att-ddt-memo {
          text-align: left !important;
          padding-left: 10px !important;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .att-ddt-footer {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 12mm;
          text-align: center;
          font-size: 16px;
        }

        .att-ddt-summary {
          margin-top: 10mm;
        }
        .att-ddt-summary table {
          border-collapse: collapse;
          width: 100%;
          font-size: 16px;
        }
        .att-ddt-summary th,
        .att-ddt-summary td {
          border: 1px solid #111;
          padding: 10px 12px;
          text-align: center;
        }
        .att-ddt-summary th {
          font-weight: 800;
        }

        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          .att-ddt-root { background: #fff !important; padding: 0 !important; }
          .att-ddt-page {
            margin: 0 !important;
            box-shadow: none !important;
            padding: 18mm 16mm 16mm 16mm;
            page-break-after: always;
          }
        }
      `}</style>

      {dataPages.map((pageRows, pageIdx) => {
        const isFirst = pageIdx === 0;
        const pageNo = pageIdx + 1;

        const padded = padRows(pageRows);
        const startNo = pageIdx * ROWS_PER_PAGE;

        return (
          <div key={`page-${pageIdx}`} className="att-ddt-page">
            {isFirst && (
              <>
                <h1 className="att-ddt-title">{titleText}</h1>

                <div className="att-ddt-top">
                  <table className="att-ddt-box-table">
                    <tbody>
                      <tr>
                        <th>발급일</th>
                        <td>{issueDate}</td>
                      </tr>
                      <tr>
                        <th>조회기간</th>
                        <td>{periodText}</td>
                      </tr>
                      <tr>
                        <th>소속</th>
                        <td>{departmentText}</td>
                      </tr>
                      <tr>
                        <th>성명</th>
                        <td>{nameText}</td>
                      </tr>
                    </tbody>
                  </table>

                  <table className="att-ddt-approval">
                    <thead>
                      <tr>
                        <th>승인</th>
                        <th>결재</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td />
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <table className="att-ddt-main-table">
              {isFirst && (
                <thead>
                  <tr>
                    <th className="att-ddt-col-no">No</th>
                    <th className="att-ddt-col-date">날짜</th>
                    <th className="att-ddt-col-time">시간</th>
                    <th className="att-ddt-col-event">이벤트</th>
                    <th className="att-ddt-col-memo">사유/메모</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {padded.map((r, i) => {
                  const no = startNo + i + 1;
                  return (
                    <tr key={`r-${pageIdx}-${i}`}>
                      <td>{no}</td>
                      <td>{r.date || ''}</td>
                      <td>{r.timeText || ''}</td>
                      <td>{r.eventText || ''}</td>
                      <td className="att-ddt-memo">{r.memo || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="att-ddt-footer">{`페이지 ${pageNo}/${totalPages}`}</div>
          </div>
        );
      })}

      <div className="att-ddt-page">
        <div className="att-ddt-summary">
          <table>
            <thead>
              <tr>
                <th>총 근무</th>
                <th>휴게</th>
                <th>순수 근무</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{totalWorkText ?? '___h__m'}</td>
                <td>{breakText ?? '___h__m'}</td>
                <td>{netWorkText ?? '___h__m'}</td>
                <td>{noteText ?? '________________'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="att-ddt-footer">{`페이지 ${totalPages}/${totalPages}`}</div>
      </div>
    </div>
  );
};

export default AttendanceDailyDetailTemplate;
