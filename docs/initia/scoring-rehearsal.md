# Railbird — INITIATE Hackathon Pre-Submission Scoring Rehearsal

> Self-assessment against the official rubric before final submission.
> Rubric: Originality (20) / Tech & Initia (30) / Product & UX (20) / Demo & Completeness (20) / Market (10)

---

## 1. Originality & Track Fit — 20 points

**Our claim:**  
Railbird is the first fully-autonomous AI poker protocol on an appchain. Four Gemini-powered agents
play Texas Hold'em with no human in the loop, using VRF-randomized community cards and
ECIES-encrypted hole cards. The Gaming + AI dual-track is the strongest possible fit.

**Evidence:**

- `bots/agent/src/strategy/` — Gemini decision loop with GTO deviation and RAG memory
- `contracts/src/PokerTable.sol` — VRF-gated hand flow, ECIES hole card commits
- `apps/web/src/app/evolution/` — on-chain strategy evolution timeline

**Risk:**  
Judges may say "poker is old tech." Counter: the combination of autonomous AI agents + encrypted
private information + verifiable randomness on an appchain is a novel composition, not a poker clone.

---

## 2. Technical Execution & Initia Integration — 30 points

**Our claim:**  
Three hard requirements fully satisfied. Six Initia integration layers:

1. Own MiniEVM rollup (`infra/initia/rollup.json`)
2. InterwovenKit as sole wallet layer (`apps/web/src/lib/wallet/interwoven.ts`, `providers.tsx`)
3. Auto-sign sessions for in-hand actions (`apps/web/src/lib/wallet/useAutoSignSession.ts`)
4. `.init` username resolution on agent pages and leaderboard (`apps/web/src/lib/initiaUsername.ts`)
5. Interwoven Bridge deeplink from vault deposit panel (`apps/web/src/app/agent/[token]/page.tsx`)
6. Session revocation API + audit marker (`services/ownerview/src/routes/session.ts`)

**Evidence:**

- `docs/adr/ADR-020-initia-stack.md` — stack decision rationale
- `docs/initia/autosign-session-design.md` — threat model and session scope
- `infra/initia/deployments.json` — deployed contract addresses
- `docs/initia/vrf.md` — VRF flow explanation (why not Chainlink)
- `apps/web/src/lib/wallet/interwoven.ts` — InterwovenKit signer adapter
- `scripts/e2e-smoke.initia.sh` — full E2E harness
- `docs/initia/e2e-evidence.md` — TX evidence (run harness to populate)

**Status:**  
Rollup metadata and deployment manifests are live and aligned with the current submission.
Use the published RPC, launch transaction, and public app/video links as the judge-facing proof set.

---

## 3. Product Value & UX — 20 points

**Our claim:**  
Auto-sign sessions solve the #1 UX blocker in blockchain gaming (wallet popup per action).
A 10–50 action poker hand is playable without friction. Agent pages with persona radar charts,
GTO deviation, strategy history, and `.init` names create a polished, non-crypto-native UX.

**Evidence:**

- `apps/web/src/lib/wallet/useAutoSignSession.ts` — session timer, ON/OFF toggle
- `apps/web/src/app/agent/[token]/page.tsx` — persona radar, ROI, `.init` badge, Bridge deeplink
- `apps/web/src/app/leaderboard/` — `.init` names, ELO ratings
- `apps/web/src/app/table/[id]/` — live card animations, action log, timer

**Risk:**  
Live demo requires a running rollup + bots. Judges who cannot access the live URL
should fall back to the demo video. Ensure `demoUrl` in `submission.json` is reachable.

---

## 4. Working Demo & Completeness — 20 points

**Our claim:**  
Submission is complete and machine-verifiable:

- `.initia/submission.json` — all required fields (validated by `node scripts/validate-submission.mjs`)
- `README.md` — Quick Start in 4 commands, all 3 hard requirements in opening paragraphs
- Demo video — `https://www.youtube.com/watch?v=ylTicxzWggQ`
- E2E smoke: `scripts/e2e-smoke.initia.sh` covers deploy → 4 seats → 3 hand settlements
- 420+ contract unit tests: `forge test`
- Full build: `pnpm build`

**Evidence:**

- `node scripts/validate-submission.mjs` → exit 0
- `forge test` → ≥420 passed
- `pnpm --filter @playerco/web build` → clean

**Status:**  
Demo video is published on YouTube at `https://www.youtube.com/watch?v=ylTicxzWggQ`.
If the pitch video is regenerated, re-upload to the same YouTube video (replace) or
publish a new video and update the URL in `.initia/submission.json`, `DORAHACKS.md`,
`INITIA_SUBMISSION.md`, and the submission form.

---

## 5. Market Understanding — 10 points

**Our claim:**  
Target: crypto-native gamers tired of trivially simple on-chain games and the $3B+ online poker
market converting to crypto. Autonomous AI agents create a "watch-and-bet" spectator sport that
runs without human players — a new category. Initia's ecosystem distribution + InterwovenKit UX
reduces onboarding friction versus EVM-only competitors.

**Evidence:**

- `HACKATHON.md` — competitive context and market framing
- `docs/adr/ADR-020-initia-stack.md` — why Initia fits the current distribution strategy
- `INITIA_SUBMISSION.md` §5 — competitive landscape

**Risk:**  
No revenue model stated (intentional for hackathon). Judges interested in monetization:
the agent token economy (RCHIP buy-ins, vault yield, `.init` branding) is the path.

---

---

## Pre-Submit Runbook (Canonical)

Run these steps in order from a fresh clone. Target: ≤30 minutes if the rollup is already live.

### Step 1 — Provision rollup (skip if `infra/initia/rollup.json` has a real chainId)

```bash
bash scripts/initia/launch-minitia.sh
# Verify:
jq -r '.chainId' infra/initia/rollup.json          # must be an integer
cast chain-id --rpc-url "$(jq -r .rpcUrl infra/initia/rollup.json)"  # must match
```

### Step 2 — Deploy contracts

```bash
export $(grep -v '^#' .env.initia | xargs)
bash scripts/deploy/initia.sh
# Verify:
jq '.' infra/initia/deployments.json               # all addresses non-zero
node scripts/validate-submission.mjs               # must pass contract address checks
```

### Step 3 — Refresh demo video if you cut a new version

```bash
# Re-upload to YouTube (replace existing video or publish a new one).
# If URL changes, update these in a single commit:
#   - .initia/submission.json (.demoVideo)
#   - DORAHACKS.md, INITIA_SUBMISSION.md, README.md, .initia/SUBMISSION_PACK.txt
#   - DoraHacks submission form Q4
# Current URL: https://www.youtube.com/watch?v=ylTicxzWggQ
```

### Step 4 — Run E2E smoke (populate evidence)

```bash
bash scripts/e2e-smoke.initia.sh 3
# Verify:
grep PLACEHOLDER docs/initia/e2e-evidence.md       # must return nothing
```

### Step 5 — Final validation gate

```bash
node scripts/validate-submission.mjs               # must exit 0 (zero output on error)
pnpm --filter @playerco/web build                  # must succeed
forge test                                         # must pass ≥420 tests
```

### Step 6 — Hard requirement checklist

- [ ] `jq -r '.chainId' infra/initia/rollup.json` returns an integer (not PLACEHOLDER)
- [ ] `jq -r '.rpcUrl' infra/initia/rollup.json` resolves and `cast chain-id` matches
- [ ] All addresses in `infra/initia/deployments.json` are non-zero
- [ ] `.initia/submission.json` `demoVideo` is a live public video URL
- [ ] `node scripts/validate-submission.mjs` exits 0
- [ ] `pnpm --filter @playerco/web build` exits 0
- [ ] Demo video follows `docs/initia/demo-script.md` (InterwovenKit modal, auto-sign, `.init`, bridge, explorer TXs)
