# SCENARIO.md — User Scenarios by Role

> PlayerCo 플랫폼의 모든 유저 역할별 상세 시나리오.
> 각 시나리오는 유저의 동기, 진입 경로, 핵심 플로우, 엣지 케이스를 포함한다.
> 각 역할마다 최소 3개 이상의 하위 시나리오와 엣지 케이스 집합을 제공한다.

---

## Roles Overview

| Role | Wallet 필요 | 핵심 가치 | 주요 페이지 |
|------|:-----------:|-----------|------------|
| Spectator | No | AI 대결 관전 엔터테인먼트 | `/live`, `/table/:id`, `/leaderboard` |
| Bettor | Yes | AI 매치에 사이드벳으로 수익 | `/table/:id` (BettingPanel), `/live` |
| Agent Owner | Yes | 나만의 AI 에이전트 생성/운영 | `/create-agent`, `/me`, `/agent/:token` |
| Trader | Yes | 에이전트 토큰 매매 차익 | `/agent/:token` (nad.fun widget) |
| Judge (Demo) | No | 30초 안에 플랫폼 이해 | `/live` → `/create-agent` → `/verify` |
| Content Creator | Optional | 라이브 스트리밍/하이라이트 제작 | `/live`, `/table/:id`, OBS capture |
| Developer / Integrator | Optional | Indexer API/이벤트 스트림 사용 | `/docs`, REST/WS API |
| Keeper (Bot) | Yes (자동) | 게임 라이브니스 유지 | N/A (백엔드) |
| Admin | Yes (multisig) | 긴급 정지/파라미터 관리 | N/A (컨트랙트 직접) |

---

## 1. Spectator (관전자)

### 1.1 동기
- "AI끼리 포커 치는 거 구경하고 싶다"
- 지갑 없이도, 회원가입 없이도 바로 볼 수 있어야 함
- 다양한 진입 경로: 소셜 링크, 검색, 친구 추천, 북마크 재방문

### 1.2 시나리오 A: 첫 방문 — "뭐 하는 사이트지?"

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

### 1.3 시나리오 B: 돌아온 레일버드 (Daily Regular)

**동기**: 매일 퇴근 후 1시간 정도 가볍게 관전하는 고정 팬

1. **북마크로 `/live` 직행** — 랜딩 페이지 안 거침
2. **즐겨찾기 에이전트 필터**
   - 관심 에이전트(e.g., SharkBot, RockBot) 북마크 기반 테이블 우선순위 노출
   - 즐겨찾기 에이전트가 포함된 테이블이면 자동 전환 우선권
3. **핸드 요약 다이제스트**
   - 마지막 방문 이후 하이라이트 핸드 (큰 팟, 역전 쇼다운, 올인) 타임라인 표시
   - 각 하이라이트 → `/table/:id?hand=N` 딥링크 재생
4. **리더보드 변동 알림**
   - 마지막 방문 이후 순위 변동 TOP 5 배지
   - "SharkBot가 3위 → 1위" 스타일 표시
5. **Spectator 레벨 / 배지 (gamification, 선택)**
   - 관전 시간 누적 → "Silver Railbird", "Gold Railbird" 배지
   - 지갑 없이 로컬스토리지 기반 tracking (익명)

### 1.4 시나리오 C: 딥링크 진입 — "친구가 이 핸드 보래"

**동기**: Discord/Twitter에서 특정 핸드 링크를 받고 들어옴

1. **딥링크** `/table/:id?hand=127` 클릭
2. 해당 핸드 시점으로 테이블 뷰 복원
   - 커뮤니티 카드, 팟, 각 시트 액션 순서 재생(replay)
   - 쇼다운까지 step-through 가능
3. "Why?" 버튼으로 해당 핸드의 결정 내역 즉시 확인
4. **핸드 공유 버튼** → 재전파
   - 이미지 카드 자동 생성 (OG image): 커뮤니티 카드 + 쇼다운 결과 + 에이전트 이모지
   - X/Discord/Telegram 공유 프리셋

### 1.5 시나리오 D: 모바일 세로 관전

**동기**: 지하철/침대에서 한 손 관전

1. **모바일 접속 시 자동 세로 레이아웃**
   - 상단: 테이블 (커뮤니티 카드 + 팟)
   - 중단: 시트별 간소화된 카드 (가로 스크롤)
   - 하단: Action Log + AI Commentary (탭 전환)
2. **스와이프 제스처**
   - 좌우 스와이프 → 다른 테이블 전환
   - 위로 당기기 → Decision Breakdown 펼침
3. **백그라운드 알림 (옵션)**
   - 웹 푸시 승인 시: "올인 임박", "쇼다운 결과" 알림
   - 탭 복귀 → 해당 핸드로 자동 점프

### 1.6 시나리오 E: 멀티 테이블 모니터링 (파워 레일버드)

**동기**: 여러 테이블을 한 번에 보고 싶음

1. **Multi-view mode (`/live?mode=grid`)**
   - 2x2 또는 3x3 그리드로 최대 9테이블 동시 표시
   - 각 셀: 간소화된 테이블 (팟, 시트, 최근 액션)
2. **하이라이트 셀 auto-pop**
   - 한 테이블에서 올인 발생 → 해당 셀 테두리 glow + 중앙 확대 모달
   - 쇼다운 종료 시 자동 축소
3. **사운드 알림 토글**
   - 큰 팟, 올인 시 짧은 효과음 (토글 가능)

### 1.7 엣지 케이스
- **데이터 없음**: `/live` 접속 시 활성 테이블 없으면 → "Waiting for next hand..." 표시
- **VRF 지연**: VRF 콜백 대기 중 → "Dealing cards..." 상태 표시, 스피너
- **인덱서 지연**: 이벤트 stream lag 5초 초과 → 상단에 "Feed delayed" 배너
- **WebSocket 끊김**: 자동 재연결 + 마지막 수신 시점부터 이벤트 백필
- **모바일**: 세로 레이아웃 반응형, 사이드바가 하단으로 이동
- **테이블 전환**: 보던 테이블 핸드 종료 → 자동으로 다음 활발한 테이블로 전환 (수동 선택도 가능)
- **딥링크 만료**: 오래된 핸드 딥링크 → "Replay not available (indexer retention)"
- **OG 이미지 생성 실패**: 폴백 정적 이미지로 대체
- **동일 IP 과도 요청**: rate limit 초과 → "Too many requests" + 쿨다운 안내

---

## 2. Bettor (사이드벳 참여자)

### 2.1 동기
- "저 에이전트가 이길 것 같은데, 베팅해볼까"
- Spectator에서 시작해서 지갑 연결 후 베팅으로 전환
- 분석 기반 수익 추구, 엔터테인먼트 베팅, 하이롤러 액션 등 스타일 다양

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
4. **자동 베팅 추천 (읽기 전용 힌트)**
   - "이 매치업에서 SharkBot의 과거 승률 62%" 같은 힌트 노출
   - 최종 결정은 유저가 수동 클릭 (자동 실행 없음)

### 2.4 시나리오 C: 분석형 베터 (Stats-Driven)

**동기**: "ROI 극대화. 수치 없이는 안 베팅함."

1. **에이전트 비교 테이블**
   - 대상 핸드의 시트별 에이전트 사이드-by-사이드 비교
   - VPIP / PFR / AF / Showdown Win% / EV per hand
2. **매치업 히스토리 조회**
   - 과거 동일 매치업 (A vs B) 승패 카운트
   - 최근 10핸드 결과 리스트
3. **포지션/스택 불균형 경고**
   - "Seat 0는 short stack, all-in 리스크 높음" 배지
4. **Kelly-like 사이징 힌트 (읽기 전용)**
   - 과거 승률 기반 "권장 베팅 비중" 힌트 (최종 판단은 유저)
5. 베팅 후 결과 자동 기록 → 개인 ROI 스냅샷 페이지

### 2.5 시나리오 D: 하이롤러 / 고래 베팅

**동기**: 큰 금액 한 방

1. **대형 베팅 시 경고 모달**
   - "This bet is > 10% of current pool. Expected odds will drop to X."
   - 확인 체크박스 필요
2. **슬리피지 표시**
   - 자신의 베팅이 풀에 들어간 후의 재계산된 implied odds 미리보기
3. **대형 베팅 트랜잭션 확인**
   - 2-step: approve 금액 상한 + place bet
4. **베팅 후 풀 임팩트 시각화**
   - 풀 파이차트에서 자신의 점유율 강조
5. **쇼다운 시 애니메이션 강조**
   - 큰 베팅 이긴 경우 "BIG WIN" 배지 (공개는 옵션, 익명 지갑 표시)

### 2.6 시나리오 E: 엔터테인먼트 베터 (Casual)

**동기**: 소액, 재미 위주. ROI 무관심.

1. **원클릭 베팅 UI**
   - 프리셋 금액 버튼 (10 / 50 / 100 RCHIP)
   - 시트 아이콘 클릭 한 번 → 즉시 approve+bet 통합 흐름
2. **"All-in on vibes" 무드 모드**
   - 소액 랜덤 배정 옵션: 버튼 누르면 랜덤 시트에 프리셋 금액 베팅
3. **베팅 후 간단 alert만** — 복잡한 통계는 안 보여줌
4. 히스토리는 "오늘 얼마 썼나" 정도만 요약

### 2.7 시나리오 F: 연패 후 행동

**동기**: 연속으로 졌을 때 유저 보호 / 차분한 UX

1. **연패 감지**: 최근 5회 베팅 중 4회 이상 loss
2. **Cooldown suggestion 모달 (선택적 표시)**
   - "You've had a rough streak. Take a break?" 안내
   - 강제 중단 아님, 닫기 가능 (자율성 존중)
3. **손실 누적 표시**: 최근 24h 손실 합계 프롬프트
4. **"Reduce bet size" 토글** — 프리셋 금액 자동 절반 권장

### 2.8 엣지 케이스
- **지갑 미연결**: 베팅 시도 → "Connect Wallet" 프롬프트
- **잔고 부족**: RCHIP 잔고 < 베팅 금액 → "Insufficient RCHIP balance" 에러
- **approve 실패, bet 성공 없이 종료**: 첫 step만 성공 후 사용자 중단 → approve 남지만 베팅 미진행, 다음 베팅 시 재사용
- **이미 정산된 풀**: settle 된 핸드에 베팅 시도 → 컨트랙트 revert "Pool already settled"
- **베팅 가능 시간 외**: BETTING_PRE ~ BETTING_RIVER 외 상태에서 베팅 시도 → revert
- **중복 클레임**: 이미 claim한 bet에 다시 claim → revert (Bet.claimed flag)
- **빈 풀**: 아무도 안 건 풀 settle → 정상 처리 (분배할 것 없음)
- **트랜잭션 실패**: 네트워크 오류 등 → 실패 상태 표시 + 재시도 안내
- **블록 경합**: 같은 블록 내 둘 이상의 placeBet → 테이블-핸드 lock 없으면 허용, 한쪽만 반영되도록 컨트랙트 처리
- **시트 사임(abandoned)**: 베팅한 시트가 중도 이탈(operator crash, auto-fold) → 컨트랙트 규칙대로 "seat did not win"으로 처리, 기대값 공지
- **지갑 스위치**: 베팅 후 다른 지갑으로 스위치 → claim은 원래 베팅 지갑만 가능
- **우발적 이중 탭**: 모바일 double-tap → debounce 필요 (클라이언트 UX)
- **가스 부족**: 베팅은 approve/place 모두 가스 필요 → 가스 잔고 체크 후 "Insufficient gas" 사전 경고

---

## 3. Agent Owner (에이전트 소유자)

### 3.1 동기
- "나만의 AI 에이전트를 만들어서 포커 테이블에 앉히고 싶다"
- 에이전트 전략 커스터마이징, 성과 모니터링, hole card 확인
- 여러 에이전트 운영 (포트폴리오), 부진 디버깅, 재배포

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

### 3.5 시나리오 D: 멀티 에이전트 포트폴리오

**동기**: "스타일 다른 에이전트 3개 돌리고 상대적 성과 비교"

1. **`/me` 포트폴리오 뷰**
   - 에이전트 카드 그리드 (3~10개)
   - 합계 PnL, 총 buy-in 대비 ROI
   - 정렬: ROI / PnL / 핸드 수 / 최근 활동
2. **비교 차트 모달**
   - 체크박스 2~3개 선택 → PnL 시계열 overlay
   - 레이더 차트 겹치기
3. **일괄 관리 (MVP 이후)**
   - 전체 중지 / 전체 상태 확인
   - 배치 액션은 per-agent 순차 실행
4. **포트폴리오 알림**
   - 특정 에이전트가 buy-in 20% 이하로 떨어지면 "Low stack warning"
   - 올인 임박 / 토너먼트 버블 등 이벤트 푸시

### 3.6 시나리오 E: 부진 디버깅 (Underperformer Review)

**동기**: "이 에이전트 왜 계속 지지? 뭘 잘못하고 있지?"

1. **Loss Analysis 뷰** (`/agent/:token?view=losses`)
   - 최근 20핸드 중 loss 핸드만 필터
   - 각 핸드: Pre/Flop/Turn/River 액션 리플레이
2. **EV delta 강조**
   - 각 결정의 EV Estimate vs 실제 결과 (+/- 잔차)
   - GTO Deviation이 큰 결정 → 빨간 하이라이트
3. **Opponent Exploit 노출**
   - 상대의 bluff 빈도, 내 에이전트의 fold 빈도 대비 분석
   - "상대가 당신의 tight한 스타일을 공략 중" 진단
4. **Persona 재설계 제안**
   - 현재 파라미터 vs 승률 기반 권장 파라미터 diff
   - 단, MVP는 "재배포 필요" (수정 불가)
5. **재배포 경로**
   - 기존 에이전트 stop → 조정된 persona로 new create
   - 기존 토큰/이력은 유지 (에이전트는 token 주소로 식별되지만 owner 입장 UX)

### 3.7 시나리오 F: Top-up / 재시트

**동기**: "내 에이전트가 거의 올인 직전. 더 넣어줄까, 접을까?"

1. **Low stack 알림**
   - 스택이 buy-in의 20% 이하 → `/me`에서 경고 배지
2. **Top-up 의사결정**
   - 현재 스택, 24h PnL, 오늘 승률 표시
   - MVP에서 top-up 불가 → "Stop and redeploy" 안내
3. **Graceful stop**
   - 다음 핸드 종료 후 seat exit
   - 잔여 스택 vault로 회수
4. **새 테이블 선택**
   - 더 낮은 stakes 테이블로 이동 추천

### 3.8 시나리오 G: 에이전트 간 라이벌리 (스토리)

**동기**: "내 에이전트 vs 다른 owner 에이전트, 같은 테이블 직결"

1. **라이벌 감지**
   - 프로필에 "Head-to-head vs SharkBot: 8W 5L" 같은 스탯 표시
2. **매치 알림 (옵션)**
   - 동일 테이블 착석 시 owner에게 푸시
3. **H2H 통계 페이지**
   - 두 에이전트의 상대 승률, 평균 팟 사이즈, blunder 횟수
4. **스트리머/소셜 친화**
   - "H2H 리포트 공유하기" 버튼 → OG 이미지 + 요약 텍스트

### 3.9 엣지 케이스
- **Operator wallet 고갈**: Fleet 서비스의 wallet pool 전부 사용 중 → "No operator wallets available. Try later." 에러
- **에이전트 크래시**: 봇 프로세스 크래시 → 자동 재시작 (최대 3회) → 3회 초과 시 중지 상태로 전환
- **Hole card 인증 실패**: 지갑 서명 불일치 → OwnerView 거부 → "Authentication failed" 에러
- **다른 시트 hole card 시도**: ACL 위반 → OwnerView 거부 (절대 반환 안 함)
- **에이전트 이름 중복**: 허용 (이름은 unique constraint 아님, token address가 식별자)
- **테이블 꽉 참**: 모든 시트 occupied → 해당 테이블 선택 불가
- **Buy-in 부족**: RCHIP 잔고 < buy-in → approve/deploy 단계에서 실패
- **동시 persona 수정**: MVP에서는 생성 후 수정 불가 (새 에이전트 생성 필요)
- **Fleet API 장애**: 배포 요청 실패 → 트랜잭션/자금 이동 없음, safe fail
- **Registering 단계에서 사용자 탭 종료**: Fleet가 결과 webhook로 마무리, 다음 접속 시 상태 표시
- **Operator 키 유출 의심**: owner는 stop 후 재배포, 구 operator는 블랙리스트(운영 이슈)
- **동일 지갑 다중 생성 한도**: MVP에서 owner당 에이전트 수 상한 → 초과 시 "Max agents per wallet reached"
- **Table address 변경(upgrade)**: 기존 에이전트 seat 무효화, 재배포 안내
- **Buy-in 환불**: stop 시점 스택 = 0이면 환불 없음; 잔여분은 vault로 이전

---

## 4. Trader (토큰 트레이더)

### 4.1 동기
- "이 에이전트 성과 좋은데, 토큰 사볼까"
- 에이전트 성과 기반 토큰 가격 변동에서 수익 추구
- 스테이지별(Bonding Curve / Locked / DEX) 다른 전략

### 4.2 시나리오 A: nad.fun 인앱 트레이딩 (기본 흐름)

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

### 4.4 시나리오 C: Bonding Curve 초기 진입

**동기**: "신규 에이전트 출시 직후, 커브 아래쪽에서 미리 잡자"

1. **신규 에이전트 알림**
   - `/leaderboard?filter=new` 또는 홈 "New Agents" 섹션
   - 출시 후 1시간 이내 에이전트만 노출
2. **첫 핸드 관전 + 초기 매수**
   - 에이전트가 아직 핸드 수 적음 → 성과 샘플 부족
   - 유저는 persona(전략 파라미터)와 owner 평판만 보고 결정
3. **작은 매수로 커브 아래쪽 확보**
   - 1~10 MON 정도 스몰 엔트리
4. **관찰 후 분할 매수/청산**
   - 핸드 누적 → 승률 확인 → 추가 매수 or 손절
5. **리스크 배지**
   - "No track record yet" 경고 표시

### 4.5 시나리오 D: Graduation / DEX 전환 트레이딩

**동기**: "Bonding curve 졸업 임박 or 직후, router 스위치 포착"

1. **Graduation 임박 배지**
   - "90% to graduation" 프로그레스 바 (Lens 조회 기반)
2. **Router 자동 스위치**
   - 스테이지 전환 시 위젯이 router 자동 재조회
   - 사용자 무개입
3. **Post-graduation liquidity 변동 경고**
   - 초기 DEX LP 얇음 → slippage 높음 경고
4. **분할 매도 제안**
   - "Selling 50%+ of your holdings may incur high slippage" 안내

### 4.6 시나리오 E: 이벤트 기반 스윙 (Event-Driven)

**동기**: "쇼다운 직후 가격 반응을 보고 단타"

1. **핸드 종료 푸시 알림**
   - 즐겨찾기 에이전트의 쇼다운 결과 (win/loss + 팟 크기)
2. **프로필 직행 → 가격 차트 확인**
   - 최근 리밸런싱 이력 + 직전 핸드 PnL
3. **즉시 buy/sell 결정**
   - 승리 후 상승 기대 → buy
   - 패배 후 리바운드 기대 → buy (역발상)
4. **tight stop-loss 설정 (클라이언트 UX)**
   - 가격 알림만 제공, 자동 실행 없음 (비수탁)
5. **리밸런싱 직후 창 활용**
   - Treasury 매매 → 가격 영향 → swing 기회

### 4.7 시나리오 F: 에이전트 발견 (Discovery)

**동기**: "좋은 에이전트 찾아서 장기 보유"

1. **리더보드 필터**
   - 기간: 7d / 30d / All
   - 지표: ROI / Max Stack / 승률
2. **에이전트 프로필 정밀 조회**
   - Persona / Opponent Reads / Verified AI 배지 체크
3. **Owner 활동 확인**
   - 동일 owner의 다른 에이전트 이력 — owner 신뢰도 추정
4. **Watchlist 추가 (로컬 북마크)**
   - 지갑 없이 로컬스토리지 저장
5. **감시 → 진입 타이밍 대기**
   - 리밸런싱 후 가격 반응 관찰 → 진입

### 4.8 시나리오 G: 장기 홀더 (Long-term Holder)

**동기**: "이 에이전트의 Verified AI 서사가 마음에 든다. 오래 들고 간다."

1. **정기 Treasury 스냅샷 체크**
   - NAV per share 변화 추적 (주간/월간)
2. **Rebalancing History 분석**
   - 누적 rebalancing 횟수, 누적 매수/매도 금액
3. **Verified AI 배지 유지 여부 모니터링**
   - 최근 20핸드 reasoning hash 온체인 존재 계속 유효한지
4. **매도는 rare** — 위젯은 주로 sell 탭으로 마이너 조정만

### 4.9 엣지 케이스
- **Locked 스테이지**: 토큰이 locked 상태 → "Token is currently locked. Trading unavailable." 표시 + "Open on nad.fun" fallback만 활성
- **Slippage 초과**: 실행 가격이 slippage 허용범위 초과 → 트랜잭션 revert → "Price moved too much" 에러
- **Deadline 초과**: 트랜잭션이 deadline 내 미체결 → revert → "Transaction expired" 에러
- **지갑 미연결**: 트레이딩 위젯에 "Connect Wallet to Trade" 프롬프트
- **잔고 부족**: MON/토큰 잔고 부족 → "Insufficient balance" 에러
- **Router 변경**: 토큰이 bonding curve에서 DEX로 graduation → Lens 재조회 후 router 자동 전환
- **NAV per share 하락 리밸런싱 시도**: 컨트랙트에서 자동 revert (accretive-only constraint)
- **Lens 장애**: quote 조회 실패 → "Quote unavailable. Open on nad.fun" fallback 강제
- **가격 급변 race**: quote → tx 사이 가격 이동 → slippage 보호로 revert
- **Approve 무한대 여부**: 기본 approve는 해당 거래액 한정, 무한대는 옵트인
- **가스 토큰 부족**: MON 있어도 가스 모자라면 tx 실패 → 사전 안내
- **지원하지 않는 지갑**: WalletConnect 세션 끊김 → 재연결 안내
- **익명 토큰 스캠 우려**: 플랫폼 외부 contract와 충돌 방지 — in-app 위젯은 오직 등록된 agent token만 노출

---

## 5. Judge / Demo Viewer (심사위원)

### 5.1 동기
- "이 프로젝트가 뭔지 30초 안에 이해하고 싶다"
- AI 트랙 평가: AI 깊이, DeFi 크로스오버, 기술적 참신성
- 시간 부족한 심사위원 / 기술 딥다이브 심사위원 / 회의적 심사위원 등 스펙트럼 존재

### 5.2 시나리오 A: 해커톤 데모 (Golden Path, 5분)

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

### 5.3 시나리오 B: 30초 엘리베이터 데모 (시간 초압축)

**상황**: 부스 순회 심사위원, 30초만 줌

1. **`/live` 한 화면**
   - "지금 진짜 AI가 포커 치고 있음"
2. **올인 한 번 → 쇼다운** 기다렸다가 시각 효과 보여주기
3. **"Why?" 단 1회 클릭** — Decision Breakdown 1초 표시
4. **한 문장 결론**: "AI가 자율 플레이 + 모든 결정 온체인 검증"
5. 명함 + `/verify` URL 전달

### 5.4 시나리오 C: 기술 딥다이브 심사위원

**동기**: "진짜 이게 동작해? 코드/아키 보여줘"

1. **`/verify` 직행** — hash 대조 실제 수행
2. **Block explorer 링크 직접 클릭** — on-chain reasoning hash 확인
3. **Agent profile의 Verified AI 배지 상세**
   - 최근 20핸드 hash 리스트 + 타임스탬프
4. **컨트랙트 주소 요청 → README/DEPLOY.md 제시**
5. **VRF 상태 위젯 설명** — 커뮤니티 카드 생성 투명성
6. **GitHub 레포 노출** (공개 레포)
7. 필요 시 Indexer REST/WS 엔드포인트 시연

### 5.5 시나리오 D: 회의적 심사위원 (Trust-minimized 요구)

**동기**: "프론트가 거짓말 안 친다는 걸 어떻게 증명?"

1. **Verifier 페이지에서 임의 핸드/테이블 입력**
2. **UI 숫자 vs on-chain hash 일치 여부 확인**
3. **Hole card 노출 안 된다는 점 강조**
   - OwnerView는 wallet signature 없이는 절대 hole card 반환 안 함
4. **Treasury Accretive-only**:
   - Revert 조건을 컨트랙트 코드에서 직접 보여주기
5. **Pause 메커니즘** — Admin 오용 방지 multisig 설명
6. **플랫폼 kill switch 가능성 및 한계 설명**

### 5.6 시나리오 E: DeFi-focused 심사위원

**동기**: "토큰 이코노미 / 리밸런싱 모델이 핵심"

1. **Agent profile의 Treasury A/B/N/P 설명**
2. **NAV per share 그래프** — 시간에 따른 변화
3. **Rebalancing history** — 매 핸드별 매매 로그
4. **Accretive-only 규칙**의 수학적 보장
5. **nad.fun 인앱 위젯** 실제 매수 시연 (옵션)

### 5.7 심사위원 관점 체크리스트
- [ ] AI Depth: opponent modeling, counter-strategy, decision breakdown, GTO deviation
- [ ] DeFi Crossover: on-chain side betting, treasury rebalancing, nad.fun token trading
- [ ] Platform Openness: anyone can create AI agent, open registration
- [ ] Transparency: explainable AI ("Why?"), verifiable AI audit trail
- [ ] Real-time: live ESPN mode, WebSocket updates, AI commentary
- [ ] On-chain: VRF cards, commit/reveal, reasoning hash, side bets, settlement
- [ ] Safety: emergency pause, accretive-only, wallet-based auth
- [ ] Liveness: 30m timeouts, keeper bot, VRF retry

### 5.8 엣지 케이스
- **데모 중 VRF 지연**: 기본 라이브가 멈춤 → 미리 준비한 `?hand=` 딥링크로 우회
- **빈 테이블**: 데모 직전 모든 테이블 종료 → staging 데이터셋에서 리플레이
- **Wi-Fi 불안**: 로컬 Indexer 캐시로 fallback (선택적 offline 데모 빌드)
- **Wallet 연결 실패**: "Connect-less demo" 모드 — 읽기 전용 기능만 시연

---

## 6. Content Creator / Streamer (신규)

### 6.1 동기
- "AI 포커 라이브를 내 채널에서 중계하고 싶다"
- 하이라이트 클립 제작, Shorts/Reels 편집
- 시청자와 인터랙션 + 사이드벳 참여 유도

### 6.2 시나리오 A: 라이브 스트리밍 (OBS / Twitch)

1. **전용 "Stream Mode" URL (`/live?stream=1`)**
   - UI 오버레이 최소화, 풀블리드 테이블
   - 투명 배경 옵션 (chroma key 친화)
   - 큰 폰트, 고대비 색상
2. **오버레이 컴포넌트**
   - 팟 크기, 커뮤니티 카드, 에이전트 스택만 표시
   - AI Commentary 토글 가능
3. **"Caster Controls"** (단축키)
   - 다음 테이블 / 이전 테이블
   - 쇼다운 replay 정지/재생
4. **시청자 참여 링크**
   - 현재 핸드 딥링크 자동 복사 → 채팅 붙여넣기
5. **Decision Breakdown "방송용" 확대 모드**
   - 큰 숫자, 애니메이션 강조

### 6.3 시나리오 B: 하이라이트 클립 제작

1. **Highlight Builder (`/table/:id?view=clips`)**
   - 특정 핸드 선택 → 시작/끝 타임라인 설정
   - 자동 생성: 큰 팟 / 올인 / 블러프 성공
2. **클립 익스포트**
   - MP4 렌더 (서버 or 클라이언트) — MVP는 "화면 녹화 안내" 정도일 수도
   - OG 이미지 자동 생성 (썸네일용)
3. **시청자 공유 카드**
   - "AI가 블러프 성공" 자동 캡션
4. **크레딧 표시**
   - 에이전트 이름, 해시 링크, `/verify` 딥링크

### 6.4 시나리오 C: 시청자 인터랙션 (커뮤니티 크리에이터)

1. **시청자가 특정 에이전트에 베팅하도록 안내**
2. **스트리머 전용 referral 코드 (선택)** — MVP는 단순 링크 트래킹
3. **스트리머 채널 위젯**
   - 현재 시청 중인 테이블의 요약을 방송 UI에 노출
4. **Q&A: "이 AI는 왜 이렇게 했지?"**
   - 스트리머가 "Why?" 클릭 → 실시간으로 시청자에게 설명

### 6.5 엣지 케이스
- **스트림 모드에서 민감 정보 노출**: Owner hole cards 절대 안 보임 (공개 뷰 기준)
- **장시간 세션**: WebSocket 끊김 자동 재연결
- **저작권**: 에이전트 이모지/이름은 플랫폼 공개 데이터, 스트리머가 사용 가능
- **모바일 스트리밍**: 세로 9:16 "Vertical Stream" 레이아웃 (옵션)

---

## 7. Developer / Integrator (신규)

### 7.1 동기
- "Indexer API로 데이터 가져와서 분석/대시보드 만들고 싶다"
- 커뮤니티 봇, 알림 서비스, 외부 대시보드
- AI 결정 데이터셋 확보해서 연구

### 7.2 시나리오 A: 공개 REST API 사용

1. **`/docs` 또는 README의 API 섹션 참조**
2. **엔드포인트 예시**
   - `GET /api/tables` — 활성 테이블 목록
   - `GET /api/tables/:id/hands` — 핸드 히스토리
   - `GET /api/agents/:token` — 에이전트 메타 + 성과
   - `GET /api/leaderboard?range=7d`
3. **레이트 리밋**
   - 익명 요청: 60 req/min
   - API key (옵션): 600 req/min
4. **JSON 스키마 예시 + 샘플 응답**

### 7.3 시나리오 B: WebSocket 실시간 스트림

1. **`wss://.../stream?table=0xABC...`**
2. **이벤트 타입**
   - `hand_started`, `action`, `street_advanced`, `showdown`, `hand_settled`, `rebalanced`
3. **재연결 프로토콜**
   - `last_event_id` 기반 백필
4. **샘플 클라이언트** (Node / Python / browser)

### 7.4 시나리오 C: 커뮤니티 봇 제작

**예: Discord 알림 봇**

1. WS 구독 → 큰 팟 / 올인 / 신규 에이전트 이벤트 감지
2. Discord webhook으로 임베드 전송
3. 각 알림에 `/table/:id?hand=N` 딥링크 포함

### 7.5 시나리오 D: AI 결정 데이터셋 분석

1. **핸드 히스토리 덤프 조회**
2. **각 결정의 reasoning hash + 공개 reasoning 요약 수집**
3. **로컬에서 GTO 근사치와 비교 분석**
4. **연구 논문/블로그 post용 데이터로 활용**
5. **Verifier 엔드포인트로 hash 재검증**

### 7.6 시나리오 E: 3rd-party 위젯 임베드

1. **`<iframe src="/embed/table/:id?theme=dark">`** 형태
2. **커뮤니티 사이트에 임베드** — 라이브 테이블 위젯
3. **허용 도메인 화이트리스트** (CSP)

### 7.7 엣지 케이스
- **API 인덱서 지연**: 체인 이벤트 수신과 API 노출 사이 지연 — 응답에 `indexer_lag_sec` 메타 포함
- **스키마 변경**: 버전 프리픽스 `/api/v1/...`
- **WS 과다 구독**: 최대 동시 구독 수 제한
- **레이트 리밋 초과**: 429 응답 + `Retry-After`
- **공개 도중 private 필드 노출 금지**: hole cards는 어떤 엔드포인트도 반환하지 않음 (OwnerView만 예외)
- **지원 체인 변경**: Multi-chain이면 `chain_id` 쿼리 필수

---

## 8. Keeper (Bot)

### 8.1 동기
- 게임 라이브니스 유지 (자동화)
- incentive: KeeperIncentives 컨트랙트에서 소액 보상 (optional)
- 여러 독립 Keeper가 경쟁적으로 실행 (permissionless)

### 8.2 시나리오 A: 표준 운영

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

### 8.3 시나리오 B: Keeper 경쟁 (Permissionless)

**동기**: 여러 Keeper가 같은 기회를 노림

1. 이벤트 감지 → 실행 결정
2. 무작위 짧은 지터(jitter)로 블록 경합 완화
3. 컨트랙트에서는 먼저 포함된 tx가 승리, 나머지는 revert
4. Keeper 운영자는 가스 전략/지연 튜닝으로 성공률 개선
5. Incentive 적립 → 운영 비용 회수

### 8.4 시나리오 C: 부분 장애 회복

1. **VRF 프로바이더 장애**
   - 반복 재시도 실패 → 알림 + admin fallback 경로
2. **RPC 장애**
   - multi-RPC fallback
3. **Keeper 프로세스 크래시**
   - systemd / docker restart policy
4. **Keeper wallet 가스 고갈**
   - 자동 top-up 알림, 혹은 다른 Keeper에 위임

### 8.5 시나리오 D: Keeper 모니터링 대시보드 (옵션)

1. 내부 운영 대시보드 (public 아님)
2. 지표: 성공 tx 수, revert 수, 평균 응답 시간, 누적 인센티브
3. 알림: VRF lag, 타임아웃 누적 테이블 수

### 8.6 엣지 케이스
- **이중 실행**: 두 Keeper가 동시에 같은 함수 호출 → 하나는 revert (idempotency)
- **가스 부족**: Keeper wallet 가스 고갈 → 알림/로그 + 다른 Keeper가 대신 실행
- **VRF 영구 실패**: 재시도 한도 초과 → 핸드 취소 또는 admin 개입 필요
- **체인 재조직(reorg)**: 트랜잭션이 reorg되면 상태 복원 후 재실행 시도
- **블록 경합 실패**: 같은 블록에 여러 Keeper tx → 승자만 반영, 나머지 gas 손실
- **인센티브 풀 고갈**: 인센티브 없어도 운영 계속 (알트루이스트 / admin fallback)

---

## 9. Admin / Risk Manager

### 9.1 동기
- 긴급 상황 대응, 시스템 파라미터 관리
- 지속 가능한 운영 (모니터링, 튜닝, 인시던트 리뷰)

### 9.2 시나리오 A: 긴급 정지 (Emergency Pause)

1. 이상 징후 감지 (e.g., 비정상적 리밸런싱, 컨트랙트 버그 의심)
2. Multisig로 `pause()` 실행
3. 모든 게임/트레이딩/리밸런싱 일시 중지
4. 원인 분석 후 `unpause()` 또는 업그레이드

### 9.3 시나리오 B: 파라미터 변경

1. **리밸런싱 파라미터 조정**:
   - `rebalanceMaxMonBps`: buy 크기 상한 (A의 bps)
   - `rebalanceMaxTokenBps`: sell 크기 상한 (B의 bps)
2. **게임 파라미터 조정**:
   - 블라인드 크기
   - 타임아웃 시간 (기본 30분)
3. Multisig 트랜잭션으로 실행

### 9.4 시나리오 C: 인시던트 대응 (Runbook)

**상황**: 비정상 가격 급등/급락, 리밸런싱 실패율 급증

1. **탐지**
   - 모니터링 알림 (가격/리밸런싱/Keeper 지표)
2. **1차 대응**
   - 해당 에이전트 또는 전체 pause
3. **근본 원인 조사**
   - 컨트랙트 이벤트 로그 + Keeper 로그 + 인덱서 데이터 cross-reference
4. **완화 조치**
   - 파라미터 tightening, 특정 테이블만 일시 정지
5. **복구**
   - unpause 후 canary 관찰
6. **회고 문서 작성**
   - 재발 방지 티켓 발행

### 9.5 시나리오 D: 주기적 헬스 체크

1. **주간 지표 리뷰**
   - 활성 테이블, 일일 핸드 수, 평균 응답 시간
   - Verified AI 배지 보유 에이전트 비율
   - 실패한 리밸런싱/사이드벳 settle 수
2. **Keeper 인센티브 풀 잔고 점검**
3. **컨트랙트 파라미터 적정성 리뷰**

### 9.6 시나리오 E: 파라미터 튜닝 (Observed Metrics 기반)

1. **문제 인식**: timeout 빈도 과도 → 게임 흐름 나쁨
2. **데이터 수집**: 최근 30일 타임아웃 분포
3. **가설**: 30분이 너무 길다 → 10분으로 축소 제안
4. **내부 승인** → multisig tx로 파라미터 교체
5. **후속 관찰**: 4주간 지표 변화 추적

### 9.7 엣지 케이스
- **단독 admin key 분실**: multisig이므로 threshold 이상 서명자 필요 → 단일 키 분실은 허용
- **pause 중 진행 중인 핸드**: 현재 핸드는 완료 허용 / 신규 핸드 개시 차단 (구현에 따라)
- **pause 직후 사이드벳**: placeBet revert, 이미 들어간 풀은 unpause 후 정상 정산
- **파라미터 변경 경합**: 동일 블록 내 두 개의 multisig tx → 나중 tx 덮어쓰기
- **긴급 복구용 admin-only 경로 오용 방지**: 명시적 role check + 이벤트 emit으로 투명성
- **Treasury upgrade 필요 시**: proxy pattern 전제, 그렇지 않으면 마이그레이션 플랜 필요

---

## 10. Cross-Role User Journeys

실제 유저는 한 역할에 머무르지 않고 여러 역할 사이를 이동한다. 아래는 대표적인 funnel과 전환 시나리오다.

### 10.1 Funnel: Spectator → Bettor → Agent Owner

1. **진입**: 친구가 보낸 `/table/:id?hand=127` 딥링크
2. **관전**: AI Commentary, Decision Breakdown 보고 흥미 발생
3. **지갑 연결**: "Side Bet" 탭 클릭 시 연결 프롬프트
4. **RCHIP 획득**: on-ramp 또는 faucet (테스트넷)
5. **첫 베팅**: 소액 (50 RCHIP)
6. **쇼다운 승리**: 클레임, 도파민
7. **반복 베팅**: 점점 분석형으로 진화 (2.4 시나리오)
8. **"직접 에이전트 만들어볼까?"** → `/create-agent`
9. **Agent Owner 전환 완료**

### 10.2 Funnel: Judge → Developer → Contributor

1. **해커톤 데모 관람** (5.2)
2. **GitHub 레포 방문** → README / ARCHITECTURE 리뷰
3. **Indexer API 호출** → 데이터 실험 (7.2)
4. **이슈 or PR 제출**
5. **커뮤니티 가입**

### 10.3 Funnel: Trader → Agent Owner

1. **에이전트 토큰 매수** (4.4 or 4.5)
2. **장기 홀더가 됨** (4.8)
3. **"내가 직접 운영하면 더 잘할 수 있지 않을까?"**
4. **Agent Owner로 전환**
5. **자기 에이전트 토큰도 보유 → 이해관계 일치**

### 10.4 Funnel: Content Creator → Community Hub

1. **스트림 모드 사용** (6.2)
2. **시청자 성장 → 커뮤니티 내 영향력 확대**
3. **Discord 봇 제작 (Developer 역할 겸업)**
4. **시청자 → Bettor/Owner로 전환 유도**

### 10.5 Cross-Role Interaction Map

```
Spectator ──(관전)──→ Table/Live
    │
    ├─ 지갑 연결 ─→ Bettor ──(사이드벳)──→ SideBetPool
    │                  │
    │                  └─(에이전트 분석)──→ Agent Profile
    │
    ├─ 지갑 연결 ─→ Agent Owner ──(생성)──→ Fleet Manager ──→ Agent Bot
    │                  │                                         │
    │                  ├─(hole cards)──→ OwnerView Service       │
    │                  │                                         │
    │                  └─(모니터링)──→ Agent Profile              │
    │                                                            │
    ├─ 지갑 연결 ─→ Trader ──(토큰 매매)──→ nad.fun Router       │
    │                                                            │
    ├─ (OBS)  ──→ Content Creator ──(stream)──→ /live?stream=1  │
    │                                                            │
    └─ (API)  ──→ Developer ──(REST/WS)──→ Indexer              │
                                                                 │
Keeper Bot ──(liveness)──→ PokerTable/SideBetPool/VRF           │
                                                                 │
Agent Bot ←──(spawn)──── Fleet Manager                          │
    │                                                            │
    ├─(opponent tracking)──→ OpponentTracker                    │
    ├─(reasoning hash)──→ BettingEngine (on-chain)              │
    ├─(decision)──→ Gemini AI → commitDecision/revealDecision   │
    └─(hole cards)──→ OwnerView Service (read)

Admin ──(multisig)──→ PokerTable.pause / params
                      PlayerVault.pause / params
                      KeeperIncentives.fund
```

---

## 11. Failure Mode Matrix (Cross-Role)

각 실패 모드와 역할별 영향 요약. 운영 팀은 이 표를 monitoring dashboard 우선순위 설정에 사용.

| Failure | Spectator | Bettor | Owner | Trader | Keeper | Admin |
|---------|-----------|--------|-------|--------|--------|-------|
| VRF 지연/실패 | "Dealing cards..." | 베팅 가능 시간 연장 | hole cards 대기 | 가격 영향 없음 | reRequestVRF 호출 | 장기화 시 pause 고려 |
| Indexer lag | "Feed delayed" 배너 | odds 부정확 가능성 | hole cards 영향 없음 (OwnerView는 별도) | quote 영향 없음 | N/A | 인덱서 스케일 |
| RPC 장애 | 읽기 영향 | 베팅 tx 실패 | 모니터링 delay | 스왑 실패 | multi-RPC fallback | RPC 운영 |
| WalletConnect 끊김 | N/A | 재연결 필요 | 재연결 필요 | 재연결 필요 | N/A | N/A |
| Operator wallet 고갈 | N/A | N/A | 배포 실패 | N/A | N/A | 지갑 풀 충전 |
| nad.fun Lens 장애 | N/A | N/A | N/A | "Open on nad.fun" fallback | N/A | 모니터링 |
| SideBetPool settled race | N/A | 이중 정산 방지 revert | N/A | N/A | idempotent | N/A |
| Treasury revert (non-accretive) | N/A | N/A | 자동 skip | 리밸런싱 누락 감지 | 다음 hand 시도 | 파라미터 검토 |
| Keeper 경합 | N/A | N/A | N/A | N/A | 가스 손실 가능 | incentive 튜닝 |
| Fleet API 장애 | N/A | N/A | 배포 실패 / stop 대기 | N/A | N/A | Fleet 복구 |

---

## 12. Scenario Priority for Demo

| Priority | Scenario | User | Why |
|:--------:|----------|------|-----|
| P0 | ESPN Mode 라이브 관전 | Spectator/Judge | 첫 인상, 30초 안에 "AI가 플레이 중" 체감 |
| P0 | Agent 생성 위자드 | Agent Owner/Judge | "누구나 AI 에이전트를 만든다" 플랫폼 내러티브 |
| P0 | 온체인 사이드벳 | Bettor/Judge | DeFi x AI 크로스오버 핵심 |
| P0 | "Why?" Decision Breakdown | Spectator/Judge | Explainable AI 차별점 |
| P1 | Opponent Modeling 표시 | Spectator/Judge | AI 깊이 증명 |
| P1 | On-chain Verification | Spectator/Judge | Trustless AI 내러티브 |
| P1 | nad.fun 인앱 트레이딩 | Trader | 토큰 이코노미 시연 |
| P1 | 딥링크 핸드 재생 (1.4) | Spectator | 바이럴 진입 경로 |
| P2 | Owner Hole Cards | Agent Owner | 보안 모델 시연 |
| P2 | Treasury Rebalancing 관찰 | Trader | Accretive-only 정책 시연 |
| P2 | Multi-agent Portfolio (3.5) | Agent Owner | 리텐션 내러티브 |
| P2 | Stream Mode (6.2) | Content Creator | 커뮤니티 확산 경로 |
| P3 | Developer API (7.2) | Developer | 에코시스템 확장 |
| P3 | Keeper 자동화 | Keeper | 백엔드 인프라 (데모에서 비가시적) |
| P3 | Admin Emergency Pause | Admin | 운영 시나리오 (데모 불필요) |

---

## 13. Open Questions / Future Scenarios

MVP 이후 고려할 시나리오. 현재 구현 범위는 아니지만, 방향성 정렬용.

- **토너먼트 모드**: 다수 에이전트 대회, 상금 풀, 시즌제
- **Persona 수정 가능**: Owner가 에이전트 파라미터를 실시간 조정 (현재 MVP는 생성 후 고정)
- **Private 테이블**: owner 초청제, 커뮤니티/친구 전용
- **ZK hole cards**: 현재 OwnerView 서비스 → 장기적으로 ZK 기반 privacy
- **Cross-agent 협업/적대 메타**: 같은 owner의 여러 에이전트 간 협업 제한, 담합 방지 정책
- **AI 모델 다변화**: Gemini 외 다른 LLM provider 선택 가능
- **Reputation 시스템**: owner 단위 신뢰도, 사기/악성 행동 탐지
- **Mobile native app**: 푸시 알림 완전 지원
- **In-game tipping**: 시청자 → 에이전트/owner 팁 전송
