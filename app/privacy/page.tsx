// app/privacy/page.tsx
export default function PrivacyPage() {
  const supportEmail = 'zxcvbnm89432@gmail.com';

  return (
    <main className="container docWrap">
      <div className="card docCard">
        <h1>브리드(BREATH) 개인정보 처리방침</h1>
        <p>
          브리드(BREATH)는 사용자의 개인정보를 소중히 보호합니다.
          본 방침은 서비스 제공을 위해 어떤 정보를 어떻게 처리하는지 설명합니다.
        </p>

        <h2>1. 수집하는 개인정보</h2>
        <ul>
          <li>이메일 주소(로그인 및 계정 식별 목적)</li>
          <li>사용자가 앱에 입력한 기록 데이터(서비스 제공 목적)</li>
        </ul>

        <h2>2. 이용 목적</h2>
        <ul>
          <li>사용자 인증 및 계정 관리</li>
          <li>기록 데이터 저장 및 동기화</li>
          <li>서비스 품질 개선을 위한 오류 대응</li>
        </ul>

        <h2>3. 보관 및 파기</h2>
        <p>
          개인정보는 서비스 제공에 필요한 기간 동안 보관되며,
          사용자가 계정 삭제를 진행하는 경우 관련 정보는 파기됩니다.
        </p>

        <h2>4. 제3자 제공</h2>
        <p>
          브리드는 법령에 따른 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.
        </p>

        <h2>5. 문의</h2>
        <p>
          개인정보 관련 문의: <span className="mono">{supportEmail}</span>
        </p>

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
