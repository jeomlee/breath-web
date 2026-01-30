// app/support/page.tsx
export default function SupportPage() {
  const supportEmail = 'zxcvbnm89432@gmail.com';

  return (
    <main className="container docWrap">
      <div className="card docCard">
        <h1>브리드(BREATH) 지원</h1>
        <p>문의/버그 제보는 아래 이메일로 보내주세요.</p>

        <div className="hr" />

        <h2>문의 이메일</h2>
        <p><span className="mono">{supportEmail}</span></p>

        <h2>보내주면 좋은 정보</h2>
        <ul>
          <li>기기 모델(iPhone 13 등)</li>
          <li>iOS 버전</li>
          <li>문제 발생 화면/상황 설명</li>
        </ul>

        <div className="hr" />
        <p style={{ marginTop: 12 }}>
          <a className="pill" href="/privacy">개인정보처리방침</a>{' '}
          <a className="pill" href="/terms">서비스 이용약관</a>{' '}
          <a className="pill" href="/">← 홈으로</a>
        </p>
      </div>
    </main>
  );
}
