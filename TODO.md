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
| H-2 | 모바일 반응형 | ⬜ |
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
| M-7 | 에러 응답 형식 통일 | ⬜ |
| N-1 | console.log 정리 | ✅ |
| N-2 | DB 마이그레이션 개선 | ✅ |
| N-3 | GTO deviation 피드백 | ⬜ |
| N-4 | Evolution 파라미터 | ⬜ |
| N-5 | ABI 버전 관리 | ⬜ |
| N-6 | KAIA 레거시 정리 | ✅ |
| N-7 | Hole card 암호화 문서 | ⬜ |
| N-8 | CI/CD 파이프라인 | ⬜ |
| D-1 ~ D-9 | 디자인 시스템 | ⬜ |
| D-10 ~ D-17 | 네비게이션/IA | ⬜ |
| D-18 ~ D-24 | 컴포넌트 품질 | ⬜ |
| D-25 ~ D-30 | 로딩/에러/빈 상태 | ⬜ |
| D-31 ~ D-37 | 반응형 디자인 | ⬜ |
| D-38 ~ D-44 | 인터랙션 디자인 | ⬜ |
| D-45 ~ D-49 | 데이터 시각화 | ⬜ |
| D-50 ~ D-55 | 카피/마이크로카피 | ⬜ |
| D-56 ~ D-60 | 퍼포먼스 | ⬜ |
| D-61 ~ D-70 | 접근성(a11y) | ⬜ |

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
