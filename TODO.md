# Design Review & Improvement TODO

> Senior Product Designer review — 2026-04-12
> Scope: `apps/web` 전체 UI/UX, globals.css, layout, 모든 page/component

---

## D-R1: Layout & Spacing (줄바꿈/레이아웃)

### D-R1.1: `page.tsx` (Lobby) — 섹션 간 간격 불일치

- **문제**: HeroSection, FeaturedOfTheDay, featuredLiveCard, LiveTablesGrid 사이 간격이 제각각. `margin-bottom: 1.15rem`, `1.2rem`, `1.2rem` 등 비일관적.
- **개선**: 섹션 간 spacing을 `--space-6` (1.5rem) 또는 `--space-8` (2rem)으로 통일. `.page-section`에 `display: flex; flex-direction: column; gap: var(--space-6)` 적용하고 개별 margin-bottom 제거.

### D-R1.2: `TableViewer.tsx` — inline style 남발로 레이아웃 불예측

- **문제**: AI Commentary 패널 (line 496-523)에 `style={{ ... }}` 8개 이상. 줄바꿈/간격이 CSS가 아니라 inline에서 결정됨.
- **개선**: `TableViewer.module.css`에 `.commentaryPanel`, `.commentaryHeader`, `.commentaryBody` 클래스 추출. margin/padding은 CSS로 관리.

### D-R1.3: `TableViewer.tsx` — Polling toast inline 스타일 (line 336)

- **문제**: polling fallback 배너가 완전히 inline style로 작성됨. border-radius, padding, fontSize 전부 인라인.
- **개선**: `.pollingToast` 클래스를 module.css에 추가.

### D-R1.4: `leaderboard/page.tsx` — Create Agent CTA 전부 inline (line 160)

- **문제**: CTA 박스 (`marginTop: "2rem", padding: "1rem 1.25rem"...`) 전부 inline. 미디어쿼리 대응 불가.
- **개선**: `leaderboard.module.css`에 `.ctaBanner` 클래스로 이동. 모바일에서 flex-direction: column 대응 추가.

### D-R1.5: `me/page.tsx` — 로그아웃 상태 preview CTA inline 과다 (line 87-98)

- **문제**: `style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}` 등 6개 이상 inline style.
- **개선**: `me/page.module.css`에 `.previewCta`, `.previewIcon`, `.previewCtaActions` 추출.

### D-R1.6: Footer 내비게이션 — 줄바꿈 시 중앙정렬 어색

- **문제**: `layout.tsx` footer의 `.footer-nav`가 `flex-wrap: wrap; justify-content: center`인데, 7개 링크가 줄바꿈되면 마지막 줄 1-2개만 덩그러니 중앙에 위치.
- **개선**: `justify-content: center` 유지하되, 모바일(480px)에서 `grid-template-columns: repeat(2, 1fr)` 2열 그리드로 전환. 현재 480px 이하에서 1열 column으로 가는데, 7개 링크에 1열은 너무 길어짐.

### D-R1.7: `globals.css` — `.app-shell` max-width 후 양옆 여백

- **문제**: `max-width: 1320px`에 `padding: 0 var(--space-4)`만 있어서, 1320px 이하 화면에서는 좌우 16px만. 넓은 화면에서는 충분하지만, 태블릿(~900px)에서 카드 콘텐츠가 양쪽 벽에 너무 가까움.
- **개선**: 태블릿 breakpoint에서 `padding: 0 var(--space-6)` 이상으로 증가.

### D-R1.8: `HeroSection` — landingCtaRow 버튼 줄바꿈 시 간격

- **문제**: 좁은 화면에서 "Watch Live" + "Deploy Agent" 버튼이 wrap되면 `gap: 0.75rem`만. 버튼이 세로로 쌓일 때 gap이 부족해 보임.
- **개선**: 모바일에서 `flex-direction: column; gap: var(--space-3)` 추가, 버튼을 `width: 100%`로.

---

## D-R2: Typography & Text

### D-R2.1: 폰트 사이즈 스케일 비일관

- **문제**: `--text-xs: 0.72rem`, `--text-sm: 0.82rem` 등 토큰이 정의되어 있지만, 컴포넌트에서 `font-size: 0.78rem`, `0.76rem`, `0.8rem`, `0.68rem` 등 중간 값을 직접 사용. 토큰의 의미 퇴색.
- **개선**: 코드 내 임의 font-size를 가장 가까운 토큰으로 정리. 예: `0.78rem` → `var(--text-sm)`, `0.68rem` → `var(--text-xs)` 또는 `var(--text-2xs)`.

### D-R2.2: `SeatPanel` — `.seatLabel` 텍스트가 너무 작음

- **문제**: `.seatLabel` font-size `0.72rem` (10.4px). 모바일에서 `0.69rem` (9.9px). 이는 최소 가독 사이즈(~11px) 이하.
- **개선**: 최소 `var(--text-xs)` (0.72rem = 10.4px) 유지하되, 모바일에서도 줄이지 않기. `letter-spacing: 0.04em` + uppercase 조합이면 더 더 작아 보이므로 `0.75rem` 이상 권장.

### D-R2.3: `.aggressionBadge` font-size 0.58rem — 너무 작음

- **문제**: `SeatPanel.module.css` `.aggressionBadge`가 `0.58rem` (8.4px). 사실상 읽기 불가.
- **개선**: 최소 `0.65rem` (var(--text-2xs)). uppercase + letter-spacing 조합이면 `0.68rem` 이상.

### D-R2.4: 숫자/금액에 tabular-nums 미적용

- **문제**: 포커 칩 스택, 팟 사이즈 등 숫자가 proportional figures로 렌더. 숫자가 변경될 때 너비가 변하면서 레이아웃 떨림 발생.
- **개선**: `.seatStack`, `.potValue`, `.landingStatValue`, `AnimatedNumber` 등 수치 표시 요소에 `font-variant-numeric: tabular-nums` 적용.

### D-R2.5: `LiveDashboard` — pot 표시 raw wei 값

- **문제**: `LiveDashboard.tsx` line 392에 `{hand?.pot ?? "0"} RCHIP`으로 포맷 없이 raw 값 출력. 다른 곳에서는 `formatChips()` 사용.
- **개선**: `formatChips(hand?.pot ?? "0")` 으로 통일.

---

## D-R3: Visual Hierarchy & Information Architecture

### D-R3.1: Lobby page — Featured table과 LiveTablesGrid의 정보 중복

- **문제**: featured live table 카드에 seats, pot, blinds, actions 전부 보여주고, 바로 아래 LiveTablesGrid에서 같은 테이블이 또 나옴. 사용자가 같은 정보를 두 번 소화.
- **개선**: LiveTablesGrid에서 featured table을 제외하거나, featured를 더 크게/differentiated 하게 표현하고 grid에서는 compact 버전으로.

### D-R3.2: `TableViewer` — 정보 밀도 과다

- **문제**: TableViewer에 표시되는 정보 블록: connection status, owner banner, breadcrumb, coachmarks, matchup poster, header, action required banner, now acting bar, join seat form, table layout, AI commentary, action log, showdown results, players panel. 총 14개 섹션이 선형 배치.
- **개선**:
  - Action required + Now acting bar → 하나로 합치기
  - Players panel과 Action log → 탭으로 묶기 (또는 사이드 패널)
  - AI Commentary는 토글 기본값을 closed로 (현재 open)

### D-R3.3: Agent page — stat card 라벨이 generic

- **문제**: "External Assets (A)", "Treasury Shares (B)" 같은 기술 라벨. 일반 유저에게 의미 전달 약함.
- **개선**: "Total Value", "Reserved Supply", "Circulating Supply", "Price per Share" 등 유저 친화적 라벨 + 기술 명칭은 tooltip으로.

### D-R3.4: Leaderboard — 빈 상태에서 demo 데이터 opacity 0.55

- **문제**: `opacity: 0.55`로 데모 데이터를 보여주는데, 위에 "SAMPLE DATA" 배너가 있어도 유저가 실제 데이터와 혼동 가능. `pointerEvents: "none"` + `userSelect: "none"`이 적용되어 있지만 시각적 구분 부족.
- **개선**: demo 영역에 반복적인 대각선 줄무늬 overlay나 watermark "DEMO" 추가. 또는 opacity를 0.35로 더 낮추기.

---

## D-R4: Color & Contrast

### D-R4.1: `.muted` (#9ba3c1) 대비 불충분한 곳

- **문제**: `--muted: #9ba3c1`은 `--background: #06070b` 위에서 대비 약 6.2:1로 WCAG AA 통과. 하지만 `.card` (배경 rgba(16,18,33,0.82)) 위에서는 대비가 약 4.8:1로 소형 텍스트(~12px 이하) AA 기준(4.5:1) 간신히 통과.
- **개선**: card 위에 올라가는 muted 텍스트에는 `--text-muted: #7c84a2` 대신 약간 밝은 `#a0a8c7` 정도 사용하거나, card 배경을 약간 더 어둡게.

### D-R4.2: `SeatPanel.folded` — `filter: grayscale(0.5)` 접근성

- **문제**: grayscale 필터가 패널 전체에 적용되어 dealer chip, YOU pill의 색상 정보도 영향. 코드에 "not to dealer chip or YOU pill" 주석이 있지만, `filter`는 하위 요소 전체에 적용됨. `opacity: 1; filter: none`을 자식에 줘도 부모 filter가 우선.
- **개선**: `filter: grayscale(0.5)`를 부모에서 제거하고, 개별 자식 요소에 `.folded .seatAddress { color: #666 }` 등으로 직접 dimming.

### D-R4.3: Red/green for positive/negative — 색맹 대응

- **문제**: PnL, winrate 등에서 `--success` (green)과 `--danger` (red)만으로 구분. Red-green 색맹(~8% 남성)에게 구분 불가.
- **개선**: +/- 기호, 화살표(↑↓), 또는 underline 등 형태(shape) 기반 보조 시각 신호 추가. `prefers-color-scheme`과 무관하게 항상 적용.

---

## D-R5: Responsive & Mobile

### D-R5.1: Topbar — 모바일에서 nav 이중 구현

- **문제**: `layout.module.css`에 `.topNav` (inline nav)와 `.mobileDrawer` (slide-in drawer) 두 가지가 있는데, `MobileNav` 컴포넌트가 별도로 존재. 어떤 breakpoint에서 어떤 nav가 보이는지 추적 어려움.
- **개선**: 하나의 responsive nav로 통합하거나, breakpoint 경계를 명확히 문서화.

### D-R5.2: `TableViewer` — 640px 이하에서 connectionStatus가 inline으로 전환

- **문제**: 같은 `.connectionStatus`에 두 개의 `@media (max-width: 640px)` 블록이 있음 (line 720, 834). 첫 번째는 `display: none`을 updatedAt에 적용, 두 번째는 position을 static으로 변경. 순서 의존적이라 유지보수 위험.
- **개선**: 하나의 640px 미디어쿼리로 통합.

### D-R5.3: SeatPanel — 모바일 `.mobileExpandBtn` 터치 타겟 미달

- **문제**: `.mobileExpandBtn`이 `padding: 0.1rem 0.25rem`. WCAG 2.5.5에서 요구하는 44x44px 터치 타겟 미달.
- **개선**: `min-width: 44px; min-height: 44px` 추가. 또는 부모의 padding을 활용하여 암묵적 hit area 확보.

### D-R5.4: NadFunTradingWidget — 좁은 화면에서 controls row 깨짐

- **문제**: `.nadfunControlsRow`의 slippage + deadline 필드가 좁은 화면에서 어떻게 반응하는지 미디어쿼리 부재.
- **개선**: 480px 이하에서 `flex-direction: column` 또는 `grid-template-columns: 1fr` 전환 추가.

### D-R5.5: `LiveDashboard` — grid view 모바일 미대응

- **문제**: `.tableGrid`와 `.tableGridCard`에 모바일 breakpoint 처리 확인 필요. stream mode에서 sidebar가 숨겨지지만, 메인 콘텐츠 width 활용이 불명확.
- **개선**: 640px 이하에서 `.tableGrid`를 1열로 전환, sidebar를 완전 숨기기.

---

## D-R6: Component Design & Patterns

### D-R6.1: inline style → CSS module 마이그레이션 필요 목록

- **문제**: 아래 컴포넌트에서 `style={{ }}` 남발. 미디어쿼리/hover/focus 대응 불가, 코드 가독성 저하.
- **대상 파일**:
  - `TableViewer.tsx` — AI commentary (line 496-523), polling toast (336), JoinSeatForm 내부 (694-700)
  - `leaderboard/page.tsx` — header row (51), subtitle (55), CTA banner (160)
  - `me/page.tsx` — preview CTA (87-98), registration guide (188), agent card actions (275)
  - `LiveDashboard.tsx` — waiting state (313-314), allIn indicator (399), community cards (382)
- **개선**: 모든 레이아웃/스페이싱 inline style을 해당 module.css로 이동.

### D-R6.2: `<a href>` vs `<Link href>` 혼용

- **문제**: `layout.tsx` footer에서 `<a href="/">Home</a>` 사용 (line 146-159). Next.js에서 `<a>`는 full page reload 유발.
- **개선**: footer의 내부 링크를 전부 `<Link>` 컴포넌트로 교체. 외부 링크(GitHub)만 `<a>` 유지.

### D-R6.3: Loading 상태 일관성

- **문제**: 각 page별 `loading.tsx`가 있지만, inline에서도 `<div className="loading"><span className="spinner" /> Loading...</div>` 패턴 반복.
- **개선**: `<LoadingSpinner label="Loading..." />` 공통 컴포넌트로 추출. 사이즈 variant (sm/md/lg) 지원.

### D-R6.4: Error 상태 표현 불일관

- **문제**:
  - Lobby: `<div className="empty error-card">` + custom heading/body
  - Leaderboard: `<div className="empty"><p>Unable to load...</p></div>`
  - Agent: `<div className="empty"><p>Unable to load agent</p><p className="error-detail">...</p></div>`
  - Me: `<div className="card error-card">{error}</div>`
- **개선**: `<ErrorState title="..." message="..." onRetry={...} />` 공통 컴포넌트 통일. (ErrorState 컴포넌트가 이미 존재하지만 미사용 페이지 다수)

### D-R6.5: Empty 상태에 이모지 의존

- **문제**: Lobby empty state에 `&#x1FA99;` (poker chip emoji), create-agent에 `🔗`, `🤖` 등. 이모지는 OS/브라우저별 렌더 차이가 크고, 프로페셔널하지 않음.
- **개선**: SVG 아이콘이나 CSS-only 일러스트로 교체. 또는 프로젝트 아이콘 세트(Lucide 등) 도입.

---

## D-R7: Interaction & Micro-UX

### D-R7.1: `JoinSeatForm` — 폼 제출 후 피드백 위치

- **문제**: `joinStatus` 메시지가 폼 하단에 나타나지만, 긴 폼 후 스크롤 아래에 있으면 유저가 못 봄.
- **개선**: 상태 메시지에 `scrollIntoView()` 추가하거나, Toast 컴포넌트로 전환.

### D-R7.2: NadFunTradingWidget — quote 만료 UX

- **문제**: quote가 10초 후 만료되면 "Quote expired — get a new quote" 텍스트만 표시. execute 버튼은 그대로 활성.
- **개선**: quote 만료 시 execute 버튼 disabled + "Get new quote first" 안내. 또는 자동 re-quote.

### D-R7.3: Create Agent wizard — 뒤로가기 시 데이터 보존

- **문제**: Step 3 → Step 2 뒤로가기는 잘 동작하지만, 브라우저 뒤로가기(history back)는 전체 페이지를 벗어남.
- **개선**: URL에 step 파라미터 (`?step=2`) 반영 + `popstate` 핸들링으로 wizard 내 뒤로가기 지원.

### D-R7.4: Wallet 연결 → Sign In 2단계 인지 부족

- **문제**: "Connect Wallet" 후 즉시 "Sign In" 버튼이 나오는데, 왜 2단계인지 설명 부족. 유저가 "연결했는데 왜 또?"라고 느낌.
- **개선**: `me/page.tsx`의 auth step UI를 WalletButton에도 mini 버전으로 적용. 또는 connect 후 자동 sign-in 시도.

### D-R7.5: Table viewer — Breadcrumb "Tables" 링크가 "/" (Home)으로 감

- **문제**: `Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Tables", href: "/" }, ...]}` — "Tables"가 별도 `/tables` 페이지가 아니라 Home으로 매핑.
- **개선**: "Tables" 대신 "Live"로 변경하고 `/live`로 연결. 또는 breadcrumb에서 제거하여 Home → Table #N 2단계로.

---

## D-R8: Animation & Performance

### D-R8.1: `body::after` ambient glow — 끊김

- **문제**: `ambient-glow` keyframes에서 `background` 속성을 애니메이트. `background`는 composite 불가 속성이라 매 프레임 리페인트 발생.
- **개선**: `background`를 정적으로 두고 `opacity`만 애니메이트하는 두 개의 pseudo-element 사용. 또는 `will-change: opacity` + opacity 기반 전환.

### D-R8.2: `SeatPanel` — 다중 animation 동시 정의

- **문제**: `.seatPanel.allIn`, `.justChecked`, `.active`의 animation이 겹칠 수 있음. CSS animation은 하나만 적용됨.
- **개선**: 복합 상태에 대한 우선순위 명시. 또는 animation을 transition 기반으로 전환.

### D-R8.3: `hero-shimmer` animation — 무한 반복

- **문제**: `.landingHero::after`에 `animation: hero-shimmer 4s ease-in-out infinite`. 계속 렌더 비용 발생.
- **개선**: 3~4회 후 멈추기 (`animation-iteration-count: 3`) 또는 `IntersectionObserver`로 뷰포트 밖이면 pause.

---

## D-R9: Design System Consistency

### D-R9.1: border-radius 비일관

- **문제**: `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px` 토큰이 있지만:
  - `joinFieldInput`: `border-radius: 11px` (토큰 없음)
  - `communityCards`: `border-radius: 14px` (토큰 없음)
  - `tableLayout`: `border-radius: 24px` (토큰 없음)
  - `.nowActingBar`: `border-radius: 12px` (토큰 사용 가능하지만 raw 값)
- **개선**: 모든 custom border-radius를 가장 가까운 토큰으로 정리하거나, `--radius-2xl: 24px` 등 토큰 추가.

### D-R9.2: 색상 하드코딩 과다

- **문제**: module.css에서 `rgba(...)` 직접 사용 과다. 예: `SeatPanel.module.css`에 `color: #c8ccb9`, `color: #e7e8ef`, `color: #ffe3ad`, `color: #fff2d4` 등 20+ 하드코딩.
- **개선**: 자주 쓰이는 색상을 `--seat-label-color`, `--seat-stack-color` 등 시멘틱 토큰으로 추출.

### D-R9.3: Card padding 불일관

- **문제**: `--card-padding-sm/md/lg` 토큰이 있지만, `page.module.css`의 `.landingHero`는 `clamp(1rem, 3vw, 1.75rem)`, `.featuredLiveSeat`는 `0.6rem`, `.seatChip`는 `0.5rem` 등 각기 다름.
- **개선**: card 내부 요소의 padding도 토큰 기반으로 정리.

### D-R9.4: Button variant 산발

- **문제**: `.btn`, `.btn-ghost`, `.btn-danger`, `.btn-secondary`, `.btn-link`, `.btn-join`, `.ghost-btn`, `.wallet-button`, `.wallet-button.sign`, `.joinToggleBtn`, `.primaryBtn`, `.nadfunQuoteBtn`, `.nadfunExecuteBtn` 등 12+ 버튼 스타일.
- **개선**: 버튼 시스템 정리. Primary / Secondary / Ghost / Danger 4가지로 통합. 사이즈 variant (sm/md/lg) 분리. `wallet-button`은 `.btn` + `.btn-wallet` modifier로.

---

## D-R10: Page-specific Issues

### D-R10.1: `/live` — header가 global topbar을 완전 교체하는데 Link로 돌아가기만 제공

- **문제**: Live 페이지는 자체 header를 쓰면서 global nav를 숨김. 유저가 다른 페이지로 이동하려면 "← Back" 한 번 누르고 다시 nav에서 선택해야 함.
- **개선**: Live header에 최소한의 nav 링크(Home, Leaderboard) 또는 햄버거 메뉴 추가.

### D-R10.2: `/create-agent` — Step 4 Deploy 전 최종 확인 화면 부재

- **문제**: Deploy 버튼 누르면 바로 API 호출. 선택한 persona + table에 대한 최종 요약 확인이 Step 4에 있긴 하지만, deploy 후 취소 불가.
- **개선**: Deploy 전 ConfirmDialog 추가. "Deploy Agent X to Table Y?" 확인.

### D-R10.3: `/me` — 인증되지 않은 상태에서 `<section>` 누락

- **문제**: `!isAuthenticated` 상태 (line 103-129)에서 `<section className="page-section">` 없이 `<div className={styles.authPrompt}>`만 반환. `page-section` 애니메이션과 padding 미적용.
- **개선**: `<section className="page-section">` 래핑 추가.

### D-R10.4: 404 페이지 — 카드 애니메이션 후 멈춤

- **문제**: `card-bust` 애니메이션이 `both` fill-mode로 opacity 0.4에서 멈춤. 의도적일 수 있지만, 유저가 "고장난 것" 으로 인식 가능.
- **개선**: 애니메이션 끝 상태를 opacity 0.6 이상으로 올리거나, subtle한 floating 루프 추가.

---

## D-R11: Accessibility

### D-R11.1: `LiveDashboard` showdown overlay — focus trap 미구현

- **문제**: `role="dialog" aria-modal="true"` 설정은 있지만, focus가 dialog 밖으로 나갈 수 있음. Tab 키로 뒤의 콘텐츠에 접근 가능.
- **개선**: focus trap 로직 추가 (first/last focusable element 사이 순환).

### D-R11.2: `PokerCard` — 카드 이미지에 alt text 미확인

- **문제**: 카드 컴포넌트가 시각적으로만 정보 전달. screen reader가 "3 of hearts" 등으로 읽을 수 있는지 확인 필요.
- **개선**: `aria-label="3 of Hearts"` 등 카드 정보를 텍스트로 제공.

### D-R11.3: 키보드 네비게이션 — 탭 필터 (Leaderboard)

- **문제**: metric/period 탭이 `<Link>` 기반이라 각각이 tab stop. 5개 metric + 4개 period = 9개 tab stop. 키보드 유저에게 과도.
- **개선**: `role="tablist"` + `role="tab"` 패턴으로 변경. 화살표 키로 탭 간 이동, Enter/Space로 선택.

### D-R11.4: Color-only 상태 표시 — dot.pulse

- **문제**: live status의 녹색 점(`.dot.pulse`)이 색상과 애니메이션만으로 "라이브" 상태 전달. `prefers-reduced-motion`일 때 색상만 남음.
- **개선**: "LIVE" 텍스트가 항상 옆에 있으므로 큰 문제는 아니지만, dot 자체에 `aria-hidden="true"` 명시.

---

## D-R12: Content & Copy

### D-R12.1: Hero 카피 — 톤 불일치

- **문제**: "WHERE THE AI PLAYS FOR KEEPS." — all-caps 공격적 톤. 바로 아래 feature strip은 정보 전달 위주의 차분한 톤. 히어로와 본문 톤 갭.
- **개선**: 히어로 카피를 sentence case로 변경하거나, feature strip도 같은 에너지 레벨로 맞추기.

### D-R12.2: 404 — "YOU BLUFFED INTO NOTHING."

- **문제**: 재미있지만, 해커톤 심사위원이 실제 깨진 링크로 도달했을 때 혼란 가능. 실제 에러 안내가 부족.
- **개선**: 유머 카피 유지하되, 아래에 "The page you're looking for doesn't exist." 한 줄 추가.

### D-R12.3: Footer credit — "Built for HashKey Chain Hackathon"

- **문제**: 해커톤 끝나면 stale해지는 카피.
- **개선**: 환경변수로 제어하거나, 해커톤 이후 "Powered by HashKey Chain"만 남기기.
