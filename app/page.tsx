// app/page.tsx
export default function HomePage() {
  const supportEmail = 'zxcvbnm89432@gmail.com';
  const downloadHref = '#';
  const testflightHref = '#';

  return (
    <>
      <header className="nav">
        <div className="container navInner">
          <div className="brand">
            <div className="logo" aria-hidden />
            <div className="brandText">
              <div className="title">BREATH</div>
              <div className="sub">강박 없이, 계속을 위한 기록</div>
            </div>
          </div>

          <nav className="navLinks">
            <a className="pill" href="/privacy">개인정보처리방침</a>
            <a className="pill" href="/terms">서비스 이용약관</a>
            <a className="pill" href="/support">지원</a>
            <a className="primaryBtn" href={testflightHref} aria-label="TestFlight">
              테스트(TestFlight) <span style={{ opacity: 0.7 }}>↗</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="heroGrid">
            <div className="card heroMain">
              <div className="kicker">
                <span className="dot" />
                오늘은 1개면 충분해.
              </div>

              <div className="h1">
                숨처럼 가볍게,
                <br />
                기록은 계속되게.
              </div>

              <p className="desc">
                BREATH는 “해야 한다”를 줄이고, “계속할 수 있게” 만드는 기록 앱이야.
                <br />
                완벽하지 않아도, 끊겨도, 다시 시작할 수 있게.
              </p>

              <div className="tagRow">
                <span className="tag">완료/쉬기/미기록</span>
                <span className="tag">캘린더·히트맵</span>
                <span className="tag">부담 없는 알림</span>
                <span className="tag">최소한의 개인정보</span>
              </div>

              <div className="ctaRow">
                <a className="primaryBtn" href={downloadHref}>
                  다운로드 <span style={{ opacity: 0.7 }}>↗</span>
                </a>
                <a className="pill" href="/support">문의하기</a>
                <a className="pill" href="/privacy">개인정보</a>
                <a className="pill" href="/terms">약관</a>
              </div>

              <div style={{ marginTop: 18, color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.6 }}>
                ※ 본 페이지는 앱 심사 및 사용자 안내를 위한 정보 페이지입니다.
              </div>
            </div>

            <aside className="card heroSide">
              <div className="sideTitle">핵심 기능</div>
              <div className="featureList">
                <div className="featureItem">
                  <div className="ft"><span className="badge" /> 오늘의 기록</div>
                  <p>“완료/쉬기/미기록”으로 오늘을 정리해. 쉬는 날도 실패가 아니게.</p>
                </div>
                <div className="featureItem">
                  <div className="ft"><span className="badge" /> 시각화</div>
                  <p>캘린더와 히트맵으로 흐름을 봐. 숫자보다 리듬에 집중.</p>
                </div>
                <div className="featureItem">
                  <div className="ft"><span className="badge" /> 알림(선택)</div>
                  <p>강요하지 않는 한 번의 알림. 켜고 끄는 건 전적으로 너의 선택.</p>
                </div>
                <div className="featureItem">
                  <div className="ft"><span className="badge" /> 최소 수집</div>
                  <p>서비스 제공에 필요한 범위에서만 처리해. 불필요한 정보는 받지 않아.</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="section">
          <div className="grid2">
            <div className="card panel">
              <div className="panelTitle">무엇을 하나요?</div>
              <div className="small">
                BREATH는 ‘꾸준함’을 방해하는 강박을 낮추는 데 초점을 둬.
                <br />
                기록이 죄책감이 되지 않도록, “쉬기”를 선택지로 둔다.
              </div>

              <div className="hr" />

              <div className="panelTitle">누구에게 좋아요?</div>
              <div className="small">
                - 기록이 자주 끊겨서 자신을 탓하던 사람<br />
                - 루틴 앱이 부담으로 느껴졌던 사람<br />
                - 완벽이 아니라, “계속”을 원했던 사람
              </div>
            </div>

            <div className="card panel">
              <div className="panelTitle">FAQ</div>
              <div className="faq">
                <div className="faqItem">
                  <div className="faqQ">Q. 어떤 정보를 수집하나요?</div>
                  <div className="faqA">
                    A. 로그인/계정 식별을 위한 이메일과, 사용자가 입력한 기록 데이터만 처리합니다.
                    자세한 내용은{' '}
                    <a href="/privacy" style={{ textDecoration: 'underline', opacity: 0.9 }}>
                      개인정보처리방침
                    </a>
                    을 참고해주세요.
                  </div>
                </div>

                <div className="faqItem">
                  <div className="faqQ">Q. 계정 삭제는 어떻게 하나요?</div>
                  <div className="faqA">
                    A. 앱 내 설정에서 계정 삭제를 진행할 수 있습니다. 삭제 시 개인정보는 파기됩니다.
                  </div>
                </div>

                <div className="faqItem">
                  <div className="faqQ">Q. 문의는 어디로 하나요?</div>
                  <div className="faqA">
                    A. <span className="mono">{supportEmail}</span> 로 보내주세요. 가능하면 기기/OS 버전도 같이 적어주면 좋아요.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="footer">
          <div className="container footerRow">
            <div>문의: <span className="mono">{supportEmail}</span></div>
            <div>© 2026 BREATH</div>
          </div>
        </footer>
      </main>
    </>
  );
}
