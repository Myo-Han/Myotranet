// 원천징수영수증 출력 템플릿 (샘플/모의 데이터 기반)
import React from 'react';

type Props = {
  companyName?: string;
  issueDate: string;
  yearText: string; // 예: "2025"
  nameText: string;
  departmentText: string;
  positionText: string;
  totalGross: number;
  incomeTax: number;
  localIncomeTax: number;
  paidTax: number;
};

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

const WithholdingTemplate: React.FC<Props> = ({
  companyName = '묘한',
  issueDate,
  yearText,
  nameText,
  departmentText,
  positionText,
  totalGross,
  incomeTax,
  localIncomeTax,
  paidTax,
}) => {
  const decidedTax = incomeTax + localIncomeTax;
  const diffTax = decidedTax - paidTax;

  return (
    <div className="wh-root">
      <style>{`
        .wh-root { background: #f3f4f6; padding: 16px; }
        .wh-page {
          width: 210mm; min-height: 297mm; margin: 0 auto;
          background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          padding: 20mm 18mm; box-sizing: border-box;
        }
        .wh-title { text-align: center; font-weight: 800; font-size: 26px; margin-bottom: 4px; }
        .wh-sub { text-align: center; font-size: 14px; color: #555; margin-bottom: 20px; }
        .wh-table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 18px; }
        .wh-table th, .wh-table td { border: 1px solid #111; padding: 9px 12px; }
        .wh-table th { background: #fafafa; text-align: left; width: 26%; }
        .wh-table td.amount { text-align: right; }
        .wh-total { font-weight: 800; }
        .wh-note { margin-top: 30px; font-size: 12px; color: #b91c1c; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          .wh-root { background: #fff !important; padding: 0 !important; }
          .wh-page { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="wh-page">
        <h1 className="wh-title">근로소득 원천징수영수증</h1>
        <p className="wh-sub">귀속연도 {yearText}년 · 발급일 {issueDate}</p>

        <table className="wh-table">
          <tbody>
            <tr>
              <th>성명</th><td>{nameText}</td>
              <th>소속</th><td>{departmentText || '-'}</td>
            </tr>
            <tr>
              <th>직급</th><td colSpan={3}>{positionText || '-'}</td>
            </tr>
          </tbody>
        </table>

        <table className="wh-table">
          <tbody>
            <tr><th>총 급여액</th><td className="amount">{fmt(totalGross)}</td></tr>
            <tr><th>결정세액(소득세)</th><td className="amount">{fmt(incomeTax)}</td></tr>
            <tr><th>결정세액(지방소득세)</th><td className="amount">{fmt(localIncomeTax)}</td></tr>
            <tr className="wh-total"><th>결정세액 합계</th><td className="amount">{fmt(decidedTax)}</td></tr>
            <tr><th>기납부세액</th><td className="amount">{fmt(paidTax)}</td></tr>
            <tr className="wh-total">
              <th>{diffTax >= 0 ? '차감징수세액' : '차감환급세액'}</th>
              <td className="amount">{fmt(Math.abs(diffTax))}</td>
            </tr>
          </tbody>
        </table>

        <p className="wh-note">
          ※ 본 영수증은 샘플/테스트 데이터로 계산된 것으로, 실제 세무 신고나 증빙에 사용할 수 없습니다.
        </p>

        <p style={{ textAlign: 'center', marginTop: 24 }}>{companyName}</p>
      </div>
    </div>
  );
};

export default WithholdingTemplate;
