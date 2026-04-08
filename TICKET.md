# TICKET.md — AI Track Enhancement (Hackathon Submission Hardening)

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

# M11 — AI Track Enhancement (Hashkey Hackathon AI 트랙 강화)

> **목표**: 기존 AI 파이프라인(Gemini 전략 + RAG + 온체인 커밋/리빌 + Treasury Advisor)을
> "AI가 on-chain에서 플레이하고, 학습하고, 진화하고, 해설하고, 그 모든 과정이 검증 가능하다"
> 수준으로 끌어올려 AI 트랙 1등을 노린다.
>
> **우선순위 기준**: 데모 임팩트 × 구현 난이도 역수 (쉽고 임팩트 큰 것 먼저)

---

## T-1101 Real-time AI Game Commentary for Spectators (P0)
- Status: [ ] TODO
- Depends on: M9 (4-seat table), existing Gemini integration, existing WebSocket infra
- Goal: AI가 포커 핸드를 실시간 해설하여 관전 경험을 극대화한다. "AI가 플레이도 하고, 해설도 한다."
- Scope:
    - **서비스**: `services/ownerview` 에 commentary 생성 + 저장 endpoint 추가
    - **에이전트/킵퍼**: 매 액션 settle 후 (또는 street 전환 시) commentary 요청 → OwnerView에 저장
    - **인덱서**: OwnerView commentary proxy endpoint + WebSocket `ai_commentary` 메시지 타입 추가
    - **웹**: Table Viewer에 "AI Commentary" 패널 추가 (접이식, 실시간 스트리밍)
- Tasks:
    1. `services/ownerview/src/routes/commentary.ts` 신규:
        - `POST /commentary` — body: `{ tableAddress, handId, street, triggerAction, context }` → Gemini 호출 → 해설 생성 및 저장
        - `GET /commentary?tableAddress=&handId=` — 해당 핸드의 전체 해설 리스트 반환
        - Gemini 프롬프트: 포커 해설자 역할 — community cards, pot size, 액션 시퀀스, 각 에이전트 페르소나를 참조하여 1~3문장 해설 생성
        - 인메모리 저장 (기존 reasoning store 패턴 동일)
    2. `bots/keeper/src/bot.ts` 에 commentary trigger 로직 추가:
        - 매 street 전환 시 (flop/turn/river dealt) + 핸드 종료 시 commentary 요청
        - 컨텍스트: community cards, pot, 최근 액션 3개, 활성 시트 페르소나 이름
        - 실패 시 무시 (liveness에 영향 없음)
    3. `services/indexer/src/api/routes.ts` 에 proxy endpoint 추가:
        - `GET /tables/:tableId/hands/:handId/commentary` → OwnerView `/commentary` proxy
    4. `services/indexer/src/ws/types.ts` 에 `ai_commentary` 메시지 타입 추가:
        - `{ type: "ai_commentary", tableId, timestamp, data: { handId, street, commentary, personaContext? } }`
    5. `services/indexer/src/ws/server.ts` 에서 commentary 이벤트 브로드캐스트 로직 추가
    6. `apps/web/src/app/table/[id]/page.tsx` 에 AI Commentary 패널 추가:
        - 테이블 뷰어 하단 또는 사이드에 접이식 패널
        - 실시간 commentary 메시지 수신 → 시간순 표시
        - 각 commentary에 street 라벨 (Preflop/Flop/Turn/River/Settlement)
        - 페르소나 이모지 + 이름 표시 (누가 관련된 해설인지)
- Acceptance:
    - `POST /commentary` 호출 시 Gemini가 1~3문장 포커 해설 생성 및 저장
    - `GET /commentary` 로 핸드별 해설 조회 가능
    - WebSocket으로 `ai_commentary` 메시지가 실시간 브로드캐스트
    - Table Viewer에 Commentary 패널이 표시되고 실시간 업데이트
    - Gemini API 실패 시 graceful skip (게임 진행에 영향 없음)
    - 해설 내용에 hole card 정보가 포함되지 않음 (showdown 전까지)
- Commit: `feat(ownerview,keeper,indexer,web): add real-time AI game commentary for spectators`

---

## T-1102 On-chain AI Strategy Registry (P0)
- Status: [ ] TODO
- Depends on: existing PlayerRegistry, existing persona system
- Goal: AI 에이전트의 전략 버전/설정을 온체인에 기록하여 "검증 가능한 AI 진화" 내러티브를 확립한다.
- Scope:
    - **컨트랙트**: `PlayerRegistry` 에 strategy config 기록 기능 추가
    - **에이전트**: 부팅 시 현재 전략 설정을 온체인에 기록
    - **인덱서**: strategy update 이벤트 인덱싱
    - **웹**: 에이전트 프로필에 전략 버전 이력 표시
- Tasks:
    1. `contracts/src/PlayerRegistry.sol` 확장:
        - 새 매핑: `mapping(address => StrategyRecord[]) public strategyHistory`
        - `StrategyRecord` 구조체: `{ bytes32 configHash, string personaId, uint16 aggressionBps, uint16 tightnessBps, uint16 bluffFreqBps, uint256 version, uint256 timestamp }`
        - `updateStrategy(bytes32 configHash, string personaId, uint16 aggressionBps, uint16 tightnessBps, uint16 bluffFreqBps)` — owner/operator만 호출 가능, version 자동 증가
        - `getStrategyHistory(agent, offset, limit)` — 페이지네이션 지원
        - `getLatestStrategy(agent)` — 현재 활성 전략 반환
        - 이벤트: `StrategyUpdated(address indexed agent, uint256 version, bytes32 configHash, string personaId, uint16 aggressionBps, uint16 tightnessBps, uint16 bluffFreqBps)`
    2. `contracts/test/PlayerRegistry.t.sol` 에 테스트 추가:
        - strategy update 성공/실패 (권한 체크)
        - history 조회 + 페이지네이션
        - version 자동 증가 검증
        - 이벤트 emission 검증
    3. `bots/agent/src/bot.ts` 에 strategy registration 로직 추가:
        - 에이전트 부팅 시 현재 persona config → configHash 계산 (keccak256 of serialized config)
        - `updateStrategy()` 온체인 호출
        - 전략 변경 시 (T-1103 self-play evolution 후) 자동 재등록
    4. `services/indexer/src/` 에 `StrategyUpdated` 이벤트 인덱싱:
        - DB 테이블: `strategy_history(agent, version, config_hash, persona_id, aggression_bps, tightness_bps, bluff_freq_bps, block_number, tx_hash, timestamp)`
        - API: `GET /agents/:address/strategies` — 전략 이력 반환
    5. `apps/web/src/app/agent/[token]/page.tsx` 에 "Strategy History" 섹션 추가:
        - 버전별 전략 변경 타임라인
        - 각 버전: persona name, 파라미터 변경 diff (이전 대비 aggression +5% 등)
        - configHash → explorer 링크
- Acceptance:
    - `updateStrategy()` 호출 시 온체인에 전략 레코드 기록 + 이벤트 발생
    - owner/operator 외 호출 시 revert
    - 에이전트 부팅 시 자동으로 현재 전략을 온체인에 등록
    - 인덱서에서 strategy_history 조회 가능
    - 웹에서 전략 버전 이력 타임라인 표시
    - Foundry 테스트 최소 8개 추가
- Commit: `feat(contracts,agent,indexer,web): add on-chain AI strategy registry with version tracking`

---

## T-1103 Self-Play Strategy Evolution (Online Learning Loop) (P0)
- Status: [ ] TODO
- Depends on: T-1102 (on-chain strategy registry), existing RAG vector store, existing persona system
- Goal: AI 에이전트가 자기 대국 결과를 분석해서 전략 파라미터를 자동 조정한다. "AI가 진짜 on-chain에서 학습한다."
- Scope:
    - **에이전트**: 매 N핸드마다 최근 성과를 평가하고 persona 파라미터를 evolutionary strategy로 조정
    - **RAG 연동**: 학습 메타데이터를 RAG knowledge base에 기록
    - **온체인**: 조정된 파라미터를 T-1102 strategy registry에 기록
- Tasks:
    1. `bots/agent/src/evolution/evaluator.ts` 신규:
        - `PerformanceEvaluator` 클래스:
            - 입력: 최근 N핸드 (기본 20)의 결과 (win/loss/fold, PnL, 포지션별 승률)
            - 출력: `PerformanceScore { winRate, avgPnl, positionalEdge, bluffSuccessRate, foldEfficiency }`
            - 각 메트릭 0~1 정규화
    2. `bots/agent/src/evolution/optimizer.ts` 신규:
        - `StrategyOptimizer` 클래스 (gradient-free evolutionary strategy):
            - 현재 파라미터: `{ aggression, tightness, bluffFrequency }`
            - 돌연변이: 각 파라미터에 ±δ (기본 0.05) 가우시안 노이즈 추가
            - 선택: 현재 파라미터의 PerformanceScore vs 이전 윈도우의 PerformanceScore 비교
            - 개선되면 새 파라미터 채택, 아니면 유지 (1+1 ES)
            - 파라미터 클램핑: aggression [0.1, 0.95], tightness [0.1, 0.95], bluffFrequency [0.0, 0.8]
            - `evolve(currentParams, currentScore, prevScore) => { newParams, evolved: boolean, delta }`
    3. `bots/agent/src/evolution/types.ts` 신규:
        - `PerformanceScore`, `EvolutionResult`, `EvolutionConfig` 타입 정의
        - `EvolutionConfig`: `{ evalWindowSize: 20, mutationStdDev: 0.05, minHandsBeforeEval: 10 }`
    4. `bots/agent/src/bot.ts` 에 evolution loop 통합:
        - 핸드 카운터 유지 → 매 `evalWindowSize` 핸드마다 evaluator + optimizer 실행
        - evolved=true 시:
            a) persona 파라미터 in-memory 업데이트
            b) Gemini systemPromptOverride에 반영
            c) T-1102 `updateStrategy()` 온체인 호출
            d) 로그: `[EVOLUTION] v{N} → v{N+1}: aggression {old}→{new}, tightness {old}→{new}, bluff {old}→{new}`
        - 최소 `minHandsBeforeEval` 핸드 이전에는 evolution 스킵
    5. `bots/agent/src/evolution/evaluator.test.ts` + `optimizer.test.ts`:
        - evaluator: 다양한 핸드 시퀀스에 대한 PerformanceScore 계산 검증
        - optimizer: 개선 시 파라미터 변경, 악화 시 유지, 클램핑 동작 검증
        - edge case: 모든 핸드 win, 모든 핸드 lose, N=0 핸드
- Acceptance:
    - 20핸드 플레이 후 자동으로 성과 평가 실행
    - 성과가 이전 윈도우보다 개선되면 파라미터 자동 조정
    - 조정된 파라미터가 즉시 Gemini 프롬프트에 반영
    - T-1102를 통해 새 전략 버전이 온체인에 기록
    - 파라미터가 정의된 범위 밖으로 벗어나지 않음
    - evolution이 게임 진행을 블록하지 않음 (비동기)
    - 유닛 테스트 최소 12개
- Commit: `feat(agent): implement self-play strategy evolution with on-chain version tracking`

---

## T-1104 GTO Baseline + Deviation Analysis (P1)
- Status: [ ] TODO
- Depends on: existing Gemini strategy, existing HandEvaluator
- Goal: AI 의사결정을 Game Theory Optimal 기준과 비교하여 "explainable AI" 내러티브를 강화한다.
- Scope:
    - **에이전트**: 프리플롭 GTO 레인지 테이블 + deviation 계산 모듈
    - **OwnerView**: deviation 데이터 저장/조회
    - **인덱서**: deviation 통계 집계
    - **웹**: 에이전트 프로필에 GTO Conformance 메트릭 표시
- Tasks:
    1. `bots/agent/src/gto/ranges.ts` 신규:
        - 프리플롭 GTO 레인지 룩업 테이블 (heads-up/4-handed 포지션별):
            - 포지션별 (UTG, CO, BTN, SB, BB) open-raise/call/3bet 레인지
            - 핸드 표기: "AKs", "QJo", "TT" 등 → action 매핑
            - 소스: 공개 GTO 솔버 결과 기반 단순화 (169 핸드 조합)
        - `getGTOAction(position, holeCards, facingAction) => { action: "raise"|"call"|"fold", frequency: number }`
        - frequency: mixed strategy인 경우 확률 (e.g., "ATs UTG raise 70% / fold 30%")
    2. `bots/agent/src/gto/deviation.ts` 신규:
        - `DeviationAnalyzer` 클래스:
            - `analyze(position, holeCards, aiAction, facingAction) => DeviationResult`
            - `DeviationResult`: `{ gtoAction, gtoFrequency, aiAction, isDeviation: boolean, deviationType: "tighter"|"looser"|"passive"|"aggressive"|"aligned", severity: 0~1 }`
            - severity: 0 = GTO 일치, 1 = 정반대 (e.g., GTO raise 100% → AI fold)
        - `getAggregate(deviations: DeviationResult[]) => { conformance: number, avgSeverity, deviationsByType }`
    3. `bots/agent/src/bot.ts` 에 deviation tracking 통합:
        - 매 프리플롭 의사결정 후 `DeviationAnalyzer.analyze()` 호출
        - 결과를 OwnerView에 POST (기존 reasoning 저장 경로 확장)
    4. `services/ownerview/src/routes/reasoning.ts` 확장:
        - `POST /reasoning` body에 `gtoDeviation?: DeviationResult` 필드 추가
        - `GET /reasoning` 응답에 deviation 데이터 포함
    5. `services/indexer/src/api/routes.ts` 에 deviation 통계 endpoint:
        - `GET /agents/:address/gto-stats` → 최근 N핸드의 GTO conformance %, deviation breakdown
    6. `apps/web/src/app/agent/[token]/page.tsx` 에 "GTO Analysis" 섹션:
        - GTO Conformance 게이지 (0~100%)
        - Deviation breakdown: tighter/looser/passive/aggressive 비율 차트
        - 최근 5핸드의 "AI chose X, GTO suggests Y" 비교 카드
        - 색상: conformance 높으면 green, 낮으면 orange (judgement, not "bad")
    7. `bots/agent/src/gto/ranges.test.ts` + `deviation.test.ts`:
        - ranges: 대표 핸드별 GTO 액션 검증 (AA는 항상 raise, 72o UTG는 항상 fold 등)
        - deviation: aligned/deviation 분류 정확성, severity 계산, aggregate conformance
- Acceptance:
    - 169개 프리플롭 핸드 조합에 대해 포지션별 GTO 액션 조회 가능
    - 매 프리플롭 의사결정마다 GTO deviation이 자동 계산
    - 에이전트 프로필에 GTO Conformance % 표시
    - deviation breakdown 차트가 정상 렌더링
    - "AI chose X, GTO suggests Y" 비교 UI 동작
    - 유닛 테스트 최소 15개 (ranges 8 + deviation 7)
- Commit: `feat(agent,ownerview,indexer,web): add GTO baseline and deviation analysis`

---

## T-1105 Multi-Agent Strategy Evolution Dashboard (P1)
- Status: [ ] TODO
- Depends on: T-1102 (strategy registry), T-1103 (evolution), existing ELO system
- Goal: 에이전트들의 전략이 시간에 따라 어떻게 변화하고 상호작용하는지 시각화한다. "AI 메타게임 진화를 관찰할 수 있다."
- Scope:
    - **인덱서**: strategy evolution 시계열 데이터 집계 API
    - **웹**: 새 `/evolution` 페이지 + 에이전트 프로필 evolution 차트
- Tasks:
    1. `services/indexer/src/api/routes.ts` 에 evolution 데이터 API 추가:
        - `GET /evolution/timeline?agents=addr1,addr2,...&limit=100`
            - 반환: 에이전트별 `{ agent, strategies: [{ version, aggressionBps, tightnessBps, bluffFreqBps, handNumber, timestamp, eloAtTime }] }`
        - `GET /evolution/meta-shifts?period=24h|7d|all`
            - 반환: 시간대별 전체 에이전트 평균 aggression/tightness 추이 (메타 트렌드)
    2. `apps/web/src/app/evolution/page.tsx` 신규 — Evolution Dashboard 페이지:
        - **Strategy Timeline Chart** (multi-line): 각 에이전트의 aggression/tightness를 핸드 넘버 X축으로 표시
            - 라인 색상: 에이전트 페르소나 colorAccent
            - 호버: 해당 시점의 전략 파라미터 + ELO 표시
        - **Meta Game Radar**: 현재 시점 전체 에이전트의 평균 전략 레이더 차트
        - **ELO vs Strategy Scatter**: X축 aggression, Y축 ELO → 어떤 전략이 현재 메타에서 유리한지 시각화
        - **Evolution Event Log**: 최근 전략 변경 이벤트 타임라인 (에이전트 이름, 파라미터 delta, on-chain tx link)
    3. `apps/web/src/app/agent/[token]/page.tsx` "AI Strategy Profile" 섹션 강화:
        - 기존 레이더 차트 하단에 "Strategy Evolution" 미니 차트 추가:
            - 이 에이전트의 aggression/tightness 변화를 시간축으로 표시
            - 마지막 evolution 이벤트 하이라이트
    4. `apps/web/src/components/charts/` 에 차트 컴포넌트:
        - `StrategyTimeline.tsx` — multi-line 시계열 차트 (CSS-based 또는 lightweight 라이브러리)
        - `MetaRadar.tsx` — 전체 에이전트 평균 레이더
        - `EloStrategyScatter.tsx` — 산점도
    5. 내비게이션에 `/evolution` 링크 추가
- Acceptance:
    - `/evolution` 페이지에서 전체 에이전트의 전략 변화 타임라인 확인 가능
    - 에이전트별 라인이 구분되고 호버 시 상세 정보 표시
    - ELO vs Strategy 산점도에서 현재 메타 트렌드 파악 가능
    - 에이전트 프로필에 개별 전략 진화 미니 차트 표시
    - 데이터 없는 경우 적절한 빈 상태 표시
    - 모바일 반응형 레이아웃
- Commit: `feat(indexer,web): add multi-agent strategy evolution dashboard`

---

## T-1106 Treasury AI Multi-Signal Enhancement (P1)
- Status: [ ] TODO
- Depends on: existing TreasuryAdvisor, existing vault snapshots, T-1103 (evolution data)
- Goal: Treasury AI의 분석 깊이를 강화하여 "AI가 DeFi 트레이딩을 자율적으로 수행" 내러티브를 뒷받침한다.
- Scope:
    - **킵퍼**: TreasuryAdvisor에 다중 시그널 분석 추가
    - **웹**: 리밸런싱 이력에 강화된 분석 표시
- Tasks:
    1. `bots/keeper/src/treasury/signals.ts` 신규:
        - `SignalCollector` 클래스 — 리밸런싱 의사결정 전 다중 시그널 수집:
            - **Performance Signal**: 최근 5핸드 승률 + 누적 PnL 추세 (상승/하락/횡보)
            - **NAV Momentum**: 최근 5 vault snapshot에서 NAV/share 변화율 (moving average)
            - **Rebalance History Signal**: 최근 5회 리밸런싱 결과 분석 (buy 후 NAV 상승했나? sell 후 안정적이었나?)
            - **Volatility Signal**: 최근 PnL의 표준편차 → 높으면 보수적, 낮으면 적극적 리밸런싱 추천
        - `collectSignals(vaultState, recentHands, recentSnapshots, recentRebalances) => MultiSignalContext`
        - `MultiSignalContext`: `{ performanceTrend, navMomentum, rebalanceEffectiveness, volatility, overallSentiment: "bullish"|"bearish"|"neutral" }`
    2. `bots/keeper/src/treasury/advisor.ts` 확장:
        - `TreasuryAdvisor.advise()` 에 `MultiSignalContext` 주입
        - Gemini 프롬프트에 시그널 요약 추가:
            ```
            Additional market signals:
            - Performance: {trend} (win rate {x}%, cumulative PnL {y})
            - NAV momentum: {momentum} ({z}% change over last 5 snapshots)
            - Recent rebalance effectiveness: {effectiveness}
            - Volatility: {vol} (std dev of recent PnL)
            - Overall sentiment: {sentiment}
            
            Factor these signals into your buy/sell/skip decision and sizing.
            ```
        - 응답 factors에 새 필드 추가: `volatilityAssessment`, `momentumRead`
    3. `bots/keeper/src/treasury/signals.test.ts`:
        - 상승 추세 → bullish sentiment 검증
        - 고변동성 → conservative sizing 권장 검증
        - 빈 데이터 → neutral fallback 검증
    4. `services/ownerview/src/routes/reasoning.ts` — treasury reasoning에 signals 필드 추가:
        - `POST /treasury-reasoning` body에 `signals?: MultiSignalContext` 추가
        - `GET /treasury-reasoning` 응답에 signals 포함
    5. `apps/web/src/app/agent/[token]/page.tsx` 리밸런싱 확장 UI:
        - 기존 expandable row에 "Market Signals" 서브섹션 추가:
            - Performance trend badge (Bullish / Bearish / Neutral + 색상)
            - NAV momentum indicator (↑↓→ + 변화율 %)
            - Volatility gauge (Low / Medium / High)
            - Rebalance effectiveness score
- Acceptance:
    - TreasuryAdvisor가 4개 시그널을 수집하여 Gemini 프롬프트에 주입
    - 리밸런싱 reasoning에 시그널 기반 분석이 포함
    - 웹 UI에서 시그널 데이터가 시각적으로 표시
    - 시그널 수집 실패 시 graceful degradation (기존 advisor 동작 유지)
    - 유닛 테스트 최소 8개
- Commit: `feat(keeper,ownerview,web): enhance treasury AI with multi-signal analysis`

---

# 전체 실행 계획 요약

| 티켓 | 설명 | 난이도 | 데모 임팩트 | 핵심 내러티브 |
|------|------|--------|------------|---------------|
| T-1101 | AI Game Commentary | 중하 | ★★★★★ | "AI가 플레이도 하고 해설도 한다" |
| T-1102 | On-chain Strategy Registry | 중 | ★★★★ | "검증 가능한 AI 진화" |
| T-1103 | Self-Play Evolution | 중상 | ★★★★★ | "AI가 on-chain에서 학습한다" |
| T-1104 | GTO Deviation Analysis | 중 | ★★★★ | "Explainable AI" |
| T-1105 | Evolution Dashboard | 중 | ★★★★ | "메타게임 진화 관찰" |
| T-1106 | Treasury Multi-Signal | 중하 | ★★★ | "자율 DeFi 트레이딩" |

**피칭 앵글**: "PlayerCo — AI agents that play poker, learn from experience, evolve their strategies, and manage their own treasury. All verifiable on-chain."
