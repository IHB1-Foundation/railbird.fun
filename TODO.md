# TODO.md — Hackathon Submission Checklist

> **Hackathon**: On-Chain Horizon Hackathon
> **Deadline**: 2026-04-15 23:59 (GMT+8) — **D-2**
> **Demo Day**: 2026-04-22 (AWS) / 2026-04-23 (Web3 Festival)
> **Audit Date**: 2026-04-13

---

## Legend

- [ ] TODO
- [~] IN PROGRESS
- [x] DONE

---

## P0 — BLOCKER (제출 전 반드시 해결)

### B-1: `SUBMISSION.md` On-Chain Evidence 전부 TBD

- [x] 9개 배포 tx + 11개 게임 라이프사이클 tx = 총 20개 트랜잭션 기입 완료
- 배포: ChipToken, PokerTable 1/2, PlayerRegistry, PlayerVault, VRFAdapter + Vault setup 3건
- 게임: registerSeat x2, startHand, submitHoleCommit, advanceToPreflop, VRF fulfill, fold, check, call, raise, revealHoleCards, settleShowdown, settlement by fold
- `registerEncryptionKey`만 미포함 (배포된 바이트코드에 미포함 — OwnerView 서비스에서 오프체인 처리)

### B-2: 데모 비디오 없음

- [ ] DoraHacks 제출용 데모 비디오 녹화 필요
- `docs/demo-script.md` (3분 워크스루)는 있지만 실제 영상 파일 없음
- 해결: demo-script.md 기반으로 3분 스크린 레코딩 (OBS/QuickTime) + 업로드

### B-3: `pnpm build` (root) 실패 — `packageManager` 필드 누락

- [x] `package.json`에 `"packageManager": "pnpm@9.14.4"` 추가
- Turbo가 workspace 해석 실패 → 모든 root-level 빌드/테스트/린트 명령 불가
- 개별 패키지 빌드(`apps/web`, `contracts`)는 성공하지만 CI 파이프라인 전체가 깨짐

### B-4: Foundry 테스트 84개 실패 (332 통과)

- [x] `TrustlessDealerTest` 6개 실패 — 에러 메시지 코드 정렬 완료
- [x] `VaultTableIntegration` — vault notification 추가 + MockVault로 테스트 수정
- [x] `SeatManagerTest` / `SeatLifecycleTest` — 에러 메시지 불일치 수정
- [x] `ShuffleVerifier` 1개 실패 — 에러 메시지 수정
- [x] `PokerTableTest` 40개 + `PauseEmergencyTest` 4개 + `PlayerRegistryIntegrationTest` 2개 — 전부 수정
- [x] `ProductionVRFAdapterTest` 1개 — V1 에러코드 정렬
- **결과: 416 pass / 0 fail (전부 통과)**

### B-5: KYC SBT — enforce 불필요, 문서 정리만

- [x] 인터페이스/스토리지는 존재, 실제 enforce 안 함 (의도된 설계)
- [x] README/SUBMISSION에서 "KYC SBT Gate enforced" → "KYC SBT ready (opt-in)" 수정 완료

### B-6: SideBetPool 배포 스크립트 누락

- [x] `DeployHashKey.s.sol`에 SideBetPool 배포 로직 추가 완료
- 사이드벳이 데모 핵심 피처인데 배포 안 됨
- 해결: deploy 스크립트에 SideBetPool 추가 + 테스트넷 재배포

---

## P1 — HIGH (데모 품질에 직접 영향)

### H-1: `og-image.png` 누락

- [ ] `apps/web/public/og-image.png` (1200x630) 없음
- 소셜 공유 시 (Twitter/Discord/DoraHacks) 썸네일 깨짐
- 해결: 브랜드 에셋 (`apps/web/public/brand/`) 기반으로 OG 이미지 생성

### H-2: 도메인 불일치 — `railbird.xyz` vs `railbird.fun`

- [x] `layout.tsx` 기본값 `railbird.fun`으로 통일 완료
- OG meta, sitemap, robots.txt에 잘못된 도메인 노출 가능
- 해결: `NEXT_PUBLIC_APP_URL` 통일 또는 layout.tsx 기본값을 `railbird.fun`으로 변경

### H-3: `next.config.js` 프로덕션 fallback URL이 Railway raw URL

- [ ] `indexer-production-4bb1.up.railway.app`, `ownerview-production.up.railway.app`
- `NEXT_PUBLIC_*` 환경변수 미설정 시 커스텀 도메인 대신 Railway URL 사용
- 데모 중 환경변수 누락 시 동작은 하지만 URL이 프로페셔널하지 않음

### H-4: `/verify` 페이지가 메인 네비게이션에 없음

- [x] `MobileNav.tsx`에 "Verify" 링크 추가 완료

### H-5: TypeScript 에러 4개 (테스트 파일)

- [x] `components.test.tsx` — mock 타입 불일치 수정
- [x] `holeCardDecrypt.test.ts` — Uint8Array/BufferSource 불일치 수정
- [x] `scenario-harness.test.tsx` — Response mock 타입 불일치 수정
- 프로덕션 코드에는 에러 0개, 테스트만 해당
- CI에서 typecheck가 돌면 실패할 수 있음

---

## P2 — MEDIUM (있으면 좋지만 제출 가능)

### M-1: SUBMISSION.md 컨트랙트 주소 불일치

- [x] SUBMISSION.md 주소 업데이트 완료
- 어떤 게 최신인지 확인 → SUBMISSION.md 업데이트 필요

### M-2: `/quiz` 페이지 "Coming soon" 플레이스홀더

- [ ] 심사위원이 클릭할 수 있음 — 버튼 비활성화 + "Coming soon" 표시 중
- 해결 옵션: 네비에서 제거하거나, 더 명확한 메시지로 교체

### M-3: `useGodMode` 훅 데드코드

- [ ] 프로덕션에서 안전(no-op)하지만, 코드 리뷰 시 인상 안 좋을 수 있음
- 우선순위 낮음

### M-4: Foundry optimizer OFF (기본 프로필)

- [ ] deploy 프로필에서는 ON이지만, 기본 테스트 프로필은 OFF
- 가스비 최적화 관점에서 deploy 프로필 사용 확인 필요

### M-5: `.env.hashkey`에 실제 private key 커밋됨

- [ ] 테스트넷 전용이라 기능적 이슈 없지만, 공개 레포에서 보안 인상 안 좋음
- README에 "testnet only" 명시되어 있으나, 심사위원 관점 고려

### M-6: README에 License 불일치

- [x] 라이선스 표기 통일 완료
- 해커톤 공개 레포에서 혼동 유발

---

## P3 — LOW (데모 후 또는 수상 후)

### L-1: Forge 컨트랙트 lint warnings

- [ ] unchecked ERC20 transfers, unsafe typecasts, unaliased imports 등
- 컴파일은 성공, 기능 영향 없음

### L-2: ESLint warnings 6개 (web)

- [ ] unused variables, useRef 제안 등
- 빌드 성공에 영향 없음

### L-3: `/compendium`, `/sidebets/leaderboard` 네비 미노출

- [ ] 직접 URL로만 접근 가능, 메인 네비에 없음
- 핵심 데모 경로 아님

### L-4: Pitch Deck `.pptx` 미커밋 (untracked)

- [ ] `Railbird_Pitch_Deck.pptx` — git untracked 상태
- 필요 시 커밋 또는 별도 공유

---

## 현재 상태 요약

| 카테고리                 | 상태                              |
| ------------------------ | --------------------------------- |
| 웹앱 빌드                | PASS (Next.js 20 pages, 0 errors) |
| 컨트랙트 빌드            | PASS (warnings only)              |
| 루트 빌드 (`pnpm build`) | PASS (packageManager 추가됨)      |
| Foundry 테스트           | **416 pass / 0 fail**             |
| TypeScript               | PASS (0 errors)                   |
| 데모 스크립트            | READY (3분 워크스루)              |
| 피치 스크립트            | READY (6분 12슬라이드)            |
| 배포 인프라              | READY (Vercel + Railway + Docker) |
| 온체인 Evidence          | DONE (20 tx 기입)                 |
| 데모 비디오              | **MISSING**                       |
| KYC SBT                  | DONE (opt-in, 문서 수정 완료)     |
| SideBetPool 배포         | DONE (deploy script 추가)         |

### 완료된 피처 (TICKET.md M12 기준)

| 티켓   | 설명                       | 상태 |
| ------ | -------------------------- | ---- |
| T-1201 | On-chain Side Betting      | DONE |
| T-1202 | Open Agent Registration    | DONE |
| T-1203 | Opponent Modeling          | DONE |
| T-1204 | Live ESPN Mode             | DONE |
| T-1205 | Deep Explainability (Why?) | DONE |
| T-1206 | On-chain AI Audit Trail    | DONE |

모든 M12 피처 티켓 완료. P0 블로커 해결 완료 (B-2 데모 비디오 제외). **남은 과제: 데모 비디오 녹화(B-2), og-image 생성(H-1), Railway URL 정리(H-3).**
