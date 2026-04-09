# TICKET.md — AI Track Final Push + User-Facing Platform (Hackathon Submission)

## Status legend
- [ ] TODO
- [~] IN PROGRESS
- [x] DONE

## Rules
- Execute tickets strictly top-to-bottom.
- One ticket at a time.
- A ticket is DONE only if its Acceptance Criteria are satisfied.
- When completing a ticket, append:
    1) Key files changed
    2) How to run/tests
    3) How to manually verify (demo steps)

---

# M12 — AI Track Final Push: "AI Agent Platform"

> **Goal**: 기존 "AI가 플레이 + 학습 + 진화"에서
> "**누구나 자기 AI 에이전트를 만들고, 관전자가 사이드벳을 걸고, AI가 상대를 읽고 적응하며, 모든 과정이 투명하다**"
> 수준으로 확장하여 AI 트랙 1등을 확정한다.
>
> **Pitching Angle**: "PlayerCo — The first open platform where anyone creates autonomous AI poker agents
> that learn, adapt to opponents, and manage their own treasury on-chain.
> Spectators bet on AI matches in real-time. Every AI decision is explainable and verifiable."
>
> **Priority**: 데모 임팩트 × AI 깊이 × DeFi 크로스오버

---

## T-1201 On-chain Side Betting — SideBetPool (P0)
- Status: [x] DONE
- Depends on: PokerTable settlement, ChipToken, existing localStorage betting UI
- Goal: 관전자가 RCHIP으로 온체인 사이드벳을 걸 수 있게 한다. "AI 대결에 돈을 건다" — DeFi×AI 크로스오버.
- Scope:
    - **컨트랙트**: `SideBetPool.sol` — 핸드별 사이드벳 풀 관리
    - **킵퍼**: 핸드 settle 후 자동 정산 트리거
    - **인덱서**: 벳 이벤트 인덱싱 + API
    - **웹**: 기존 localStorage BettingPanel → 온체인 업그레이드
- Tasks:
    1. `contracts/src/SideBetPool.sol` 신규:
        - 상태:
            - `mapping(bytes32 => Pool) public pools` — poolKey = `keccak256(tableAddress, handId)`
            - `Pool` 구조체: `{ address table, uint256 handId, uint256 totalPool, uint8 winnerSeat, bool settled, uint256 createdAt }`
            - `mapping(bytes32 => mapping(uint8 => uint256)) public seatTotals` — 시트별 총 베팅액
            - `mapping(bytes32 => mapping(address => Bet[])) public userBets` — 유저별 베팅 내역
            - `Bet` 구조체: `{ uint8 seatIndex, uint256 amount, bool claimed }`
        - 함수:
            - `placeBet(address table, uint256 handId, uint8 seatIndex)` payable:
                - RCHIP `transferFrom` 으로 풀에 입금 (또는 native token)
                - `require(!pools[key].settled, "Pool already settled")`
                - 핸드가 BETTING_PRE ~ BETTING_RIVER 사이일 때만 가능 (PokerTable 상태 체크)
                - 풀이 없으면 자동 생성
                - 이벤트: `BetPlaced(poolKey, bettor, seatIndex, amount)`
            - `settleBets(address table, uint256 handId)`:
                - PokerTable에서 settlement 상태 + winner 확인
                - `require(gameState == SETTLED || gameState == WAITING_FOR_SEATS)`
                - winnerSeat 기록, settled = true
                - 이벤트: `PoolSettled(poolKey, winnerSeat, totalPool)`
            - `claimWinnings(address table, uint256 handId)`:
                - 유저의 winning bet에 대해 비례 배분 계산
                - `payout = userBetOnWinner * totalPool / seatTotals[winnerSeat]`
                - RCHIP transfer
                - 이벤트: `WinningsClaimed(poolKey, bettor, payout)`
            - `getPoolInfo(address table, uint256 handId)` view
            - `getUserBets(address table, uint256 handId, address user)` view
            - `getSeatOdds(address table, uint256 handId)` view — 시트별 implied odds 반환
        - 보안:
            - Reentrancy guard (checks-effects-interactions 또는 ReentrancyGuard)
            - settled 후 추가 베팅 불가
            - 중복 claim 불가 (Bet.claimed flag)
    2. `contracts/test/SideBetPool.t.sol`:
        - placeBet 성공 / 실패 (already settled, invalid seat)
        - 다중 유저 베팅 → settle → claim 흐름
        - 비례 배분 정확성 (3명이 각각 다른 시트에 다른 금액 베팅)
        - claim 후 재 claim 불가
        - 빈 풀 settle 처리
        - reentrancy 방어
        - 최소 10개 테스트
    3. `bots/keeper/src/bot.ts` — settle 트리거:
        - 핸드 정산 후 `settleBets()` 자동 호출
        - rebalancedHands 패턴과 동일하게 중복 방지 Set 사용
    4. `services/indexer/src/` — SideBetPool 이벤트 인덱싱:
        - DB 테이블: `side_bets(pool_key, table_address, hand_id, bettor, seat_index, amount, tx_hash, block_number, timestamp)`
        - DB 테이블: `side_bet_settlements(pool_key, winner_seat, total_pool, settled_at)`
        - API:
            - `GET /sidebets/:tableAddress/:handId` — 풀 정보 + 시트별 총액
            - `GET /sidebets/:tableAddress/:handId/user/:address` — 유저 베팅 내역
            - `GET /sidebets/leaderboard` — 사이드벳 수익 랭킹
    5. `apps/web/src/components/BettingPanel.tsx` 온체인 업그레이드:
        - 기존 localStorage 로직 제거 → 온체인 트랜잭션으로 교체
        - `placeBet()`: ChipToken approve → SideBetPool.placeBet() 트랜잭션
        - `claimWinnings()`: settle 후 claim 버튼
        - 실시간 풀 크기 / 시트별 odds 표시 (인덱서 API 폴링 또는 WS)
        - 지갑 연결 필수 (ConnectWallet 프롬프트)
        - 트랜잭션 상태 표시 (pending/confirmed/failed)
    6. `apps/web/src/app/table/[id]/TableViewer.tsx` — 사이드벳 위젯 통합:
        - 테이블 뷰어에 "Side Bets" 탭/패널 추가
        - 각 시트 패널에 현재 총 베팅액 표시
        - 핸드 종료 시 사이드벳 결과 표시
- Acceptance:
    - `placeBet()` 으로 RCHIP 온체인 사이드벳 성공
    - 핸드 settle 후 `settleBets()` 자동 실행
    - winner에 베팅한 유저가 비례 배분으로 payout 수령
    - 인덱서에서 사이드벳 데이터 조회 가능
    - 웹 UI에서 온체인 베팅/클레임 플로우 동작
    - Foundry 테스트 최소 10개
- Commit: `feat(contracts,keeper,indexer,web): add on-chain side betting pool for AI matches`

---

## T-1202 Open Agent Registration & Fleet Manager (P0)
- Status: [x] DONE
- Depends on: PlayerRegistry, existing agent bot, existing persona system
- Goal: 누구나 자기만의 AI 에이전트를 설정하고 테이블에 앉힐 수 있다. "AI Agent Platform" 내러티브의 핵심.
- Scope:
    - **웹**: `/create-agent` 위자드 페이지 (페르소나 설정 + 배포)
    - **서비스**: `services/fleet/` — 에이전트 라이프사이클 관리 서비스
    - **에이전트**: 동적 페르소나 설정 지원 확장
- Tasks:
    1. `apps/web/src/app/create-agent/page.tsx` 신규 — Agent Creation Wizard:
        - **Step 1: Connect Wallet** — 지갑 연결 확인
        - **Step 2: Persona Config**:
            - Agent Name (텍스트 입력, 1-24자)
            - Emoji 선택 (프리셋 그리드: 🦈🔥🪨🧠🐺🦊🐻🦅🐍🎯)
            - Color Accent 선택 (프리셋 8색)
            - **Strategy Sliders**:
                - Aggression: 0.0 ~ 1.0 (슬라이더 + 숫자 표시)
                - Tightness: 0.0 ~ 1.0
                - Bluff Frequency: 0.0 ~ 1.0
                - Position Awareness: 0.0 ~ 1.0
            - **Personality Prompt** (optional textarea):
                - 기본 프리셋 4종 (shark/maniac/rock/adaptive) 선택 시 자동 채워짐
                - 커스텀 수정 가능 (200자 이내)
            - **프리셋 Quick Pick**: "Use Preset" 버튼으로 기존 4종 중 선택 → 모든 파라미터 자동 세팅
            - 실시간 레이더 차트 프리뷰 (PersonaRadar 컴포넌트 재활용)
        - **Step 3: Select Table**:
            - 사용 가능한 테이블 리스트 (빈 시트 있는 테이블)
            - 테이블별 stakes, 현재 착석 에이전트, 빈 시트 수 표시
        - **Step 4: Fund & Deploy**:
            - 필요한 RCHIP buy-in 금액 표시
            - ChipToken approve + seat registration 트랜잭션
            - "Deploy Agent" 버튼 → fleet API 호출
            - 배포 상태 표시 (registering → seating → starting → live)
        - 내비게이션에 "Create Agent" 링크 추가
    2. `services/fleet/` 신규 — Agent Fleet Manager:
        - `services/fleet/src/index.ts` — Express 서버 엔트리
        - `services/fleet/src/api.ts` — REST API:
            - `POST /fleet/agents` — 새 에이전트 생성 요청
                - body: `{ ownerAddress, tableAddress, personaConfig, systemPrompt? }`
                - 프리펀딩된 operator 지갑 풀에서 하나 할당
                - 에이전트 봇 프로세스 spawn
                - 반환: `{ agentId, operatorAddress, status }`
            - `GET /fleet/agents` — 실행 중인 에이전트 목록
            - `GET /fleet/agents/:id` — 에이전트 상태
            - `DELETE /fleet/agents/:id` — 에이전트 중지 (owner만)
            - `GET /fleet/wallets/available` — 사용 가능한 operator 지갑 수
        - `services/fleet/src/pool.ts` — Operator Wallet Pool:
            - 환경변수: `FLEET_OPERATOR_KEYS` (콤마 구분 private keys)
            - 지갑 할당/반환 관리
            - 사용 중/사용 가능 상태 추적
        - `services/fleet/src/spawner.ts` — Agent Process Manager:
            - `child_process.fork()` 로 agent bot 프로세스 생성
            - 환경변수로 persona config 전달
            - 프로세스 health 모니터링 (5초 heartbeat)
            - 크래시 시 자동 재시작 (최대 3회)
            - graceful shutdown
        - `services/fleet/src/types.ts` — Fleet 타입 정의
    3. `bots/agent/src/bot.ts` 확장 — 동적 페르소나:
        - `AGENT_PERSONA_JSON` 환경변수 지원: JSON 문자열로 커스텀 PersonaConfig 주입
        - 기존 `AGENT_PERSONA` (ID) 대비 우선순위: JSON > ID > default
        - 부팅 시 로그: `[FLEET] Using custom persona: {name} (aggression={x}, tightness={y})`
    4. `bots/agent/src/strategy/persona.ts` 확장:
        - `createCustomPersona(config: Partial<PersonaConfig> & { name: string })`: 커스텀 페르소나 생성
        - validation: 모든 숫자 파라미터 [0, 1] 범위 클램핑
        - systemPromptOverride 자동 생성 (파라미터 기반 템플릿)
    5. `packages/shared/src/types.ts` — Fleet 관련 타입 추가:
        - `FleetAgentConfig`, `FleetAgentStatus` 인터페이스
    6. `pnpm-workspace.yaml` 에 `services/fleet` 추가
    7. `services/fleet/package.json` + `tsconfig.json` 설정
- Acceptance:
    - `/create-agent` 에서 4단계 위자드로 커스텀 에이전트 생성 가능
    - 슬라이더로 전략 파라미터 조정 시 레이더 차트 실시간 업데이트
    - 프리셋 선택 시 모든 파라미터 자동 세팅
    - Fleet API에 POST 시 에이전트 봇 프로세스 자동 생성
    - 생성된 에이전트가 실제 테이블에서 Gemini 기반 플레이 시작
    - 에이전트 중지 시 프로세스 clean shutdown
    - 커스텀 persona JSON으로 에이전트 부팅 성공
- Commit: `feat(web,fleet,agent): add open agent registration portal with fleet manager`

---

## T-1203 Opponent Modeling & Adaptive Counter-Strategy (P0)
- Status: [x] DONE
- Depends on: existing Gemini strategy, existing RAG, existing action history
- Goal: AI 에이전트가 상대의 플레이 패턴을 추적하고 이에 맞춰 전략을 실시간 적응한다. "AI가 상대를 읽는다" — 포커 AI의 본질.
- Scope:
    - **에이전트**: opponent tracker + counter-strategy 모듈
    - **OwnerView**: opponent model 데이터 저장/조회
    - **웹**: 에이전트 프로필에 opponent read 표시
- Tasks:
    1. `bots/agent/src/opponent/tracker.ts` 신규:
        - `OpponentTracker` 클래스:
            - 입력: 관찰된 액션 스트림 (seatIndex, action, street, amount, isPreflop)
            - 시트별 통계 추적:
                - `VPIP` (Voluntarily Put $ In Pot): preflop에서 자발적으로 팟에 참여한 비율
                - `PFR` (Pre-Flop Raise %): preflop raise 비율
                - `AF` (Aggression Factor): (bets + raises) / calls (0이면 passive, 3+ 이면 aggressive)
                - `foldToCBet` (%): flop에서 c-bet에 fold한 비율
                - `WTSD` (Went To Showdown %): showdown까지 간 비율
                - `W$SD` (Won $ at Showdown %): showdown에서 이긴 비율
                - `3betFreq`: 3bet 빈도
                - `checkRaiseFreq`: check-raise 빈도
            - `observe(seatIndex, action, context)`: 액션 관찰 및 통계 업데이트
            - `getProfile(seatIndex) => OpponentProfile`: 현재 통계 요약
            - `getSampleSize(seatIndex) => number`: 관찰된 핸드 수
            - 최소 샘플 사이즈: 5핸드 이전에는 "unknown" 반환
    2. `bots/agent/src/opponent/counter.ts` 신규:
        - `CounterStrategyAdvisor` 클래스:
            - `advise(opponentProfile: OpponentProfile) => CounterAdvice`:
                - **vs Tight-Passive** (high tightness, low AF): "Steal blinds aggressively. Their raises mean real strength — fold marginal hands."
                - **vs Loose-Aggressive** (low tightness, high AF): "Tighten up. Trap with strong hands. Don't bluff — they'll call or re-raise."
                - **vs Tight-Aggressive** (high tightness, high AF): "Respect their raises. 3-bet polarized. Exploit their fold-to-3bet."
                - **vs Loose-Passive** (low tightness, low AF): "Value bet widely. Don't bluff — they'll call. Isolate with strong hands."
                - **vs Unknown** (insufficient data): "Play standard GTO-leaning strategy. Gather information."
            - `CounterAdvice`: `{ style: string, adjustments: { aggression: number, tightness: number, bluffFreq: number }, promptInjection: string }`
            - adjustments는 base persona에 대한 delta (+/- 0.0~0.2 범위)
    3. `bots/agent/src/opponent/types.ts` 신규:
        - `OpponentProfile`, `CounterAdvice`, `OpponentStats` 타입 정의
    4. `bots/agent/src/bot.ts` 에 opponent modeling 통합:
        - 매 액션 관찰 시 `OpponentTracker.observe()` 호출
        - 의사결정 전: 현재 상대의 `OpponentProfile` 조회
        - `CounterStrategyAdvisor.advise()` 결과를 Gemini 프롬프트에 주입:
            ```
            === OPPONENT READ ===
            Seat {X} ({name}): {style} player
            Stats (over {N} hands): VPIP {vpip}%, PFR {pfr}%, AF {af}, Fold-to-CBet {ftcb}%
            Counter-strategy: {promptInjection}
            Recommended adjustments: aggression {delta}, tightness {delta}
            ===
            ```
        - evolution과 독립: opponent adjustments는 일시적 (해당 핸드/세션만), evolution은 영구적
    5. `bots/agent/src/opponent/tracker.test.ts` + `counter.test.ts`:
        - tracker: 다양한 액션 시퀀스 → VPIP/PFR/AF 정확성 검증
        - counter: 각 opponent 타입에 대한 올바른 counter-advice 생성 검증
        - edge case: 0핸드 관찰, 모든 핸드 fold, all-in maniac
        - 최소 15개 테스트
    6. `services/ownerview/src/routes/reasoning.ts` 확장:
        - `POST /reasoning` body에 `opponentRead?: { seatIndex, profile, counterAdvice }` 추가
        - `GET /reasoning` 응답에 opponentRead 포함
    7. `apps/web/src/app/agent/[token]/page.tsx` — "Opponent Reads" 섹션:
        - 최근 핸드에서의 상대 프로필 표시 (카드 형태)
        - 각 상대: 이름/이모지 + VPIP/PFR/AF 수치 + 스타일 분류 배지
        - counter-strategy 요약 텍스트
- Acceptance:
    - 매 핸드마다 상대 통계가 업데이트
    - 5핸드 이후부터 유의미한 opponent profile 생성
    - counter-strategy가 Gemini 프롬프트에 주입되어 의사결정에 영향
    - 상대 스타일이 올바르게 분류됨 (tight-passive, loose-aggressive 등)
    - opponent read 데이터가 OwnerView에 저장되고 웹에서 조회 가능
    - 유닛 테스트 최소 15개
- Commit: `feat(agent,ownerview,web): add opponent modeling with adaptive counter-strategy`

---

## T-1204 Live Demo "ESPN Mode" Page (P0)
- Status: [x] DONE
- Depends on: existing TableViewer, existing WebSocket infra, existing AI Commentary
- Goal: 심사위원이 URL 하나 열면 30초 안에 "AI가 플레이하고 있다"를 체감하는 킬러 데모 페이지.
- Scope:
    - **웹**: `/live` 페이지 — 실시간 AI 대결 중계 모드
- Tasks:
    1. `apps/web/src/app/live/page.tsx` 신규 — ESPN Mode:
        - **레이아웃**: 풀스크린 최적화, 네비게이션 최소화
        - **메인 영역** (70%):
            - 현재 가장 활발한 테이블 자동 선택 (최근 액션 기준)
            - 테이블 뷰: 커뮤니티 카드 + 팟 + 시트 패널 (TableViewer 컴포넌트 재활용)
            - "LIVE" 배지 (빨간 점 애니메이션)
            - 핸드 넘버 + 스트리트 표시
        - **AI Commentary 오버레이** (하단):
            - 최신 해설 3개 표시 (fade-in 애니메이션)
            - 해설자 톤: 스포츠 중계 스타일
        - **사이드바** (30%):
            - **Agent Cards**: 각 에이전트의 이름/이모지/현재 스택/ELO
            - **AI Thinking** (실시간): 마지막 액션의 AI reasoning 요약 (2줄)
            - **Side Bets**: 현재 사이드벳 풀 크기 + 시트별 배당률 (T-1201 연동)
            - **Stats Ticker**: 오늘 총 핸드 수, 가장 큰 팟, 현재 리더
        - **이벤트 하이라이트**:
            - 올인 시 화면 효과 (border glow)
            - 쇼다운 시 결과 오버레이 (승자 + 핸드 + 팟 금액)
            - 큰 팟(평균의 3배+) 시 "BIG POT" 배지
        - **자동 테이블 전환**:
            - 여러 테이블이 있을 때 가장 흥미로운 테이블로 자동 전환
            - 기준: 쇼다운 임박, 올인 상황, 큰 팟
            - 수동 테이블 선택도 가능
        - **풀스크린 토글**: F11 또는 버튼으로 fullscreen API 호출
    2. `apps/web/src/app/live/LiveDashboard.tsx` — 메인 대시보드 컴포넌트
    3. `apps/web/src/app/live/AgentCards.tsx` — 에이전트 카드 사이드바
    4. `apps/web/src/app/live/StatsTicker.tsx` — 통계 티커
    5. `apps/web/src/app/live/live.module.css` — ESPN 스타일 CSS
    6. 내비게이션에 "LIVE" 링크 추가 (빨간 점 표시)
- Acceptance:
    - `/live` 접속 시 즉시 라이브 AI 대결 화면 표시
    - AI Commentary가 실시간으로 흐름
    - 에이전트 카드에 현재 스택/ELO 표시
    - 올인/쇼다운 시 시각 효과 동작
    - 풀스크린 모드 동작
    - 모바일 반응형 (세로 레이아웃)
    - 데이터 없을 때 "Waiting for next hand..." 상태 표시
- Commit: `feat(web): add live ESPN-mode demo page for AI matches`

---

## T-1205 AI Decision Deep Explainability — "Why?" (P1)
- Status: [x] DONE
- Depends on: existing reasoning data, existing GTO deviation, T-1203 opponent modeling
- Goal: 각 AI 액션에 대해 "왜 이 결정을 했는지" 심층 분석을 제공한다. "Explainable AI in DeFi" 내러티브.
- Scope:
    - **에이전트**: reasoning 데이터에 structured decision breakdown 추가
    - **OwnerView**: explainability 데이터 저장/조회
    - **웹**: ActionLog에 "Why?" 인터랙션 추가
- Tasks:
    1. `bots/agent/src/strategy/geminiStrategy.ts` 확장:
        - Gemini 프롬프트에 structured output 요청 추가:
            ```
            Also provide a decision breakdown in this exact format:
            HAND_STRENGTH: [description + percentile, e.g., "Top pair with ace kicker — top 15% of hands"]
            POT_ODDS: [calculation, e.g., "Need 25% equity to call. Estimated equity: 62%"]
            EV_ESTIMATE: [expected value reasoning, e.g., "+EV call: risking 200 to win 800"]
            OPPONENT_READ: [what you think about opponent's range, e.g., "Opponent's check suggests weakness or slow-play"]
            KEY_FACTOR: [the single most important factor in this decision]
            CONFIDENCE: [0-100, how confident you are in this decision]
            ```
        - 파싱: Gemini 응답에서 각 필드를 추출하여 `DecisionBreakdown` 객체 생성
    2. `bots/agent/src/strategy/types.ts` 확장:
        - `DecisionBreakdown` 인터페이스:
            ```typescript
            interface DecisionBreakdown {
              handStrength: string;
              potOdds: string;
              evEstimate: string;
              opponentRead: string;
              keyFactor: string;
              confidence: number;
              gtoDeviation?: { action: string; severity: number; explanation: string };
              counterStrategy?: string;
            }
            ```
    3. `services/ownerview/src/routes/reasoning.ts` 확장:
        - `POST /reasoning` body에 `breakdown?: DecisionBreakdown` 추가
        - `GET /reasoning` 응답에 breakdown 포함
    4. `apps/web/src/app/table/[id]/ActionLog.tsx` — "Why?" 버튼:
        - 각 액션 행에 "Why?" 버튼 (reasoning 데이터 있는 경우만)
        - 클릭 시 expand → `DecisionBreakdown` 표시:
            - **Hand Strength**: 카드 아이콘 + percentile bar
            - **Pot Odds**: 계산식 + equity bar
            - **EV Estimate**: +/- EV 컬러코딩
            - **Opponent Read**: 상대 프로필 링크 (T-1203 연동)
            - **Key Factor**: 강조 표시
            - **Confidence**: 0-100 게이지
            - **GTO Note**: deviation 있으면 "Deviated from GTO: {explanation}" 표시
        - 접힌 상태에서도 confidence 배지 표시 (높으면 green, 낮으면 orange)
    5. `apps/web/src/components/DecisionBreakdown.tsx` 신규:
        - 재사용 가능한 decision breakdown 표시 컴포넌트
        - compact mode (인라인) / expanded mode (카드)
    6. `apps/web/src/app/table/[id]/ActionLog.module.css` 확장:
        - Why? 버튼 + breakdown 카드 스타일
- Acceptance:
    - 각 AI 액션에 "Why?" 버튼 표시
    - 클릭 시 6개 breakdown 필드가 시각적으로 표시
    - confidence 게이지 동작
    - GTO deviation 정보 연동
    - opponent read 정보 연동 (T-1203 이후)
    - reasoning 없는 액션에는 "Why?" 버튼 미표시
    - 모바일에서도 breakdown 카드 정상 렌더링
- Commit: `feat(agent,ownerview,web): add deep AI decision explainability with Why? button`

---

## T-1206 On-chain Verifiable AI Audit Trail (P1)
- Status: [x] DONE
- Depends on: existing commitDecision/revealDecision, existing reasoning data
- Goal: AI의 모든 의사결정 과정(reasoning + factors)의 해시를 온체인에 기록하여 사후 검증 가능하게 한다. "Trustless AI" 내러티브.
- Scope:
    - **에이전트**: reasoning hash 계산 + 온체인 커밋 확장
    - **컨트랙트**: commitDecision에 reasoningHash 필드 추가
    - **인덱서**: reasoning hash 인덱싱 + verification API
    - **웹**: "Verified AI" 배지 + verification 페이지
- Tasks:
    1. `contracts/src/table/BettingEngine.sol` 확장:
        - `commitDecision()` 에 추가 파라미터: `bytes32 reasoningHash`
        - 저장: `mapping(uint256 => mapping(uint8 => bytes32)) public reasoningHashes` (handId => seatIndex => hash)
        - `revealDecision()` 시 reasoningHash도 이벤트에 포함
        - 이벤트 확장: `DecisionCommitted(handId, seatIndex, commitHash, reasoningHash)`
        - 새 view: `getReasoningHash(uint256 handId, uint8 seatIndex) => bytes32`
    2. `contracts/test/PokerTable.t.sol` 확장:
        - reasoningHash 커밋/조회 테스트
        - zero hash 허용 (reasoning 없는 경우)
        - 이벤트 emission 검증
    3. `bots/agent/src/bot.ts` — reasoning hash 계산:
        - `commitDecision` 호출 전:
            ```typescript
            const reasoningPayload = JSON.stringify({ reasoning, factors, breakdown, opponentRead });
            const reasoningHash = keccak256(toBytes(reasoningPayload));
            ```
        - `commitDecision(commitHash, reasoningHash)` 으로 호출
    4. `services/indexer/src/` — reasoning hash 인덱싱:
        - DB 테이블: `decision_audit(hand_id, seat_index, reasoning_hash, commit_tx_hash, block_number, verified)`
        - API:
            - `GET /audit/:tableAddress/:handId` — 해당 핸드의 모든 AI 결정 audit trail
            - `POST /audit/verify` — body: `{ handId, seatIndex, reasoning, factors }` → 서버에서 hash 재계산 → 온체인 hash와 비교 → `{ verified: boolean }`
    5. `apps/web/src/app/agent/[token]/page.tsx` — "Verified AI" 배지:
        - 최근 20핸드의 reasoning hash가 모두 온체인에 존재하면 "Verified AI" 배지 표시
        - 배지 클릭 → verification 상세 모달:
            - 핸드별 reasoning hash 목록
            - 각 hash → block explorer 링크
            - 검증 상태 (green check / red x)
    6. `apps/web/src/app/verify/page.tsx` 신규 — AI Decision Verifier:
        - 입력: table address + hand ID
        - 표시: 해당 핸드의 모든 AI 결정
            - 각 결정: action + reasoning 요약 + on-chain hash + verification status
        - "Verify" 버튼: reasoning 데이터 → hash 재계산 → 온체인 대조
        - 결과: "All decisions verified" / "Mismatch found at seat X"
- Acceptance:
    - `commitDecision` 시 reasoningHash가 온체인에 기록
    - `getReasoningHash()` 로 온체인 hash 조회 가능
    - 인덱서에서 audit trail 조회 가능
    - verify API에서 reasoning 데이터 ↔ 온체인 hash 대조 성공
    - "Verified AI" 배지가 에이전트 프로필에 표시
    - `/verify` 페이지에서 핸드별 검증 가능
    - Foundry 테스트 최소 5개 추가
- Commit: `feat(contracts,agent,indexer,web): add on-chain verifiable AI audit trail`

---

# Execution Plan Summary

| Ticket | Description | Effort | Demo Impact | AI Depth | Narrative |
|--------|-------------|--------|-------------|----------|-----------|
| T-1201 | On-chain Side Betting | Medium | ★★★★★ | ★★ | "AI 대결에 돈을 건다" (DeFi×AI) |
| T-1202 | Open Agent Registration | Medium-High | ★★★★★ | ★★★ | "누구나 AI 에이전트를 만든다" |
| T-1203 | Opponent Modeling | Medium | ★★★★ | ★★★★★ | "AI가 상대를 읽고 적응한다" |
| T-1204 | Live ESPN Mode | Low-Medium | ★★★★★ | ★★ | "30초 안에 체감하는 AI 대결" |
| T-1205 | Deep Explainability | Low-Medium | ★★★★ | ★★★★ | "Explainable AI in DeFi" |
| T-1206 | AI Audit Trail | Medium | ★★★ | ★★★★★ | "Trustless & Verifiable AI" |

**Judge-facing Pitch Flow:**
1. Open `/live` → "Look, AI agents are playing poker right now" (T-1204)
2. "Anyone can create their own AI agent" → show `/create-agent` (T-1202)
3. "Spectators bet on AI matches" → show side betting pool (T-1201)
4. Click "Why?" → "Every AI decision is explainable" (T-1205)
5. Show opponent modeling → "AI reads opponents and adapts in real-time" (T-1203)
6. Show `/verify` → "All AI decisions are verifiable on-chain" (T-1206)

**Killer Sentence:** "PlayerCo is the first open AI agent platform where autonomous agents play poker, learn from opponents, manage their own capital — and anyone can create one, bet on matches, and verify every AI decision on-chain."
