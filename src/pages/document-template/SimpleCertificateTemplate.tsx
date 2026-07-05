// 재직증명서 / 근무사실증명서 / 퇴직증명서 공용 출력 템플릿
import React from 'react';

export type CertificateInfoRow = {
  label: string;
  value: string;
};

type Props = {
  titleText: string;      // 예: "재직증명서"
  issueDate: string;      // 발급일 YYYY-MM-DD
  infoRows: CertificateInfoRow[]; // 성명/소속/직급/입사일 등
  bodyText: string;       // 증명 문구 (여러 줄 가능, \n 구분)
  purposeText?: string;   // 제출 용도
  companyName?: string;
};

const SimpleCertificateTemplate: React.FC<Props> = ({
  titleText,
  issueDate,
  infoRows,
  bodyText,
  purposeText,
  companyName = '묘한',
}) => {
  return (
    <div className="cert-root">
      <style>{`
        .cert-root { background: #f3f4f6; padding: 16px; }
        .cert-page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #fff;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          padding: 24mm 20mm;
          position: relative;
          box-sizing: border-box;
        }
        .cert-title {
          text-align: center;
          font-weight: 800;
          font-size: 30px;
          letter-spacing: 4px;
          margin-bottom: 40px;
        }
        .cert-info-table {
          border-collapse: collapse;
          width: 100%;
          font-size: 15px;
          margin-bottom: 40px;
        }
        .cert-info-table th, .cert-info-table td {
          border: 1px solid #111;
          padding: 10px 14px;
        }
        .cert-info-table th {
          background: #fafafa;
          width: 30%;
          text-align: left;
          font-weight: 700;
        }
        .cert-body {
          font-size: 16px;
          line-height: 2;
          white-space: pre-wrap;
          min-height: 120px;
          margin-bottom: 40px;
        }
        .cert-purpose {
          font-size: 15px;
          margin-bottom: 60px;
        }
        .cert-footer {
          text-align: center;
          font-size: 16px;
          line-height: 2;
        }
        .cert-issuedate {
          text-align: center;
          font-size: 16px;
          margin-bottom: 24px;
        }
        @media print {
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          .cert-root { background: #fff !important; padding: 0 !important; }
          .cert-page { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="cert-page">
        <h1 className="cert-title">{titleText}</h1>

        <table className="cert-info-table">
          <tbody>
            {infoRows.map((row) => (
              <tr key={row.label}>
                <th>{row.label}</th>
                <td>{row.value || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="cert-body">{bodyText}</div>

        {purposeText && <div className="cert-purpose">용도 : {purposeText}</div>}

        <div className="cert-issuedate">{issueDate}</div>

        <div className="cert-footer">
          {companyName}
          <br />
          대표 (인)
        </div>
      </div>
    </div>
  );
};

export default SimpleCertificateTemplate;
