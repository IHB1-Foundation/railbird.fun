# Railbird 배포 TODO (남은 작업만)

기준일: 2026-02-15  
목표: Railway + Vercel 운영 배포 완료, 실시간 게임/트레이딩 정상 동작 확인

## 1. Railway 프로젝트 구성

- [ ] Railway 프로젝트 생성
- [ ] PostgreSQL 서비스 1개 생성
- [ ] 앱 서비스 8개 생성: `ownerview`, `indexer`, `keeper`, `vrf-operator`, `agent-1`, `agent-2`, `agent-3`, `agent-4`
- [ ] (대안) 에이전트를 하나의 서비스로 묶을 경우 `agent-bot` 1개 + `RAILWAY_SERVICE_ROLE=agents-pack`
- [ ] 모든 서비스 Node 버전 20으로 고정
- [ ] `railway.json` 기본값(build/start) 자동 반영 확인
- [ ] (자동 반영 실패 시) Start Command 수동 지정: `bash scripts/railway/start-service.sh`
- [ ] 환경변수 자동 주입 스크립트 실행: `bash scripts/railway/apply-vars.sh`
- [ ] 서비스명 규칙 지키기 (자동 분기용)
  - [ ] `ownerview`, `indexer`, `keeper`, `vrf-operator`, `agent-1`, `agent-2`, `agent-3`, `agent-4`
- [ ] (선택) 커스텀 이름 쓸 경우 `RAILWAY_SERVICE_ROLE` 수동 지정

## 2. Railway 공통 환경변수 주입

- [ ] `CHAIN_ENV=testnet`
- [ ] `CHAIN_ID=10143`
- [ ] `RPC_URL=https://testnet-rpc.monad.xyz`
- [ ] `POKER_TABLE_ADDRESS=0xC5d4Ad9ce78447501024ED699842d267A9D77a58`
- [ ] `PLAYER_REGISTRY_ADDRESS=0x2b85AF079eb1a86912b2c79e790759018641fFd4`
- [ ] `PLAYER_VAULT_ADDRESS=0xf434455eF0Dd722dec4f9caBFB5e67Ea26332C96`
- [ ] `VRF_ADAPTER_ADDRESS=0xEa22C8FB76b4C26C4cb94c1d7a879abd694a70b0`
- [ ] `RCHIP_TOKEN_ADDRESS=0x66e817138F285e59109b408a04a5Ca5B3Cb07cdf`
- [ ] `NADFUN_LENS_ADDRESS=0xd2F5843b64329D6A296A4e6BB05BA2a9BD3816F8`
- [ ] `NADFUN_BONDING_ROUTER_ADDRESS=0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- [ ] `NADFUN_DEX_ROUTER_ADDRESS=0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- [ ] `WMON_ADDRESS=0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd`
- [ ] `CORS_ALLOWED_ORIGINS=https://railbird.fun,https://www.railbird.fun`

## 3. Railway 서비스별 설정

### 3-1. `ownerview`

- [ ] Start Command: `bash scripts/railway/start-service.sh`
- [ ] `RAILWAY_SERVICE_ROLE=ownerview`
- [ ] Build Command: `pnpm -r build`
- [ ] `PORT`는 Railway 기본 포트 사용
- [ ] `JWT_SECRET`(32자 이상) 설정
- [ ] `DEALER_API_KEY` 설정
- [ ] `HOLECARD_DATA_DIR=/data/holecards` 설정
- [ ] 필요 시 Railway Volume 연결 (hole cards 영속성)

### 3-2. `indexer`

- [ ] Start Command: `bash scripts/railway/start-service.sh`
- [ ] `RAILWAY_SERVICE_ROLE=indexer`
- [ ] Build Command: `pnpm -r build`
- [ ] Railway Postgres 연결값 준비 (`PG*` 또는 `DATABASE_URL`; 런타임에 `DB_*`로 자동 매핑됨)
- [ ] `START_BLOCK` 설정
- [ ] `POLL_INTERVAL_MS=2000` 설정

### 3-3. `keeper`

- [ ] Start Command: `bash scripts/railway/start-service.sh`
- [ ] `RAILWAY_SERVICE_ROLE=keeper`
- [ ] Build Command: `pnpm -r build`
- [ ] `KEEPER_PRIVATE_KEY` 설정
- [ ] `ENABLE_REBALANCING=false` 유지 (초기 안정화 구간)

### 3-4. `vrf-operator`

- [ ] Start Command: `bash scripts/railway/start-service.sh`
- [ ] `RAILWAY_SERVICE_ROLE=vrf-operator`
- [ ] `VRF_OPERATOR_PRIVATE_KEY` 설정 (반드시 `ProductionVRFAdapter.operator` 주소의 키)
- [ ] `VRF_OPERATOR_POLL_INTERVAL_MS=1500` 설정
- [ ] `VRF_OPERATOR_MIN_CONFIRMATIONS=1` 설정
- [ ] `VRF_OPERATOR_RESCAN_WINDOW=256` 설정

### 3-5. `agent-1` ~ `agent-4`

- [ ] Start Command: `bash scripts/railway/start-service.sh`
- [ ] Build Command: `pnpm -r build`
- [ ] 서비스명을 `agent-1`~`agent-4`로 두어 slot 자동 매핑 확인
- [ ] (선택) 커스텀 이름이면 `AGENT_SLOT=1/2/3/4` 수동 지정
- [ ] `AGENT_1_OPERATOR_PRIVATE_KEY` ~ `AGENT_4_OPERATOR_PRIVATE_KEY` 설정
- [ ] `OWNERVIEW_URL=https://ownerview.railbird.fun`
- [ ] `AGGRESSION_FACTOR` 값 분리 설정 (`0.15/0.35/0.60/0.85`)
- [ ] `TURN_ACTION_DELAY_MS` 운영값 확정 (현재 기본 60000ms (1분))

## 4. DB 마이그레이션 (필수 1회)

- [ ] indexer가 빌드된 상태에서 아래 명령 1회 실행
- [ ] `pnpm --filter @playerco/indexer db:migrate`
- [ ] `indexer_state`, `hands`, `actions`, `agents` 테이블 생성 확인

## 5. VRF 운영 경로 확보 (스크립트 준비 완료, 배포만 남음)

- [ ] `scripts/railway/start-vrf-operator.sh`로 서비스 기동
- [ ] `bots/vrf-operator` 빌드/실행 로그에서 request fulfill 확인
- [ ] 이 단계 없으면 핸드가 `WAITING_VRF_*`에서 멈출 수 있음

## 6. Vercel 배포

- [ ] Vercel 프로젝트 연결
- [ ] Build Command: `pnpm --filter @playerco/web build`
- [ ] Install Command: `pnpm install --frozen-lockfile`
- [ ] `NEXT_PUBLIC_INDEXER_URL=https://indexer.railbird.fun`
- [ ] `NEXT_PUBLIC_OWNERVIEW_URL=https://ownerview.railbird.fun`
- [ ] `NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz`
- [ ] `NEXT_PUBLIC_NADFUN_LENS_ADDRESS=0xd2F5843b64329D6A296A4e6BB05BA2a9BD3816F8`
- [ ] `NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS=0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- [ ] `NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS=0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- [ ] `NEXT_PUBLIC_WMON_ADDRESS=0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd`
- [ ] `NEXT_PUBLIC_TABLE_MAX_SEATS=9`

## 7. 배포 후 검증

- [ ] `GET https://indexer.railbird.fun/api/health` = `status: ready`
- [ ] `GET https://ownerview.railbird.fun/health` = `status: ready` 또는 의도된 상태
- [ ] `GET https://indexer.railbird.fun/api/token-metadata/player-a.json` 응답 확인
- [ ] `GET https://indexer.railbird.fun/api/token-assets/player-a.svg` 이미지 확인
- [ ] 웹에서 테이블/에이전트/리더보드 렌더 확인
- [ ] 폴링 기반 테이블 갱신 정상 동작 확인 (3초 주기)
- [ ] 1핸드 이상 진행 확인 (VRF 포함)
- [ ] 토큰 buy/sell quote 및 트랜잭션 경로 확인

## 8. 제출 직전 문서 확정

- [ ] `SUBMISSION.md`의 Token Contract Address 최종 확정
- [ ] 배포 URL 3개(웹/인덱서/오너뷰) 최종 반영
- [ ] 장애 대응 연락/운영 지갑 역할 분리 문서화
