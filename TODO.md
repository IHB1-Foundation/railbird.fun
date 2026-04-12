# TODO.md — Production Hardening Roadmap

> **Goal**: 현재 해커톤 수준의 Railbird/PlayerCo를 **메인넷 런칭 가능한 프로덕션 레벨**로 끌어올리기 위한 전체 할 일 목록.
>
> **형식**: `TICKET.md` 와 동일한 구조. 티켓 러너가 마일스톤 순서대로 자동 실행 가능.
>
> **우선순위**: P0(런칭 블로커) → P1(프로덕션 필수) → P2(런칭 후 스프린트)
>
> **실행 규칙**: `CLAUDE.md`의 NegRisk Ticket Runner 룰을 따른다. 한 티켓 = 한 커밋. 실패 시 즉시 중단.

## Status legend

- [ ] TODO
- [~] IN PROGRESS
- [x] DONE

## Milestone summary

| Milestone | Theme                          | Priority | Tickets         |
| --------- | ------------------------------ | -------- | --------------- |
| **M13**   | Security & Legal Compliance    | P0       | T-1301 ~ T-1306 |
| **M14**   | Observability & Error Tracking | P1       | T-1401 ~ T-1405 |
| **M15**   | Reliability & Resilience       | P1       | T-1501 ~ T-1507 |
| **M16**   | Testing & QA Expansion         | P1       | T-1601 ~ T-1606 |
| **M17**   | Developer Experience & CI/CD   | P1       | T-1701 ~ T-1706 |
| **M18**   | Documentation & API Contracts  | P1       | T-1801 ~ T-1804 |
| **M19**   | Performance & Scale            | P2       | T-1901 ~ T-1906 |
| **M20**   | Deployment & Infrastructure    | P2       | T-2001 ~ T-2005 |
| **M21**   | Frontend Production Polish     | P2       | T-2101 ~ T-2106 |

---

# M13 — Security & Legal Compliance (P0 Blockers)

> **Goal**: 메인넷/공개 런칭 전에 반드시 해결되어야 하는 보안·법적 블로커를 제거한다.
> 이 마일스톤이 완료되지 않으면 프로덕션 런칭은 **불가**.

---

## T-1301 Git history secret audit & `.env.hashkey` 제거 (P0)

- Status: [x] DONE
- Depends on: —
- Goal: `.gitignore`에 등록되어 있음에도 실제로는 추적되고 있는 `.env.hashkey` 파일을 히스토리에서 제거하고, 전체 git 히스토리에서 노출된 시크릿이 없는지 검증한다.
- Scope:
  - **audit**: `gitleaks` / `trufflehog` 로 전체 히스토리 스캔
  - **remediation**: 노출된 키는 모두 로테이션
  - **cleanup**: `.env.hashkey`를 index에서 제거 (파일 자체는 로컬 보존)
- Tasks:
  1. `git ls-files | grep -E "^\.env"` 로 추적 중인 env 파일 전수 확인
  2. `gitleaks detect --source . --verbose` (없으면 설치) 실행 → 리포트 저장 `docs/security/gitleaks-report.txt`
  3. `git rm --cached .env.hashkey` 로 index에서 제거 (파일은 로컬 유지)
  4. 만약 `gitleaks`가 실제 시크릿(private key, API key) 을 히스토리에서 발견하면:
     - 해당 키는 **즉시 로테이션** (Gemini, Dealer, Operator wallets 등)
     - `git filter-repo` 또는 `bfg-repo-cleaner`로 히스토리 rewrite는 **사용자 승인 후에만** 실행
     - 승인이 없으면 티켓 러너를 중단하고 사용자에게 보고
  5. `.gitignore`에 이미 있는 `.env.hashkey` 라인이 정상 작동하는지 재확인
  6. `docs/security/secret-audit.md` 신규:
     - 발견된 시크릿 목록 (마스킹)
     - 로테이션 상태
     - 남아 있는 히스토리 리스크
- Acceptance:
  - `git ls-files | grep -E "^\.env"` 결과에 `.env.example`, `.env.hashkey.example` 만 남음
  - `gitleaks detect` 결과 0 findings (또는 모두 false-positive로 문서화)
  - `docs/security/secret-audit.md` 커밋
- Commit: `chore(security): audit git history for secrets and untrack .env.hashkey`

---

## T-1302 Secrets manager 도입 (P0)

- Status: [x] DONE
- Depends on: T-1301
- Goal: 평문 env 변수 기반 시크릿 관리에서 Vercel/Railway 네이티브 시크릿 또는 외부 vault(1Password/Doppler/AWS Secrets Manager)로 전환. 로컬 개발은 `.env.local` 유지.
- Scope:
  - **선정**: Railway Secrets(현재 인프라)+Vercel Env Vars(web)로 결정 후 문서화
  - **마이그레이션**: 각 서비스의 필수 시크릿 목록 → 배포 환경 시크릿에 등록 완료
  - **검증**: 런타임 startup에서 모든 필수 시크릿이 주입되는지 validation
- Tasks:
  1. `docs/security/secrets-inventory.md` 작성:
     - 서비스별 필수 시크릿 목록 (name, owner, rotation SLA)
     - 현재 저장 위치 (로컬 .env vs Railway vs Vercel)
     - Target 저장 위치 (마이그레이션 후)
  2. `packages/shared/src/env.ts` 신규:
     - `requireEnv(name, { minLength?, pattern? })` 헬퍼
     - 부팅 시 누락된 필수 시크릿이 있으면 즉시 fail-close (프로세스 종료)
     - masked 로깅 (`API_KEY=***abc` 형태)
  3. 각 서비스 entrypoint(`services/*/src/index.ts`, `bots/*/src/bot.ts`)에서 `requireEnv` 사용으로 전환
  4. `DEPLOY.md` 섹션 "Secrets Setup" 추가: Railway/Vercel 시크릿 등록 수동 단계 기술
  5. 기존 `process.env.FOO || "default"` 패턴은 모두 제거 — 필수 시크릿에 디폴트 금지
- Acceptance:
  - 필수 env가 누락되면 모든 서비스가 startup에서 fail-close (exit code != 0)
  - `docs/security/secrets-inventory.md` 가 실제 배포 환경 시크릿과 1:1 매칭
  - 로그에 시크릿이 평문으로 찍히지 않음 (grep 테스트)
- Commit: `feat(shared,infra): add fail-close env validation and secrets inventory`

---

## T-1303 Legal pages: ToS, Privacy, Disclaimer (P0)

- Status: [x] DONE
- Depends on: —
- Goal: 공개 런칭 시 법적으로 요구되는 최소 수준의 ToS / Privacy Policy / Risk Disclaimer 페이지를 웹앱에 추가한다.
- Scope:
  - **웹**: `/terms`, `/privacy`, `/disclaimer` 세 라우트
  - **푸터**: 모든 페이지 푸터에 링크
  - **동의 배너**: 최초 방문 시 ToS/Privacy 동의 배너 (localStorage로 한 번만)
- Tasks:
  1. `apps/web/src/app/terms/page.tsx` 신규:
     - Markdown 렌더링 (MDX) 또는 정적 JSX
     - 조항: service description, wallet-based identity, no KYC, no guaranteed yield, experimental software, arbitration clause (해커톤 수준)
  2. `apps/web/src/app/privacy/page.tsx` 신규:
     - 수집 데이터: wallet address, hand/action history, IP (rate limiting 목적), cookie
     - 제3자 공유: Gemini API (decision reasoning), blockchain (public)
     - 데이터 보존 기간: 무기한 (on-chain) / off-chain은 90일 rolling
     - 사용자 권리: opt-out, 데이터 삭제 요청 경로
  3. `apps/web/src/app/disclaimer/page.tsx` 신규:
     - "Not financial advice"
     - "Experimental software, use at your own risk"
     - "Token values may fluctuate, possible total loss"
     - "18+ only (gambling-adjacent content)"
     - "No liability for smart contract bugs"
  4. `apps/web/src/components/LegalFooter.tsx`:
     - 푸터 링크 3종 + copyright + "testnet only" 배지 (chainId 기반)
     - `RootLayout`에 삽입
  5. `apps/web/src/components/ConsentBanner.tsx`:
     - 최초 방문 시 표시, "I understand" 클릭 시 `localStorage.consentAcceptedAt = ISO` 저장
     - 이후 숨김
  6. 메타데이터: 각 페이지에 `metadata` export (title, noindex for disclaimer)
- Acceptance:
  - `/terms`, `/privacy`, `/disclaimer` 모두 렌더링 정상
  - 모든 페이지 푸터에 링크 노출
  - 최초 방문 시 동의 배너 표시, 동의 후 숨김
  - 다크/라이트 모드 모두 렌더링 확인
- Commit: `feat(web): add ToS, privacy, disclaimer pages with consent banner`

---

## T-1304 Auth endpoint rate limiting + audit log (P0)

- Status: [x] DONE
- Depends on: —
- Goal: `/auth/nonce`, `/auth/verify`, `/dealer/*` 엔드포인트에 IP 기반 rate limiting과 감사 로그를 추가하여 브루트포스/에뉴머레이션을 차단한다.
- Scope:
  - **ownerview**: auth/dealer 라우트에 express-rate-limit 또는 자체 limiter 연결
  - **감사 로그**: 인증 성공/실패 DB 테이블에 기록 (10일 rolling)
  - **알람 가능**: 특정 IP 실패 10회 초과 시 메트릭 증가
- Tasks:
  1. `services/ownerview/src/middleware/rateLimit.ts` 신규:
     - IP + path 조합으로 token bucket (10 req/min for auth, 30 req/min for dealer)
     - exceeded 시 429 + `Retry-After` 헤더
     - trust proxy 처리 (X-Forwarded-For)
  2. `services/ownerview/src/routes/auth.ts` 에 미들웨어 적용
  3. `services/ownerview/src/routes/dealer.ts` 에 미들웨어 적용
  4. DB 테이블 `auth_events(id, ip, path, address, outcome, reason, created_at)`:
     - `services/indexer/migrations/010_auth_events.sql` (indexer가 ownerview DB 공유 전제)
     - ownerview 쪽에서 insert, 90일 TTL 스크립트
  5. `packages/shared/src/metrics.ts` 에 카운터 추가:
     - `railbird_auth_attempts_total{outcome, path}`
     - `railbird_auth_rate_limited_total{path}`
  6. 테스트: `services/ownerview/src/middleware/rateLimit.test.ts`
     - 11번째 요청에 429
     - 1분 후 리셋
     - trust proxy 헤더 파싱
- Acceptance:
  - 11번째 `/auth/nonce` 요청이 429 반환
  - `auth_events` 테이블에 성공/실패 기록
  - Prometheus 메트릭 노출 확인
  - 유닛 테스트 최소 5개 통과
- Commit: `feat(ownerview,indexer): add auth rate limiting and audit events`

---

## T-1305 CORS deny-by-default (P0)

- Status: [x] DONE
- Depends on: —
- Goal: 모든 HTTP 서비스(indexer, ownerview, fleet)에서 `CORS_ALLOWED_ORIGINS` 가 비어있을 때 `*` 로 폴백하지 않고 **deny-all** 로 동작하도록 한다.
- Scope:
  - **indexer, ownerview, fleet**: CORS 미들웨어 통일
  - **공유 유틸**: `packages/shared/src/http/cors.ts`
- Tasks:
  1. `packages/shared/src/http/cors.ts` 신규:
     - `parseAllowedOrigins(raw?: string) => string[] | false`
     - 빈 문자열/undefined → `[]` (deny all non-explicit)
     - `*` 명시 → `["*"]` (개발 전용)
     - `createCorsMiddleware(origins)` Express 미들웨어 팩토리
  2. 각 서비스의 기존 CORS 로직을 공유 유틸로 교체
  3. 로컬 개발용 `.env.example` 에 `CORS_ALLOWED_ORIGINS=http://localhost:3000` 디폴트 주석
  4. 테스트: `packages/shared/src/http/cors.test.ts`
     - empty → deny
     - single origin → allow only that
     - wildcard → allow all (개발용)
     - preflight OPTIONS 처리
- Acceptance:
  - `CORS_ALLOWED_ORIGINS` 미설정 상태에서 cross-origin 요청이 **차단**됨
  - 세 서비스 모두 같은 CORS 유틸 사용
  - 유닛 테스트 최소 6개 통과
- Commit: `feat(shared,services): unify CORS middleware with deny-by-default`

---

## T-1306 Dependency/SCA scanning in CI (P0)

- Status: [x] DONE
- Depends on: —
- Goal: CI에 secret scanning(`gitleaks`) + dependency vulnerability scanning(`pnpm audit` blocking + `osv-scanner`)을 추가하여 보안 이슈가 머지되지 않도록 한다.
- Scope:
  - **CI**: `.github/workflows/security.yml` 신규 또는 `ci.yml` 확장
  - **정책**: high 이상 취약점 블로킹 (medium은 advisory)
- Tasks:
  1. `.github/workflows/security.yml` 신규:
     - Job `gitleaks`: `gitleaks/gitleaks-action@v2`, fail on findings
     - Job `pnpm-audit`: `pnpm audit --audit-level high` (high 이상 블로킹)
     - Job `osv-scanner`: `google/osv-scanner-action`
     - Job `solhint-strict`: `solhint 'contracts/src/**/*.sol'` 를 블로킹으로 변경
  2. `.gitleaks.toml` 신규: 프로젝트별 allowlist (e.g., `.env.example` 예시 값)
  3. 기존 `ci.yml`의 `audit` job은 삭제 (security.yml로 이관)
  4. README의 "Security" 섹션에 뱃지 추가 (gitleaks, osv)
- Acceptance:
  - PR에 high 취약점이 있으면 CI 실패
  - `.env.example` false-positive는 allowlist로 통과
  - solhint 위반이 있으면 CI 실패
- Commit: `ci(security): add gitleaks, osv-scanner, and strict solhint to CI`

---

# M14 — Observability & Error Tracking (P1)

> **Goal**: 프로덕션에서 문제 발생 시 5분 안에 원인을 파악할 수 있는 관측 기반을 구축한다.

---

## T-1401 Sentry 통합 (P1)

- Status: [x] DONE
- Depends on: T-1302
- Goal: 프론트엔드(Next.js) + 백엔드 서비스 + 봇 전체에 Sentry error tracking을 통합하여 프로덕션 예외를 중앙 집계한다.
- Scope:
  - **web**: `@sentry/nextjs`
  - **services/bots**: `@sentry/node`
  - **공유 초기화**: `packages/shared/src/observability/sentry.ts`
- Tasks:
  1. `packages/shared/src/observability/sentry.ts`:
     - `initSentry({ service, environment, dsn, release })`
     - environment: `process.env.CHAIN_ENV` (local/testnet/mainnet)
     - PII 스크러빙 (wallet address 는 해시, private key/signature 제거)
     - 샘플링: prod 10%, staging 50%, local 0%
  2. `apps/web/sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  3. 각 서비스/봇 entrypoint에서 `initSentry` 호출 (로직 시작 전)
  4. 에러 경계 업데이트: `apps/web/src/app/global-error.tsx` → `Sentry.captureException`
  5. `DEPLOY.md` 에 `SENTRY_DSN` 환경변수 추가
  6. 테스트: 의도적 throw → Sentry 이벤트 수신 (manual 검증)
- Acceptance:
  - 프론트/백엔드에서 uncaught exception 발생 시 Sentry에 수신
  - PII (address, signature) 마스킹 확인
  - local 환경에서는 Sentry 전송 안 됨
- Commit: `feat(shared,web,services,bots): integrate Sentry error tracking`

---

## T-1402 Structured logging shipping (P1)

- Status: [x] DONE
- Depends on: T-1302
- Goal: pino 로그를 stdout-only 에서 외부 로그 수집기(Better Stack / Axiom / Grafana Loki)로 전송. 모든 서비스 동일 포맷.
- Scope:
  - **선정**: Better Stack Logtail (무료 티어 충분) 또는 Grafana Cloud Loki
  - **전송**: `pino-logtail` 또는 HTTP transport
  - **correlation ID**: 요청별 traceId 주입
- Tasks:
  1. `packages/shared/src/logger.ts` 확장:
     - `LOG_SHIPPER` env 기반 transport 선택 (stdout / logtail / loki)
     - `traceId` 필드 자동 주입 (AsyncLocalStorage)
  2. 각 HTTP 서비스에 `traceId` 미들웨어:
     - `X-Trace-Id` 헤더 존재 시 재사용, 없으면 생성
     - response에 echo
  3. 봇들은 "hand ID + seat"를 logical trace ID로 사용
  4. `DEPLOY.md` 에 로그 수집기 셋업 문서화
  5. 샘플 쿼리 문서: "특정 handId 의 모든 로그" Loki/Logtail 쿼리 예시
- Acceptance:
  - 서비스/봇 로그가 외부 수집기에 도착
  - 동일 요청의 로그들이 traceId 로 그룹핑 가능
  - 로컬 개발은 여전히 stdout
- Commit: `feat(shared): add log shipping and trace ID propagation`

---

## T-1403 Metrics scraper + Grafana dashboard (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 이미 노출 중인 `/metrics` Prometheus 엔드포인트를 실제 수집 + 대시보드까지 연결. Grafana Cloud 무료 티어 사용.
- Scope:
  - **Grafana Cloud**: prom 수집 + 기본 대시보드
  - **대시보드**: bot health, indexer lag, auth rate, action latency
- Tasks:
  1. `docs/observability/grafana-setup.md` 작성: Grafana Cloud stack 만들기 → remote_write 토큰 생성 → 서비스별 scrape config
  2. `infra/grafana/dashboards/` 에 JSON 대시보드 3종 커밋:
     - `bots.json` — agent/keeper/vrf-operator health, actions, errors
     - `indexer.json` — block lag, WS subscribers, DB query latency
     - `ownerview.json` — auth attempts, rate limited, JWT issued
  3. `packages/shared/src/metrics.ts` 확장:
     - `railbird_indexer_block_lag{network}` Gauge
     - `railbird_ownerview_jwt_active` Gauge
     - 기존 메트릭 명명 일관성 점검 (prefix 통일)
  4. Prometheus scrape 설정: Railway 내부망에서 접근 가능한지 확인 → 필요 시 public `/metrics` 에 auth 추가
- Acceptance:
  - Grafana Cloud에 3개 대시보드 import 가능
  - 실제 staging 환경에서 메트릭 수집 확인
  - `/metrics` 엔드포인트는 인증 보호 또는 IP allowlist
- Commit: `feat(observability): add metrics gauges and Grafana dashboards`

---

## T-1404 Distributed tracing (OpenTelemetry) (P1)

- Status: [x] DONE
- Depends on: T-1402
- Goal: web → ownerview → indexer 요청 흐름을 OTel로 추적. trace sampling은 1%.
- Scope:
  - **패키지**: `@opentelemetry/sdk-node`, `@opentelemetry/instrumentation-http`, `...instrumentation-pg`, `...instrumentation-pino`
  - **receiver**: Grafana Tempo 또는 Honeycomb
- Tasks:
  1. `packages/shared/src/observability/tracing.ts`:
     - `initTracing({ service, endpoint })`
     - auto-instrumentation: http, pg, express
  2. 각 entrypoint 최상단에서 `initTracing()` 호출 (다른 import 전)
  3. 수동 span: viem 호출, 컨트랙트 호출, Gemini API 호출
  4. `DEPLOY.md` 에 `OTEL_EXPORTER_ENDPOINT` 문서화
  5. 로컬: `otel-collector` docker-compose 서비스 추가 (옵션)
- Acceptance:
  - Honeycomb/Tempo 에서 end-to-end trace 확인 가능
  - HTTP, DB, 외부 API span이 나타남
  - 샘플링 1% 적용
- Commit: `feat(observability): add OpenTelemetry distributed tracing`

---

## T-1405 Uptime monitoring & paging (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 외부 uptime monitor(Better Stack Uptime / UptimeRobot)로 주요 엔드포인트 모니터링. 장애 시 Slack/Discord 웹훅으로 알림.
- Scope:
  - **모니터링 대상**: web /, indexer /health, ownerview /health, fleet /health, chain RPC
  - **알림**: Discord 웹훅 (팀 채널)
- Tasks:
  1. `docs/observability/uptime-setup.md`:
     - Better Stack Uptime 계정 세팅
     - 모니터 5개 등록 (60s interval)
     - on-call rotation (팀 1명 시작)
  2. `/health` 엔드포인트 강화:
     - shallow: 서비스 alive
     - deep: DB reachable, chain RPC reachable, 필수 컨트랙트 존재
     - 쿼리 파라미터 `?deep=1` 로 분기
  3. StatusPage 페이지 (옵션, Better Stack 내장) 생성
- Acceptance:
  - 5개 엔드포인트 모두 모니터링 중
  - 의도적 중단 테스트 시 알림 도달
  - deep health check가 DB 다운을 감지
- Commit: `feat(services): add deep health checks and document uptime monitoring`

---

# M15 — Reliability & Resilience (P1)

> **Goal**: 일시적 장애(RPC flake, DB 타임아웃, 느린 client) 상황에서도 시스템이 자가 복구 가능해야 한다.

---

## T-1501 RPC exponential backoff wrapper (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 모든 viem RPC 호출에 지수 백오프 재시도 래퍼를 적용. 재시도 카운트/성공률을 메트릭으로 노출.
- Scope:
  - **공유 유틸**: `packages/shared/src/chain/rpcRetry.ts`
  - **적용**: bots, services 전역
- Tasks:
  1. `packages/shared/src/chain/rpcRetry.ts`:
     - `withRpcRetry(fn, { maxAttempts=5, baseMs=200, maxMs=5000, retryOn?=(err)=>bool })`
     - 기본 retry 조건: network error, 429, 5xx, "nonce too low" (nonce 재조회 훅)
     - jitter 포함
  2. 기존 `publicClient.readContract`, `.getBlock`, `.getLogs` 호출을 모두 래핑
  3. `railbird_rpc_retry_total{op,outcome}` 메트릭
  4. 테스트: `rpcRetry.test.ts`
     - 3번째에 성공
     - maxAttempts 초과 시 throw
     - non-retriable 에러는 즉시 throw
- Acceptance:
  - 강제 RPC 장애 시뮬레이션에서 자동 복구
  - 메트릭으로 재시도 빈도 확인 가능
  - 유닛 테스트 최소 5개
- Commit: `feat(shared,bots,services): add RPC exponential backoff wrapper`

---

## T-1502 Indexer reorg detection & rollback (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 인덱서가 체인 reorg를 감지하여 영향받은 블록의 DB 상태를 롤백하고 재인덱싱한다.
- Scope:
  - **indexer**: parent hash 추적, reorg 감지 루프
  - **DB**: 롤백 가능한 schema (blocks 테이블)
- Tasks:
  1. DB 테이블 `indexed_blocks(number, hash, parent_hash, indexed_at)`:
     - `services/indexer/migrations/011_indexed_blocks.sql`
  2. `services/indexer/src/listener.ts`:
     - 매 블록 저장 시 parent_hash 검증
     - mismatch → reorg 시작 → 공통 조상 찾기 → 이후 블록 데이터 모두 삭제 → 재인덱싱
  3. 영향받는 테이블(hands, events, actions, side_bets, etc.)에 `block_number` 컬럼 존재 확인 → 없으면 추가
  4. 롤백 쿼리: `DELETE FROM ... WHERE block_number >= $1`
  5. 메트릭: `railbird_indexer_reorg_total{depth}`
  6. 테스트: `services/indexer/src/listener.reorg.test.ts`
     - 3-depth reorg 시뮬레이션 → 상태 일관성
- Acceptance:
  - anvil에서 `anvil_reorg` 명령으로 reorg 시뮬레이션 → 인덱서 자동 복구
  - 롤백 깊이 메트릭 기록
  - 테스트 통과
- Commit: `feat(indexer): add reorg detection and rollback`

---

## T-1503 Indexer cursor-based backfill resume (P1)

- Status: [x] DONE
- Depends on: T-1502
- Goal: 인덱서 재시작 시 마지막 성공 블록부터 resume 하여 backfill 시간 단축. `INDEXER_FLUSH_ON_START` 는 개발용 옵션으로만 유지.
- Scope:
  - **indexer**: `cursor` 테이블에 per-contract last block 저장
- Tasks:
  1. DB 테이블 `indexer_cursors(contract_address, last_block, updated_at)`:
     - `services/indexer/migrations/012_indexer_cursors.sql`
  2. `services/indexer/src/listener.ts`:
     - 시작 시 cursor 읽기 → max(cursor, START_BLOCK)
     - 각 배치 성공 후 cursor 업데이트 (same tx)
  3. `INDEXER_FLUSH_ON_START` 은 유지하되 기본값 false, prod에선 강제 false
  4. 메트릭: `railbird_indexer_cursor_lag{contract}` Gauge (head - cursor)
  5. 테스트: 재시작 시 cursor 이후부터만 처리 검증
- Acceptance:
  - 재시작 후 backfill 시간이 이전 블록 재처리 없이 단축
  - cursor lag 메트릭이 Grafana에 나타남
  - 테스트 통과
- Commit: `feat(indexer): add cursor-based backfill resume`

---

## T-1504 WebSocket backpressure & dead client 제거 (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 느린 WS 클라이언트로 인해 인덱서 메모리가 무한정 증가하지 않도록 backpressure 처리.
- Scope:
  - **indexer**: WsManager 개선
- Tasks:
  1. `services/indexer/src/ws/wsManager.ts`:
     - 각 client별 outbound buffer 제한 (`maxBuffered=100`)
     - `ws.bufferedAmount > threshold` 이면 해당 client drop + metric 증가
     - drain 이벤트 기반 backpressure 완화
  2. heartbeat ping (30s) → pong 응답 없으면 연결 종료
  3. 메트릭: `railbird_ws_clients_dropped_total{reason}`, `railbird_ws_buffered_bytes{client}`
  4. 테스트: 의도적으로 느린 client → drop 확인
- Acceptance:
  - 10MB buffer 초과 client는 강제 종료
  - 죽은 client는 ping 실패 후 15초 내 정리
  - 메모리 leak 테스트 통과 (5분 stress → buffer 안정)
- Commit: `feat(indexer): add WS backpressure and dead client eviction`

---

## T-1505 External API timeouts 표준화 (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 모든 외부 API 호출(Gemini, Dealer service, RPC)에 명시적 timeout + AbortSignal.
- Scope:
  - **gemini**: GEMINI_TIMEOUT_MS 명시 적용
  - **dealer**: fetch signal + timeout
  - **rpc**: viem client transport에 timeout 옵션
- Tasks:
  1. `packages/shared/src/http/fetchWithTimeout.ts`:
     - `fetchWithTimeout(url, { timeoutMs, ...opts })`
     - AbortController + timeout clear
  2. 기존 Gemini/Dealer 호출 → `fetchWithTimeout` 로 교체
  3. viem `createPublicClient` 에 `{ transport: http(rpc, { timeout: 15000, retryCount: 0 }) }` (retry는 T-1501 래퍼가 담당)
  4. 메트릭: `railbird_external_api_timeout_total{target}`
- Acceptance:
  - Gemini API가 15초 내 응답 없으면 Abort + fallback
  - 테스트: 지연 mock 서버로 timeout 발동 검증
- Commit: `feat(shared,agent,services): standardize external API timeouts`

---

## T-1506 DB connection pool tuning + health (P1)

- Status: [x] DONE
- Depends on: —
- Goal: DB 풀 파라미터를 prod-ready 로 조정하고, pool exhaustion을 감지하는 health check 및 메트릭 추가.
- Scope:
  - **indexer, ownerview**: pg pool 설정
- Tasks:
  1. `packages/shared/src/db/pool.ts`:
     - `createPgPool({ max, idleTimeoutMs, connectionTimeoutMs, statementTimeoutMs })`
     - default: max=20, idle=10s, conn=5s, stmt=30s
  2. `SET statement_timeout` 을 each acquire 시 적용 (runtime override 가능)
  3. 메트릭:
     - `railbird_pg_pool_total_count`
     - `railbird_pg_pool_idle_count`
     - `railbird_pg_pool_waiting_count`
     - `railbird_pg_query_duration_seconds{query}` histogram
  4. deep health: `SELECT 1` 을 2s timeout 으로 실행
  5. `DEPLOY.md` 에 prod 풀 사이즈 가이드 추가
- Acceptance:
  - pool exhaustion 상황에서 waiting_count 메트릭 증가 확인
  - 30초 초과 쿼리는 자동 abort
  - Grafana 에 pg pool 패널 추가
- Commit: `feat(shared,services): add PG pool tuning and health metrics`

---

## T-1507 DB 백업 & 롤백 전략 문서화 + script (P1)

- Status: [x] DONE
- Depends on: —
- Goal: Postgres 백업/복구 절차 문서화 + 자동 pg_dump 스크립트 + 각 마이그레이션 `down.sql` 추가.
- Scope:
  - **scripts**: pg_dump + restore 스크립트
  - **migrations**: down.sql 파일 추가
  - **runbook**: RTO/RPO SLA
- Tasks:
  1. `scripts/db/backup.sh`:
     - `pg_dump --format=custom` → S3/R2 업로드 (S3 미설정 시 로컬)
     - 암호화 (gpg) 옵션
     - 7일 retention
  2. `scripts/db/restore.sh`:
     - 백업 파일 선택 → `pg_restore` → migration re-verify
  3. 기존 마이그레이션 9개에 대응하는 `services/indexer/migrations/down/00X_*.sql` 파일 추가
  4. `services/indexer/src/db/migrate.ts` 에 `migrateDown(target)` 함수 추가 (수동 호출만)
  5. `docs/runbook.md` 의 "Backup & Restore" 섹션:
     - RTO: 30분, RPO: 1시간
     - 백업 주기: 매시간 (cron)
     - 복구 테스트: 주 1회
  6. CI에서 backup script 동작 검증 (dry-run)
- Acceptance:
  - `bash scripts/db/backup.sh` 로 백업 파일 생성
  - `bash scripts/db/restore.sh <file>` 로 복구 성공
  - 모든 up 마이그레이션에 대응하는 down 파일 존재
  - runbook 업데이트
- Commit: `feat(ops): add DB backup/restore scripts and migration rollback`

---

# M16 — Testing & QA Expansion (P1)

> **Goal**: 변경으로 인한 regression을 CI에서 잡을 수 있는 테스트 커버리지 확보.

---

## T-1601 Foundry invariant tests (P1)

- Status: [x] DONE
- Depends on: —
- Goal: PokerTable, PlayerVault, SideBetPool 에 대한 invariant (state conservation) 테스트 추가.
- Scope:
  - **contracts**: invariant suites
- Tasks:
  1. `contracts/test/invariant/PokerTableInvariant.t.sol`:
     - Invariant: `sum(seat.stack) + pot == initial total chips` (한 핸드 내)
     - Invariant: `lastActionBlock <= block.number`
     - Handler: 랜덤 action 시퀀스 생성
  2. `contracts/test/invariant/PlayerVaultInvariant.t.sol`:
     - Invariant: `A == sum(externalAssets) - payables`
     - Invariant: `B <= totalSupply` (treasury shares 상한)
     - Invariant: post-rebalance NAV per share ≥ pre-rebalance NAV per share
  3. `contracts/test/invariant/SideBetPoolInvariant.t.sol`:
     - Invariant: `sum(seatTotals) == totalPool - claimedPool`
     - Invariant: settled pool은 새 bet 수락 안 함
  4. `foundry.toml` 에 invariant 설정 추가 (runs=256, depth=15)
  5. CI에 invariant job 추가
- Acceptance:
  - 3개 invariant suite 통과
  - CI에서 invariant 실행 확인
  - README에 "invariant tested" 뱃지
- Commit: `test(contracts): add invariant tests for PokerTable, Vault, SideBet`

---

## T-1602 E2E 시나리오 확장 (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 현재 `scripts/ci-e2e.sh` 의 단일 시나리오를 확장 (4-seat, 중복 핸드, reorg 시뮬레이션, 에이전트 크래시 복구).
- Scope:
  - **scripts**: e2e 시나리오 셸 + harness
  - **services**: scenario 컨트롤 API
- Tasks:
  1. `scripts/e2e/` 구조화:
     - `scripts/e2e/lib/common.sh` — 공통 setup/teardown
     - `scripts/e2e/scenarios/01-happy-path.sh` — 2 agent, 1 hand
     - `scripts/e2e/scenarios/02-4seat-settlement.sh`
     - `scripts/e2e/scenarios/03-timeout-fold.sh` — force timeout
     - `scripts/e2e/scenarios/04-agent-crash.sh` — kill + restart
     - `scripts/e2e/scenarios/05-reorg.sh` — anvil_reorg
  2. `scripts/e2e/run-all.sh` — 전체 실행 + 결과 리포트
  3. 각 시나리오 후 DB/컨트랙트 상태 검증
  4. CI workflow `ci.yml` 에 `e2e-full` job (main 브랜치만)
  5. timeout: 15분
- Acceptance:
  - 5개 시나리오 모두 로컬에서 통과
  - CI에 main merge 시 실행
  - 각 시나리오 독립 실행 가능
- Commit: `test(e2e): expand E2E scenarios with 4-seat, timeout, crash, reorg`

---

## T-1603 Frontend component & a11y tests (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 핵심 페이지(TableViewer, AgentPage, Live, Create-Agent)에 대한 Playwright 테스트 + axe-core a11y 검증.
- Scope:
  - **web**: Playwright 설정 + 테스트 + a11y
- Tasks:
  1. `apps/web/playwright.config.ts` 설정
  2. `apps/web/e2e/table.spec.ts` — /table/[id] 렌더링, 액션 로그, WS 업데이트 mock
  3. `apps/web/e2e/live.spec.ts` — /live 자동 테이블 전환
  4. `apps/web/e2e/create-agent.spec.ts` — 위자드 4단계 워크플로
  5. `apps/web/e2e/a11y.spec.ts` — `@axe-core/playwright` 로 5개 핵심 페이지 자동 검사 (critical/serious 위반 0)
  6. CI job `web-e2e` 추가 (Playwright 브라우저 캐시)
- Acceptance:
  - 4개 spec 파일 통과
  - a11y critical/serious 위반 0
  - CI에서 실행
- Commit: `test(web): add Playwright e2e and axe a11y tests`

---

## T-1604 Bot 통합 테스트 (P1)

- Status: [x] DONE
- Depends on: —
- Goal: agent/keeper 봇이 실제 인덱서+ownerview+컨트랙트와 통합 동작하는지 검증하는 통합 테스트.
- Scope:
  - **bots/agent**: integration test harness
  - **bots/keeper**: integration test harness
- Tasks:
  1. `bots/agent/test/integration/fullRound.test.ts`:
     - anvil + deployed contracts + 실제 indexer + ownerview
     - 에이전트가 1라운드 (preflop → river → showdown) 완주
  2. `bots/keeper/test/integration/timeout.test.ts`:
     - 타임아웃 핸드에 대해 forceTimeout 호출
     - VRF 재요청
  3. test harness: `bots/agent/test/integration/harness.ts` — 컨테이너 기동/종료
  4. CI에서 `bot-integration` job 추가
- Acceptance:
  - 2개 통합 테스트 통과
  - CI에서 실행
- Commit: `test(bots): add integration tests for agent and keeper`

---

## T-1605 Load & stress tests (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 인덱서 WS, ownerview auth, side bet placing에 대한 부하 테스트 → 병목 식별.
- Scope:
  - **tooling**: k6 또는 artillery
- Tasks:
  1. `scripts/load/k6-indexer-ws.js`:
     - 500 동시 WS connection, 5분
     - 목표: P99 latency < 1s, no dropped messages
  2. `scripts/load/k6-auth.js`:
     - 100 RPS `/auth/nonce` + `/auth/verify`
     - rate limiter 동작 검증 (429 응답 확인)
  3. `scripts/load/k6-sidebet.js`:
     - 50 동시 유저 베팅 → settle → claim
  4. `docs/performance/load-test-results.md` — baseline 수치 기록
  5. CI job은 수동 트리거만 (main merge 시 스킵)
- Acceptance:
  - 3개 스크립트 실행 가능
  - baseline 수치 문서화
  - 병목 1개 이상 식별 + 별도 티켓 등록
- Commit: `test(load): add k6 load tests and baseline results`

---

## T-1606 테스트 커버리지 리포트 (P1)

- Status: [x] DONE
- Depends on: —
- Goal: vitest + forge coverage 를 CI 아티팩트로 업로드하고 주요 수치를 README 뱃지로 노출.
- Scope:
  - **CI**: coverage collection + upload
- Tasks:
  1. `vitest.config` 전역에 `coverage: { provider: 'v8', reporter: ['text','lcov','json'] }`
  2. `forge coverage --report lcov` 실행
  3. CI: `codecov/codecov-action` 로 upload (또는 Coveralls)
  4. README에 coverage 뱃지
  5. 목표 임계치: contracts 85%, services 70%, web 50% (점진)
  6. 임계치 미달 시 CI warning (블로킹 아님)
- Acceptance:
  - Codecov에 3개 리포트 업로드
  - 뱃지 표시
  - 임계치 설정 문서화
- Commit: `ci(test): add coverage collection and Codecov upload`

---

# M17 — Developer Experience & CI/CD (P1)

> **Goal**: 실수로 나쁜 코드가 머지되는 것을 예방. 새로운 기여자가 1시간 안에 로컬에서 실행할 수 있어야 함.

---

## T-1701 Pre-commit hooks (husky + lint-staged) (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 커밋 시 자동으로 lint + typecheck + prettier 실행.
- Scope:
  - **husky**: pre-commit + commit-msg hook
- Tasks:
  1. `pnpm add -D -w husky lint-staged`
  2. `pnpm exec husky init`
  3. `.husky/pre-commit`:
     ```sh
     pnpm exec lint-staged
     ```
  4. `package.json` `lint-staged`:
     - `*.{ts,tsx}`: eslint --fix + prettier
     - `*.sol`: solhint
  5. `.husky/commit-msg`:
     - commitlint 또는 정규식으로 Conventional Commit 검증
  6. `CONTRIBUTING.md` 에 설치/우회 방법 문서화
- Acceptance:
  - 불량 커밋이 로컬에서 차단됨
  - CI는 이전처럼 계속 동작
  - `--no-verify` 는 비상용으로만 허용
- Commit: `chore(dx): add husky pre-commit and commit-msg hooks`

---

## T-1702 ESLint + Prettier 명시적 설정 (P1)

- Status: [x] DONE
- Depends on: T-1701
- Goal: 프로젝트 루트에 명시적 ESLint/Prettier 설정 파일 추가 + 모든 패키지가 상속.
- Scope:
  - **root**: .eslintrc.cjs, .prettierrc, .editorconfig
- Tasks:
  1. `.eslintrc.cjs`:
     - extends: `eslint:recommended`, `@typescript-eslint/recommended`, `next/core-web-vitals`
     - rules: no-floating-promises, consistent-type-imports, import ordering
  2. `.prettierrc`:
     - printWidth 100, singleQuote, trailingComma "all", tabWidth 2
  3. `.editorconfig` (기본)
  4. 기존 코드 `pnpm lint --fix && pnpm format` 로 정리 (별도 커밋)
- Acceptance:
  - `pnpm lint` 전체 통과
  - `pnpm format` 실행 시 변경 없음 (정리 후)
- Commit: `chore(dx): add explicit ESLint, Prettier, EditorConfig`

---

## T-1703 Turborepo 빌드 캐시 (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 모노레포 빌드/테스트 시간 단축 위해 Turbo 도입.
- Scope:
  - **root**: turbo.json
- Tasks:
  1. `pnpm add -D -w turbo`
  2. `turbo.json`:
     - pipeline: build, test, lint, typecheck
     - dependsOn: `^build`
     - outputs: dist/**, .next/**
  3. 기존 `package.json` scripts 를 `turbo run X` 로 전환
  4. CI `actions/cache` 로 `.turbo` 디렉토리 캐싱
- Acceptance:
  - `turbo run build` 2회째 실행 시 캐시 히트 (대부분 skip)
  - CI 빌드 시간 30% 이상 단축
- Commit: `chore(dx): add Turborepo for build caching`

---

## T-1704 Branch protection & code review rules (P1)

- Status: [x] DONE
- Depends on: T-1306
- Goal: `main` 브랜치에 직접 push 금지, CI 통과 + 1 review 필수.
- Scope:
  - **GitHub settings**: branch protection (gh cli 또는 문서)
- Tasks:
  1. `docs/repo/branch-protection.md` 설정 기록:
     - Required status checks: contracts, typecheck, lint, e2e, security
     - Require pull request before merging
     - Required approvals: 1
     - Dismiss stale approvals on new commits
     - Require linear history
  2. `gh api --method PUT repos/:owner/:repo/branches/main/protection ...` 스크립트 `scripts/repo/apply-branch-protection.sh`
  3. README의 "Contributing" 섹션 업데이트
- Acceptance:
  - main 직접 push 차단
  - CI 실패 PR은 merge 불가
- Commit: `docs(repo): add branch protection policy and script`

---

## T-1705 CONTRIBUTING.md + PR template + CODEOWNERS (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 기여자 온보딩 문서 + PR/issue 템플릿.
- Scope:
  - **repo**: CONTRIBUTING, templates, CODEOWNERS
- Tasks:
  1. `CONTRIBUTING.md`:
     - 로컬 셋업 (pnpm i, foundry, anvil)
     - 테스트 실행법
     - 커밋 스타일 (Conventional Commits)
     - PR 프로세스
  2. `.github/PULL_REQUEST_TEMPLATE.md`:
     - Summary / Test plan / Related ticket
  3. `.github/ISSUE_TEMPLATE/bug.md`, `feature.md`
  4. `.github/CODEOWNERS`:
     - contracts/ → @solidity-team
     - apps/web/ → @frontend
     - etc. (팀 단계 이전에는 개인 할당)
- Acceptance:
  - 새 PR 생성 시 템플릿 자동 로드
  - CODEOWNERS 기반 auto-assign 동작
- Commit: `chore(repo): add contributing docs, PR template, codeowners`

---

## T-1706 로컬 devcontainer (P1)

- Status: [x] DONE
- Depends on: —
- Goal: VSCode devcontainer 로 원클릭 로컬 개발 환경. 신규 기여자가 pnpm/foundry/anvil 수동 설치 불필요.
- Scope:
  - **.devcontainer**: Dockerfile + devcontainer.json
- Tasks:
  1. `.devcontainer/Dockerfile`:
     - base: node:20
     - install pnpm, foundry (foundryup), docker CLI
     - pre-install workspace deps
  2. `.devcontainer/devcontainer.json`:
     - extensions: esbenp.prettier, dbaeumer.vscode-eslint, juanblanco.solidity
     - postCreateCommand: `pnpm install && pnpm build`
     - forwardPorts: 3000, 4000, 4001, 8545
  3. `LOCAL.md` 에 devcontainer 사용법 추가
- Acceptance:
  - "Reopen in Container" 로 10분 내 full 환경 부팅
  - `pnpm test` 즉시 실행 가능
- Commit: `chore(dx): add VSCode devcontainer`

---

# M18 — Documentation & API Contracts (P1)

## T-1801 OpenAPI specs for HTTP services (P1)

- Status: [x] DONE
- Depends on: —
- Goal: indexer / ownerview / fleet REST API를 OpenAPI 3 로 문서화 + Swagger UI 노출.
- Scope:
  - **tooling**: `zod-to-openapi` 또는 수동 YAML
- Tasks:
  1. 각 서비스의 라우트 → zod 스키마로 검증 (현재 수동이면 zod 도입)
  2. `@asteasolutions/zod-to-openapi` 로 spec 자동 생성
  3. `/openapi.json` + `/docs` (Swagger UI) 엔드포인트
  4. CI에서 spec validity 검증 (`swagger-cli validate`)
  5. README 에 API 문서 링크
- Acceptance:
  - 3개 서비스 모두 `/docs` 페이지 접근 가능
  - CI spec validation 통과
  - 모든 라우트의 request/response 스키마 존재
- Commit: `feat(services): add OpenAPI specs and Swagger UI`

---

## T-1802 Architecture Decision Records (P1)

- Status: [x] DONE
- Depends on: —
- Goal: 주요 설계 결정을 ADR 형식으로 기록.
- Scope:
  - **docs/adr**
- Tasks:
  1. `docs/adr/0001-monorepo-layout.md`
  2. `docs/adr/0002-wallet-only-auth.md`
  3. `docs/adr/0003-commit-reveal-holecards.md`
  4. `docs/adr/0004-accretive-only-rebalancing.md`
  5. `docs/adr/0005-custom-circuit-breaker-vs-library.md`
  6. `docs/adr/0006-raw-sql-migrations.md`
  7. ADR 템플릿: `docs/adr/template.md` (Status/Context/Decision/Consequences)
- Acceptance:
  - 6개 ADR 존재, 모두 Accepted 상태
  - README 링크
- Commit: `docs(adr): add initial architecture decision records`

---

## T-1803 Runbook 통합 & SLO 정의 (P1)

- Status: [x] DONE
- Depends on: T-1401, T-1403, T-1405
- Goal: `DEPLOY.md`, `docs/runbook.md`, `RAILWAY.md`, `LOCAL.md` 를 일관된 구조로 통합 + SLO 명시.
- Scope:
  - **docs**: 통합된 운영 문서
- Tasks:
  1. `docs/operations/` 디렉토리 신설:
     - `01-architecture.md`
     - `02-deployment.md` (DEPLOY.md 흡수)
     - `03-local-dev.md` (LOCAL.md 흡수)
     - `04-runbook-incidents.md`
     - `05-runbook-routine.md`
     - `06-slo.md`
  2. SLO 정의 (`06-slo.md`):
     - Web app: 99.5% uptime, P95 TTFB < 800ms
     - Indexer block lag: P95 < 30s
     - Ownerview auth: P95 < 500ms, error rate < 1%
     - Agent bot: action success rate > 98%
  3. 이전 문서는 redirect 스텁으로 변경 (삭제 금지)
- Acceptance:
  - 통합 문서 구조 완성
  - SLO 측정 방식이 Grafana 쿼리와 1:1 매핑
- Commit: `docs(ops): unify runbooks and define SLOs`

---

## T-1804 DB ER diagram & data dictionary (P1)

- Status: [x] DONE
- Depends on: —
- Goal: Postgres 스키마를 자동 추출하여 ER 다이어그램 + 컬럼 설명 생성.
- Scope:
  - **tooling**: schemaspy 또는 dbdocs
- Tasks:
  1. `scripts/db/generate-er.sh`:
     - schemaspy Docker 이미지로 HTML 생성
     - 산출물: `docs/db/er-diagram/`
  2. `docs/db/data-dictionary.md` — 테이블별 설명
  3. CI에서 schema drift 검증 (선택)
- Acceptance:
  - ER 다이어그램 이미지 생성
  - 모든 테이블이 dictionary 에 기술됨
- Commit: `docs(db): add ER diagram and data dictionary`

---

# M19 — Performance & Scale (P2)

## T-1901 Redis 캐싱 레이어 (P2)

- Status: [x] DONE
- Depends on: —
- Goal: 인덱서 핫 쿼리(leaderboard, recent hands)에 Redis 캐시 도입.
- Scope:
  - **indexer**: Redis client + TTL 캐시
- Tasks:
  1. `services/indexer/src/cache/redis.ts` — ioredis client
  2. `getLeaderboard()`, `getRecentHands()`, `getAgentProfile()` 에 캐시 적용 (TTL 10s)
  3. invalidation: 해당 이벤트 인덱싱 시 해당 키 delete
  4. docker-compose 에 redis 서비스
  5. 메트릭: `railbird_cache_hit_total{key}`, `_miss_total`
- Acceptance:
  - leaderboard 쿼리 P95 latency 50% 이상 감소
  - cache hit ratio > 70% (정상 부하)
- Commit: `feat(indexer): add Redis caching for hot queries`

---

## T-1902 DB 인덱스 감사 & 튜닝 (P2)

- Status: [x] DONE
- Depends on: —
- Goal: EXPLAIN ANALYZE 로 느린 쿼리 식별 → 인덱스 추가.
- Tasks:
  1. `scripts/db/slow-queries.sh` — pg_stat_statements 상위 20개 출력
  2. 각 쿼리에 대해 EXPLAIN → 필요 시 migration 추가
  3. 결과 문서: `docs/db/indexing-review.md`
- Acceptance:
  - 느린 쿼리 top 5 모두 < 100ms
- Commit: `perf(indexer): add DB indexes based on slow query analysis`

---

## T-1903 Frontend 번들 최적화 (P2)

- Status: [x] DONE
- Depends on: —
- Goal: Next.js 번들 사이즈 축소 + lazy loading 확대.
- Tasks:
  1. `ANALYZE=true pnpm build` 분석 후 큰 모듈 식별
  2. 차트/애니메이션 라이브러리 `next/dynamic` 으로 전환
  3. unused imports 제거
  4. `docs/performance/bundle-report.md`
  5. CI에서 bundle size check (`size-limit`)
- Acceptance:
  - 초기 JS 번들 300KB (gzipped) 이하
  - size-limit CI 통과
- Commit: `perf(web): optimize bundle size with lazy loading`

---

## T-1904 RPC batch 호출 (P2)

- Status: [x] DONE
- Depends on: —
- Goal: 인덱서가 `eth_getLogs` + `eth_getBlock` 등을 single batch RPC로 묶어 호출 수 축소.
- Tasks:
  1. viem `multicall` 활용한 read 호출 배칭
  2. 인덱서 listener에서 연속된 블록의 receipt 배칭
  3. 메트릭: `railbird_rpc_calls_total{op}` 감소 확인
- Acceptance:
  - RPC 호출 수 40% 이상 감소 (동일 워크로드 기준)
- Commit: `perf(indexer,bots): batch RPC calls via multicall`

---

## T-1905 Agent 프로세스 격리 (P2)

- Status: [x] DONE
- Depends on: —
- Goal: Fleet 관리 에이전트들이 단일 프로세스 내 충돌 시 전체가 죽지 않도록 워커 프로세스 격리.
- Tasks:
  1. `services/fleet/src/spawner.ts` 개선:
     - 각 agent → 독립 child_process + 자동 재시작
     - bulkhead: 1개 crash가 다른 agent에 영향 없음
  2. 메트릭: `railbird_fleet_agent_restarts_total`
- Acceptance:
  - 특정 agent kill → 30초 내 자동 재시작
  - 다른 agent 영향 없음
- Commit: `feat(fleet): isolate agents per worker process`

---

## T-1906 WebSocket 압축 & batching (P2)

- Status: [x] DONE
- Depends on: —
- Goal: WS 메시지를 permessage-deflate 압축 + 50ms 윈도우 batching.
- Tasks:
  1. ws 라이브러리 옵션: `perMessageDeflate: { threshold: 1024 }`
  2. broadcast 시 50ms 윈도우로 묶어 단일 payload 전송
  3. client(apps/web) decoder 대응
- Acceptance:
  - WS 대역폭 30% 이상 절감
  - 지각 P95 < 100ms
- Commit: `perf(indexer,web): add WS compression and batching`

---

# M20 — Deployment & Infrastructure (P2)

## T-2001 Docker multi-stage 빌드 최적화 (P2)

- Status: [x] DONE
- Depends on: —
- Goal: 각 서비스 이미지 크기 < 200MB, 빌드 캐시 최대 활용.
- Tasks:
  1. 각 `Dockerfile` 을 multi-stage (builder / runtime) 패턴으로 통일
  2. `node:20-slim` → `node:20-alpine` 검토
  3. `docker slim` 또는 `dive` 로 사이즈 측정
  4. CI에 image size gate (`dockle`)
- Acceptance:
  - 5개 서비스 이미지 모두 < 200MB
- Commit: `perf(infra): optimize Dockerfiles with multi-stage builds`

---

## T-2002 Staging 환경 셋업 (P2)

- Status: [x] DONE
- Depends on: T-1302
- Goal: main merge 시 자동 배포되는 staging 환경 구축.
- Tasks:
  1. Railway에 staging project 생성
  2. Vercel preview → staging 도메인 매핑
  3. GitHub Actions deploy job (main 브랜치 전용)
  4. staging 전용 chain (testnet) + 별도 컨트랙트 주소
  5. `docs/operations/02-deployment.md` 업데이트
- Acceptance:
  - main merge → 5분 내 staging 자동 배포
  - staging vs prod 독립
- Commit: `feat(infra): add staging environment with auto-deploy`

---

## T-2003 Blue-green / canary 배포 (P2)

- Status: [x] DONE
- Depends on: T-2002
- Goal: 배포 시 다운타임 0. 카나리 5분 관찰 후 전체 승격.
- Tasks:
  1. Railway replica 기능 활용 (또는 Kubernetes 이전)
  2. 배포 스크립트: 새 버전 → 5% 트래픽 → 메트릭 확인 → 전체 승격
  3. rollback 스크립트
- Acceptance:
  - 배포 중 5xx 에러율 증가 없음
  - 실패 시 1분 내 자동 롤백
- Commit: `feat(infra): add canary deployment strategy`

---

## T-2004 IaC (Terraform or Pulumi) (P2)

- Status: [x] DONE
- Depends on: —
- Goal: 인프라를 코드로 관리 — Railway 프로젝트, DNS, Vercel 설정, Cloudflare WAF.
- Tasks:
  1. `infra/terraform/` 구조 생성
  2. 현재 Railway 설정을 import
  3. DNS 레코드 IaC 화
  4. Cloudflare zone + WAF rule
- Acceptance:
  - `terraform plan` 으로 현재 상태와 diff 없음
  - 문서화된 apply 절차
- Commit: `feat(infra): add Terraform for Railway, DNS, Cloudflare`

---

## T-2005 Image vulnerability scanning (P2)

- Status: [x] DONE
- Depends on: —
- Goal: 빌드된 Docker 이미지에 대해 Trivy 또는 Grype 취약점 스캔.
- Tasks:
  1. CI job `image-scan`:
     - `aquasecurity/trivy-action`
     - fail on CRITICAL
  2. `.trivyignore` — 예외 관리
- Acceptance:
  - 5개 이미지 모두 CRITICAL 0
  - CI 블로킹
- Commit: `ci(security): add Trivy image vulnerability scanning`

---

# M21 — Frontend Production Polish (P2)

## T-2101 SEO & 소셜 메타 (P2)

- Tasks:
  1. `apps/web/src/app/robots.ts` (Next.js built-in)
  2. `apps/web/src/app/sitemap.ts`
  3. 각 페이지 `metadata.openGraph`, `twitter` (og:image 제작 포함)
  4. `app/icon.png`, `app/apple-icon.png`
- Acceptance:
  - Lighthouse SEO 95+
  - Twitter / Slack 링크 프리뷰 정상
- Commit: `feat(web): add SEO metadata, robots, sitemap, OG images`

---

## T-2102 Analytics (P2)

- Tasks:
  1. Vercel Analytics 또는 Plausible 통합
  2. 주요 이벤트 트래킹: wallet_connect, table_view, bet_place, agent_create
  3. PII 제외 확인
- Acceptance:
  - 이벤트 dashboard 생성
- Commit: `feat(web): add privacy-friendly analytics`

---

## T-2103 Not-found & 500 에러 페이지 (P2)

- Tasks:
  1. `app/not-found.tsx`
  2. `app/global-error.tsx`
  3. 커스텀 스타일, 홈 복귀 CTA
- Commit: `feat(web): add custom 404 and 500 pages`

---

## T-2104 Font 최적화 (P2)

- Tasks:
  1. `next/font` 로 변경 (Google Fonts 셀프 호스팅)
  2. `display: swap`
  3. preload 주요 weight만
- Commit: `perf(web): optimize font loading with next/font`

---

## T-2105 Performance budget + Lighthouse CI (P2)

- Tasks:
  1. `lighthouse-ci` CI job
  2. budget: perf 85+, a11y 95+, best-practices 95+, SEO 95+
  3. PR comment 에 리포트 첨부
- Commit: `ci(web): add Lighthouse CI with performance budget`

---

## T-2106 Mobile 반응형 감사 (P2)

- Tasks:
  1. 주요 페이지 mobile viewport (375px) 수동 검증
  2. 깨진 레이아웃 수정
  3. Playwright mobile emulation 테스트
- Commit: `fix(web): audit and fix mobile responsive layout`

---

# 실행 우선순위 요약

## 즉시 (P0 블로커) — 런칭 전 반드시

1. **T-1301** Git history secret audit
2. **T-1302** Secrets manager 도입
3. **T-1303** Legal pages (ToS, Privacy, Disclaimer)
4. **T-1304** Auth rate limiting + audit log
5. **T-1305** CORS deny-by-default
6. **T-1306** Dependency/SCA scanning

## 필수 (P1) — 런칭 직후 2주 내

- M14 Observability 전체
- M15 Reliability 전체
- M16 Testing expansion (특히 T-1601 invariant, T-1602 e2e)
- M17 DX (T-1701 pre-commit, T-1704 branch protection)
- M18 Documentation (T-1801 OpenAPI)

## 후순위 (P2) — 런칭 후 1~3개월

- M19 Performance & scale
- M20 Deployment & infra 고도화
- M21 Frontend polish

---

# 티켓 러너 가이드

1. `TICKET.md` 와 동일한 실행 알고리즘 적용
2. M13 부터 순서대로 실행 (P0 → P1 → P2)
3. 한 티켓 = 한 커밋 (Conventional Commit)
4. 실패 시 즉시 중단 + 사용자 보고
5. 각 마일스톤 종료 시 `TODO.md` 상단의 status 표 갱신

---

**Total tickets**: 46
**P0 tickets**: 6 (M13)
**P1 tickets**: 28 (M14 ~ M18)
**P2 tickets**: 22 (M19 ~ M21)
