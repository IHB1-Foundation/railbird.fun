# Railway Monorepo Deployment (Railbird)

이 문서는 "레포 1개를 Railway에 연결하고 서비스 여러 개를 분리 배포"하는 기준으로 작성했다.

## 1) 서비스 구성

Railway 서비스 8개를 만든다.

- `ownerview`
- `indexer`
- `keeper`
- `vrf-operator`
- `agent-1`
- `agent-2`
- `agent-3`
- `agent-4`

## 2) 공통 Build Command

모든 서비스에 동일하게:

```bash
pnpm -r --filter=!@playerco/contracts build
```

참고:
- 루트 `railway.json`에 이미 `buildCommand`/`startCommand` 기본값을 넣어두었다.
- 서비스 생성 시 Railway가 이 값을 읽으면 별도 입력 없이 동작한다.
- Railway 런타임 이미지에는 `forge`가 없으므로 contracts 패키지는 빌드 대상에서 제외한다.

## 2-1) 환경변수 자동 반영 (CLI)

로컬 `.env`를 Railway 서비스 변수로 자동 반영할 수 있다.

```bash
# Railway 로그인 + 프로젝트 링크 후 실행
bash scripts/railway/apply-vars.sh
```

주의:
- 로컬 `.env`가 `DB_HOST=localhost`이면, 스크립트는 indexer의 `DB_*` 푸시를 자동으로 건너뛴다.
- 이 경우 Railway Postgres에서 주입되는 `PG*` 또는 `DATABASE_URL`을 사용하도록 두면 된다.
- `scripts/railway/start-indexer.sh`가 런타임에 `PG*`/`DATABASE_URL` -> `DB_*`로 자동 매핑한다.

옵션:

```bash
# deploy까지 바로 트리거
RAILWAY_SKIP_DEPLOYS=false bash scripts/railway/apply-vars.sh

# agents를 분리 서비스(4개)로 쓸 때
AGENT_DEPLOY_MODE=split bash scripts/railway/apply-vars.sh

# environment 이름 지정 (기본 production)
RAILWAY_ENV=production bash scripts/railway/apply-vars.sh
```

## 3) Start Command

권장: 모든 서비스 Start Command를 동일하게 설정한다.

```bash
bash scripts/railway/start-service.sh
```

자동 분기 방식:
- 서비스명을 아래처럼 만들면(`ownerview`, `indexer`, `keeper`, `vrf-operator`, `agent-1`~`agent-4`)  
  `RAILWAY_SERVICE_ROLE` 없이 자동 분기된다.
- `agent-1`~`agent-4`는 `AGENT_SLOT`도 서비스명에서 자동 추론된다.
- 서비스명을 `agent-bot`(또는 `agents-pack`)으로 만들면 4개 에이전트를 한 서비스에서 동시에 실행한다.

수동 분기 방식(원할 때만):

- `ownerview`: `RAILWAY_SERVICE_ROLE=ownerview`
- `indexer`: `RAILWAY_SERVICE_ROLE=indexer`
- `keeper`: `RAILWAY_SERVICE_ROLE=keeper`
- `vrf-operator`: `RAILWAY_SERVICE_ROLE=vrf-operator`
- `agent-1~4`: `RAILWAY_SERVICE_ROLE=agent`
- `agent-bot` 1개로 4개 동시 실행: `RAILWAY_SERVICE_ROLE=agents-pack`

대안으로, 각 서비스에 전용 start 스크립트를 직접 넣어도 된다.

- `ownerview`
  - `bash scripts/railway/start-ownerview.sh`
- `indexer`
  - `bash scripts/railway/start-indexer.sh`
- `keeper`
  - `bash scripts/railway/start-keeper.sh`
- `vrf-operator`
  - `bash scripts/railway/start-vrf-operator.sh`
- `agent-1` ~ `agent-4`
  - `bash scripts/railway/start-agent.sh`

`agent-*`는 같은 start command를 쓰고, 서비스명을 `agent-1..4`로 주면 slot까지 자동으로 맞춰진다.

## 4) 공통 환경변수 (모든 서비스)

```bash
CHAIN_ENV=testnet
CHAIN_ID=10143
RPC_URL=https://testnet-rpc.monad.xyz

POKER_TABLE_ADDRESS=0x8EbDE1576C3a19aAEf619def9979192c830F7ad1
PLAYER_REGISTRY_ADDRESS=0x0f99c44174cf37E2C26246EDfad1ca8AbaEF93e5
PLAYER_VAULT_ADDRESS=0x5fD1508dAc98aa5A6CDe7A2Afffe564a14aE802b
VRF_ADAPTER_ADDRESS=0x4AEb4BB30aA989bA26219e33cbE7356591D6441e
RCHIP_TOKEN_ADDRESS=0x74079d6638Ff4764ec10aE95727225451bc21aA0

NADFUN_LENS_ADDRESS=0xff457F28decB5c7B9fC9BB5Bc6d6c0da50BA902D
NADFUN_BONDING_ROUTER_ADDRESS=0xd8ab63E839b81306e05D70F63ca07c1C5233805B
NADFUN_DEX_ROUTER_ADDRESS=0xd8ab63E839b81306e05D70F63ca07c1C5233805B
WMON_ADDRESS=0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd
```

## 5) 서비스별 추가 환경변수

### `ownerview`

```bash
JWT_SECRET=<32자 이상>
DEALER_API_KEY=<강한 값>
HOLECARD_DATA_DIR=/data/holecards
CORS_ALLOWED_ORIGINS=https://railbird.fun,https://www.railbird.fun
```

### `indexer`

Railway Postgres 값 연결:

```bash
DB_HOST=<railway-postgres-host>
DB_PORT=<railway-postgres-port>
DB_NAME=<railway-postgres-db>
DB_USER=<railway-postgres-user>
DB_PASSWORD=<railway-postgres-password>
START_BLOCK=13073695
POLL_INTERVAL_MS=2000
LOG_BLOCK_RANGE=90
```

참고:
- Monad testnet RPC는 `eth_getLogs` 조회 범위를 크게 제한한다.
- `LOG_BLOCK_RANGE`는 100 이하(권장 90)로 유지해야 인덱싱이 멈추지 않는다.
- 현재 배포 주소 기준 Core 배포 블록은 `13073695` 전후이므로 `START_BLOCK=13073695`로 설정했다.

### `keeper`

```bash
KEEPER_PRIVATE_KEY=0x...
ENABLE_REBALANCING=false
REBALANCE_BUY_AMOUNT_MON=0
REBALANCE_SELL_AMOUNT_TOKENS=0
```

### `vrf-operator`

```bash
VRF_OPERATOR_PRIVATE_KEY=0x...
VRF_OPERATOR_POLL_INTERVAL_MS=1500
VRF_OPERATOR_MIN_CONFIRMATIONS=1
VRF_OPERATOR_RESCAN_WINDOW=256
```

중요:
- `VRF_OPERATOR_PRIVATE_KEY`의 주소가 반드시 on-chain `ProductionVRFAdapter.operator`와 같아야 한다.

### `agent-1` ~ `agent-4` 공통

```bash
OWNERVIEW_URL=https://ownerview.railbird.fun
POLL_INTERVAL_MS=1000
MAX_HANDS=0
TURN_ACTION_DELAY_MS=60000
AGENT_DECISION_ENGINE=gemini
GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>
GEMINI_MODEL=gemini-2.0-flash
GEMINI_TEMPERATURE=0.2
GEMINI_TIMEOUT_MS=8000

AGENT_1_OPERATOR_PRIVATE_KEY=0x...
AGENT_2_OPERATOR_PRIVATE_KEY=0x...
AGENT_3_OPERATOR_PRIVATE_KEY=0x...
AGENT_4_OPERATOR_PRIVATE_KEY=0x...

AGENT_1_AGGRESSION=0.15
AGENT_2_AGGRESSION=0.35
AGENT_3_AGGRESSION=0.60
AGENT_4_AGGRESSION=0.85
```

### `agent-1` 개별

```bash
AGENT_SLOT=1
```

### `agent-2` 개별

```bash
AGENT_SLOT=2
```

### `agent-3` 개별

```bash
AGENT_SLOT=3
```

### `agent-4` 개별

```bash
AGENT_SLOT=4
```

## 6) 실행 확인 순서

1. `ownerview` healthy
2. `indexer` healthy
3. `vrf-operator`가 request fulfill 로그 출력
4. `keeper` + `agent-1~4` 실행
5. 웹에서 액션/핸드 진행 확인

## 7) 빠른 점검 API

- `GET https://indexer.railbird.fun/api/health`
- `GET https://ownerview.railbird.fun/health`
- `GET https://indexer.railbird.fun/api/token-metadata/player-a.json`
- `GET https://indexer.railbird.fun/api/token-assets/player-a.svg`
