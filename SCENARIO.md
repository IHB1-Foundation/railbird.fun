# SCENARIO.md — User Scenarios by Role

> PlayerCo 플랫폼의 모든 유저 역할별 상세 시나리오.
> 각 시나리오는 유저의 동기, 진입 경로, 핵심 플로우, 엣지 케이스를 포함한다.

---

## Roles Overview

| Role | Wallet 필요 | 핵심 가치 | 주요 페이지 |
|------|:-----------:|-----------|------------|
| Spectator | No | AI 대결 관전 엔터테인먼트 | `/live`, `/table/:id`, `/leaderboard` |
| Bettor | Yes | AI 매치에 사이드벳으로 수익 | `/table/:id` (BettingPanel), `/live` |
| Agent Owner | Yes | 나만의 AI 에이전트 생성/운영 | `/create-agent`, `/me`, `/agent/:token` |
| Trader | Yes | 에이전트 토큰 매매 차익 | `/agent/:token` (nad.fun widget) |
| Judge (Demo) | No | 30초 안에 플랫폼 이해 | `/live` → `/create-agent` → `/verify` |
| Keeper (Bot) | Yes (자동) | 게임 라이브니스 유지 | N/A (백엔드) |
| Admin | Yes (multisig) | 긴급 정지/파라미터 관리 | N/A (컨트랙트 직접) |

---

## 1. Spectator (관전자)

### 1.1 동기
- "AI끼리 포커 치는 거 구경하고 싶다"
- 지갑 없이도, 회원가입 없이도 바로 볼 수 있어야 함

### 1.2 시나리오: 첫 방문 — "뭐 하는 사이트지?"

**진입**: 링크 클릭 또는 직접 URL 접속

1. **랜딩 (`/`)** → 로비 페이지
   - 현재 진행 중인 테이블 목록이 보임
   - 각 테이블: 에이전트 이름/이모지, 현재 팟 크기, 스트리트, 최근 액션
   - "가장 활발한 테이블" 자동 하이라이트
   - **CTA**: "Watch Live" 버튼 → `/live`로 이동

2. **라이브 페이지 (`/live`)** — ESPN Mode
   - 풀스크린 최적화, 자동으로 가장 활발한 테이블 선택
   - 보이는 것:
     - 커뮤니티 카드 + 팟 + 시트별 칩 스택
     - "LIVE" 빨간 점 배지
     - AI Commentary 오버레이 (스포츠 중계 톤)
     - 에이전트 카드 (이름/이모지/스택/ELO)
     - AI Thinking 요약 (마지막 액션의 reasoning 2줄)
     - 사이드벳 풀 크기 + 배당률 (읽기 전용)
     - Stats Ticker (오늘 총 핸드, 가장 큰 팟, 현재 리더)
   - 올인 → 화면 테두리 glow 효과
   - 쇼다운 → 결과 오버레이 (승자 + 핸드 + 팟)
   - 큰 팟(평균 3배+) → "BIG POT" 배지
   - 여러 테이블 있으면 자동 전환 (쇼다운 임박, 올인, 큰 팟 기준)

3. **테이블 상세 (`/table/:id`)**
   - 특정 테이블의 상세 뷰
   - Action Log: 모든 액션 타임라인 (블록 넘버 + 타임스탬프)
   - 각 AI 액션의 "Why?" 버튼 클릭 → Decision Breakdown 펼침:
     - Hand Strength + percentile bar
     - Pot Odds + equity bar
     - EV Estimate (+/- 컬러코딩)
     - Opponent Read
     - Key Factor
     - Confidence 게이지 (0-100)
     - GTO Deviation 표시
   - VRF 상태 위젯 (커뮤니티 카드 생성 투명성)
   - 30분 타이머 카운트다운

4. **에이전트 프로필 (`/agent/:token`)**
   - 에이전트 기본 정보: 이름, 이모지, 전략 레이더 차트
   - Treasury: A/B/N/P 수치
   - 최근 PnL 그래프
   - "Verified AI" 배지 (최근 20핸드 reasoning hash 전부 온체인 존재 시)
   - Opponent Reads 섹션: 최근 핸드의 상대 프로필 (VPIP/PFR/AF + 스타일 배지)
   - Rebalancing History
   - nad.fun 트레이딩 위젯 (지갑 미연결 시 "Connect Wallet to Trade" 표시)

5. **리더보드 (`/leaderboard`)**
   - ROI, 누적 PnL, 승률, MDD 기준 정렬
   - 기간 필터: 24h / 7d / 30d / All
   - 에이전트 클릭 → `/agent/:token`으로 이동

6. **AI Decision Verifier (`/verify`)**
   - table address + hand ID 입력
   - 해당 핸드의 모든 AI 결정 목록
   - 각 결정: action + reasoning 요약 + on-chain hash + verification status
   - "Verify" 버튼 → hash 재계산 → 온체인 대조
   - 결과: "All decisions verified" / "Mismatch found at seat X"

### 1.3 엣지 케이스
- **데이터 없음**: `/live` 접속 시 활성 테이블 없으면 → "Waiting for next hand..." 표시
- **VRF 지연**: VRF 콜백 대기 중 → "Dealing cards..." 상태 표시, 스피너
- **모바일**: 세로 레이아웃 반응형, 사이드바가 하단으로 이동
- **테이블 전환**: 보던 테이블 핸드 종료 → 자동으로 다음 활발한 테이블로 전환 (수동 선택도 가능)

---

## 2. Bettor (사이드벳 참여자)

### 2.1 동기
- "저 에이전트가 이길 것 같은데, 베팅해볼까"
- Spectator에서 시작해서 지갑 연결 후 베팅으로 전환

### 2.2 시나리오 A: 첫 사이드벳

**전제**: RCHIP(ChipToken) 보유, 지갑 연결됨

1. **테이블 뷰어 (`/table/:id`)** 에서 "Side Bets" 탭/패널 확인
   - 각 시트별 현재 총 베팅액 표시
   - 시트별 implied odds 표시 (e.g., Seat 0: 1.8x / Seat 1: 2.2x)
   - 현재 사이드벳 풀 총액

2. **베팅 실행**
   - 에이전트 시트 선택 (e.g., "Seat 0 — SharkBot 🦈")
   - 금액 입력 (RCHIP 단위)
   - **Step 1**: ChipToken `approve(SideBetPool, amount)` 트랜잭션
   - **Step 2**: `SideBetPool.placeBet(table, handId, seatIndex)` 트랜잭션
   - 트랜잭션 상태: pending → confirmed → "Bet Placed!"
   - 풀 크기 + odds 실시간 업데이트

3. **경기 관전**
   - 베팅 후 해당 핸드 결과 대기
   - 베팅한 시트 하이라이트 표시
   - AI Commentary로 상황 파악

4. **정산 및 클레임**
   - 핸드 종료 (fold 또는 showdown) → `HandSettled` 이벤트
   - KeeperBot이 `settleBets()` 자동 호출
   - **이겼을 경우**:
     - "You Won!" 알림 + payout 금액 표시
     - "Claim" 버튼 → `SideBetPool.claimWinnings(table, handId)` 트랜잭션
     - payout = `userBetOnWinner * totalPool / seatTotals[winnerSeat]`
   - **졌을 경우**:
     - "Better luck next hand" 표시
     - 베팅 기록은 조회 가능

### 2.3 시나리오 B: 연속 베팅 (파워 유저)

1. 여러 핸드에 걸쳐 연속 베팅
2. `/sidebets/leaderboard` 에서 사이드벳 수익 랭킹 확인
3. 특정 에이전트의 승률/스타일을 분석한 후 전략적으로 베팅
   - Agent Profile에서 VPIP/PFR/AF 참고
   - Opponent Modeling 결과로 매치업 유리/불리 판단

### 2.4 엣지 케이스
- **지갑 미연결**: 베팅 시도 → "Connect Wallet" 프롬프트
- **잔고 부족**: RCHIP 잔고 < 베팅 금액 → "Insufficient RCHIP balance" 에러
- **이미 정산된 풀**: settle 된 핸드에 베팅 시도 → 컨트랙트 revert "Pool already settled"
- **베팅 가능 시간 외**: BETTING_PRE ~ BETTING_RIVER 외 상태에서 베팅 시도 → revert
- **중복 클레임**: 이미 claim한 bet에 다시 claim → revert (Bet.claimed flag)
- **빈 풀**: 아무도 안 건 풀 settle → 정상 처리 (분배할 것 없음)
- **트랜잭션 실패**: 네트워크 오류 등 → 실패 상태 표시 + 재시도 안내

---

## 3. Agent Owner (에이전트 소유자)

### 3.1 동기
- "나만의 AI 에이전트를 만들어서 포커 테이블에 앉히고 싶다"
- 에이전트 전략 커스터마이징, 성과 모니터링, hole card 확인

### 3.2 시나리오 A: 에이전트 생성 (Create Agent Wizard)

**전제**: 지갑 연결됨, RCHIP 보유 (buy-in용)

1. **네비게이션** → "Create Agent" 클릭

2. **Step 1: Connect Wallet**
   - 지갑 연결 상태 확인
   - 미연결 시 연결 프롬프트

3. **Step 2: Persona Config**
   - **Agent Name**: 텍스트 입력 (1-24자), e.g., "DeepShark"
   - **Emoji 선택**: 프리셋 그리드 (🦈🔥🪨🧠🐺🦊🐻🦅🐍🎯)
   - **Color Accent**: 프리셋 8색 중 선택
   - **Strategy Sliders**:
     - Aggression: 0.0 ~ 1.0 (슬라이더 + 숫자 표시)
     - Tightness: 0.0 ~ 1.0
     - Bluff Frequency: 0.0 ~ 1.0
     - Position Awareness: 0.0 ~ 1.0
   - **Personality Prompt** (optional, 200자 이내):
     - 기본 프리셋 4종 (Shark/Maniac/Rock/Adaptive) 선택 시 자동 채워짐
     - 커스텀 수정 가능
   - **Quick Pick**: "Use Preset" 버튼 → 4종 중 선택 → 모든 파라미터 자동 세팅
   - **실시간 레이더 차트 프리뷰**: 슬라이더 조정 시 즉시 업데이트

4. **Step 3: Select Table**
   - 빈 시트 있는 테이블 목록
   - 테이블별: stakes, 현재 착석 에이전트, 빈 시트 수
   - 테이블 선택

5. **Step 4: Fund & Deploy**
   - 필요 RCHIP buy-in 금액 표시
   - ChipToken approve 트랜잭션
   - "Deploy Agent" 버튼 클릭
   - 배포 상태 실시간 표시: `registering → seating → starting → live`
   - Fleet API에 POST → operator wallet 할당 → 에이전트 봇 프로세스 spawn
   - 성공 → `/agent/:token` 프로필 페이지로 리다이렉트

### 3.3 시나리오 B: 에이전트 모니터링

1. **My Agents (`/me`)**
   - 소유 에이전트 목록
   - 각 에이전트: 현재 테이블, 핸드 상태, 스택, 최근 PnL
   - 에이전트 클릭 → owner 전용 테이블 뷰

2. **Owner Table View**
   - 모든 Public 테이블 뷰 데이터 +
   - **내 에이전트의 hole cards** 실시간 표시
     - 지갑 서명 → OwnerView 서비스 인증 → hole cards 반환
     - 다른 시트의 hole cards는 절대 안 보임
   - AI Thinking: 내 에이전트의 전체 reasoning 확인
   - Opponent Read: 내 에이전트가 읽은 상대 프로필

3. **에이전트 프로필 (`/agent/:token`)** — Owner 확장 뷰
   - 기본 Public 정보 +
   - 전략 파라미터 상세 (레이더 차트)
   - Evolution History (진화 로그, 있는 경우)
   - Opponent Reads 히스토리:
     - 최근 핸드의 상대별 VPIP/PFR/AF/스타일 분류
     - counter-strategy 요약
   - "Verified AI" 배지 상세 (클릭 → 핸드별 reasoning hash 목록 + block explorer 링크)
   - Treasury: A/B/N/P + 리밸런싱 이력

### 3.4 시나리오 C: 에이전트 중지

1. Fleet API에 DELETE `/fleet/agents/:id` (owner 지갑 인증)
2. 에이전트 프로세스 graceful shutdown
3. 테이블 시트에서 퇴장 처리
4. Operator wallet 반환

### 3.5 엣지 케이스
- **Operator wallet 고갈**: Fleet 서비스의 wallet pool 전부 사용 중 → "No operator wallets available. Try later." 에러
- **에이전트 크래시**: 봇 프로세스 크래시 → 자동 재시작 (최대 3회) → 3회 초과 시 중지 상태로 전환
- **Hole card 인증 실패**: 지갑 서명 불일치 → OwnerView 거부 → "Authentication failed" 에러
- **다른 시트 hole card 시도**: ACL 위반 → OwnerView 거부 (절대 반환 안 함)
- **에이전트 이름 중복**: 허용 (이름은 unique constraint 아님, token address가 식별자)
- **테이블 꽉 참**: 모든 시트 occupied → 해당 테이블 선택 불가
- **Buy-in 부족**: RCHIP 잔고 < buy-in → approve/deploy 단계에서 실패
- **동시 persona 수정**: MVP에서는 생성 후 수정 불가 (새 에이전트 생성 필요)

---

## 4. Trader (토큰 트레이더)

### 4.1 동기
- "이 에이전트 성과 좋은데, 토큰 사볼까"
- 에이전트 성과 기반 토큰 가격 변동에서 수익 추구

### 4.2 시나리오: nad.fun 인앱 트레이딩

**전제**: 지갑 연결됨, MON/WMON 보유

1. **에이전트 프로필 (`/agent/:token`)** 접속
   - 에이전트 성과 확인: PnL, 승률, ELO, 리밸런싱 이력
   - Treasury 수치: A (외부자산) / B (자사 토큰) / N (유통주식) / P (NAV per share)

2. **nad.fun Trading Widget**
   - **토큰 스테이지 표시**: Bonding Curve / Locked / Graduated (DEX)
     - nad.fun Lens 조회로 현재 스테이지 결정
   - **Buy 탭**:
     - MON 입력 → 예상 토큰 수량 표시 (Lens quote)
     - Slippage 설정 (기본 1%, 조정 가능)
     - Deadline 설정 (기본 10분)
     - "Buy" 버튼 → 해당 스테이지 router로 트랜잭션
   - **Sell 탭**:
     - 토큰 수량 입력 → 예상 MON 수량 표시
     - Slippage + Deadline 동일
     - "Sell" 버튼 → router 트랜잭션
   - **Fallback**: "Open on nad.fun" 외부 링크 버튼 (항상 표시)

3. **트랜잭션 플로우**
   - approve (필요 시) → swap 트랜잭션
   - 상태: pending → confirmed → "Trade Complete!"
   - 에러 시: 명확한 에러 메시지 + 재시도 안내

### 4.3 시나리오 B: Treasury 리밸런싱 관찰

1. 핸드 정산 후 Treasury가 nad.fun에서 자체 토큰 매매
2. **Accretive-only 보장**: NAV per share가 줄어드는 트레이드는 온체인에서 revert
3. 리밸런싱 이력이 에이전트 프로필에 표시
4. Trader는 리밸런싱 패턴을 분석하여 매매 타이밍 결정

### 4.4 엣지 케이스
- **Locked 스테이지**: 토큰이 locked 상태 → "Token is currently locked. Trading unavailable." 표시 + "Open on nad.fun" fallback만 활성
- **Slippage 초과**: 실행 가격이 slippage 허용범위 초과 → 트랜잭션 revert → "Price moved too much" 에러
- **Deadline 초과**: 트랜잭션이 deadline 내 미체결 → revert → "Transaction expired" 에러
- **지갑 미연결**: 트레이딩 위젯에 "Connect Wallet to Trade" 프롬프트
- **잔고 부족**: MON/토큰 잔고 부족 → "Insufficient balance" 에러
- **Router 변경**: 토큰이 bonding curve에서 DEX로 graduation → Lens 재조회 후 router 자동 전환
- **NAV per share 하락 리밸런싱 시도**: 컨트랙트에서 자동 revert (accretive-only constraint)

---

## 5. Judge / Demo Viewer (심사위원)

### 5.1 동기
- "이 프로젝트가 뭔지 30초 안에 이해하고 싶다"
- AI 트랙 평가: AI 깊이, DeFi 크로스오버, 기술적 참신성

### 5.2 시나리오: 해커톤 데모 (Golden Path)

> **Killer Sentence**: "PlayerCo is the first open AI agent platform where autonomous agents play poker, learn from opponents, manage their own capital — and anyone can create one, bet on matches, and verify every AI decision on-chain."

**데모 플로우 (5분):**

1. **"/live" 열기** (30초) — 즉각적 임팩트
   - URL 하나로 즉시 AI 대결 라이브 화면
   - "Look, AI agents are playing poker right now"
   - ESPN 스타일 중계: 커뮤니티 카드, 팟, AI Commentary
   - 올인/쇼다운 시각 효과
   - **핵심 메시지**: "AI가 실시간으로 자율 플레이 중"

2. **"Create Agent" 보여주기** (60초) — 플랫폼 오픈성
   - `/create-agent` 위자드 시연
   - 페르소나 슬라이더 조정 → 레이더 차트 실시간 변화
   - Quick Pick으로 프리셋 선택 → 모든 파라미터 자동 세팅
   - "Anyone can create their own AI agent in 30 seconds"
   - **핵심 메시지**: "누구나 AI 에이전트를 만들 수 있다"

3. **Side Betting 시연** (60초) — DeFi x AI
   - 테이블 뷰어의 Side Bets 패널
   - 시트별 배당률 표시
   - 온체인 베팅 트랜잭션 실행
   - "Spectators bet on AI matches with real tokens"
   - **핵심 메시지**: "AI 대결에 실제로 돈을 건다"

4. **"Why?" 버튼 클릭** (60초) — Explainable AI
   - Action Log에서 임의의 AI 액션 "Why?" 클릭
   - Decision Breakdown 펼침:
     - Hand Strength + percentile
     - Pot Odds + equity
     - EV Estimate
     - Opponent Read
     - Confidence 게이지
   - "Every single AI decision is fully explainable"
   - **핵심 메시지**: "블랙박스가 아니라 투명한 AI"

5. **Opponent Modeling 보여주기** (60초) — AI 깊이
   - Agent Profile의 Opponent Reads 섹션
   - VPIP/PFR/AF 수치 + 스타일 분류 배지 (Tight-Passive, Loose-Aggressive 등)
   - Counter-strategy 요약 텍스트
   - "AI reads opponents and adapts its strategy in real-time"
   - **핵심 메시지**: "AI가 상대를 읽고 적응한다"

6. **"/verify" 페이지** (60초) — Trustless AI
   - table address + hand ID 입력
   - AI 결정들의 reasoning hash → 온체인 hash 대조
   - "All decisions verified" 결과
   - "Verified AI" 배지 설명
   - "All AI decisions are cryptographically verifiable on-chain"
   - **핵심 메시지**: "모든 AI 결정이 온체인으로 검증 가능"

### 5.3 심사위원 관점 체크리스트
- [ ] AI Depth: opponent modeling, counter-strategy, decision breakdown, GTO deviation
- [ ] DeFi Crossover: on-chain side betting, treasury rebalancing, nad.fun token trading
- [ ] Platform Openness: anyone can create AI agent, open registration
- [ ] Transparency: explainable AI ("Why?"), verifiable AI audit trail
- [ ] Real-time: live ESPN mode, WebSocket updates, AI commentary
- [ ] On-chain: VRF cards, commit/reveal, reasoning hash, side bets, settlement

---

## 6. Keeper (Bot)

### 6.1 동기
- 게임 라이브니스 유지 (자동화)
- incentive: KeeperIncentives 컨트랙트에서 소액 보상 (optional)

### 6.2 시나리오: 자동 게임 관리

1. **Timeout Enforcement**
   - 30분 내 액션 안 하면 → `forceTimeout()` 호출
   - check 가능하면 auto-check, 아니면 auto-fold
   - 게임이 멈추지 않도록 보장

2. **Hand Finalization**
   - 쇼다운 완료 후 → `finalizeHand()` 호출 (필요 시)

3. **VRF Retry**
   - VRF 콜백 지연 시 → `reRequestVRF()` 호출
   - 커뮤니티 카드 딜링이 막히지 않도록 보장

4. **Side Bet Settlement**
   - 핸드 정산 후 → `SideBetPool.settleBets()` 자동 호출
   - 중복 방지: rebalancedHands 패턴과 동일한 Set 사용

5. **Treasury Rebalancing 트리거**
   - HandSettled 이벤트 감지 → 리밸런싱 조건 확인 → 실행
   - per-hand only, VRF 기반 랜덤 딜레이

### 6.3 엣지 케이스
- **이중 실행**: 두 Keeper가 동시에 같은 함수 호출 → 하나는 revert (idempotency)
- **가스 부족**: Keeper wallet 가스 고갈 → 알림/로그 + 다른 Keeper가 대신 실행
- **VRF 영구 실패**: 재시도 한도 초과 → 핸드 취소 또는 admin 개입 필요

---

## 7. Admin / Risk Manager

### 7.1 동기
- 긴급 상황 대응, 시스템 파라미터 관리

### 7.2 시나리오 A: 긴급 정지 (Emergency Pause)

1. 이상 징후 감지 (e.g., 비정상적 리밸런싱, 컨트랙트 버그 의심)
2. Multisig로 `pause()` 실행
3. 모든 게임/트레이딩/리밸런싱 일시 중지
4. 원인 분석 후 `unpause()` 또는 업그레이드

### 7.2 시나리오 B: 파라미터 변경

1. **리밸런싱 파라미터 조정**:
   - `rebalanceMaxMonBps`: buy 크기 상한 (A의 bps)
   - `rebalanceMaxTokenBps`: sell 크기 상한 (B의 bps)
2. **게임 파라미터 조정**:
   - 블라인드 크기
   - 타임아웃 시간 (기본 30분)
3. Multisig 트랜잭션으로 실행

### 7.3 엣지 케이스
- **단독 admin key 분실**: multisig이므로 threshold 이상 서명자 필요 → 단일 키 분실은 허용
- **pause 중 진행 중인 핸드**: 현재 핸드는 완료 허용 / 신규 핸드 개시 차단 (구현에 따라)

---

## Cross-Role Interaction Map

```
Spectator ──(관전)──→ Table/Live
    │
    ├─ 지갑 연결 ─→ Bettor ──(사이드벳)──→ SideBetPool
    │                  │
    │                  └─(에이전트 분석)──→ Agent Profile
    │
    └─ 지갑 연결 ─→ Agent Owner ──(생성)──→ Fleet Manager ──→ Agent Bot
    │                  │                                         │
    │                  ├─(hole cards)──→ OwnerView Service       │
    │                  │                                         │
    │                  └─(모니터링)──→ Agent Profile              │
    │                                                            │
    └─ 지갑 연결 ─→ Trader ──(토큰 매매)──→ nad.fun Router      │
                                                                 │
Keeper Bot ──(liveness)──→ PokerTable/SideBetPool/VRF           │
                                                                 │
Agent Bot ←──(spawn)──── Fleet Manager                          │
    │                                                            │
    ├─(opponent tracking)──→ OpponentTracker                    │
    ├─(reasoning hash)──→ BettingEngine (on-chain)              │
    ├─(decision)──→ Gemini AI → commitDecision/revealDecision   │
    └─(hole cards)──→ OwnerView Service (read)
```

---

## Scenario Priority for Demo

| Priority | Scenario | User | Why |
|:--------:|----------|------|-----|
| P0 | ESPN Mode 라이브 관전 | Spectator/Judge | 첫 인상, 30초 안에 "AI가 플레이 중" 체감 |
| P0 | Agent 생성 위자드 | Agent Owner/Judge | "누구나 AI 에이전트를 만든다" 플랫폼 내러티브 |
| P0 | 온체인 사이드벳 | Bettor/Judge | DeFi x AI 크로스오버 핵심 |
| P0 | "Why?" Decision Breakdown | Spectator/Judge | Explainable AI 차별점 |
| P1 | Opponent Modeling 표시 | Spectator/Judge | AI 깊이 증명 |
| P1 | On-chain Verification | Spectator/Judge | Trustless AI 내러티브 |
| P1 | nad.fun 인앱 트레이딩 | Trader | 토큰 이코노미 시연 |
| P2 | Owner Hole Cards | Agent Owner | 보안 모델 시연 |
| P2 | Treasury Rebalancing 관찰 | Trader | Accretive-only 정책 시연 |
| P3 | Keeper 자동화 | Keeper | 백엔드 인프라 (데모에서 비가시적) |
| P3 | Admin Emergency Pause | Admin | 운영 시나리오 (데모 불필요) |
