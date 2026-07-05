// 급여명세서 출력 템플릿 (샘플/모의 데이터 기반)
import React from 'react';

export type PayslipLine = { label: string; amount: number };

type Props = {
  companyName?: string;
  issueDate: string;
  payMonthText: string; // 예: "2026년 07월"
  nameText: string;
  departmentText: string;
  positionText: string;
  payments: PayslipLine[];
  deductions: PayslipLine[];
};

const fmt = (n: number) => n.toLocaleString('ko-KR');

const PayslipTemplate: React.FC<Props> = ({
  companyName = '묘한',
  issueDate,
  payMonthText,
  nameText,
  departmentText,
  positionText,
  payments,
  deductions,
}) => {
  const totalPayment = payments.reduce((s, p) => s + p.amount, 0);
  const totalDeduction = deductions.reduce((s, p) => s + p.amount, 0);
  const netPay = totalPayment - totalDeduction;

  return (
    <div className="pay-root">
      <style>{`
        .pay-root { background: #f3f4f6; padding: 16px; }
        .pay-page {
          width: 210mm; min-height: 297mm; margin: 0 auto;
          background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          padding: 20mm 18mm; box-sizing: border-box;
        }
        .pay-title { text-align: center; font-weight: 800; font-size: 26px; margin-bottom: 6px; }
        .pay-sub { text-align: center; font-size: 14px; color: #555; margin-bottom: 20px; }
        .pay-info-table { border-collapse: collapse; width: 100%; font-size: 14px; margin-bottom: 20px; }
        .pay-info-table th, .pay-info-table td { border: 1px solid #111; padding: 8px 12px; }
        .pay-info-table th { background: #fafafa; width: 20%; text-align: left; }
        .pay-tables { display: flex; gap: 16px; }
        .pay-table { flex: 1; border-collapse: collapse; width: 100%; font-size: 14px; }
        .pay-table th, .pay-table td { border: 1px solid #111; padding: 8px 12px; }
        .pay-table th { background: #f0f4ff; text-align: center; }
        .pay-table td.amount { text-align: right; }
        .pay-table tfoot td { font-weight: 800; }
        .pay-net { margin-top: 20px; border: 2px solid #111; padding: 14px; text-align: center; font-size: 18px; font-weight: 800; }
        .pay-note { margin-top: 30px; font-size: 12px; color: #b91c1c; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          .pay-root { background: #fff !important; padding: 0 !important; }
          .pay-page { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="pay-page">
        <h1 className="pay-title">급 여 명 세 서</h1>
        <p className="pay-sub">{payMonthText} · 발급일 {issueDate}</p>

        <table className="pay-info-table">
          <tbody>
            <tr>
              <th>성명</th>
              <td>{nameText}</td>
              <th>소속</th>
              <td>{departmentText || '-'}</td>
            </tr>
            <tr>
              <th>직급</th>
              <td colSpan={3}>{positionText || '-'}</td>
            </tr>
          </tbody>
        </table>

        <div className="pay-tables">
          <table className="pay-table">
            <thead><tr><th colSpan={2}>지급 내역</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="amount">{fmt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>지급 합계</td><td className="amount">{fmt(totalPayment)}</td></tr>
            </tfoot>
          </table>

          <table className="pay-table">
            <thead><tr><th colSpan={2}>공제 내역</th></tr></thead>
            <tbody>
              {deductions.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td className="amount">{fmt(d.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>공제 합계</td><td className="amount">{fmt(totalDeduction)}</td></tr>
            </tfoot>
          </table>
        </div>

        <div className="pay-net">실지급액(원) : {fmt(netPay)}</div>

        <p className="pay-note">
          ※ 본 명세서는 샘플/테스트 데이터로 계산된 것으로, 실제 급여 지급의 법적 효력이 없습니다.
        </p>

        <p style={{ textAlign: 'center', marginTop: 24 }}>{companyName}</p>
      </div>
    </div>
  );
};

export default PayslipTemplate;
