// app/terms/page.tsx
export default function TermsPage() {
  const supportEmail = 'breath.app@gmail.com';

  return (
    <main className="container docWrap">
      <div className="card docCard">
        <h1>브리드(BREATH) 서비스 이용약관</h1>
        <p>
          본 약관은 BREATH 서비스 이용과 관련하여 기본적인 권리/의무를 규정합니다.
          (심사용 최소 약관 버전)
        </p>

        <h2>1. 서비스 제공</h2>
        <p>BREATH는 사용자의 기록 및 관리 기능을 제공합니다.</p>

        <h2>2. 이용자의 책임</h2>
        <p>이용자는 본인의 계정 정보를 안전하게 관리해야 합니다.</p>

        <h2>3. 서비스 변경/중단</h2>
        <p>서비스 개선을 위해 일부 기능이 변경/중단될 수 있습니다.</p>

        <h2>4. 문의</h2>
        <p>문의: <span className="mono">{supportEmail}</span></p>

        <div className="hr" />
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
          최종 업데이트: 2026-01-30
        </p>

        <p style={{ marginTop: 12 }}>
          <a className="pill" href="/">← 홈으로</a>
        </p>
      </div>
    </main>
  );
}
