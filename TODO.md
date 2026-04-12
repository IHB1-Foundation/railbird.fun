# TODO.md — Production Hardening: "진짜 다 돌아야 한다"

> 시니어 테크리드 감사 결과. 모킹/플레이스홀더/미연결 기능 전수 조사.
> 기준: 실제 유저가 지갑 연결해서 모든 플로우를 End-to-End로 완주할 수 있어야 한다.

---

## 심각도 범례

- **P0** — 이거 안 되면 프로덕트가 안 됨 (배포 차단)
- **P1** — 유저가 기능을 시도하면 실패함 (데모 차단)
- **P2** — 동작은 하는데 가짜 데이터거나 서버 없이 돌아감
- **P3** — 코드 품질/보안/운영 이슈

---

## M-A: 사이드벳 온체인 전환 (BettingPanel이 아직 localStorage)

### A-1 BettingPanel은 여전히 100% localStorage 기반 (P0)

- 파일: `apps/web/src/components/BettingPanel.tsx`
- 현상: T-1201 티켓은 DONE이지만, 실제 BettingPanel.tsx는 `localStorage`에서 bankroll/wagers/settledHands를 읽고 쓴다 (L128-162, L253-255, L300-301, L368-370). 온체인 `SideBetPool.sol`과 전혀 연결되어 있지 않다.
- 해야 할 것:
  - [ ] `SideBetPool` 컨트랙트 주소를 `.env`에 추가 (`NEXT_PUBLIC_SIDE_BET_POOL_ADDRESS`)
  - [ ] `SideBetPool`을 HashKey Chain Testnet에 실제 배포하고 주소 기록
  - [ ] BettingPanel에서 localStorage 로직 제거 → `placeBet()` / `claimWinnings()` 온체인 트랜잭션으로 교체
  - [ ] ChipToken `approve` → `SideBetPool.placeBet()` 플로우 구현
  - [ ] settle 후 claim 버튼 + 트랜잭션 상태 표시
  - [ ] 인덱서 API `/api/sidebets/:table/:hand`와 연동하여 실시간 풀/odds 표시

### A-2 SideBetPool 컨트랙트 미배포 (P0)

- 현상: `contracts/src/SideBetPool.sol` 존재하고 테스트도 있지만, `.env`에 배포 주소가 없고 broadcast에도 SideBetPool 배포 기록이 없다.
- 해야 할 것:
  - [ ] SideBetPool 배포 스크립트 작성 (`script/DeploySideBetPool.s.sol`)
  - [ ] HashKey Chain Testnet에 배포
  - [ ] `.env` + `.env.example`에 `SIDE_BET_POOL_ADDRESS` / `NEXT_PUBLIC_SIDE_BET_POOL_ADDRESS` 추가
  - [ ] Keeper에 `sideBetPoolAddress` 주입해서 자동 settle 트리거 확인

### A-3 /betting 페이지가 localStorage 시뮬레이션으로만 동작 (P1)

- 파일: `apps/web/src/app/betting/page.tsx`
- 현상: "Practice Mode" 배지까지 달려 있음. 진짜 온체인 베팅이 아님.
- 해야 할 것:
  - [ ] Practice Mode 배지 제거, 진짜 온체인 모드로 전환
  - [ ] 지갑 미연결시 Connect Wallet CTA

### A-4 /sidebets/leaderboard가 인덱서 API에 의존하지만 API가 빈 데이터 반환 가능 (P2)

- 파일: `apps/web/src/app/sidebets/leaderboard/page.tsx`
- 현상: 인덱서에 `side_bets` 테이블이 있고 API도 있지만, SideBetPool이 배포 안 되어 있으므로 이벤트가 발생한 적 없음 → 항상 빈 리더보드.
- 해야 할 것:
  - [ ] A-2 이후 자연 해결. 배포 후 실제 데이터 흐름 E2E 확인.

---

## M-B: Fleet 서비스 — Create Agent가 실제로 안 됨

### B-1 NEXT_PUBLIC_FLEET_URL 미설정 → Deploy 즉시 에러 (P0)

- 파일: `apps/web/src/app/create-agent/page.tsx:87-94`
- 현상: `NEXT_PUBLIC_FLEET_URL`이 `.env`에 없다. Deploy 버튼 누르면 "Fleet service URL is not configured" 에러.
- 해야 할 것:
  - [ ] Fleet 서비스 배포 (Railway 또는 Docker)
  - [ ] `.env` + `.env.example`에 `NEXT_PUBLIC_FLEET_URL` 추가
  - [ ] `.env`에 `FLEET_OPERATOR_KEYS` 추가 (프리펀딩된 오퍼레이터 키 풀)

### B-2 Fleet WalletPool이 가짜 주소 파생 (P0)

- 파일: `services/fleet/src/pool.ts:9-15`
- 현상: `deriveAddress()`가 private key의 마지막 20바이트를 잘라서 주소로 사용. 이건 실제 이더리움 주소가 아님. 주석에도 "placeholder"라고 명시.
- 해야 할 것:
  - [ ] `viem`의 `privateKeyToAccount()`로 실제 주소 파생으로 교체
  - [ ] 또는 `ethers.Wallet(key).address` 사용

### B-3 Fleet 서비스 인프라 미준비 (P1)

- 해야 할 것:
  - [ ] `services/fleet/Dockerfile` 존재 확인 → Railway/Docker 배포 설정
  - [ ] 오퍼레이터 지갑 프리펀딩 (HSK 테스트넷 가스비)
  - [ ] `docker-compose.yml`에 fleet 서비스 추가
  - [ ] Fleet → Agent bot spawn이 실제로 작동하는지 E2E 테스트

---

## ~~M-C: 모나드/nad.fun 잔재 제거~~ — 완료

> 코드에서 모든 nad.fun/Monad 참조 삭제 완료.
> NadFunTradingWidget, INadfunRouter, MockNadfunRouter, NadfunCompatToken 삭제.
> PlayerVault.sol → 일반 IDexRouter 인터페이스로 교체.
> .env.example, next.config.js, scripts 등에서 NADFUN*\*/WMON*\* 전부 정리.

---

## M-D: Gemini API 키 미설정 → AI 에이전트가 "gemini" 모드로 못 돌아감

### D-1 GEMINI_API_KEY 주석 처리됨 (P0)

- 파일: `.env:73`
- 현상: `# GEMINI_API_KEY=` — 주석. `AGENT_DECISION_ENGINE=gemini`으로 되어 있지만 API 키가 없으면 Gemini 호출 실패.
- 해야 할 것:
  - [ ] Gemini API 키 발급 + `.env`에 설정
  - [ ] 또는 `AGENT_DECISION_ENGINE=simple` 로 명시적 전환 (하지만 T-1203 opponent modeling, T-1205 decision explainability는 Gemini 전용)

### D-2 AI Decision Explainability가 Gemini 없이 작동 불가 (P1)

- 파일: `bots/agent/src/strategy/geminiStrategy.ts`
- 현상: T-1205의 DecisionBreakdown (handStrength, potOdds, evEstimate 등)은 Gemini 프롬프트 응답에서 파싱. Gemini API 키 없으면 전체 "Why?" 기능 불가.
- 해야 할 것:
  - [ ] D-1 해결 필수
  - [ ] `simple` 엔진 fallback에서도 기본 breakdown 생성 고려

---

## M-E: 데모/샘플 데이터 — 실데이터로 교체 필요

### E-1 Leaderboard에 DEMO_LEADERBOARD 폴백 (P2)

- 파일: `apps/web/src/app/leaderboard/page.tsx:86-131`, `apps/web/src/lib/demoLeaderboard.ts`
- 현상: 실 데이터가 없으면 가짜 주소(`0xDEAD1337cafe...`)로 된 샘플 데이터를 opacity 0.35로 표시. "DEMO DATA" 배너까지 달림.
- 해야 할 것:
  - [ ] 에이전트가 실제로 핸드를 플레이하면 자연 해결
  - [ ] 핸드 0개 상태에서는 "No data yet" 빈 상태만 표시하도록 전환 검토

### E-2 agentProfiles.ts에 하드코딩된 4개 에이전트 프로필 (P2)

- 파일: `apps/web/src/lib/agentProfiles.ts:79-120`
- 현상: Aegis/Maverick/Nova/Rex 4개 에이전트가 operator 주소로 하드코딩. 새 에이전트가 등록되면 프로필이 안 뜸.
- 해야 할 것:
  - [ ] PlayerRegistry on-chain 데이터 또는 인덱서 API에서 에이전트 메타 동적 로딩
  - [ ] 하드코딩 제거 또는 fallback으로만 유지

### E-3 packages/shared/src/agentProfiles.ts도 같은 4개 하드코딩 (P2)

- 파일: `packages/shared/src/agentProfiles.ts:18-42`
- 해야 할 것:
  - [ ] E-2와 동일 처리

---

## M-F: 게이미피케이션 시스템 — 전부 클라이언트 사이드 / 영속 안 됨

### F-1 XP/Level 시스템이 서버 저장 없음 (P2)

- 파일: `apps/web/src/lib/xp.ts`
- 현상: XP 계산 로직은 있지만, 유저별 XP를 저장하는 DB/API가 없음. 인덱서 stats에서 `handsPlayed`/`handsWon`을 실시간 계산해서 보여주는 것뿐. 유저가 새로고침하면 상태 유지되지만 다른 디바이스에서는 초기화.
- 해야 할 것:
  - [ ] 인덱서 API에서 계산된 XP를 반환하거나, XP를 별도 영속 레이어에 저장
  - [ ] 또는 이 기능이 cosmetic only라면 현행 유지 (단 명시 필요)

### F-2 Achievement 시스템 — unlock 영속 없음 (P2)

- 파일: `apps/web/src/lib/achievements.ts`
- 현상: Achievement check 함수는 stats를 받아서 평가하지만, unlock 상태가 어디에도 저장 안 됨.
- 해야 할 것:
  - [ ] 인덱서 stats 기반으로 실시간 계산 OK지만, "최초 달성" 기록이 필요하면 DB 필요

### F-3 Daily Challenge — localStorage only (P2)

- 파일: `apps/web/src/lib/dailyChallenges.ts`
- 현상: 챌린지 완료가 `localStorage.setItem(challenge.completionKey, ...)` 으로만 저장. 다른 브라우저에서는 초기화.
- 해야 할 것:
  - [ ] 서버사이드 영속이 필요하면 구현, 아니면 기능 자체를 "local-only fun feature"로 명시

### F-4 Season 시스템 — UI 데코레이션만 (P3)

- 파일: `apps/web/src/lib/season.ts`
- 현상: 시즌 1 시작일(2026-04-01)부터 28일 주기로 시즌 계산. 순수 날짜 기반 유틸리티. 시즌별 리더보드 리셋 같은 백엔드 로직 없음.
- 해야 할 것:
  - [ ] 시즌별 리더보드 리셋이 필요하면 인덱서에 구현
  - [ ] 현행 cosmetic only면 OK

### F-5 Hand Quiz — 스태틱 UI만, 실 데이터 연동 없음 (P2)

- 파일: `apps/web/src/app/quiz/page.tsx`
- 현상: "SAMPLE SCENARIO"로 하드코딩된 카드만 보여줌. 인덱서에서 실제 핸드를 가져와서 퀴즈를 만드는 로직 없음. Sharkness Score도 `—` 로 고정.
- 해야 할 것:
  - [ ] 인덱서 API에서 과거 핸드 데이터 fetch → 실 시나리오 기반 퀴즈 생성
  - [ ] 또는 기능 비활성화/숨김

---

## M-G: Private Key가 .env에 평문 노출

### G-1 .env에 private keys 노출 (P0 — 보안)

- 파일: `.env:31-34, 85-93`
- 현상: `DEPLOYER_PRIVATE_KEY`, `KEEPER_PRIVATE_KEY`, `VRF_OPERATOR_PRIVATE_KEY`, `DEALER_PRIVATE_KEY`, `AGENT_1~9_OPERATOR_PRIVATE_KEY` 전부 평문으로 `.env`에 있음. `.gitignore`에 `.env`가 있어서 git에는 안 올라가지만, 실 프로덕션 운영시 위험.
- 해야 할 것:
  - [ ] 현재 키들이 테스트넷 전용인지 확인 (테스트넷이면 당장은 OK)
  - [ ] 메인넷 전환 시 반드시 시크릿 매니저(Railway secrets, AWS Secrets Manager 등) 사용
  - [ ] `.gitleaks.toml`이 있으므로 CI에서 gitleaks 체크 활성화 확인

### G-2 JWT_SECRET이 .env에 하드코딩 (P1 — 보안)

- 파일: `.env:63`
- 해야 할 것:
  - [ ] 프로덕션에서는 랜덤 생성된 시크릿 사용
  - [ ] Railway 환경변수로 관리

---

## M-H: 인프라/배포 갭

### H-1 docker-compose.yml에 fleet 서비스 누락 (P1)

- 현상: `services/fleet/Dockerfile` 존재하지만 `docker-compose.yml`에 fleet 서비스 정의 없음.
- 해야 할 것:
  - [ ] docker-compose.yml에 fleet 서비스 추가
  - [ ] 환경변수 바인딩 (FLEET_OPERATOR_KEYS 등)

### H-2 멀티 에이전트 docker-compose 미지원 (P2)

- 현상: docker-compose에 agent 서비스가 1개뿐 ("seat 0"). 9-seat 토너먼트를 돌리려면 별도 스크립트가 필요.
- 해야 할 것:
  - [ ] `docker-compose.override.yml` 또는 스크립트로 멀티 에이전트 부팅
  - [ ] 또는 fleet 서비스가 이를 대체

### H-3 Redis가 optional이지만 프로덕션에서 필요할 수 있음 (P3)

- 현상: docker-compose에 redis 있지만 `.env`에 `REDIS_URL` 미설정. 분산 rate limiting 미작동.
- 해야 할 것:
  - [ ] 단일 인스턴스면 OK (in-memory fallback)
  - [ ] 스케일 아웃 시 Redis 필수 → `.env`에 추가

---

## M-I: End-to-End 검증이 필요한 플로우

### I-1 신규 에이전트 등록 → 테이블 착석 → 핸드 플레이 전체 플로우 (P0)

- 해야 할 것:
  - [ ] fleet 서비스 정상 가동 상태에서 `/create-agent` → Deploy → 실제 핸드 시작까지 확인
  - [ ] 또는 수동 오퍼레이터 키 등록 방식이라도 E2E 시나리오 스크립트 실행

### I-2 사이드벳 전체 플로우: 베팅 → 핸드 종료 → settle → claim (P0)

- 해야 할 것:
  - [ ] SideBetPool 배포 후 실제 베팅 → settle → claim 온체인 플로우 테스트
  - [ ] Keeper가 `settleBets()` 자동 호출하는지 확인

### I-3 홀카드 복호화 플로우 (P1)

- 해야 할 것:
  - [ ] Owner가 지갑 연결 → OwnerView에서 홀카드 복호화 수신 → UI에 표시 확인
  - [ ] 다른 유저의 홀카드가 절대 노출 안 되는지 확인

### I-4 Vault rebalancing 전체 플로우 (P1)

- 해야 할 것:
  - [ ] DEX 라우터 배포/연결 또는 rebalancing 기능 자체 재설계
  - [ ] Keeper가 settle 후 rebalanceBuy/Sell 트리거 → accretive-only 체크 → 성공/실패 확인

### I-5 AI Audit Trail: commit → reveal → verify (P1)

- 해야 할 것:
  - [ ] `/verify` 페이지에서 실제 핸드의 reasoningHash 조회
  - [ ] reasoning 원문 입력 → 온체인 해시 매칭 검증 동작 확인

---

## M-J: 코드 품질/기술 부채

### J-1 God Mode 기능 — 프로덕션에서 제거 또는 보호 (P3)

- 파일: `apps/web/src/hooks/useGodMode.ts`
- 현상: localStorage로 "god mode" 토글. 어떤 권한 상승이 있는지 확인 필요.
- 해야 할 것:
  - [ ] God mode가 뭘 하는지 확인 → 프로덕션 빌드에서 제거하거나 env flag로 보호

### J-2 Konami Code 이스터에그 (P3)

- 파일: `apps/web/src/hooks/useKonami.ts`
- 현상: 코나미 코드로 크레딧 언락. 게이미피케이션의 일부이나 프로덕션 적절성 검토 필요.
- 해야 할 것:
  - [ ] 해커톤 특성상 유지해도 OK. 단 민감 정보 노출 없는지 확인.

### J-3 .env 파일이 git에 올라갈 위험 (P1)

- 현상: `.env`와 `.env.hashkey` 파일이 존재. `.gitignore`에 포함되어 있지만 `git status`에서 untracked file로 안 나오는지 확인 필요.
- 해야 할 것:
  - [ ] `git status`에서 `.env`가 tracked/staged 되지 않는지 확인
  - [ ] CI에서 gitleaks pre-commit hook 동작 확인

---

## 실행 우선순위 요약

| 우선순위 | 마일스톤                               | 핵심 블로커              |
| -------- | -------------------------------------- | ------------------------ |
| 1        | **M-D** (Gemini API 키)                | AI 에이전트가 안 돌아감  |
| 2        | **M-A** (사이드벳 온체인화)            | 베팅이 가짜              |
| 3        | **M-B** (Fleet 서비스)                 | Create Agent가 안 됨     |
| ~~4~~    | ~~**M-C** (모나드/nad.fun 잔재 제거)~~ | **완료**                 |
| 5        | **M-G** (보안)                         | Private key 관리         |
| 6        | **M-I** (E2E 검증)                     | 위 4개 해결 후 전체 검증 |
| 7        | **M-E** (데모 데이터 제거)             | UX 신뢰도                |
| 8        | **M-H** (인프라 갭)                    | 운영 안정성              |
| 9        | **M-F** (게이미피케이션)               | 영속성                   |
| 10       | **M-J** (기술 부채)                    | 클린업                   |
