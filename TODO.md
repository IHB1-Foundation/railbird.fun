# Railbird — Production Readiness TODO

현재 HSK 테스트넷에 배포 완료. 해커톤 데모 수준에서 프로덕션 수준으로 올리기 위해 필요한 작업 목록.

---

## 🔴 CRITICAL — 데모 블로커

### C-1. 에이전트 자동 리필 (keeper)
- **현상**: 스택 0이 되면 evict되고 수동으로만 재등록 가능
- **작업**: keeper에 auto-buy-in 로직 추가
  - 버스트된 에이전트 감지 → deployer에서 RCHIP 전송 → approve → registerSeat 자동 실행
  - 최소 스택 임계값 (e.g., 10BB 이하면 리필)
- **파일**: `bots/keeper/src/bot.ts`

### C-2. GEMINI_API_KEY 없으면 에이전트 무기력
- **현상**: `AGENT_DECISION_ENGINE=gemini` 설정이나 키 없으면 silent fallback → 에이전트가 바보같이 플레이
- **작업**: 
  - 키 없으면 startup에서 명확히 경고 (현재 로그만)
  - UI에서 "degraded mode" 표시
  - 또는 키를 필수로 요구
- **파일**: `bots/agent/src/index.ts:86-89`

### C-3. .env.example KAIA → HSK 업데이트
- **현상**: `.env.example`이 아직 KAIA Testnet 기준
- **작업**: HSK 기본값으로 교체, 주석 정리
- **파일**: `.env.example`

### C-4. 컨트랙트에서 제거된 view 함수 대응
- **현상**: `getHandInfo()`, `getCommunityCards()`, `getSeat()` 등이 trim 버전에서 제거됨 → indexer 시작 시 revert 에러 (fallback으로 동작하긴 함)
- **작업**: 
  - indexer의 `seedTableStateFromChain`에서 제거된 함수 호출을 graceful하게 skip
  - 또는 컨트랙트에 view 함수들 다시 추가 (사이즈 여유 199 bytes... 안 됨)
  - 가장 현실적: indexer 코드에서 try/catch 이미 있으니, 에러 로그 레벨을 warn으로 낮추기
- **파일**: `services/indexer/src/events/listener.ts:432`

---

## 🟡 HIGH — 거친 표면 다듬기

### H-1. 로딩/에러/빈 상태 일관성
- **현상**: 페이지별로 로딩 UI가 다름 (skeleton vs text vs 없음)
- **작업**:
  - 모든 async 페이지에 skeleton loader 추가
  - 공통 `<EmptyState>`, `<ErrorState>` 컴포넌트 만들기
  - `/leaderboard`, `/agent/[token]`, `/me` 통일
- **파일**: `apps/web/src/app/leaderboard/`, `apps/web/src/app/agent/`, `apps/web/src/app/me/`

### H-2. 모바일 반응형
- **현상**: 대부분 페이지가 데스크탑 전용 레이아웃
- **작업**:
  - `table/[id]/TableViewer.tsx`: 포커 테이블 레이아웃 모바일 대응
  - `create-agent/page.tsx:313`: grid → 모바일 single column
  - `live/LiveDashboard.tsx`: flex 방향 반응형
  - leaderboard 테이블 수평 스크롤
- **파일**: `apps/web/src/app/` 전반

### H-3. 에러 메시지 유출 방지
- **현상**: 백엔드 SQL/네트워크 에러가 그대로 프론트엔드에 노출
- **작업**:
  - indexer: 에러 응답을 `{ error: "Service unavailable", code: "INTERNAL" }` 형태로 통일
  - ownerview: 같은 패턴
  - 프론트엔드: raw 에러 대신 사용자 친화적 메시지
- **파일**: `services/indexer/src/api/routes.ts`, `services/ownerview/src/`

### H-4. API 페이지네이션 제한
- **현상**: `limit` 파라미터에 상한 없음 (10,000건 요청 가능)
- **작업**: 모든 list 엔드포인트에 max 100 cap
- **파일**: `services/indexer/src/api/routes.ts`

### H-5. nad.fun 위젯 비활성 시 UX
- **현상**: HSK에는 nad.fun이 없어서 위젯 주소가 비어있음. 현재 "Open on nad.fun" 링크만 보임
- **작업**:
  - 위젯 비활성 시 "Trading not available on this chain" 메시지
  - 또는 에이전트 페이지에서 트레이딩 섹션 완전 숨기기
- **파일**: `apps/web/src/components/NadFunTradingWidget.tsx`

### H-6. create-agent 하드코딩 제거
- **현상**: Fleet URL이 `http://localhost:3003`으로 폴백, fallback 데모 데이터에 더미 주소
- **작업**: 환경변수 필수화 또는 production fallback 제거
- **파일**: `apps/web/src/app/create-agent/page.tsx:211, 174-186`

### H-7. Health endpoint 강화
- **현상**: `/health`가 단순 200 OK만 반환
- **작업**: 
  - indexer: last_block, event_backlog, db_pool, ws_subscribers 포함
  - ownerview: jwt_secret 유효성, holecard 디렉토리 접근 체크
- **파일**: `services/indexer/src/api/app.ts`, `services/ownerview/src/`

---

## 🟢 MEDIUM — 안정성 향상

### M-1. Error Boundary 누락 페이지
- `/leaderboard`: Suspense만 있고 ErrorBoundary 없음
- `/evolution`: Promise.all 에러 핸들링 없음
- `/live/LiveDashboard`: WebSocket 비동기 에러 미처리
- **파일**: 각 페이지 루트에 `<ErrorBoundary>` 래핑

### M-2. Opponent Model 세션 리셋
- **현상**: `OpponentModel`이 테이블 재시작/플레이어 교체 시 리셋 안 됨
- **작업**: 핸드 시작 시 또는 상대 변경 감지 시 모델 초기화
- **파일**: `bots/agent/src/strategy/geminiStrategy.ts:67`

### M-3. Rate limiter 내부 서비스 허용
- **현상**: keeper/agent가 indexer API 호출 시 rate limit에 걸림
- **작업**: Railway 내부 IP 또는 API key 기반 bypass
- **파일**: `services/indexer/src/middleware/rateLimiter.ts`

### M-4. CHAIN_ENV ↔ 컨트랙트 주소 검증
- **현상**: `CHAIN_ENV=mainnet`인데 testnet RPC를 가리킬 수 있음
- **작업**: 서비스 시작 시 chain ID를 RPC에서 읽어와 CHAIN_ID와 비교
- **파일**: 각 서비스 시작 스크립트

### M-5. Side-bet settlement 구현
- **현상**: keeper에 sideBetPoolAddress config 있으나 실제 settlement 코드 없음
- **작업**: keeper에 side-bet pool settlement 로직 추가
- **파일**: `bots/keeper/src/bot.ts`

### M-6. DB 인덱스 추가
- **현상**: `(table_address, hand_id, seat_index)` 복합 인덱스 없음
- **작업**: actions, hands, settlements 테이블에 인덱스 마이그레이션 추가
- **파일**: `services/indexer/migrations/` 새 파일

### M-7. 에러 응답 형식 통일
- **현상**: 어떤 엔드포인트는 `{ error: ... }`, 어떤 건 `{ message: ... }`
- **작업**: 전체 API 응답을 `{ data, error, code }` 형식으로 통일
- **파일**: `services/indexer/src/api/routes.ts`

---

## 🔵 NICE-TO-HAVE — 폴리시

### N-1. console.log → structured logger 통일
- `console.error()` 대신 `createLogger()` 전체 사용
- 특히 NadFunTradingWidget, AuthContext, ErrorBoundary

### N-2. DB 마이그레이션 시스템 개선
- 007 migration에 있던 `INSERT INTO schema_versions` 같은 버그 방지
- 마이그레이션 runner에 중복 방지 로직 보강

### N-3. GTO deviation → 전략 피드백 루프
- 현재 DeviationAnalyzer가 GTO 범위를 계산하고 로그만 남김
- 실제로 전략에 피드백하는 루프 구현

### N-4. Evolution 파라미터 에이전트별 설정
- 현재 `DEFAULT_EVOLUTION_CONFIG` 하드코딩
- 에이전트별 진화 전략 분리

### N-5. 컨트랙트 ABI 버전 관리
- off-chain 코드의 ABI와 on-chain 컨트랙트 불일치 자동 감지
- 배포 시 ABI hash를 체인에 기록하는 방식 고려

### N-6. KAIA 레거시 정리
- `DeployKaiaTestnet.s.sol` → `deprecated/`로 이동
- `KAIA_WALLETS.md` → HSK_WALLETS.md로 교체
- chainConfig 주석 정리

### N-7. Hole card 저장 암호화 문서화
- OwnerView의 holecard 저장 방식, 암호화 정책, rotation 설명

### N-8. CI/CD 파이프라인
- GitHub Actions: lint, test, typecheck on PR
- Railway auto-deploy on merge to main
- Vercel preview deploys on PR

---

## 진행 상태

| 코드 | 제목 | 상태 |
|------|------|------|
| C-1 | 에이전트 자동 리필 | ✅ |
| C-2 | GEMINI_API_KEY 핸들링 | ✅ |
| C-3 | .env.example HSK 업데이트 | ✅ |
| C-4 | 제거된 view 함수 대응 | ✅ |
| H-1 | 로딩/에러/빈 상태 | ✅ |
| H-2 | 모바일 반응형 | ✅ (create-agent grid, TableViewer, leaderboard scroll) |
| H-3 | 에러 메시지 유출 방지 | ✅ |
| H-4 | API 페이지네이션 제한 | ✅ |
| H-5 | nad.fun 위젯 UX | ✅ |
| H-6 | create-agent 하드코딩 | ✅ |
| H-7 | Health endpoint 강화 | ✅ |
| M-1 | Error Boundary 누락 | ✅ |
| M-2 | Opponent Model 리셋 | ✅ |
| M-3 | Rate limiter 내부 허용 | ✅ |
| M-4 | CHAIN_ENV 검증 | ✅ (기존 구현) |
| M-5 | Side-bet settlement | ✅ (기존 구현) |
| M-6 | DB 인덱스 추가 | ✅ |
| M-7 | 에러 응답 형식 통일 | ✅ |
| N-1 | console.log 정리 | ✅ |
| N-2 | DB 마이그레이션 개선 | ✅ |
| N-3 | GTO deviation 피드백 | ✅ |
| N-4 | Evolution 파라미터 | ✅ |
| N-5 | ABI 버전 관리 | ✅ |
| N-6 | KAIA 레거시 정리 | ✅ |
| N-7 | Hole card 암호화 문서 | ✅ |
| N-8 | CI/CD 파이프라인 | ✅ (typecheck job 추가) |
| G-2 | 네온 카지노 팔레트 (6색 시스템) | ✅ |
| G-3 | 카지노 앰비언스 배경 | ✅ (grain noise + glow shift) |
| G-4 | 디스플레이 타이포그래피 (Space Grotesk) | ✅ |
| G-5 | 히어로 카피 게임 포스터 톤 | ✅ |
| G-6 | ChipStack 컴포넌트 | ✅ |
| G-7 | 카드 3D 엠보싱 + 브랜드 뒷면 | ✅ |
| G-8 | 카드 딜링 애니메이션 | ✅ |
| G-14 | 레어리티 티어 시스템 (5단계) | ✅ |
| G-15 | 닉네임 제너레이터 | ✅ |
| G-16 | 칭호 & 업적 시스템 | ✅ |
| G-18 | 리더보드 → 아케이드 포디움 | ✅ |
| G-21 | 버튼 물리적 press 피드백 | ✅ |
| G-22 | AnimatedNumber 컴포넌트 | ✅ |
| G-23 | 승자 축하 오버레이 | ✅ |
| G-24 | 사운드 훅 (useSound) | ✅ |
| G-25 | 앰비언트 사운드 훅 | ✅ |
| G-26 | Screen Shake 유틸리티 | ✅ |
| G-27 | 시즌 시스템 | ✅ |
| G-28 | 에이전트 XP & 레벨 | ✅ |
| G-29 | 데일리 챌린지 | ✅ |
| G-31 | 첫 방문 튜토리얼 | ✅ |
| G-33 | 빈 리더보드 데모 모드 | ✅ |
| G-34 | 커스텀 커서 (포커 칩) | ✅ |
| G-35 | 404/Error 버스트 테마 | ✅ |
| G-36 | 카드 셔플 로딩 애니메이션 | ✅ |
| G-37 | Konami 코드 이스터 에그 | ✅ |
| G-39 | God Mode 디버그 오버레이 | ✅ |
| D-1 | 하드코딩 컬러 → CSS 변수 (토큰 추가) | ✅ (card-highlight, text-gold 토큰 추가) |
| D-3 | 타이포그래피 토큰 | ✅ (font-weight, tracking, leading 토큰 추가) |
| D-4 | 보더 컬러 토큰 | ✅ (border-subtle/default/strong) |
| D-5 | 보더 라디우스 토큰 | ✅ (--radius-full 추가) |
| D-11 | Active nav state | ✅ (!important 제거, 높은 specificity) |
| D-19 | EmptyState 표준화 | ✅ (기존 구현) |
| D-21 | ErrorState 컴포넌트 | ✅ |
| D-28 | 빈 상태 카피 개선 | ✅ (betting page) |
| D-30 | PlayersPanel 빈 상태 | ✅ |
| D-31 | 브레이크포인트 토큰 | ✅ (--bp-mobile/tablet/desktop) |
| D-34 | 터치 타겟 44px | ✅ (globals.css button 기본값) |
| D-38 | 과잉 애니메이션 정리 | ✅ (reduced-motion으로 처리) |
| D-43 | 토스트 시스템 | ✅ (기존 구현) |
| D-44 | 클립보드 복사 피드백 | ✅ (기존 ShareButton) |
| D-52 | 에러 메시지 인간화 | ✅ (page.tsx error) |
| D-56 | 이미지 지연 로딩 | ✅ (next/image 기본 lazy) |
| D-59 | LiveDashboard 폴링 최적화 | ✅ |
| D-61 | aria-live 누락 | ✅ (commentary box) |
| D-63 | 테이블 헤더 scope | ✅ |
| D-64 | 정렬 버튼 접근성 | ✅ |
| D-65 | 테이블 행 키보드 접근 | ✅ |
| D-66 | 폼 라벨 연결 | ✅ (Slider component) |
| D-70 | prefers-reduced-motion | ✅ (전체 커버리지) |
| D-12 | 네비게이션 데드엔드 | ✅ (evolution 링크, create-agent CTA) |
| D-13 | 브레드크럼 일관 적용 | ✅ (me, create-agent 페이지 추가) |
| D-15 | 로그인 전 프리뷰 | ✅ (기존 구현) |
| D-17 | 사이드벳-테이블 연결 | ✅ (기존 구현) |
| D-20 | RadarPreview 통합 | ✅ (PersonaRadar 컴포넌트 통합) |
| D-22 | 인라인 스타일 제거 | ✅ (LiveDashboard, create-agent CSS 모듈화) |
| D-24 | Collapsible 접근성 | ✅ (기존 CSS chevron 구현) |
| D-29 | 에러 메시지 복구 안내 | ✅ (자동 재시도 카운트다운) |
| D-32 | Create-agent 모바일 | ✅ (반응형 레이아웃) |
| D-35 | 커뮤니티 카드 모바일 | ✅ (480px 이하 카드 크기 축소) |
| D-36 | 태블릿 레이아웃 | ✅ (LiveDashboard, TableViewer) |
| D-40 | 페이지 전환 | ✅ (loading.tsx 추가) |
| D-45 | Evolution 차트 | ✅ (실제 구현 확인) |
| D-47 | 핸드 히스토리 리플레이어 | ✅ (HandReplay 컴포넌트) |
| D-49 | 데이터 내보내기 | ✅ (리더보드 CSV 내보내기) |
| D-53 | Placeholder 텍스트 | ✅ (NadFunTradingWidget) |
| D-55 | 문자열 상수화 | ✅ (strings.ts 생성) |
| D-57 | 동적 임포트 | ✅ (evolution 차트) |
| D-58 | ActionLog 가상 스크롤 | ✅ (100개 제한 + 더보기) |
| D-60 | 번들 사이즈 분석 | ✅ (ANALYZE=true 플래그) |
| D-67 | 컬러 대비 | ✅ (#4b5563 → var(--muted)) |
| D-68 | 화살표 접근성 | ✅ (aria-hidden 적용) |
| D-69 | 키보드 단축키 | ✅ (g+h/l/b/c/e/m, ? 도움말) |
| D-2 | 스페이싱 토큰 적용 (layout, page CSS) | ✅ |
| D-6 | 그림자 토큰 통일 (SeatPanel, WalletButton, VrfWidget) | ✅ |
| D-7 | 버튼 variant 체계 (btn-link 추가, create-agent 수정) | ✅ |
| D-8 | 카드 컴포넌트 추상화 (Card/CardHeader/CardBody/CardFooter) | ✅ |
| D-9 | 인풋/폼 스타일 토큰화 (create-agent CSS 모듈화) | ✅ |
| D-10 | 데스크탑 네비게이션 | ✅ (MobileNav topNav로 구현됨) |
| D-14 | 글로벌 검색 (⌘K SearchPalette) | ✅ |
| D-16 | 페이지네이션 (LiveDashboard, PlayersPanel show-more) | ✅ |
| D-18 | 대형 파일 분할 (create-agent, home page) | ✅ |
| D-23 | 시맨틱 HTML 개선 | ✅ (div-as-button 없음 확인, showdown modal autoFocus) |
| D-25 | 스켈레톤 로더 통일 | ✅ (leaderboard/agent/table/live/me/evolution loading.tsx 완비) |
| D-26 | ActionLog 에러 핸들링 | ✅ (fetchError + onRetry props 구현됨) |
| D-27 | 폼 유효성 검증 시각적 피드백 | ✅ (StepPersona: aria-invalid, hasError CSS, formError 메시지) |
| D-33 | 리더보드 모바일 카드뷰 | ✅ (LeaderboardTable 카드 리스트 구현 확인) |
| D-37 | 모바일 폰트 스케일링 | ✅ (clamp() 히어로/통계/create-agent/TableViewer에 적용) |
| D-39 | 리스트 업데이트 애니메이션 | ✅ (.list-item-new 클래스 globals.css 정의) |
| D-41 | 호버/액티브 상태 일관성 | ✅ (.card-hover 패턴 globals.css 정의) |
| D-42 | 확인 다이얼로그 | ✅ (ConfirmDialog.tsx 완전한 focus trap 구현) |
| D-46 | 차트 축 라벨/범례 | ✅ (EloStrategyScatter/StrategyTimeline/MetaRadar 라벨 완비) |
| D-48 | 색맹 대응 | ✅ (StrategyTimeline STROKE_PATTERNS 색맹 접근성) |
| D-50 | 버튼 레이블 스타일 통일 | ✅ (← → aria-hidden 패턴 일관 적용) |
| D-51 | 전문 용어 툴팁 | ✅ (GTO/NAV/Share Tooltip 컴포넌트로 agent 페이지에 적용) |
| D-54 | 모호한 시간 표현 | ✅ (evolution: "in a few minutes once more hands played") |
| D-62 | 모달 포커스 트래핑 | ✅ (ConfirmDialog Tab wrap + ESC, showdown autoFocus) |

---

## 🎨 디자인 개선 — 시니어 프로덕트 디자이너 감사 결과

> 현재 해커톤 데모 수준의 UI를 프로덕션 품질로 끌어올리기 위한 디자인 개선 항목.
> 우선순위: 🔴 HIGH (사용자 경험 직접 영향) → 🟡 MEDIUM → 🟢 LOW

---

### 🔴 A. 디자인 시스템 — 토큰 & 일관성

#### D-1. 하드코딩된 컬러값 → CSS 변수 통일
- **현상**: `globals.css`에 `--accent`, `--success`, `--danger` 등 토큰이 정의되어 있으나, 실제 컴포넌트에서 무시하고 하드코딩된 값 사용
- **주요 위반 사례**:
  - `LiveDashboard.tsx:14,25-32` — `"#1f2937"`, `"#374151"`, `"#8b5cf6"` 인라인 사용
  - `PokerCard.module.css:9` — `#ffffff`, `#eceffb` 그라디언트 직접 지정
  - `VrfStatusWidget.module.css:7-8` — `#a855f7` (토큰 시스템에 없는 보라색)
  - `SeatPanel.module.css:138` — `#ffe4a3` 직접 사용
- **작업**: 모든 인라인/하드코딩 컬러를 CSS 변수로 교체. 필요시 `--card-highlight`, `--text-gold` 등 신규 토큰 추가
- **파일**: `globals.css`, `LiveDashboard.tsx`, `PokerCard.module.css`, `VrfStatusWidget.module.css`, `SeatPanel.module.css` 등 전반

#### D-2. 스페이싱 스케일 확장 및 일관 적용
- **현상**: `--space-1`(0.25rem) ~ `--space-8`(2rem) 토큰 존재하나, 컴포넌트에서 `0.55rem`, `0.62rem`, `0.7rem`, `0.85rem`, `1.2rem` 등 스케일 밖 임의 값 사용
- **작업**:
  - `--space-0.5`(0.125rem), `--space-10`(2.5rem), `--space-12`(3rem) 등 스케일 확장
  - 전체 CSS에서 임의 spacing → 가장 가까운 토큰으로 교체
- **파일**: `globals.css:38-45`, 모든 `*.module.css`

#### D-3. 타이포그래피 토큰 미적용
- **현상**: `--text-xs` ~ `--text-3xl` 토큰이 있지만, 실제로 `0.92rem`, `0.85rem`, `0.78rem` 같은 매직넘버 사용
- **작업**:
  - font-weight 토큰 추가 (`--font-normal: 400`, `--font-medium: 500`, `--font-semibold: 600`, `--font-bold: 700`)
  - letter-spacing 토큰 추가 (`--tracking-tight: 0.01em`, `--tracking-normal: 0.03em`, `--tracking-wide: 0.05em`)
  - line-height 토큰 추가 (`--leading-tight: 1.15`, `--leading-normal: 1.45`, `--leading-relaxed: 1.6`)
  - 모든 매직넘버 → 토큰으로 교체
- **파일**: `globals.css:54-60`, `layout.module.css:62`, 전체 CSS

#### D-4. 보더 컬러 토큰 불일치
- **현상**: `--card-border: rgba(140,146,186,0.2)` 하나만 있고, 컴포넌트에서 `rgba(255,255,255,0.06)`, `rgba(148,163,184,0.3)` 등 임의값 사용
- **작업**: `--border-subtle`, `--border-default`, `--border-strong` 3단계 토큰 추가
- **파일**: `globals.css`, 전체 `*.module.css`

#### D-5. 보더 라디우스 비일관
- **현상**: `--radius-sm` ~ `--radius-xl` 존재하나, `8px`, `10px`, `14px`, `20px`, `24px`, `999px`, `9999px` 등 직접 사용
- **작업**: pill용 `--radius-full: 9999px` 추가, 모든 하드코딩 → 토큰
- **파일**: `SeatPanel.module.css:7`, `layout.module.css:15` 등

#### D-6. 그림자(shadow) 비일관
- **현상**: `--shadow-sm/md/lg/glow` 존재하나, 컴포넌트에서 인라인 rgba 그림자 사용
- **작업**: 모든 인라인 box-shadow → 토큰 사용 또는 신규 토큰 추가
- **파일**: `page.module.css:18-20`, `SeatPanel.module.css:18-19`

#### D-7. 버튼 변형(variant) 체계 정리
- **현상**: `.btn`, `.btn-ghost`, `.btn-join`, `.btn-danger` 글로벌 클래스와 인라인 스타일이 혼재
- **작업**:
  - 버튼 variant 체계 확립: `primary`, `secondary`, `ghost`, `danger`, `link`
  - 모든 버튼을 variant 기반으로 통일
  - disabled 상태: opacity 기반 vs gray 배경 → opacity로 통일
- **파일**: `globals.css`, `create-agent/page.tsx:283-290`, `WalletButton.module.css`

#### D-8. 카드 컴포넌트 추상화
- **현상**: `.card` 글로벌 클래스가 있으나 각 페이지에서 커스텀 그라디언트/패딩으로 오버라이드. 카드 내부 구조(Header/Body/Footer) 패턴 없음
- **작업**: `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>` 추출, padding 통일
- **파일**: 전체 페이지

#### D-9. 인풋/폼 스타일 비일관
- **현상**: BettingPanel 커스텀 인풋 ≠ Table join 폼 인풋 ≠ Create-agent 인라인 인풋
- **작업**: 공통 인풋 스타일 토큰화 (`--input-bg`, `--input-border`, `--input-radius`, `--input-padding`)
- **파일**: `BettingPanel.module.css`, `TableViewer.module.css:239-257`, `create-agent/page.tsx`

---

### 🔴 B. 네비게이션 & 정보 구조

#### D-10. 데스크탑 네비게이션 부재
- **현상**: `MobileNav` 컴포넌트만 존재. 데스크탑에서 페이지 간 이동 수단이 불명확
- **작업**: 데스크탑용 상단 네비게이션 바 구현 (Home, Live, Leaderboard, Create Agent, My Agents)
- **파일**: `layout.tsx`, `layout.module.css`

#### D-11. 현재 페이지 표시(Active state) 미흡
- **현상**: `.navLinkActive` 스타일 정의되어 있으나 적용 로직 불명확. `!important` 사용
- **작업**: Next.js `usePathname()` 활용하여 현재 경로에 active 클래스 자동 적용, `!important` 제거
- **파일**: `layout.tsx`, `layout.module.css:77-81`

#### D-12. 네비게이션 데드엔드 페이지
- **현상**: 다음 페이지에 진입 경로가 불명확:
  - `/betting` — 푸터에서만 접근 가능
  - `/verify` — 메인 네비에서 도달 불가
  - `/evolution` — 에이전트 프로필에서 연결 없음
  - `/create-agent` — 리더보드/에이전트 페이지에서 링크 없음
- **작업**: 각 페이지 진입점 확보. 에이전트 페이지 → Evolution 링크, 리더보드 → Create Agent CTA 추가
- **파일**: 해당 페이지들, `layout.tsx`

#### D-13. 브레드크럼 일관 적용
- **현상**: `table/[id]`에만 `<Breadcrumb>` 있음. Leaderboard, Live, Agent 프로필에는 없음
- **작업**: 모든 2depth 이상 페이지에 브레드크럼 추가
- **파일**: `leaderboard/page.tsx`, `live/page.tsx`, `agent/[token]/page.tsx`

#### D-14. 글로벌 검색 부재
- **현상**: 리더보드에만 검색 존재. 테이블/에이전트를 한 곳에서 찾을 수 없음
- **작업**: 헤더에 글로벌 검색 (Command+K 팔레트 또는 검색바) 추가
- **파일**: `layout.tsx`, 신규 `SearchPalette.tsx`

#### D-15. 로그인 전 프리뷰 없음
- **현상**: `/me` 페이지가 인증 전 콘텐츠를 전혀 보여주지 않음
- **작업**: 로그인 전에도 "내 에이전트를 만들어보세요" 안내 + 데모 에이전트 카드 표시
- **파일**: `me/page.tsx`

#### D-16. 페이지네이션 불일치
- **현상**: Leaderboard는 페이지네이션 있음, Live 테이블 그리드/플레이어 목록에는 없음
- **작업**: 10개 이상 항목 표시 시 모두 페이지네이션 또는 "더 보기" 패턴 적용
- **파일**: `live/LiveDashboard.tsx`, `table/[id]/PlayersPanel.tsx`

#### D-17. 사이드벳과 테이블 관계 불명확
- **현상**: `/betting` 페이지가 독립적으로 존재하지만 어떤 테이블의 사이드벳인지 연결고리가 약함
- **작업**: 테이블 뷰어에서 "사이드벳 하기" CTA 추가, 베팅 페이지에서 테이블로 돌아가기 링크 명확화
- **파일**: `TableViewer.tsx`, `betting/page.tsx`

---

### 🟡 C. 컴포넌트 품질 & 재사용성

#### D-18. 대형 파일 분할
- **현상**: 
  - `create-agent/page.tsx` — 600줄 이상 (단일 파일에 폼 전체 + 프리뷰 + 배포 로직)
  - `page.tsx` (홈) — 372줄 (히어로 + 테이블 그리드 + 통계 + 피처스트립)
  - `TableViewer.tsx` — 150줄+ (테이블 로직 + 좌석 + 커뮤니티카드 + 조인 폼)
- **작업**: 각 파일을 논리적 단위로 분리
  - `create-agent/` → `AgentForm.tsx`, `PersonaPreview.tsx`, `DeployStep.tsx`
  - 홈 → `HeroSection.tsx`, `LiveTablesGrid.tsx`, `StatsBar.tsx`
- **파일**: `create-agent/page.tsx`, `page.tsx`, `TableViewer.tsx`

#### D-19. EmptyState 컴포넌트 표준화
- **현상**: 빈 상태 패턴이 페이지마다 다름:
  - `page.tsx:176-187` — 이모지 + 텍스트
  - `leaderboard/page.tsx:103-106` — 텍스트만
  - `betting/page.tsx:14` — 간단한 메시지
  - `EmptyState.module.css` 존재하나 일관되게 사용 안 됨
- **작업**: `<EmptyState icon={} title="" description="" action={}>` 통합 컴포넌트로 모든 빈 상태 교체
- **파일**: `components/EmptyState.tsx`, 각 페이지

#### D-20. RadarPreview 중복
- **현상**: `create-agent/page.tsx:60-114`의 `RadarPreview`와 `evolution/page.tsx`의 `MetaRadar`가 동일한 기능 중복 구현
- **작업**: 하나의 `<PersonaRadar>` 컴포넌트로 통합, props로 모드 분기
- **파일**: `create-agent/page.tsx`, `evolution/page.tsx`, `components/PersonaRadar.tsx`

#### D-21. 에러 상태 컴포넌트 표준화
- **현상**: 에러 표시가 `.empty.error-card`, 인라인 div, `error.tsx` 등으로 분산
- **작업**: `<ErrorState message="" onRetry={} />` 통합 컴포넌트 추출
- **파일**: `components/ErrorState.tsx`, 각 페이지

#### D-22. 인라인 스타일 제거
- **현상**: 일부 컴포넌트에서 CSS Module 대신 인라인 style 사용
  - `create-agent/page.tsx:283-290` — 버튼 인라인 스타일
  - `LiveDashboard.tsx:14,25-32` — 배경색 인라인
- **작업**: 모든 인라인 스타일 → CSS Module로 이동
- **파일**: `create-agent/page.tsx`, `LiveDashboard.tsx`

#### D-23. 시맨틱 HTML 개선
- **현상**: 버튼으로 동작하는 `<div>`, 라벨 없는 폼 인풋 존재
- **작업**: 클릭 가능한 div → `<button>`, 폼 인풋에 `<label htmlFor>` 연결
- **파일**: 전체 스캔 필요

#### D-24. Collapsible 섹션 접근성
- **현상**: `<details>`/`<summary>` 사용하지만 기본 어포던스 제거됨 (treasuryReasoningSummary)
- **작업**: `aria-expanded` 상태 관리, 열림/닫힘 시각적 표시(chevron 아이콘) 추가
- **파일**: `agent/[token]/page.tsx`

---

### 🟡 D. 로딩/에러/빈 상태

#### D-25. 스켈레톤 로더 통일
- **현상**: 루트 `loading.tsx`만 스켈레톤 애니메이션 있음. 하위 페이지는 텍스트 또는 스피너 사용
- **작업**: 모든 페이지별 로딩 상태에 콘텐츠 형태를 반영한 스켈레톤 로더 구현
- **파일**: `leaderboard/loading.tsx`, `agent/[token]/loading.tsx`, `table/[id]/loading.tsx`

#### D-26. ActionLog 에러 핸들링 부재
- **현상**: `ActionLog.tsx`에서 액션 fetch 실패 시 에러 표시 없음
- **작업**: fetch 실패 시 인라인 에러 메시지 + 재시도 버튼
- **파일**: `table/[id]/ActionLog.tsx`

#### D-27. 폼 유효성 검증 시각적 피드백
- **현상**: `create-agent/page.tsx`의 textarea 등에 에러 메시지 표시 없음 (line 393-403)
- **작업**: 모든 폼 인풋에 에러 상태 스타일 (빨간 테두리 + 에러 메시지) 추가
- **파일**: `create-agent/page.tsx`, `TableViewer.tsx` (join 폼)

#### D-28. 빈 상태 카피 개선
- **현상**: 
  - `/betting` — "No live tables to bet on" (왜 없는지, 언제 생기는지 설명 없음)
  - `/evolution` — 설명이 너무 길고 장황
- **작업**: 각 빈 상태에 (1) 상황 설명, (2) 다음 행동 안내를 2줄 이내로
- **파일**: `betting/page.tsx:18`, `evolution/page.tsx:54-57`

#### D-29. 에러 메시지에 복구 안내 추가
- **현상**: "Unable to reach indexer — Check back shortly" — "shortly"가 얼마나 짧은지 불명확
- **작업**: 에러 메시지에 구체적 행동 제시: "잠시 후 새로고침하세요" + 자동 재시도 타이머 표시
- **파일**: `page.tsx:58`, `error.tsx`

#### D-30. 플레이어 패널 빈 상태
- **현상**: 아무도 착석하지 않은 테이블에서 PlayersPanel이 비어 보임
- **작업**: "아직 착석한 플레이어가 없습니다 — 첫 번째로 참여해보세요" 표시
- **파일**: `table/[id]/PlayersPanel.tsx`

---

### 🔴 E. 반응형 디자인

#### D-31. 브레이크포인트 통일
- **현상**: 768px, 840px, 640px, 600px, 480px 등 파일마다 다른 브레이크포인트 사용
- **작업**: 3단계 브레이크포인트 표준 수립:
  - `--bp-mobile: 640px`
  - `--bp-tablet: 768px`  
  - `--bp-desktop: 1024px`
  - 모든 미디어 쿼리를 이 기준으로 통일
- **파일**: 전체 `*.module.css`

#### D-32. Create-agent 모바일 대응
- **현상**: 반응형 스타일 전무. 레이더 프리뷰가 모바일에서 오버플로우 (line 408-419)
- **작업**: 모바일에서 step-by-step 위자드 형태로 전환, 프리뷰를 하단 고정 또는 별도 스텝으로 분리
- **파일**: `create-agent/page.tsx`

#### D-33. 리더보드 모바일 카드뷰
- **현상**: 테이블이 수평 스크롤만 제공 — 모바일에서 사용성 열악
- **작업**: 모바일(640px 이하)에서 테이블 → 카드 리스트 뷰로 전환
- **파일**: `LeaderboardTable.tsx`, `LeaderboardTable.module.css:33`

#### D-34. 터치 타겟 크기 부족
- **현상**: 버튼/링크의 최소 터치 영역이 44px(WCAG 기준) 미만인 경우 존재
- **작업**: 모든 인터랙티브 요소에 `min-height: 44px`, `min-width: 44px` 보장
- **파일**: `globals.css` 버튼/링크 기본 스타일

#### D-35. 커뮤니티 카드 모바일 오버플로우
- **현상**: 5장의 커뮤니티 카드가 좁은 화면에서 잘릴 가능성
- **작업**: 모바일에서 카드 크기 축소 또는 2줄 레이아웃으로 전환
- **파일**: `TableViewer.module.css`

#### D-36. 태블릿 레이아웃 부재
- **현상**: 대부분 모바일↔데스크탑 2단 전환만 있고, 태블릿(768~1024px) 전용 레이아웃 없음
- **작업**: Live Dashboard 2컬럼, 테이블 뷰어 좌석 배치 등 태블릿 최적화
- **파일**: `live.module.css:300`, `TableViewer.module.css:686-692`

#### D-37. 모바일 폰트 스케일링 불일관
- **현상**: 일부에서 `clamp()` 사용하나 전체 적용되지 않음
- **작업**: 히어로 타이틀, 통계 숫자 등 핵심 텍스트에 `clamp()` 적용
- **파일**: `page.module.css`, `live.module.css`

---

### 🟡 F. 인터랙션 디자인

#### D-38. 과잉 애니메이션 정리
- **현상**: dealer-pulse, action-glow, live badge, dot-pulse 등 동시 무한 애니메이션이 화면에 여러 개 → 시각적 소음
- **작업**: 동시 무한 애니메이션을 2개 이하로 제한. 정보 전달 목적 없는 장식적 애니메이션 제거 또는 1회성으로 변경
- **파일**: `globals.css:616-851`, `live.module.css`

#### D-39. 리스트 업데이트 애니메이션 부재
- **현상**: ActionLog에 새 항목 추가 시, 리더보드 순위 변경 시 트랜지션 없이 즉시 렌더
- **작업**: 새 항목은 `fade-in` + `slide-down`, 순위 변경은 `translateY` 트랜지션 추가
- **파일**: `ActionLog.tsx`, `LeaderboardTable.tsx`

#### D-40. 페이지 전환 트랜지션
- **현상**: 페이지 간 이동 시 갑작스러운 전환
- **작업**: Next.js App Router의 `loading.tsx` + CSS `fade-in` 으로 부드러운 전환 보장
- **파일**: 각 `loading.tsx`

#### D-41. 호버/액티브 상태 불일치
- **현상**: brightness filter vs border-color 변경 vs background 변경이 컴포넌트마다 다름
- **작업**: 인터랙티브 요소의 hover/active 패턴 3가지로 정리: (1) 버튼: brightness, (2) 카드: border glow, (3) 링크: color shift
- **파일**: `globals.css`, 각 module.css

#### D-42. 확인 다이얼로그 부재
- **현상**: 에이전트 배포, 베팅 등 중요 액션에 확인 단계 없음
- **작업**: 자산이 관련된 액션(배포, 베팅, 테이블 참여)에 확인 모달 추가
- **파일**: `create-agent/page.tsx`, `BettingPanel.tsx`, `TableViewer.tsx`

#### D-43. 토스트/알림 시스템 부재
- **현상**: 복사 완료, 배팅 결과 등 피드백을 줄 시스템적 방법이 없음
- **작업**: 글로벌 토스트 시스템 구현 (성공/경고/에러 3종)
- **파일**: 신규 `components/Toast.tsx`, `providers.tsx`

#### D-44. 클립보드 복사 피드백 없음
- **현상**: 주소 복사 등의 액션 후 성공 여부를 사용자가 알 수 없음
- **작업**: 복사 시 "Copied!" 토스트 또는 아이콘 변경(체크마크) 피드백
- **파일**: 주소 표시 관련 컴포넌트

---

### 🟡 G. 데이터 시각화

#### D-45. Evolution 차트 구현 확인
- **현상**: `StrategyTimeline`, `MetaRadar`, `EloStrategyScatter` 임포트하지만 실제 구현체 미확인
- **작업**: 차트 플레이스홀더(`globals.css:515-524`)가 남아있으면 실제 구현으로 교체
- **파일**: `evolution/page.tsx`, `components/` 차트 관련

#### D-46. 차트 축 라벨/범례 부재
- **현상**: 데이터 시각화에 범례, 축 라벨 없이 수치만 표시
- **작업**: 모든 차트에 범례, 축 라벨, 호버 시 정확한 수치 표시 추가
- **파일**: 차트 컴포넌트들

#### D-47. 핸드 히스토리 리플레이어
- **현상**: 과거 핸드를 시각적으로 재생할 수 없음 (텍스트 로그만 존재)
- **작업**: 핸드 단위 리플레이 뷰어 (최소: 스텝별 보드 상태 + 액션 하이라이트)
- **파일**: 신규 `table/[id]/HandReplay.tsx`

#### D-48. 색맹 대응 부족
- **현상**: 좌석 패널 색상이 색맹 사용자에게 구분 불가능할 수 있음
- **작업**: 색상 외에 패턴/아이콘으로 구분 가능하도록 보조 표시 추가
- **파일**: `SeatPanel.module.css`, `PokerCard.module.css`

#### D-49. 데이터 내보내기(export) 기능
- **현상**: 에이전트 성적, 핸드 로그 등을 CSV/JSON으로 내보낼 수 없음
- **작업**: 리더보드, 에이전트 프로필에 "Export" 버튼 추가
- **파일**: `LeaderboardTable.tsx`, `agent/[token]/page.tsx`

---

### 🟡 H. 카피 & 마이크로카피

#### D-50. 버튼 레이블 스타일 통일
- **현상**: "Continue →" vs "Select Table →" vs "Fund & Deploy →" — 화살표 사용/미사용 불일관, 동사 조합 불일관
- **작업**: 규칙 수립: 주요 CTA는 "동사 + 목적어" (화살표 없음), 탐색 링크만 화살표 사용
- **파일**: `create-agent/page.tsx:291,435`, 전체 버튼

#### D-51. 전문 용어 용어집
- **현상**: "VRF", "ECIES", "NAV/Share", "GTO", "ELO" 등 설명 없이 UI에 노출
- **작업**: 용어 옆 `(?)` 아이콘 + 툴팁으로 간단한 설명 제공, 또는 전용 용어집 페이지
- **파일**: 관련 컴포넌트 전체

#### D-52. 에러 메시지 인간화
- **현상**: "Failed to load tables" — 기술적, 복구 방법 없음
- **작업**: 모든 에러 메시지를 "무엇이 잘못됐는지 + 무엇을 할 수 있는지" 형식으로 교체
  - Bad: "Failed to load tables"
  - Good: "테이블 목록을 불러오지 못했습니다. 네트워크를 확인하고 새로고침해주세요."
- **파일**: `page.tsx:42`, 전체 에러 메시지

#### D-53. Placeholder 텍스트 누락
- **현상**: 일부 인풋에 placeholder 없음
- **작업**: 모든 텍스트 인풋에 예시 포함 placeholder 추가
- **파일**: 폼 관련 컴포넌트

#### D-54. "shortly" 같은 모호한 시간 표현
- **현상**: "Check back shortly" — 사용자가 판단할 기준 없음
- **작업**: 가능하면 구체적 시간 또는 자동 재시도 카운트다운 표시
- **파일**: `page.tsx`, `error.tsx`

#### D-55. 다국어/i18n 준비
- **현상**: 한국어/영어 혼재, 하드코딩된 문자열
- **작업**: 최소한 모든 사용자 대면 문자열을 상수 파일로 분리 (`constants/strings.ts`)
- **파일**: 전체 페이지

---

### 🟢 I. 퍼포먼스

#### D-56. below-fold 이미지 지연 로딩
- **현상**: `next/image` 사용하지만 priority 외 이미지에 명시적 lazy loading 미적용
- **작업**: 스크롤 아래 이미지에 `loading="lazy"` 적용, 필요시 blur placeholder
- **파일**: `page.tsx`, `layout.tsx`

#### D-57. 대형 컴포넌트 동적 임포트
- **현상**: 차트, 레이더 등 무거운 컴포넌트가 페이지와 함께 번들됨
- **작업**: `React.lazy()` + `Suspense`로 차트/시각화 컴포넌트 동적 로딩
- **파일**: `evolution/page.tsx`, `create-agent/page.tsx` (RadarPreview)

#### D-58. ActionLog 가상 스크롤
- **현상**: 긴 액션 로그가 모두 DOM에 렌더됨
- **작업**: 100개 이상 시 가상 스크롤(react-window 등) 적용
- **파일**: `table/[id]/ActionLog.tsx`

#### D-59. LiveDashboard 폴링 최적화
- **현상**: 3초 간격 폴링 (`LiveDashboard.tsx:11`) — 탭 비활성 시에도 계속 요청
- **작업**: `document.visibilityState` 체크하여 비활성 탭에서는 폴링 중단
- **파일**: `LiveDashboard.tsx`

#### D-60. 번들 사이즈 분석
- **현상**: 차트 라이브러리, 포커 로직 등 번들 크기 미확인
- **작업**: `next/bundle-analyzer` 설정, 200KB 이상 청크 최적화
- **파일**: `next.config.js`

---

### 🔴 J. 접근성 (a11y)

#### D-61. aria-live 누락
- **현상**: LiveDashboard 코멘터리 업데이트, 알림, 상태 변경이 스크린리더에 전달 안 됨
- **작업**: 실시간 업데이트 영역에 `aria-live="polite"` 또는 `role="alert"` 추가
- **파일**: `LiveDashboard.tsx:335`, `StatsTicker.tsx`

#### D-62. 모달 포커스 트래핑
- **현상**: showdownOverlay 등 모달 오버레이에 포커스 트랩 없음 → 배경 요소로 탭 이동 가능
- **작업**: 모달에 `role="dialog"`, `aria-modal="true"`, 포커스 트랩, ESC 키로 닫기 구현
- **파일**: `live.module.css:243`, 관련 TSX

#### D-63. 테이블 헤더 scope 누락
- **현상**: 리더보드 테이블 `<th>`에 `scope="col"` 없음
- **작업**: 모든 `<th>`에 `scope` 속성 추가
- **파일**: `LeaderboardTable.tsx`

#### D-64. 정렬 버튼 접근성
- **현상**: 리더보드 정렬 아이콘에 `aria-label` 없음 (`LeaderboardTable.tsx:164-171`)
- **작업**: `aria-label="ELO 내림차순 정렬"` 등 상태 포함 레이블 추가
- **파일**: `LeaderboardTable.tsx`

#### D-65. 클릭 가능한 테이블 행 키보드 접근
- **현상**: 테이블 행 클릭으로 에이전트 페이지 이동하나 키보드로 접근 불가 (`line 205`)
- **작업**: `<tr>` → `<tr tabIndex={0} role="link" onKeyDown={Enter → navigate}>` 또는 행 내 링크 추가
- **파일**: `LeaderboardTable.tsx:205`

#### D-66. 폼 라벨 연결
- **현상**: `create-agent/page.tsx`의 `<input type="range">` 등에 `htmlFor` 연결 없음
- **작업**: 모든 인풋에 명시적 `<label htmlFor>` 연결
- **파일**: `create-agent/page.tsx:116-131`

#### D-67. 컬러 대비(contrast) 검증
- **현상**: `--muted: #9ba3c1` on `--background: #06070b` — WCAG AA 기준 충족 여부 미확인
- **작업**: 모든 텍스트/배경 조합에 대해 WCAG AA(4.5:1) 검증, 미달 시 색상 조정
- **파일**: `globals.css` 컬러 토큰

#### D-68. 화살표/특수문자 텍스트 대체
- **현상**: "←", "→" 등 기호가 스크린리더에서 의미 전달 안 됨
- **작업**: `<span aria-label="뒤로가기">←</span>` 또는 `<span aria-hidden="true">←</span><span class="sr-only">뒤로가기</span>` 패턴 적용
- **파일**: 화살표 사용하는 모든 컴포넌트

#### D-69. 키보드 내비게이션 단축키
- **현상**: 파워유저를 위한 키보드 단축키 없음
- **작업**: `?` 키로 단축키 도움말, `g + l` → Live, `g + b` → Leaderboard 등
- **파일**: 신규 `hooks/useKeyboardShortcuts.ts`

#### D-70. prefers-reduced-motion 범위 확장
- **현상**: `globals.css:694-725`에 일부 애니메이션만 비활성화
- **작업**: 모든 `@keyframes` 애니메이션과 CSS transition을 감사하여, 장식적 애니메이션 전체를 `prefers-reduced-motion: reduce` 시 비활성화
- **파일**: `globals.css`, 모든 `*.module.css`

---

## 🎮 게임피엘(Game-Feel) — 시니어 프로덕트 디자이너 2차 감사

> **감사 시점**: 2026-04-10 — 모든 D-series 완료 후 재감사
>
> **현재 상태**: 디자인 시스템은 단단해졌지만, Railbird는 여전히 "다크모드 크립토 대시보드 + 포커 테이블"처럼 보인다. 토큰화, 접근성, 반응형은 이제 프로덕션 기본기 수준에 도달했다. 문제는 **정체성**이다.
>
> **핵심 문제**: Railbird는 "AI 에이전트들이 온체인 카지노에서 싸우는" 독보적 컨셉을 가지고 있음에도, 비주얼 언어가 SaaS-standard purple 대시보드에 머물러 있어 사용자가 "이건 데이터 화면"이라고 느낀다. 경쟁하는 다른 DeFi/analytics 제품과 구분되지 않는다.
>
> **이번 감사의 목표**: 사용자가 페이지를 열자마자 "이건 **게임**이다"라고 느끼게 만든다. 관람(watch)에서 참여(play)로 감각 이동.

### 🎯 총평 (Executive Summary)

1. **정체성 부재** — `#816cf9`(bootstrap purple) 단일톤에 의존. 카지노/게임 특유의 네온, 골드, 펠트그린 삼원색이 없다. 팔레트만 봐도 이게 포커 제품인지 알 수 없다.
2. **평범한 타이포** — Roboto 단일 폰트. H1부터 본문까지 같은 얼굴을 가지고 있어 브랜드 톤이 단조롭다. 디스플레이 폰트가 없다.
3. **피지컬리티 부재** — 팟, 베팅, 스택이 전부 숫자 텍스트. 포커의 본질인 "칩을 밀고 카드를 뒤집는" 감각이 없다. `PokerCard`는 납작한 CSS 박스이고 딜링/폴딩/올인 같은 순간에 시각 이벤트가 없다.
4. **주이스(Juice) 부재** — `transform: translateY(-1px)`와 `filter: brightness(1.1)`뿐. 버튼이 "눌리는" 감각, 숫자가 "증가하는" 쾌감, 승리가 "터지는" 느낌이 전무하다. 포커는 감각 놀이인데 감각이 없다.
5. **캐릭터 부재** — 에이전트가 지갑주소(`0x1a2b...f3d4`)와 이니셜 한 글자(`AgentAvatar.tsx:10`)로만 식별된다. 4가지 퍼스널리티가 시각적으로 동일하다. 게임에서는 "내 캐릭터"가 이름과 얼굴을 가져야 한다.
6. **정보 계층 단조로움** — "표 + 카드"라는 2개 패턴만 반복. 게임은 대시보드·HUD·스코어보드·리플레이·로비를 각각 다르게 그려야 한다. 라이브 중계는 ESPN인데 리더보드는 재무제표 같은 식으로.
7. **프로그레션 부재** — 시즌, 레벨, XP, 업적, 티어, 칭호가 전부 없다. 재방문 동기가 "핸드 수가 올라있겠지"밖에 없다.
8. **사운드/햅틱 제로** — 음소거 게임이다. 칩이 떨어지는 소리, 카드 flip 소리가 없어 감각 인풋 채널이 하나 부족하다.

**결론**: 지금의 Railbird는 "포커 분석 툴"이고, 이걸 **"포커 아레나"**로 바꿔야 한다. 아래 G-series는 그 전환을 위한 구체 티켓들이다.

---

### 🔴 GA. 비주얼 아이덴티티 리세팅

#### G-1. 엠블럼 & 워드마크 리디자인
- **현상**: 원형 보라 아바타 + 그라디언트 텍스트(`layout.module.css:33-50`). "테크 스타트업 v0" 느낌
- **작업**:
  - 엠블럼: 포커 칩과 기차 레일의 네거티브 스페이스 결합 (기차 바퀴 = 칩 테두리)
  - 워드마크: 디스플레이 폰트로 교체. 제안: Monument Extended, Azeret Mono, 또는 커스텀 stencil
  - 파비콘/apple-touch-icon/OG 이미지 전부 재작업
  - 3가지 변형 확보: full color / mono / stacked
- **파일**: `public/brand/`, `layout.module.css:25-50`

#### G-2. 네온 카지노 팔레트 확장 (6색 시스템)
- **현상**: `--accent: #816cf9` 단일톤. 거의 모든 상태/강조를 이 하나로 처리
- **작업**: 역할이 분명한 네온 6색 + glow 변종 도입
  ```
  --neon-violet: #a78bfa     (primary)
  --neon-magenta: #f472b6    (urgency / all-in)
  --neon-cyan: #22d3ee       (info / VRF / verified)
  --neon-lime: #a3e635       (reward / win / up)
  --neon-gold: #facc15       (prestige / 승자 / 리더보드 1위)
  --neon-crimson: #ef4444    (danger / fold / bust)
  ```
  각 컬러에 `-glow` 토큰(box-shadow용) 동반 정의
  - 상태 컬러(success/warning/danger)를 위 팔레트에 매핑
- **파일**: `globals.css:1-108`

#### G-3. 카지노 플로어 앰비언스 (배경 리믹스)
- **현상**: 배경이 고요한 다크 네이비 + dot grid. 포커 테이블만 펠트 그린, 나머지 페이지는 제품 설명서 느낌
- **작업**:
  - 배경에 SVG film grain / granular noise layer 추가 (현재 `::before` dot grid 대체)
  - 네온 사인 반사광처럼 screen-blend 모드로 움직이는 컬러 글로우 레이어 (violet↔cyan slow shift)
  - 페이지별 subtle tint: leaderboard는 golden trophy, evolution은 cyan lab, create-agent는 velvet red
  - `body::before/::after`에 테이블 펠트 그린 미묘 반사
- **파일**: `globals.css:122-155`, 페이지별 `*.module.css`

#### G-4. 디스플레이 타이포그래피 도입
- **현상**: Roboto 단일 폰트, H1도 숫자도 캡션도 같은 얼굴(`layout.tsx:13-17`)
- **작업**:
  - `--font-display`(디스플레이용), `--font-mono`(스탯/주소) 토큰 추가
  - 디스플레이 폰트 후보: **Monument Extended**, **Azeret Mono**, **Bungee**, **Space Grotesk 800**
  - 적용 대상: H1, 카드 타이틀, 스탯 숫자, 브랜드 워드마크, 섹션 타이틀
  - 본문은 Roboto 유지, 숫자는 tabular-nums
- **파일**: `layout.tsx`, `globals.css:25-26, 100-107`

#### G-5. 히어로 카피 → 게임 포스터 톤
- **현상**: "AI Agents Play On-Chain Poker."(`HeroSection.tsx:24`) — 설명문. 차가움
- **작업**: 게임 포스터/영화 태그라인 풍으로 교체
  - 예: "WHERE THE AI PLAYS FOR KEEPS." / "AUTONOMOUS. VERIFIABLE. RELENTLESS."
  - eyebrow → "SEASON 1 · HASHKEY CHAIN" 식 시즌 메타포
  - 부제: 현재 장황한 기술 설명 삭제, "Watch the bots burn through $X in chips. Place your rail bets."
- **파일**: `apps/web/src/app/_components/HeroSection.tsx:22-36`

---

### 🔴 GB. 피지컬리티 (Physicality)

#### G-6. `<ChipStack>` 컴포넌트
- **현상**: 팟/베팅/스택 모두 숫자 텍스트(`page.tsx:131-133`, `TableViewer.module.css:100-105`). "칩을 밀었다"는 감각 없음
- **작업**:
  - 신규 `<ChipStack amount={} />`: 금액에 따라 `1/5/25/100/500` 단위 칩 개수/컬러 자동 구성 (실제 포커 칩 denomination)
  - CSS 3D stack (multi box-shadow로 높이감)
  - 팟, 시트별 베팅, 시트 스택에 텍스트와 병기
- **파일**: 신규 `components/poker/ChipStack.tsx`, `TableViewer.tsx`, `SeatPanel.tsx`

#### G-7. 카드 컴포넌트 3D 엠보싱 & 전용 뒷면
- **현상**: `PokerCard.module.css` 납작한 흰 박스 + 대각선 줄 뒷면(`PokerCard.module.css:36-43`)
- **작업**:
  - 앞면: multi-layer box-shadow + 얇은 radial highlight로 embossed 3D
  - 뒷면: Railbird 브랜드 패턴 (엠블럼 + 네온 문양). 현재 `repeating-linear-gradient` 제거
  - hover 시 `transform: perspective(600px) rotateY(-4deg) translateY(-2px)` 살짝 기울임
  - 카드 바디에 `--card-width`, `--card-height` 토큰 정의하고 크기 일관화
- **파일**: `PokerCard.module.css`, `PokerCard.tsx`

#### G-8. 카드 딜링 애니메이션
- **현상**: 커뮤니티 카드/홀 카드 즉시 pop-in. 딜러가 뿌리는 감각 부재
- **작업**:
  - 새 카드 mount 시 deck 위치(테이블 상단 가상점)에서 목적지로 translate + `rotateY` flip
  - 플롭 3장 stagger delay (60ms씩)
  - 턴/리버 단일 카드 별도 keyframe
  - `prefers-reduced-motion: reduce` 시 fade만
- **파일**: `TableViewer.tsx`, `PokerCard.tsx`, `globals.css`

#### G-9. 베팅/폴드/올인 액션 이펙트
- **현상**: 액션은 로그 텍스트 + 숫자 변경이 전부. "칩을 내밀었다"는 모션 없음
- **작업**:
  - Bet/Raise: 해당 시트에서 팟 방향으로 chip ghost가 arc 궤도로 비행
  - Fold: 홀 카드 2장이 덱으로 튕겨 돌아가는 애니메이션
  - All-in: seatPanel에서 크림슨 flash + 화면 전체 subtle shake + "ALL IN" 네온 사인
  - Check: subtle tap pulse
- **파일**: `TableViewer.tsx`, `SeatPanel.tsx`, 신규 `components/effects/ChipFlight.tsx`

#### G-10. 팟 수집 (Pot Collection) 이펙트
- **현상**: 쇼다운 후 팟이 조용히 사라지고 스택이 숫자만 증가
- **작업**:
  - 승자 결정 후 팟 chip stack이 승자 시트로 arc 비행 (1초)
  - 승자 자리에 gold particle burst
  - 스택 숫자는 카운트업 애니메이션 (`AnimatedNumber` — G-22)
- **파일**: `TableViewer.tsx`, 신규 `components/effects/ChipFlight.tsx`, `SeatPanel.tsx`

#### G-11. 딜러 버튼 / 블라인드 마커 피지컬화
- **현상**: D/SB/BB가 단순 CSS 원 또는 텍스트
- **작업**:
  - 실제 포커 딜러 버튼 일러스트 (3D bevel, 크림 화이트 칩)
  - 핸드 시작 시 이전 시트 → 다음 시트로 slide 애니메이션
  - SB/BB는 blue/red 칩 일러스트
- **파일**: `SeatPanel.tsx`, `TableViewer.tsx`

---

### 🔴 GC. 캐릭터 & 페르소나 시스템

#### G-12. 에이전트 아바타 일러스트 세트
- **현상**: `AgentAvatar.tsx` 전체가 "이름 첫 글자 + 원형 배경"이 전부(`AgentAvatar.tsx:10, 14-37`). 4가지 퍼스널리티가 시각적으로 동일
- **작업**:
  - 퍼스널리티별 캐릭터 일러스트 세트 (최소 8~12종): aggressive=여우/coyote, tight=올빼미, loose=bear, GTO=robot, bluffer=trickster, calling station=mule, nit=turtle, maniac=monkey 등
  - 원형 뱃지(프로필용) + 반신 일러스트(카드용) 2가지 variant
  - `SeatPanel`, `LeaderboardTable`, `agent/[token]`, `create-agent/StepPersona`, `me/page`, `live/AgentCards` 전체 통일
- **파일**: `components/AgentAvatar.tsx`, `public/brand/avatars/`

#### G-13. 에이전트 = 트레이딩 카드 (Hearthstone/Pokemon 스타일)
- **현상**: 에이전트 프로필 페이지가 일반 통계 대시보드
- **작업**:
  - 에이전트 프로필 헤더를 **트레이딩 카드** 형태로 재디자인
    - 프레임: 티어 컬러 (G-14)
    - 상단: 이름 + ELO (mana cost 위치)
    - 중앙: 캐릭터 일러스트
    - 하단 능력치 4~6개: aggression, tightness, bluff frequency, win rate, hands played, ROI
    - 플레이버 텍스트 1줄 (페르소나 prompt에서 추출)
  - 뒷면: 상세 통계 (클릭 flip, G-7 카드와 애니메이션 공유)
  - 리더보드 hover 시 mini card preview popout
- **파일**: 신규 `components/AgentCard.tsx`, `agent/[token]/page.tsx`

#### G-14. 레어리티 티어 시스템 (5단계)
- **현상**: 모든 에이전트 비주얼 동등
- **작업**:
  - ELO 또는 윈레이트 기반 5단계: Common(회색) → Rare(시안) → Epic(바이올렛) → Legendary(골드) → Mythic(홀로그래픽)
  - 카드 프레임, 네임플레이트, 리더보드 행에 반영
  - Mythic은 CSS hue-rotate + holographic sheen 애니메이션 (tilt 시 반사)
  - 승격/강등 시 toast 이벤트 ("Promoted to Legendary")
- **파일**: 신규 `lib/rarity.ts`, `components/AgentCard.tsx`, `LeaderboardTable.tsx`

#### G-15. 닉네임 제너레이터
- **현상**: 에이전트가 지갑주소로만 표현됨 (`0x1a2b...f3d4`). 인격 없음
- **작업**:
  - deterministic generator: address hash → `{adjective}{noun}#{3-digit}` (예: "Reckless Raven #724", "Cold Ember #401", "Iron Fang #088")
  - 사용자 지정 가능하되 미지정 시 자동
  - 주소는 작은 mono 서브텍스트로 강등
  - adjective/noun 세트는 포커/위험/운 테마로 선별 (200×200)
- **파일**: 신규 `lib/nicknames.ts`, `create-agent/_components/StepPersona.tsx`, 모든 에이전트 표시부

#### G-16. 칭호 & 업적 시스템
- **현상**: 에이전트 성과가 숫자 표로만 표현됨. 업적 개념 없음
- **작업**:
  - 업적 정의: "River Rat"(리버 역전승 5회), "Cooler"(상대 AA/KK 대상 승리 10회), "Ice Cold"(200핸드 no bluff), "Jackpot"(단일 핸드 1000 chip 이상 획득), "Nemesis"(특정 에이전트 상대 10전 승리)
  - 리더보드 닉네임 옆 최대 3개 배지 표시
  - 에이전트 프로필에 achievement grid (언락/락, 진행률 %)
- **파일**: 신규 `lib/achievements.ts`, `LeaderboardTable.tsx`, `agent/[token]/page.tsx`

---

### 🔴 GD. HUD & 스코어보드

#### G-17. Live 페이지 → ESPN/F1 중계 HUD
- **현상**: `live.module.css:1`에 `/* ESPN Mode */` 주석이 있지만 실제는 평범한 2컬럼 대시보드. 중계 느낌 없음
- **작업**:
  - 상단 TICKER 바: 주식 시세 스타일 무한 스크롤 — "AGENT_X +230 · AGENT_Y folded AA · AGENT_Z ALL IN · SEASON #1"
  - 메인 영역: 테이블 라이브 + **Win Probability 바** (두 생존자 맞대결 HP 바처럼)
  - 우측 커멘터리: 하이라이트 이벤트마다 flash + 카테고리 아이콘 (bluff/hero call/suckout)
  - 하단: 다음 이벤트 카운트다운, "Next blinds up in 3 hands" 등
  - 풀스크린 모드 시 브랜드 워터마크 하단 우측
- **파일**: `live/LiveDashboard.tsx`, `live/live.module.css`, `live/StatsTicker.tsx`

#### G-18. 리더보드 → 아케이드 하이스코어 보드
- **현상**: 리더보드 = 정통 데이터 테이블(`LeaderboardTable.tsx`). 데이터 그리드 그 자체
- **작업**:
  - 상위 3명을 **트로피 포디움**으로 별도 헤더 (금/은/동, 2위 좌측, 1위 중앙 높게, 3위 우측)
  - 각 행에 순위 변동 화살표 + 변동폭 (`▲ 2`, `▼ 5`, `NEW`)
  - 1위는 홀로그래픽 네임플레이트 (CSS hue shift)
  - LED 세그먼트 폰트로 스코어 표시 (digital clock 스타일)
  - 로그인한 사용자의 에이전트는 하이라이트 + "YOU" 네온 뱃지
  - 상단 "HALL OF FAME" 헤더 + 시즌 번호 크게
- **파일**: `LeaderboardTable.tsx`, `LeaderboardTable.module.css`, `leaderboard/page.tsx`

#### G-19. 테이블 페이지 → 매치업 포스터 헤더
- **현상**: 테이블 헤더가 "Table #0 · Waiting" 단순 텍스트(`page.tsx:114-121`)
- **작업**:
  - 매치업 "VS" 포스터 스타일: 좌우에 참여 에이전트 아바타 크게, 중앙 "VS" 네온, 하단 현재 블라인드/앤티
  - 각 에이전트 아래 HP바처럼 스택 퍼센트 바 (시작 대비)
  - 핸드 카운트 = "Round 42/∞" 격투 게임 라운드 메타포
  - 스테이크 레벨에 따라 포스터 색상 (micro/small/high)
- **파일**: `table/[id]/page.tsx`, `TableViewer.tsx`, `TableViewer.module.css`

#### G-20. 액션 프롬프트 HUD
- **현상**: 현재 턴 액터 표시가 subtle highlight뿐
- **작업**:
  - 현재 액터 시트 주변 circular ring timer (`TimerRing` 이미 존재) + pulsing neon glow
  - 액션 버튼 컨테이너 상단에 "ACTION REQUIRED" 네온 사인 (작은 marquee 애니메이션)
  - 타이머 < 5초 시 크림슨 pulse + vibrate (모바일)
  - 오토 액션 시 "Agent auto-called" 등 자막
- **파일**: `TableViewer.tsx`, `TimerRing.tsx`, `BettingPanel.tsx`

---

### 🟡 GE. 주이스 (Juice) & 피드백

#### G-21. 버튼 피지컬 press 피드백
- **현상**: `:hover`는 `translateY(-1px) + brightness(1.1)`뿐(`globals.css:329-333`). `:active` 상태 없음 — "눌리는" 느낌 부재
- **작업**:
  - `.btn:active`에 `translateY(1px) + inset box-shadow` press down
  - 주요 CTA에 success flash + chip-drop 파티클 훅
  - 터치 디바이스에서 tap → subtle haptic (G-24)
- **파일**: `globals.css:313-338`

#### G-22. `<AnimatedNumber>` — 카운트업/다운
- **현상**: 팟/스택/ELO/NAV 모두 즉시 교체. "증가하는 쾌감" 부재
- **작업**:
  - `<AnimatedNumber from={prev} to={curr} duration={600} />` 컴포넌트 (requestAnimationFrame 기반, lib 불필요)
  - 증가: lime flash, 감소: crimson flash (각 400ms fade out)
  - 큰 delta (>20%)는 slight scale bounce
  - 모든 핵심 수치 교체: 팟, 스택, ELO, NAV/Share, 칩 카운트, 블라인드
  - `prefers-reduced-motion` 시 즉시 교체
- **파일**: 신규 `components/AnimatedNumber.tsx`, 전역 적용

#### G-23. 승자 축하 (Celebration Overlay)
- **현상**: 쇼다운 "winner" 뱃지와 yellow border pulse가 전부(`globals.css:886-894, 960-963`)
- **작업**:
  - 승자 결정 시 전체 화면 overlay: 골드 confetti 파티클 (canvas 기반), "WINNER" zoom-in 대형 타이포
  - camera shake (G-26)
  - 연속 승리 streak: combo counter (2연승, 3연승…) + 색상 escalation
  - Jackpot 조건 (big pot, all-in 승리) 시 특수 오버레이 + slot machine ding
- **파일**: 신규 `components/effects/CelebrationOverlay.tsx`, `ShowdownResultsPanel.tsx`

#### G-24. 사운드 디자인 & 햅틱
- **현상**: 무음. 사운드 파일/훅 전무
- **작업**:
  - 사운드 세트 수집/제작 (CC0 Kenney.nl / freesound): chip-place, chip-stack, card-flip, card-deal-riffle, fold, raise, check, win-small, win-big, jackpot, lose, bell, notification, ui-hover, ui-click
  - `useSound(name)` 훅 + 글로벌 음소거 토글 (로컬스토리지)
  - 헤더에 🔊/🔇 아이콘 (설정 영역)
  - 모바일 햅틱: `navigator.vibrate()` — fold=짧게, raise=중간, win=긴 패턴
  - 사운드 기본 OFF (접근성), 사용자가 켜야 함
- **파일**: 신규 `public/sounds/`, `hooks/useSound.ts`, `providers.tsx`, `layout.tsx`

#### G-25. 앰비언트 카지노 사운드
- **현상**: `/live`, `/table/[id]`가 완전히 고요
- **작업**:
  - Low-volume casino ambience loop (crowd murmur, distant chips, subtle jazz)
  - 핸드 활성 시 chip clatter background
  - 사용자 토글 (기본 off)
  - 브라우저 탭 블러 시 자동 mute
- **파일**: 신규 `hooks/useAmbientSound.ts`, `live/LiveDashboard.tsx`, `TableViewer.tsx`

#### G-26. Screen Shake (임팩트 모멘트)
- **현상**: Big pot, all-in, bust, 쇼다운 등 임팩트 순간 화면이 고요
- **작업**:
  - `.shake-sm`, `.shake-md`, `.shake-lg` CSS 유틸 (keyframes + CSS custom property로 강도 제어)
  - Trigger: all-in → sm, winner reveal → md, jackpot → lg
  - `prefers-reduced-motion: reduce` 존중 (해당 시 flash로 대체)
- **파일**: `globals.css`, 관련 컴포넌트

---

### 🟡 GF. 프로그레션 & 시즌

#### G-27. 시즌 시스템
- **현상**: 모든 통계가 all-time 누적. "이번 시즌/이번 주" 개념 없음. 재방문 동기 약함
- **작업**:
  - Season 개념 도입 (2~4주 단위), season ID로 snapshot
  - 리더보드 탭: All Time / Season N / This Week
  - 홈에 "Season 1 · Day 12 / 28" 진행 바
  - 시즌 종료 시 보상/리셋 이벤트
- **파일**: 신규 `lib/season.ts`, `leaderboard/page.tsx`, `page.tsx`

#### G-28. 에이전트 레벨 & XP
- **현상**: ELO만 존재. 누적 활동에 대한 명시적 보상 없음
- **작업**:
  - XP 획득: 핸드 플레이 +1, 승리 +5, bluff 성공 +10, jackpot +50
  - Level 1~50 커브 (exponential)
  - 레벨업 시 toast + sound + confetti mini
  - 프로필 카드에 level bar 표시
- **파일**: 신규 `lib/xp.ts`, `components/AgentCard.tsx`, 에이전트 페이지

#### G-29. 데일리 챌린지
- **현상**: 매일 방문 유인 없음
- **작업**:
  - "TODAY'S OBJECTIVE" 홈 상단 dismissible 카드
  - 예: "Watch an all-in showdown", "Bet on 3 rails", "Create your first agent"
  - 완료 시 소형 보상 (XP, 배지)
  - 24h rotation
- **파일**: `page.tsx`, 신규 `lib/dailyChallenges.ts`

#### G-30. Compendium (배지 도감)
- **현상**: 업적이 리스트로만 존재하게 될 예정 (G-16)
- **작업**:
  - `/compendium` 신규 페이지: 모든 업적 그리드 (언락/락)
  - 락된 배지는 실루엣 + 힌트 ("Win 10 hands with AA")
  - 진행률 게이지 (23/100 · 23%)
  - 공유용 OG 이미지 auto-generate
- **파일**: 신규 `app/compendium/page.tsx`, 네비게이션 링크 추가

---

### 🟡 GG. 온보딩 & 튜토리얼

#### G-31. 첫 방문 튜토리얼 오버레이
- **현상**: 첫 방문자가 VRF, ECIES, NAV/Share, 에이전트 개념을 이해 못함. 이탈 리스크
- **작업**:
  - 첫 방문 감지 → 5-step skippable tour: (1) 여기서 AI가 경기함, (2) 실시간 보기, (3) 순위 보기, (4) 직접 만들기, (5) rail bet
  - 각 스텝마다 관련 CTA에 spotlight + pointer
  - localStorage에 `railbird:tour-completed` 플래그
  - Settings에 "Replay tutorial" 토글
- **파일**: 신규 `components/Tutorial.tsx`, `providers.tsx`

#### G-32. 테이블 초심자 코치마크
- **현상**: 처음 테이블 보는 유저가 "이게 뭐야" — 각 영역의 의미 불명
- **작업**:
  - 테이블 페이지 상단에 "Show me how" 버튼
  - 클릭 시 coach mark 체인: 커뮤니티 카드 → 팟 → 시트 → 액션 로그
  - 완료/스킵 상태 저장
- **파일**: `TableViewer.tsx`

#### G-33. 빈 리더보드 데모 모드
- **현상**: 실제 데이터 없으면 빈 페이지
- **작업**:
  - 빈 상태에 샘플 에이전트 5~10개 고정 데이터 프리뷰 + "Sample data — actual agents appear once play begins" 뱃지
  - 샘플 에이전트는 시각적으로 faded + locked icon
- **파일**: `leaderboard/page.tsx`, `LeaderboardTable.tsx`

---

### 🟢 GH. 미세 디테일 & 이스터 에그

#### G-34. 커스텀 커서 (포커 칩)
- **현상**: 브라우저 기본 커서
- **작업**:
  - 전역 커서를 mini chip SVG로 교체 (desktop only, 모바일 불영향)
  - hover 가능한 요소에서는 "card peek" 커서로 전환
  - `@media (pointer: coarse)` 조건부 해제
- **파일**: `globals.css`, 신규 `public/cursors/`

#### G-35. 404 / Error 페이지 → "버스트" 테마
- **현상**: `not-found.tsx`, `error.tsx`가 기본 메시지
- **작업**:
  - 404: "YOU BLUFFED INTO NOTHING" + 폴드된 카드 일러스트 + "Back to the table" CTA
  - error: "THE DEALER FOLDED" + broken card 일러스트 + "Deal again" CTA (retry)
  - 이 페이지들만의 디스플레이 폰트 사용
- **파일**: `app/not-found.tsx`, `app/error.tsx`

#### G-36. 로딩 스켈레톤 → 카드 셔플 애니메이션
- **현상**: 일반 shimmer 스켈레톤
- **작업**:
  - 주요 페이지 루트 로딩에 SVG 카드 셔플 loop (deck riffle)
  - 스켈레톤은 서브레벨 유지
- **파일**: 각 `loading.tsx`, 신규 `components/ShuffleLoader.tsx`

#### G-37. Konami 코드 이스터 에그
- **현상**: 없음
- **작업**:
  - `↑↑↓↓←→←→BA` 입력 → 화면 전체 chip rain (30초) + 크레딧 롤
  - 한 번 트리거 시 `/credits` 페이지 언락
- **파일**: 신규 `hooks/useKonami.ts`, `providers.tsx`

#### G-38. HandReplay → 아케이드 컨트롤
- **현상**: `HandReplay.tsx` 기본 play/pause
- **작업**:
  - 재생 컨트롤을 아케이드 조이스틱/슬롯머신 스타일 (빨간 play, LED 카운터)
  - 속도: 0.5x / 1x / 2x / 4x 배율 버튼
  - 옵션: VHS 스캔라인 오버레이 토글
- **파일**: `HandReplay.tsx`, `HandReplay.module.css`

#### G-39. "God Mode" 디버그 오버레이
- **현상**: VRF status, block height 등 기술 정보가 항상 노출 (`VrfStatusWidget`). 게임 느낌 저해
- **작업**:
  - 기본 숨김, `~` 키 조합 또는 설정 토글로 노출
  - 토글 상태 localStorage 저장
  - 개발자 모드 활성 시 body에 `.dev-mode` 클래스 → 디버그 요소 display
- **파일**: `VrfStatusWidget.tsx`, `providers.tsx`, `globals.css`

#### G-40. 홈페이지 "TODAY'S FEATURE" 카드
- **현상**: 홈이 매번 동일. 방문 유인 없음
- **작업**:
  - 홈 상단에 오늘의 가장 핫한 테이블/에이전트 1장을 큰 포스터로 피처
  - 일별 로테이션 (서버 deterministic), 크로스페이드 애니메이션
- **파일**: `HeroSection.tsx`, 신규 `_components/FeaturedOfTheDay.tsx`

---

### 🟢 GI. 마이크로-게임 확장

#### G-41. Rail Bets → 예측 미니게임
- **현상**: `/betting` 페이지가 단순 풀 deposit UI
- **작업**:
  - "다음 핸드 승자 예측" 빠른 미니게임 (no deposit, 가상 Oracle 레이팅)
  - 연속 맞추기 시 스트릭 카운터
  - 별도 리더보드 섹션 "Oracles"
  - 실제 베팅 UI와 탭으로 분리
- **파일**: `betting/page.tsx` 리디자인

#### G-42. 핸드 퀴즈 모드
- **현상**: 교육/참여 요소 없음
- **작업**:
  - 과거 핸드 N개를 퀴즈로: "당신이라면 Check/Call/Raise?" → 에이전트 실제 액션과 비교, GTO deviation과도 비교
  - 정답률 기반 "Sharkness Score"
  - 공유 가능한 결과 카드
- **파일**: 신규 `app/quiz/page.tsx`, 관련 API

---

## 🗓️ G-series 구현 순서 제안

| 주차 | 테마 | 티켓 | 기대 효과 |
|------|------|------|-----------|
| W1 | Re-skin 기반 | G-1, G-2, G-4, G-5 | 첫인상이 "게임"으로 변환 |
| W2 | 피지컬리티 | G-6, G-7, G-8, G-9, G-10, G-11 | 테이블이 "살아 움직임" |
| W3 | 캐릭터 | G-12, G-13, G-14, G-15, G-16 | 에이전트 = "내 캐릭터" |
| W4 | HUD | G-17, G-18, G-19, G-20 | 라이브 = "중계", 리더보드 = "스코어보드" |
| W5 | 주이스 | G-21, G-22, G-23, G-24, G-25, G-26 | 모든 인터랙션이 "쾌감" |
| W6 | 프로그레션 | G-27, G-28, G-29, G-30 | 재방문 동기 확보 |
| W7 | 온보딩+폴리시 | G-31, G-32, G-33, G-34~G-40 | 첫 사용자 + 완성도 |
| W8 | 확장 | G-41, G-42, G-3 (앰비언스) | 롱테일 피처 |

**주의사항**:
- G-series 전체가 `prefers-reduced-motion: reduce` 존중 필수
- 모든 사운드는 기본 OFF, opt-in만 (접근성)
- 모바일 퍼포먼스 보호: 파티클/shake는 `@media (hover: hover)` 또는 GPU 디바이스 체크
- 캐릭터 일러스트는 외주/AI 생성 에셋 결정 필요 — 작업 시작 전 에셋 소스 픽스
- 사운드 라이선스: CC0(Kenney, freesound.org filtering) 또는 자체 제작

---

# 🎨 PD-Series — Design Hygiene & Layout Audit (2026-04-10)

> Senior PD review. G-series가 "게임 느낌"을 입혔지만 그 아래의 **기본 디자인 위생**(타이포 스케일, 줄바꿈, ellipsis, z-index, 터치 타깃, 스페이싱 시스템) 문제가 다수 발견됨. 이 시리즈는 신규 기능이 아니라 **누적된 미세 결함의 정비**.
>
> 우선순위:
> - 🔴 **P0** — 실제 깨짐(레이아웃 박살, ellipsis 안 됨, 모바일 컷)
> - 🟡 **P1** — 시각적 일관성/접근성 (대비, 터치 타깃, 스페이싱 jungle)
> - 🟢 **P2** — 시스템화 (토큰화, scale 정비)

---

## 🔴 PD-A. Flex/Grid 줄바꿈·Ellipsis 깨짐 (P0)

### PD-A1. `min-width: 0` 누락 → ellipsis 무력화
- **문제**: flex/grid 자식이 `text-overflow: ellipsis`를 가지면 부모 또는 본인에 `min-width: 0`이 필요한데 누락된 곳이 다수. 결과: 긴 지갑 주소·에이전트 이름이 컨테이너를 밀어내고 가로 스크롤 발생.
- **현장**:
  - `apps/web/src/app/page.module.css:284-291` `.tableContractValue` — 부모 `.tableMetaFull`에 `min-width: 0` 없음
  - `apps/web/src/app/page.module.css:324-332` `.seatAddr` — 부모 `.featuredLiveSeat`에 `min-width: 0` 없음 (`.seatChip`에는 있지만 다른 컨테이너)
  - `apps/web/src/components/poker/SeatPanel.module.css:62-71` `.seatAddress` — `text-align: center` + nowrap + ellipsis 조합. 가운데 정렬은 ellipsis와 충돌
  - `apps/web/src/app/leaderboard/LeaderboardTable.module.css:143-150` `.addressCell` — `<td>`에 `min-width: 0` 없음
  - `apps/web/src/app/leaderboard/LeaderboardTable.module.css:219-225` `.agentCardName` — `.agentCardInfo`엔 `min-width: 0` 있으나 grid `auto 1fr auto`에서 두 번째 컬럼 내부 자식에도 명시 필요한지 검증
- **수정**: 모든 ellipsis 자식의 직속/조상 flex/grid item에 `min-width: 0` 강제. utility class `.truncate`를 globals.css에 추가하고 인라인 사용 금지.
- **파일**: 위 모든 module.css

### PD-A2. 한국어 텍스트 mid-word 깨짐
- **문제**: `<html lang="en">` 하드코딩(layout.tsx:51, 62). 한국어 에이전트 이름/설명이 들어가는 곳에서 `word-break: keep-all`이 없어 음절 단위로 잘림. CJK 텍스트 가독성 저하.
- **수정**:
  - `layout.tsx`에서 요청별 locale 감지 또는 `lang="en"` 유지하되 globals.css에 `:lang(ko), [lang="ko"] { word-break: keep-all; overflow-wrap: anywhere; }` 추가
  - 에이전트 이름 컴포넌트에 `lang="ko"` 명시 (Hangul 감지 유틸)
- **파일**: `layout.tsx`, `globals.css`, `lib/agentProfiles.ts`

### PD-A3. 모노스페이스 contract address `overflow-wrap: anywhere` 가독성 저해
- **문제**: `apps/web/src/app/table/[id]/TableViewer.module.css:121-125` `.tableHeadingMetaMono { overflow-wrap: anywhere; }` — 0x주소가 6글자, 4글자, 임의 위치에서 잘려 hash 인지 어려움
- **수정**: `word-break: break-all`로 변경하거나, 더 좋게는 `<wbr>`을 4자리마다 삽입한 monospace span 사용 (`shortenAddress` 유틸 확장)
- **파일**: `lib/utils.ts`, `TableViewer.module.css`

### PD-A4. `featuredLiveActionItem` grid가 액션 amount 0일 때 빈 컬럼
- **문제**: `apps/web/src/app/page.module.css:221-230` `grid-template-columns: 1fr 1fr auto;` — amount가 "-"여도 컬럼은 차지. 모바일(840px↓)에선 1fr로 무너지지만 데스크탑에서 시각적 공백
- **수정**: 액션 row를 inline-flex + gap으로 재작성, 비어있는 셀은 렌더하지 않음
- **파일**: `page.tsx:188-195`, `page.module.css:221-230`

### PD-A5. Featured live grid 4-col → 2-col → 1-col, **하지만 6개 stat이 4-col 일 때 마지막 줄 2개 orphan**
- **문제**: `featuredLiveGrid`가 6개 div 렌더(`Hand, Pot, Actor, Blinds, Button, Contract`)하는데 grid가 4-col이라 5,6번째가 다음 줄에 떠 있음. Contract는 `grid-column: 1/-1` full width라 5번째(Button)만 외톨이
- **수정**: 5개 stat + 1 full row contract로 명확히 분리하거나, `auto-fit, minmax(140px, 1fr)`로 변경
- **파일**: `apps/web/src/app/page.module.css:180-184`

### PD-A6. `.featureStrip` 3-col → 2-col → 1-col 전환에서 orphan
- **문제**: `apps/web/src/app/page.module.css:124-129, 361-364` 768px에서 2-col로 바뀌면 3개 항목 중 마지막 1개가 orphan row (혼자 한 줄)
- **수정**: 768px 구간을 건너뛰고 1024px에서 바로 1-col로 가거나, 3-col을 유지하되 padding 줄이기. 또는 `auto-fit, minmax(220px, 1fr)`
- **파일**: `apps/web/src/app/page.module.css:124-129, 361-373`

---

## 🔴 PD-B. 모바일 컷·고정폭 (P0)

### PD-B1. SeatPanel 최소폭 132px이 320px 화면에서 과대
- **문제**: `apps/web/src/components/poker/SeatPanel.module.css:2` `.seatPanel { width: clamp(132px, 16vw, 170px); }` — iPhone SE (320px)에서 padding 제외 가용폭이 ~280px. 9-max 테이블이면 좌석을 가로로 나열할 수 없음
- **수정**: 모바일(`<480px`)에서 `width: clamp(108px, 24vw, 132px)`로 축소, 또는 모바일 전용 컴팩트 카드 레이아웃
- **파일**: `SeatPanel.module.css`

### PD-B2. Leaderboard `min-width: 700px` 강제
- **문제**: `LeaderboardTable.module.css:61` 데스크탑 테이블 강제 700px → 사용자 줌 125%면 875px → 패럴 스크롤. 768px↓에서 `min-width: 0`로 풀리지만 640px↓에선 카드 리스트로 교체
- **수정**: 768px↓에서 이미 풀리니 OK이지만, 768~1024 영역에서 zoom 시 스크롤 fade overlay 반드시 표시 (`.scrollFade`가 있긴 한데 항상 켜짐 — JS로 스크롤 가능 여부 감지)
- **파일**: `LeaderboardTable.tsx`, `LeaderboardTable.module.css`

### PD-B3. Topbar `topbarActions { min-width: 210px }` 고정
- **문제**: `layout.module.css:100` 데스크탑에서 wallet button 영역이 210px 고정. 1024px↓에서 0으로 풀리지만, 768~1024 어색한 transition
- **수정**: `min-width` 제거하고 wallet button에 자체 `min-width: 9.5rem` 부여
- **파일**: `layout.module.css`

### PD-B4. Hero visual frame `min-height: 180px` 모바일에서도 동일
- **문제**: `page.module.css:82-88, 348-350` 모바일(<1024)에서 160px로 줄지만, 360px 화면에서도 visual+stats grid를 모두 보여줘 첫 화면(Above-the-fold)이 hero copy를 밀어냄
- **수정**: 모바일에선 visual 숨기거나(<640px) order 재배치: copy → CTA → stats → visual
- **파일**: `page.module.css`, `_components/HeroSection.tsx`

### PD-B5. Topbar가 sticky인데 `scroll-margin-top` 부재
- **문제**: 모든 anchor link가 sticky topbar(72px) 뒤에 가려짐. `globals.css`에 `:target { scroll-margin-top: 80px; }` 또는 `html { scroll-padding-top: 80px; }` 없음
- **수정**: `globals.css`에 `html { scroll-padding-top: 84px; }` 한 줄
- **파일**: `globals.css`

### PD-B6. Leaderboard sticky `<th>` 동일 문제
- **문제**: `LeaderboardTable.module.css:79-83` `position: sticky; top: 0;` — 페이지 내부 스크롤이 아니라 윈도우 스크롤일 경우 topbar(72px) 뒤로 들어감
- **수정**: `top: 72px` 또는 CSS 변수 `--topbar-height`로 통일
- **파일**: `LeaderboardTable.module.css`, `globals.css` (변수 정의)

---

## 🔴 PD-C. Z-index 무정부 상태 (P0)

### PD-C1. Z-index 토큰 부재 — 임의 값 8개 발견
- **현장**:
  ```
  globals.css:218       skip-to-content    9999
  Tutorial.module.css:4 tutorial overlay   8000
  SearchPalette.module.css:4 backdrop      200
  live.module.css:251   showdown overlay   100
  layout.module.css:4   topbar             40
  layout.module.css:139 mobileBackdrop     38
  layout.module.css:156 mobileDrawer       39
  layout.module.css:20  liveHeader         40
  ```
- **문제**: showdown(100) < searchPalette(200) < tutorial(8000) < skip(9999). 게임 중 튜토리얼이 showdown을 가린다거나, search palette가 modal 위에 떠있다거나 — 의도가 불명. Toast, ErrorBoundary, ConfirmDialog 등 추가될 때마다 충돌 risk.
- **수정**: `globals.css`에 z-index scale 토큰 추가
  ```css
  --z-base: 0;
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-fixed: 30;
  --z-nav-backdrop: 38;
  --z-nav-drawer: 39;
  --z-topbar: 40;
  --z-overlay: 100;
  --z-modal: 200;
  --z-toast: 300;
  --z-tutorial: 400;
  --z-skip-link: 9999;  /* always on top */
  ```
  모든 하드코드된 z-index를 토큰으로 교체.
- **파일**: `globals.css`, 모든 module.css

---

## 🟡 PD-D. 타이포그래피 정글 (P1)

### PD-D1. font-size 18종 발견 — 0.58~0.95rem 범위에 13단계
- **수집**:
  ```
  0.58rem  aggressionBadge, foldedBadge
  0.62rem  challengeEyebrow
  0.65rem  seatFoldedText, featuredEyebrow
  0.68rem  seatChipLabel, joinSeatBadge, challengeXp
  0.7rem   --text-xs, foot-credit, podiumScore, modeBadge, seatLabel
  0.72rem  agentMeta, podiumName, foldedBadge, landingEyebrow, agentCard
  0.74rem  streetTitle
  0.75rem  text-sm utility, kbdHint, addressCell
  0.76rem  joinFieldLabel, seatAddress, actionActor, landingStatLabel
  0.78rem  seatChip, thinkingBox, achievementDesc
  0.8rem   --text-sm, label, modeBanner span, treasuryFactors
  0.82rem  achievementFlavor, joinFieldLabel, seasonLabel, expandedDetails
  0.85rem  cardChipSuit, reasoningBadge, agentCardMetric, searchInput
  0.875rem actionLog, infoGrid, agentToken, tableHeadingMeta
  0.88rem  pokerCard rank, achievementTitle, agentCardName, nowActingBar
  0.9rem   joinFieldInput, agentName
  0.92rem  --text-base
  0.95rem  agentCardMetric, statCard
  ```
- **문제**: 0.7~0.92rem 사이에 13개 size가 동시에 살아있음. 사용자는 위계를 인지 못 하고 코드는 변경 시 어디를 만질지 알 수 없음. 토큰 시스템(`--text-xs/sm/base/lg/xl/2xl/3xl`)이 있는데 거의 안 쓰임.
- **수정**:
  1. 토큰 강제: `--text-2xs: 0.65rem`, `--text-xs: 0.72rem`, `--text-sm: 0.82rem`, `--text-base: 0.92rem`로 정비 (5단계 small 이하)
  2. ESLint custom rule 또는 stylelint `declaration-property-value-allowed-list`로 `font-size: <number>` 직접 사용 금지
  3. 모든 module.css 일괄 검색 후 토큰으로 치환
- **파일**: `globals.css`, 모든 module.css

### PD-D2. 헤딩 line-height 1.15 — 디스플레이 대형 텍스트에서 ascender/descender 충돌
- **문제**: `globals.css:282` `h1-h5 { line-height: 1.15; }`. `clamp(1.6rem, 2.4vw, 2.4rem)` 헤딩에서 한국어 받침이 다음 줄과 거의 닿음. WCAG는 "1.5 line-height for body, 1.2 for large display"를 제안하지만 한국어/이모지/diacritic 포함 시 1.2도 부족할 수 있음
- **수정**:
  - h1-h2: `line-height: 1.1` 유지하되 `padding-block: 0.05em` 추가
  - h3-h5: `line-height: 1.25`
  - 본문 헤딩 (.section-title): `line-height: 1.2`
  - 또는 `--leading-display: 1.1, --leading-heading: 1.25, --leading-body: 1.45` 토큰 분리
- **파일**: `globals.css`

### PD-D3. `.landingTitle`이 `letter-spacing: -0.02em` 상속하지만 한국어/CJK 부적절
- **문제**: `globals.css:340` `h1-h3 { letter-spacing: -0.02em; }` — 라틴 알파벳 디스플레이 폰트(Space Grotesk)엔 좋지만 CJK엔 글자가 겹쳐 보임
- **수정**: `:lang(ko) h1, :lang(ko) h2, :lang(ko) h3 { letter-spacing: 0; }`
- **파일**: `globals.css`

### PD-D4. 본문 letter-spacing `0.01em` 전역 — 한국어 가독성 저해
- **문제**: `globals.css:158` `body { letter-spacing: 0.01em; }`. 한국어는 letter-spacing 양수 시 음절 사이가 벌어져 가독성↓
- **수정**: `body { letter-spacing: normal; }` + 라틴 전용 클래스에서만 0.01em 적용. 또는 `:lang(en)`/`:lang(ko)` 분리
- **파일**: `globals.css`

### PD-D5. font-family fallback 누락
- **문제**: `globals.css:157` `font-family: var(--font-roboto), Roboto, ...` — `--font-roboto`가 next/font에서 주입되는데 변수 자체가 비면 fallback 체인이 깨짐 (콤마 다음에 빈 값). `var(--font-roboto, Roboto)` 형태로 fallback 안에 fallback 명시 필요
- **수정**: `font-family: var(--font-roboto, Roboto), "Segoe UI", ...`
- **파일**: `globals.css`, `--font-display`도 동일 문제 line 28

### PD-D6. 헤딩 vs 본문 폰트 mismatch — `h1,h2,h3 { font-family: var(--font-display); }`이지만 h4,h5는 본문 폰트
- **문제**: `globals.css:337` h1-h3만 display 폰트. h4,h5는 Roboto. 시각적 위계가 갑자기 끊김
- **수정**: h1-h5 모두 display 폰트, 또는 의도적이라면 주석 추가
- **파일**: `globals.css`

### PD-D7. uppercase 텍스트 letter-spacing 부재인 곳 다수
- **문제**: `text-transform: uppercase`가 적용된 셀렉터 중 letter-spacing이 0.04em 이상 없는 곳: `.medal`(없음), `.featuredEyebrow`(0.1 — OK), `.seatChipLabel`(0.03em — 부족), `.statLabel`(없음). 대문자는 시각적으로 붙어 보여 0.04~0.08em 권장
- **수정**: 모든 uppercase 셀렉터에 `letter-spacing: var(--tracking-wide)` 강제
- **파일**: 다수 module.css

---

## 🟡 PD-E. 스페이싱 시스템 정글 (P1)

### PD-E1. 4px grid 위반 — `0.45rem, 0.52rem, 0.55rem, 0.58rem, 0.62rem, 0.72rem` 등 24종 발견
- **수집**:
  ```
  --space scale: 0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3 rem
  실제 사용: 0.15, 0.18, 0.2, 0.22, 0.24, 0.25, 0.26, 0.28, 0.3, 0.34, 0.35, 0.4,
            0.45, 0.5, 0.52, 0.55, 0.58, 0.6, 0.62, 0.65, 0.68, 0.7, 0.72, 0.75,
            0.78, 0.8, 0.85, 0.88, 0.9, 0.92, 0.95, 1.15, 1.2 rem
  ```
- **문제**: 33종 spacing 값. `--space-*` 토큰이 정의돼 있는데 사실상 무시됨. 결과: card padding이 형제끼리 미세하게 다름 (0.72/0.78/0.85/0.9). 시각적 misalignment의 근원.
- **수정**:
  1. 8단계 토큰으로 다 정리: 2/4/6/8/12/16/24/32/48 px (= 0.125/0.25/0.375/0.5/0.75/1/1.5/2/3 rem)
  2. `padding`, `margin`, `gap` 직접 숫자 사용 ESLint/stylelint 차단
  3. 마이그레이션 PR로 일괄 치환
- **파일**: `globals.css`, 모든 module.css

### PD-E2. `gap` 대신 `margin` 사용
- **문제**: flex/grid 컨테이너에서 자식에 `margin-top` 또는 `margin-bottom` 사용 — 마지막 자식 margin 청소 필요, 반응형에서 깨짐
- **현장**: `featuredLiveSeats { margin-top: var(--space-3); }`, `treasuryReasoningText { margin: 0 0 0.5rem; }`, 다수
- **수정**: 부모에 `gap` 적용, 자식 margin 제거
- **파일**: 다수

### PD-E3. card padding 비대칭 — `0.85rem 1rem`, `0.75rem`, `0.95rem`, `1.2rem`
- **문제**: card 패밀리의 padding이 통일 안 됨. `--card-padding-sm: 0.75rem, --card-padding-md: 1rem, --card-padding-lg: 1.5rem` 토큰 부재
- **수정**: 위 토큰 정의 후 사용. `.card`는 default `var(--card-padding-md)`
- **파일**: `globals.css`

### PD-E4. `landingHero` 자체 padding 0 — `.card` 클래스에 의존
- **문제**: `apps/web/src/app/_components/HeroSection.tsx:21` `<article className={\`card ${styles.landingHero}\`}>`. landingHero에 padding 정의 없으므로 `.card`의 `var(--space-4)`(1rem)에 완전 의존. 누군가 `.card` padding을 바꾸면 hero가 깨짐
- **수정**: landingHero 자체에 명시적 padding (clamp 사용해 모바일~데스크탑 fluid)
- **파일**: `page.module.css`

---

## 🟡 PD-F. 터치 타깃·접근성 (P1)

### PD-F1. 44px 미만 터치 타깃
- **현장**:
  - `layout.module.css:60-64` `.topNav a { padding: 0.5rem 0.75rem; font-size: 0.92rem; }` → ~32px 높이. 데스크탑 nav지만 태블릿(768~1024)에서 노출
  - `live.module.css:274-281` `.tableSelectorBtn { padding: 0.25rem 0.625rem; font-size: 0.75rem; }` → ~22px 높이
  - `live.module.css:49-58` `.fullscreenBtn { padding: 0.25rem 0.625rem; }` → ~22px
  - `LeaderboardTable.module.css:13-25` `.searchInput { padding: 0.45rem 0.75rem; font-size: 0.85rem; }` → ~30px
  - `Tutorial.module.css:48-53` `.skip { min-height: 0; padding: 0.2rem 0.5rem; }` — 명시적 무력화
- **문제**: WCAG 2.5.5 (Level AAA) 44×44, 2.5.8 (Level AA) 24×24 모두 위반
- **수정**: 글로벌 `button { min-height: 44px }`가 있는데 클래스로 override되고 있음. 모바일(`@media (hover: none)`)에서 강제 44px
- **파일**: 위 module.css들

### PD-F2. focus-visible 스타일 누락
- **문제**: `globals.css:253-264`이 `.btn`, `input`, `a`에 focus ring 정의하지만 `.tableSelectorBtn`, `.fullscreenBtn`, `.hamburger`, `.searchInput`(LeaderboardTable) 등 자체 스타일 input은 focus 시 시각적 변화 없음
- **수정**: 모든 interactive element에 `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` 적용. globals.css의 셀렉터에 `[role="button"]`, `details > summary` 추가
- **파일**: `globals.css`

### PD-F3. 컬러 대비 미달
- **현장**:
  - `live.module.css:138` `.agentMeta { color: #6b7280; }` on `rgba(255,255,255,0.04)` 배경 → ~3.8:1 (AA fail)
  - `live.module.css:152-153` `.agentElo { color: #9ca3af; }` → ~5.2:1 (small text 통과, large 통과)
  - `live.module.css:185` `.oddRow { color: #9ca3af; }` → 통과
  - `globals.css:298` `.app-footer { color: var(--text-muted, #6b7280); }` — 토큰 미정 시 #6b7280 fallback. 토큰은 `#7c84a2`로 fix 됨(D-67)이지만 fallback이 stale
- **수정**:
  - `#6b7280` 직접 사용 검색 후 모두 `var(--text-muted)`로 치환
  - `--text-muted: #7c84a2` 유지하되 large text 전용 `--text-muted-soft: #9ba3c1` 추가
- **파일**: `globals.css`, `live.module.css`, 검색 후 일괄

### PD-F4. ARIA modal trap 부족
- **문제**: `LiveDashboard.tsx`의 showdown overlay (live.module.css:244) `role="dialog"` 또는 `aria-modal` 없음. 키보드 사용자가 뒤 페이지로 tab 가능
- **수정**: `<div role="dialog" aria-modal="true" aria-labelledby="..." onKeyDown={trapFocus}>` 패턴, 또는 radix-ui Dialog primitive 도입
- **파일**: `LiveDashboard.tsx`

### PD-F5. 모달 열렸을 때 body scroll lock 부재
- **문제**: SearchPalette, Tutorial, Showdown overlay 모두 `body { overflow: hidden }` 적용 안 됨. 모달 위에서 wheel 시 뒤 페이지 스크롤
- **수정**: 공통 `useScrollLock()` 훅 작성 후 모든 modal에 적용
- **파일**: 신규 `lib/useScrollLock.ts`, 각 모달 컴포넌트

### PD-F6. Skip-to-content `top: -9999px` 안티패턴
- **문제**: `globals.css:215-226` 음수 top으로 숨김 — clip-path 또는 `.sr-only` 패턴이 더 정확. 일부 스크린리더는 -9999px도 읽음
- **수정**: `.sr-only` 클래스 재사용 + `:focus-visible` 시 normal positioning
- **파일**: `globals.css`

---

## 🟡 PD-G. 비주얼 일관성 (P1)

### PD-G1. border-radius 토큰 외 값 다수
- **수집**: `0.375rem`, `0.5rem`, `0.625rem`, `0.75rem`, `0.875rem`, `8px`, `10px`, `11px`, `12px`, `14px`, `1rem`, `24px`, `46% / 40%`
- **토큰**: `--radius-sm: 8px, --radius-md: 12px, --radius-lg: 16px, --radius-xl: 20px, --radius-full: 9999px`
- **문제**: 토큰은 5단계지만 실제 사용은 12종. 카드끼리 corner radius가 1~2px씩 달라 한 화면에 모이면 어색함
- **수정**: 모두 토큰화. `0.375rem → --radius-sm`, `14px → --radius-md`, `1rem/24px → --radius-lg/xl`, `46% → 컴포넌트 전용`
- **파일**: 모든 module.css

### PD-G2. shadow도 토큰 + 인라인 mixed
- **현장**: `var(--shadow-md)`, `var(--shadow-lg)`, `0 14px 40px rgba(0,0,0,0.22)`, `0 24px 50px rgba(0,0,0,0.4)`, `0 12px 24px rgba(255,98,110,0.28)` 등 인라인 shadow 다수
- **수정**: shadow 토큰 확장 (`--shadow-card-hover`, `--shadow-card-active`, `--shadow-table-felt`) 후 직접 rgba 금지
- **파일**: `globals.css`

### PD-G3. border color hex/rgba 직접 사용
- **현장**: `rgba(148, 163, 184, 0.35)`, `rgba(146, 154, 195, 0.22)`, `rgba(169, 132, 89, 0.42)`, `rgba(255, 213, 124, 0.98)` — 한 화면에 4종 이상의 회색 border
- **수정**: `--border-subtle/default/strong` 토큰 사용 강제. accent border는 `--border-accent`, table felt 전용은 `--border-felt`
- **파일**: `globals.css`, 다수

### PD-G4. 색상 직접 hex 사용 (토큰 우회)
- **현장**: `#6b7280`, `#9ca3af`, `#f9fafb`, `#374151`, `#1f2937`, `#dc2626`, `#8b5cf6`, `#c4b5fd`, `#fca5a5` — Tailwind gray/violet/red 색상 직접 박힘
- **문제**: globals.css 토큰 시스템과 충돌. 다크 모드 토큰 변경 시 일괄 적용 불가
- **수정**: 모두 토큰화. `#6b7280 → var(--text-muted)`, `#1f2937 → var(--background-soft)`, `#dc2626 → var(--neon-crimson)` 등
- **파일**: `live.module.css` 위주, 검색 grep 후 일괄

### PD-G5. monospace 폰트 토큰 vs 직접 `monospace`
- **현장**: `var(--text-mono)` (정상) vs `font-family: monospace;` (live.module.css:148, 191, 211)
- **수정**: 모두 `var(--text-mono)`로 통일
- **파일**: `live.module.css`

---

## 🟢 PD-H. 컴포넌트별 미세 결함 (P2)

### PD-H1. PokerCard 사이즈 하드코딩, aspect-ratio 누락
- **문제**: `PokerCard.module.css:5-6` `width: 2.1rem; height: 2.85rem;` — 카드 크기는 게임 컨텍스트마다 다름(테이블 4rem, replay 3rem, hero 5rem). 사이즈 variant prop이 없음
- **수정**:
  ```css
  .pokerCard {
    --card-w: 2.1rem;
    aspect-ratio: 21 / 29;
    width: var(--card-w);
    height: auto;
  }
  .pokerCard.lg { --card-w: 3.2rem; }
  .pokerCard.xl { --card-w: 4.4rem; }
  ```
  rank/suit font-size도 `calc(var(--card-w) * 0.42)` 등으로 fluid
- **파일**: `PokerCard.module.css`, `PokerCard.tsx` (size prop)

### PD-H2. ChipStack height fixed
- **문제**: 검증 필요 — `ChipStack.module.css` 읽기 (작업 시 확인). 일반적으로 chip 위 amount label이 stack 높이 변화 시 점프
- **수정**: amount label은 stack 외부 absolute, container 높이 고정
- **파일**: `ChipStack.module.css`

### PD-H3. SeatPanel `text-align: center` + ellipsis 충돌
- **문제**: 중앙정렬 컨테이너에서 ellipsis는 양쪽 균형이 깨짐. 디자인 의도가 "닉네임 가운데" + "오버플로우 시 끝 …"이라면 `text-align: center` + `direction: ltr`로 가능하지만 구현상 어색
- **수정**: 닉네임은 `text-align: left` + 좌측 정렬, 또는 모노폰 주소는 가운데 정렬을 포기
- **파일**: `SeatPanel.module.css:62-71`

### PD-H4. cardChip `min-width: 2.25rem` 모바일 320px에서 5장 못 들어감
- **문제**: `live.module.css:303-312` 5장 board card * 2.25rem = 11.25rem (180px) + gap. 320px - padding(2rem) = 288px이라 OK이지만, 6장 이상 시나리오(turn 분리 표시 등) 미대응
- **수정**: `min-width: clamp(1.8rem, 7vw, 2.25rem)`
- **파일**: `live.module.css`

### PD-H5. liveHeader sticky `z-index: 40` — globals topbar와 동일
- **문제**: live page는 자체 topbar(`liveHeader`)를 쓰는데 z-index가 글로벌 topbar(40)와 충돌. live 페이지에서 글로벌 topbar는 숨겨야 (또는 live 전용 layout)
- **수정**: live 페이지에서 글로벌 topbar 숨기는 layout split, 또는 liveHeader z-index를 `var(--z-overlay)`로 명시
- **파일**: `apps/web/src/app/live/layout.tsx` (필요 시 신규)

### PD-H6. Toast 위치/z-index 미확인
- **확인 필요**: `Toast.tsx`는 portal로 body에 직접 mount되는지, mobile bottom nav와 충돌하는지 검증
- **수정**: `--z-toast` 사용 + `bottom: max(1rem, env(safe-area-inset-bottom))`
- **파일**: `Toast.tsx`

### PD-H7. KeyboardShortcutsHelp 모달도 동일
- **확인 필요**: z-index, body scroll lock, focus trap

### PD-H8. Compendium 그리드 `minmax(280px, 1fr)` 모바일 375px에서 1-col + 좌우 마진 작음
- **문제**: `compendium.module.css:37-41` 280px min이 모바일 320~375px에서 1열로 떨어지는데, achievementCard는 좌우 padding 0.9rem이라 가용폭이 더 작음. icon(2rem) + gap(0.85rem) + content가 빠듯
- **수정**: 모바일에서 minmax(0, 1fr), 또는 카드 내부 patterns 컴팩트화
- **파일**: `compendium.module.css`

### PD-H9. FeaturedOfTheDay `seasonLabel` line-height 미정
- **문제**: `FeaturedOfTheDay.module.css:13-22` flex with `gap: 0.4rem` + 이모지/dot — 줄간격 안 잡혀있어 dot animation pulse 시 line이 미세하게 움직임
- **수정**: `line-height: 1.2` 명시
- **파일**: `FeaturedOfTheDay.module.css`

### PD-H10. Tutorial card `max-width: 380px` 데스크탑에서 작음
- **문제**: `Tutorial.module.css:24-34` 데스크탑/태블릿에서도 380px — 본문이 좁아 줄바꿈 빈번
- **수정**: `max-width: clamp(320px, 50vw, 460px)`
- **파일**: `Tutorial.module.css`

### PD-H11. ShareButton/WalletButton 높이 mismatch
- **확인 필요**: SearchTrigger, WalletButton, ShareButton의 height가 같은지 검증. topbar에서 시각적 baseline alignment 필수
- **수정**: 공통 `--ctrl-height: 44px` 토큰 사용

### PD-H12. EmptyState 이모지 baseline misalign
- **현장**: `page.tsx:97-99` `<div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>&#x1FA99;</div>` (인라인 스타일!) — 이모지가 line-box 중앙이 아님
- **수정**: `EmptyState.tsx`로 위임, 컴포넌트 내부에서 `line-height: 1; display: block;` 적용. 인라인 스타일 제거
- **파일**: `page.tsx:97-106`

### PD-H13. EmptyState 인라인 스타일 다수 — `page.tsx:53-60, 97-106`
- **문제**: error/empty 상태에 `style={{...}}` 다수. CSS module로 빠져나가야 함
- **수정**: `EmptyState.module.css`로 이동, props로 variant 받기
- **파일**: `page.tsx`, `EmptyState.tsx`

### PD-H14. agent profile `infoRow { word-break: break-word; }` 만 — 모노스페이스 주소 깨짐
- **문제**: `apps/web/src/app/agent/[token]/page.module.css:84-86` — `break-word`는 단어 경계 우선이라 0x...로 시작하는 hash엔 안 통함
- **수정**: 모노 텍스트 자식엔 `word-break: break-all`, 일반 텍스트엔 `overflow-wrap: anywhere`
- **파일**: `apps/web/src/app/agent/[token]/page.module.css`

### PD-H15. agentToken 작은 모노 폰트 + muted color → 가독성 낮음
- **문제**: `agent/[token]/page.module.css:23-28` `font-size: 0.875rem; color: var(--muted);` — 0x주소는 사용자가 선택해서 복사하는 일이 잦음. 더 큰 사이즈, 더 강한 대비, copy 버튼 함께
- **수정**: 0.95rem + `--text-muted` (강화 토큰), copy icon button
- **파일**: 동

---

## 🟢 PD-I. 시스템 정비 (P2)

### PD-I1. CSS 변수 fallback 누락 다수
- **현장**: `var(--background-soft, #0d1020)` (live.module.css:393), `var(--text-muted, #6b7280)` (globals.css:298) — 일부만 fallback. 일관성 없음
- **수정**: 모든 var()에 fallback 강제 또는 (선호) fallback 제거하고 `:root`에 모든 토큰 정의 보장
- **파일**: 전체

### PD-I2. CSS Module class naming 불일치
- **혼합**: camelCase (`landingHero`, `featuredLiveSeats`) vs lowercase (`pokerCard`, `liveBody`) vs hyphen (없음, OK)
- **수정**: 전부 camelCase로 통일 (CSS Module 표준)
- **파일**: 전체

### PD-I3. CSS Module + globals.css 클래스 혼용
- **문제**: `<article className={\`card ${styles.landingHero}\`}>` 식으로 글로벌 `card` 클래스 + module 클래스를 합쳐 씀. globals 변경이 module에 의존성 만듦
- **수정**: globals.css의 `.card`, `.btn`, `.btn-ghost`, `.label`, `.muted` 등 utility는 명확히 utility로 분류하고, 컴포넌트 클래스는 module로만. 또는 Tailwind 도입 검토
- **파일**: 정책 결정

### PD-I4. inline `style={{...}}` 사용 다수
- **현장**: page.tsx:53-106, 다른 페이지에서도 빈번
- **수정**: 모두 module.css로 이동. 인라인 style 금지 ESLint rule
- **파일**: 전체

### PD-I5. HTML semantic / heading hierarchy 점검
- **확인 필요**: 페이지마다 h1이 정확히 1개인지, h2~h5가 skip 없이 위계인지. live page에선 `liveBadge`, `headerTitle` 등이 h1/h2 없이 div로 렌더되는지 검증
- **수정**: 각 페이지 첫 visible heading은 h1, 섹션은 h2

### PD-I6. SVG 아이콘 대신 이모지 사용 — 폰트 의존
- **현장**: `🎲, 🤖, ⚡, 🔴, ✕` — 플랫폼별 이모지 렌더링 다름. 디자인 일관성 ↓
- **수정**: lucide-react 또는 자체 SVG 아이콘 세트 도입. 이모지는 장식/감정 표현에만
- **파일**: 다수 컴포넌트

### PD-I7. globals.css가 1206 lines — 너무 큼
- **수정**: tokens.css, reset.css, typography.css, utilities.css, components.css로 분리. App Router의 root layout에서 모두 import
- **파일**: `globals.css` 분할

### PD-I8. media query 브레이크포인트 inconsistency
- **수집**: `480px, 640px, 768px, 840px, 1024px` 동시 사용. 토큰(`--bp-mobile: 640px, --bp-tablet: 768px, --bp-desktop: 1024px`)이 정의돼있지만 media query에선 못 씀(CSS spec 한계)
- **수정**: `@custom-media` (postcss-custom-media) 도입, 또는 Sass mixin, 또는 단순 컨벤션 (480/768/1024만)
- **파일**: 빌드 설정 + 모든 module.css

### PD-I9. dark mode가 유일 — light mode 계획 없음 명시 필요
- **수정**: README/CONTRIBUTING에 "dark only" 명시, 또는 향후 light theme 토큰 prefix `--dark-` 도입 (준비)
- **파일**: 문서

### PD-I10. CLS 측정/벤치마크 부재
- **수정**: Lighthouse CI 또는 web-vitals 라이브러리로 LCP/CLS 자동 측정. 이미지 explicit width/height 강제 ESLint
- **파일**: CI 설정

---

## 🗓️ PD-series 권장 작업 순서

| 단계 | 묶음 | 티켓 | 기대 효과 |
|------|------|------|-----------|
| 1 | 깨짐 수정 | PD-A1~A6, PD-B1~B6 | 실제 레이아웃 박살 해소 |
| 2 | z-index 정비 | PD-C1 | 모달/네비/오버레이 정합성 |
| 3 | 토큰 강제 | PD-D1, PD-E1, PD-G1, PD-G4 | 시각적 통일성 회복 |
| 4 | 타이포 안정화 | PD-D2~D7 | CJK + 라틴 가독성 |
| 5 | 접근성 | PD-F1~F6 | WCAG AA 통과 |
| 6 | 컴포넌트 폴리시 | PD-H1~H15 | 디테일 정리 |
| 7 | 시스템 정비 | PD-I1~I10 | 장기 유지보수 |

**진행 원칙**:
- 각 PD 티켓은 별도 PR. 1단계는 시각적 회귀 없이 안전, 3~4단계는 시각적 변화가 크므로 디자인 사인오프 필요
- PD-D1, PD-E1, PD-G1, PD-G4는 codemod/script로 일괄 변경 가능 (빠르게)
- 시각적 회귀 테스트(Playwright + screenshot diff) 도입 강력 권장

**Out of scope** (이번 시리즈에 포함 안 함):
- 신규 페이지/기능
- 컴포넌트 라이브러리 마이그레이션 (Tailwind, radix-ui)
- 다국어 i18n 시스템 (lang attr 정비는 PD-A2에 포함)
- 디자인 시스템 문서화 (Storybook 등)

