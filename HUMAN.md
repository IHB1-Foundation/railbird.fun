# HUMAN.md — 네가 직접 해야 하는 것들

> Claude가 자동 구현할 수 없는 항목만 모았다. 순서대로 실행.

---

## 0. 커밋 안 된 작업 파일 정리 (먼저 처리)

현재 브랜치에 staged 되지 않은 수정 파일들이 남아있다. 내용은 Next.js 15 업그레이드, Dockerfile 개선, 통합 테스트 개선, e2e 스크립트 보완이다.

```bash
# 무엇이 바뀌었는지 확인
git diff --stat HEAD

# 내용 괜찮으면 한 번에 커밋
git add .github/workflows/lighthouse.yml \
        .github/workflows/security.yml \
        HACKATHON.md \
        apps/web/next-env.d.ts \
        apps/web/src/app/evolution/page.tsx \
        apps/web/src/app/table/[id]/page.tsx \
        bots/agent/Dockerfile bots/keeper/Dockerfile bots/vrf-operator/Dockerfile \
        bots/agent/test/integration/ \
        bots/keeper/test/integration/ \
        package.json \
        scripts/ci-e2e.sh scripts/e2e-smoke.sh \
        scripts/e2e/ \
        services/fleet/Dockerfile services/indexer/Dockerfile services/ownerview/Dockerfile

git commit -m "chore: upgrade Next.js to 15 and harden CI/e2e scripts"
```

미추적 파일 중 repo에 포함시킬 것들도 확인:

```bash
git status --short | grep "^??"
# DORAHACKS.md, logo.png, TICKET.md, LazyCharts.tsx 등 필요한 것만 add
```

---

## 1. git push (브랜치 → 원격)

Claude는 절대 push 하지 않는다. 네가 직접:

```bash
git push origin fix/deployment-verification-ci-gates-091cac5

# 또는 main에 바로 반영하고 싶다면 PR 생성
gh pr create --title "feat: Initia port gap tickets (I1-2 through I4-3)" \
  --body "Implements all TICKET.md items that don't require live testnet."
```

---

## 2. Initia 테스트넷 롤업 프로비저닝 (I0-4)

**필요한 것**: Initia testnet에 자금이 있는 deployer 계정

```bash
# 1. 팩셋에서 INIT 받기
#    https://faucet.testnet.initia.xyz

# 2. .env에 deployer 키 설정
#    DEPLOYER_PRIVATE_KEY=0x...

# 3. 롤업 생성 스크립트 실행
bash scripts/initia/launch-minitia.sh

# 4. 결과 확인
jq -r '.chainId' infra/initia/rollup.json          # 정수여야 함 (PLACEHOLDER 아님)
cast chain-id --rpc-url "$(jq -r .rpcUrl infra/initia/rollup.json)"

# 5. .env.initia / .initia/submission.json에 실제 값 반영 후 커밋
git add infra/initia/rollup.json .env.initia .initia/submission.json
git commit -m "feat(infra): provision Railbird MiniEVM rollup on Initia testnet"
```

---

## 3. 컨트랙트 배포 (I0-5)

**필요한 것**: 위 I0-4 완료 + 롤업 RPC 접근

```bash
# 환경변수 로드
set -a; source .env; set +a

# 시뮬레이션 먼저
bash scripts/deploy/initia.sh --simulate

# 실제 배포
bash scripts/deploy/initia.sh

# 검증
cast code <CHIP_TOKEN_ADDRESS> --rpc-url "$RPC_URL"  # 비어있으면 안 됨
node scripts/validate-submission.mjs                  # exit 0이어야 함

# 커밋
git add infra/initia/deployments.json .env.initia .initia/submission.json
git commit -m "feat(contracts): deploy Railbird contracts to Initia MiniEVM rollup"
```

---

## 4. 데모 영상 업로드 (I0-6)

```bash
# Railbird_Pitch.mp4 → YouTube(비공개 or 공개) 또는 Loom 업로드

# 업로드 후 URL을 세 곳에 반영
URL="https://www.youtube.com/watch?v=ylTicxzWggQ"

# a) .initia/submission.json
jq --arg u "$URL" '.demoVideo = $u' .initia/submission.json > /tmp/sub.json \
  && mv /tmp/sub.json .initia/submission.json

# b) INITIA_SUBMISSION.md 링크도 동일 URL로 맞춤

# c) README.md Demo 테이블 링크도 수동 교체

# 검증
grep -r PLACEHOLDER_UPLOAD .                # 0건이어야 함
node scripts/validate-submission.mjs        # exit 0이어야 함

git add .initia/submission.json INITIA_SUBMISSION.md README.md
git commit -m "docs(initia): publish demo video URL and drop placeholders"
```

---

## 5. E2E 스모크 실행 + 증거 수집 (I3-2)

**필요한 것**: 롤업 + 컨트랙트 배포 완료 (I0-4, I0-5), 봇 키 설정

```bash
# e2e 스모크 (3 핸드)
bash scripts/e2e-smoke.initia.sh 3

# 결과 확인
grep PLACEHOLDER docs/initia/e2e-evidence.md  # 0건이어야 함

# 롤업 익스플로러에서 TX 확인 후
git add docs/initia/e2e-evidence.md
git commit -m "docs(initia): publish real E2E evidence from Initia rollup smoke run"
```

---

## 6. VRF 증거 TX 해시 채우기 (I1-7)

E2E 실행 후 롤업 익스플로러에서:

- `VRFRequested` TX 해시
- `VRFFulfilled` TX 해시
- 해당 핸드 번호

```bash
# docs/initia/vrf.md 42-44번째 줄 직접 편집
# PLACEHOLDER → 실제 TX 해시

grep PLACEHOLDER docs/initia/vrf.md   # 0건 확인
git add docs/initia/vrf.md
git commit -m "docs(initia): fill VRF evidence TX hashes from live rollup"
```

---

## 7. 최종 검증 게이트

모든 작업 완료 후 제출 전 마지막 확인:

```bash
node scripts/validate-submission.mjs          # exit 0 필수
grep -r PLACEHOLDER .initia/submission.json   # 0건
cast chain-id --rpc-url "$(jq -r .rpcUrl infra/initia/rollup.json)"  # 실제 체인 ID
pnpm --filter @playerco/web build             # 빌드 성공
forge test                                    # ≥420 pass
```

전체 체크리스트는 `docs/initia/scoring-rehearsal.md` 참고.

---

## 요약 테이블

| #   | 항목               | 필요 조건           | 관련 티켓     |
| --- | ------------------ | ------------------- | ------------- |
| 0   | 미커밋 파일 정리   | —                   | (브랜치 정리) |
| 1   | git push           | —                   | —             |
| 2   | 롤업 프로비저닝    | Initia testnet 자금 | I0-4          |
| 3   | 컨트랙트 배포      | #2 완료             | I0-5          |
| 4   | 데모 영상 업로드   | YouTube/Loom 계정   | I0-6          |
| 5   | E2E 스모크 실행    | #2, #3 완료         | I3-2          |
| 6   | VRF TX 해시 채우기 | #5 완료             | I1-7          |
| 7   | 최종 검증          | 전부 완료           | —             |
