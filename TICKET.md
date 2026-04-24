# TICKET.md — Initia Port Gap Tickets

> **Context**: Railbird pivoted from a previous EVM deployment target to the INITIATE hackathon on 2026-04-19
> (commit `dbfd70c`, ADR-020). This file enumerates the gaps discovered while auditing
> the port and organises them into runnable tickets.
>
> **Scope**: Only Initia-porting issues. Original product TICKET.md and TODO.md were
> deleted in the pivot commit; don't resurrect them here.
>
> **Deadline reality check**: `HACKATHON.md` lists the submission deadline as
> **2026-04-15 23:00 UTC**. Today is **2026-04-19**. Confirm with the user whether this
> is a post-deadline submission, an extension, a demo-day iteration, or a new cohort
> before treating any ticket as "must ship before 04-15".
>
> **Runner conventions** (per user's CLAUDE.md):
>
> - Follow milestones in order: M-I0 → M-I1 → M-I2 → M-I3 → M-I4.
> - Stop the runner on any test/AC failure; report and halt.
> - Exactly one commit per ticket. Commit message = the line under "Commit message".
> - Never push/pull/rebase/merge/force/amend. Operator pushes manually.
>
> **Evidence sources** consulted while writing these tickets:
>
> - `INITIA_SUBMISSION.md`, `README.md`, `HACKATHON.md`
> - `docs/adr/ADR-020-initia-stack.md`
> - `docs/initia/{rollup,autosign-session-design,e2e-evidence,scoring-rehearsal,usernames-note,vrf,demo-script}.md`
> - `.initia/submission.json`, `infra/initia/{rollup,deployments}.json`, `.env.initia`
> - `apps/web/src/lib/wallet/{interwoven.ts,useAutoSignSession.ts}`,
>   `apps/web/src/app/providers.tsx`, `apps/web/src/types/interwovenkit.d.ts`,
>   `apps/web/src/lib/{initiaUsername,pokerTableClient}.ts`
> - `apps/web/package.json`, `pnpm-lock.yaml` (grep)
> - `scripts/initia/launch-minitia.sh`, `scripts/deploy/initia.sh`,
>   `scripts/e2e-smoke.initia.sh`, `scripts/validate-submission.mjs`
> - `contracts/script/DeployInitia.s.sol`, `contracts/foundry.toml`
> - `bots/{agent,keeper,vrf-operator}/src/chain/client.ts`,
>   `packages/shared/src/chainConfig.ts`
> - `services/ownerview/src/routes/session.ts`
> - `.github/workflows/ci.yml`

---

## M-I0 — BLOCKERS (submission fails without these)

### I0-1 — Actually install `@initia/interwovenkit-react`

**Goal**: The real package must be in `pnpm-lock.yaml` and on disk. Right now
`apps/web/package.json` declares `"@initia/interwovenkit-react": "^0.2.0"` but the
lockfile has zero `initia`/`interwovenkit` entries and `node_modules/@initia/` does
not exist. TypeScript only compiles because of the handwritten stub at
`apps/web/src/types/interwovenkit.d.ts`.

**Scope**:

- Run `pnpm install` (or `pnpm add @initia/interwovenkit-react@<latest>` inside
  `apps/web/`) so the real package is resolved.
- Verify the resolved version matches the hackathon docs (current stable).
- Delete `apps/web/src/types/interwovenkit.d.ts` once the real package ships types.
  If the real types diverge, update consumers rather than shimming.
- Commit `pnpm-lock.yaml` and `apps/web/package.json`.

**AC**:

- [ ] `pnpm ls --filter @playerco/web @initia/interwovenkit-react` prints a resolved version.
- [ ] `grep -c interwovenkit pnpm-lock.yaml` > 0.
- [ ] `apps/web/src/types/interwovenkit.d.ts` either deleted or replaced with a
      comment pointing at the real package.
- [ ] `pnpm --filter @playerco/web typecheck` and `pnpm --filter @playerco/web build` pass.

**Commit message**: `chore(web): install @initia/interwovenkit-react and drop handcrafted type stub`

---

### I0-2 — Wire a real InterwovenKit bridge component inside the provider

**Goal**: Populate the two `useRef` placeholders that Initia mode depends on.
`apps/web/src/lib/wallet/interwoven.ts:193` (`iwkRef`) and
`apps/web/src/lib/wallet/useAutoSignSession.ts:48` (`iwkAutoSignRef`) both sit with
comments saying "populated by the IWKBridge component rendered in providers.tsx" —
**but no such component exists**. Result: on Initia, `connect()` is a no-op,
`activate()` falls through to a simulated timer, and `revoke()` only clears local
state. Hard requirement #2 is a façade.

**Scope**:

- Create `apps/web/src/lib/wallet/IWKBridge.tsx` that lives inside
  `InterwovenKitProvider` and calls the real hooks (whatever they turn out to be —
  `useWallet`, `useAccount`, `useAutoSign`, `useSigner`, etc. — read the installed
  package).
- Route the hook outputs into module-level singletons (`setInterwovenHandle(...)` /
  `setAutoSignHandle(...)`) that `useInitiaWallet` and `useAutoSignSession` can read.
  Refs inside custom hooks are the wrong primitive — they'll be per-instance and
  never cross-populate. Replace with a store (Zustand, or a tiny event-emitter + useSyncExternalStore).
- Render `<IWKBridge />` as a child of `InterwovenKitProvider` in `providers.tsx`.

**AC**:

- [ ] Connecting from `/table/<id>` on `CHAIN_ENV=initia-testnet` actually opens
      the InterwovenKit modal.
- [ ] `useAutoSignSession().activate()` calls the real InterwovenKit session
      API (no "simulated session" fallback path hit when
      `NEXT_PUBLIC_ENABLE_AUTOSIGN=true`).
- [ ] At least one Vitest file exercises `IWKBridge` and asserts the store
      gets populated.
- [ ] Typecheck + build pass.

**Commit message**: `feat(web): wire IWKBridge to expose InterwovenKit hooks to non-provider consumers`

**Depends on**: I0-1.

---

### I0-3 — Route web-app transactions through InterwovenKit (not `window.ethereum`)

**Goal**: The user-facing write path — `registerSeat`, approvals, etc. — is
`apps/web/src/lib/pokerTableClient.ts`. It gets its wallet via
`getInjectedProvider()` (interwoven.ts:58), which explicitly returns `null` on
`CHAIN_ENV=initia-testnet`. So on the very chain we claim to support, the web
app cannot send transactions. InterwovenKit has to be the transport.

**Scope**:

- Add a `sendTransaction` path that uses InterwovenKit's signer when
  `isInitiaEnv`. Simplest shape: export an async `getWalletClient()` from
  `lib/wallet/interwoven.ts` that, on Initia, returns a viem `WalletClient`
  wired to an `EIP1193Provider`-shaped adapter around InterwovenKit's signer
  (or returns a direct `sendTransaction` function and bypass viem in that branch).
- Update `registerSeat` and any other `getWalletClient()` / `getInjectedProvider()`
  callers in `pokerTableClient.ts` to use the new path.
- Fix hardcoded fallbacks: `getChainId()` defaults `133`, `nativeSymbol` defaults
  to a legacy token symbol — replace with throws/strict reads when
  `CHAIN_ENV=initia-testnet`.

**AC**:

- [ ] Grep `window\.ethereum\|getInjectedProvider` inside
      `apps/web/src/**/*.{ts,tsx}` — zero hits outside of tests.
- [ ] Manual smoke: with `CHAIN_ENV=initia-testnet` and rollup running,
      `registerSeat` triggers an InterwovenKit signing flow and lands a TX.
- [ ] A unit test mocks the Initia branch and asserts `sendTransaction` is
      dispatched via the InterwovenKit signer, not via `provider.request`.

**Commit message**: `feat(web): route all wallet writes through InterwovenKit on Initia`

**Depends on**: I0-1, I0-2.

---

### I0-4 — Provision the Railbird MiniEVM rollup (fill rollup.json)

**Goal**: `infra/initia/rollup.json` is entirely `PLACEHOLDER` today. Hard
requirement #1 of the hackathon is "Own Initia appchain/rollup deployed — a
valid rollup chain ID or TX link". No chain ID exists.

`scripts/initia/launch-minitia.sh` step 2 has the real `initiad minitia launch`
command commented out and writes a placeholder stub instead. It was never run
in anger.

**Scope**:

- Turn the commented stub in `launch-minitia.sh` into an executed pipeline:
  call the actual Initia L1 rollup-launch flow (see the latest
  initia-labs/minitia-artifacts README — the previous command may be
  superseded by `initiad tx opinit-bridge create-bridge` + `initiad tx rollup create`
  or whatever the current tooling shows).
- Run the script against Initia testnet with a funded deployer account.
- Commit the populated `infra/initia/rollup.json` with real `chainId`,
  `rpcUrl`, `wsUrl`/`evmRpcUrl`, `explorerUrl`, `launchTxHash`.
- Update `.env.initia` with the matching `INITIA_CHAIN_ID`, `RPC_URL`,
  `INITIA_EXPLORER_URL`.
- Update `.initia/submission.json` `rollupChainId`, `rpcUrl`, `explorerUrl`
  with the same values.

**AC**:

- [ ] `jq -r '.chainId' infra/initia/rollup.json` is an integer (not "PLACEHOLDER").
- [ ] `cast chain-id --rpc-url "$(jq -r .rpcUrl infra/initia/rollup.json)"`
      returns that same chain ID.
- [ ] `.initia/submission.json` `rollupChainId` and `rpcUrl` match `infra/initia/rollup.json`.

**Commit message**: `feat(infra): provision Railbird MiniEVM rollup on Initia testnet`

---

### I0-5 — Deploy contracts to the rollup (fill deployments.json)

**Goal**: `infra/initia/deployments.json` contains all `0x00...00` addresses.
`.initia/submission.json.contracts` also. `scripts/deploy/initia.sh` has never
been executed with a real RPC.

**Scope**:

- Export the env from the populated `.env.initia` (I0-4).
- Run `bash scripts/deploy/initia.sh --simulate` first, confirm the
  `DeployInitia.s.sol` broadcast plan is correct.
- Run `bash scripts/deploy/initia.sh` (broadcast) and verify addresses on the
  rollup explorer.
- Update `infra/initia/deployments.json` with real addresses + TX hashes +
  `deployedAt` timestamp.
- Update `.initia/submission.json.contracts[*].address` to match.
- Update `.env.initia` with the deployed addresses.

**AC**:

- [ ] Every address in `infra/initia/deployments.json` is non-zero and
      returns non-empty `cast code` on the rollup.
- [ ] Every address in `.initia/submission.json.contracts[*].address` matches.
- [ ] `forge verify-contract` attempted for at least `ChipToken`,
      `PokerTable`, `PlayerRegistry` (or an explicit note in the commit if
      the rollup explorer does not yet support verification).

**Commit message**: `feat(contracts): deploy Railbird contracts to Initia MiniEVM rollup`

**Depends on**: I0-4.

---

### I0-6 — Upload demo video and replace placeholder URL

**Goal**: `.initia/submission.json.demoVideo` is literally
`https://www.youtube.com/watch?v=PLACEHOLDER_UPLOAD_RAILBIRD_PITCH`.
`Railbird_Pitch.mp4` is untracked in the repo root (see git status).
`scripts/validate-submission.mjs` doesn't detect this because it only checks
presence, not shape.

**Scope**:

- Upload `Railbird_Pitch.mp4` to YouTube (unlisted or public) or Loom.
  Confirm it follows `docs/initia/demo-script.md` (InterwovenKit modal,
  auto-sign timer, `.init` in leaderboard, bridge deeplink, explorer TXs).
- Replace `PLACEHOLDER_UPLOAD_RAILBIRD_PITCH` in:
  - `.initia/submission.json.demoVideo`
  - `INITIA_SUBMISSION.md` §4 demoVideo line
  - `README.md` Demo table (currently "link after recording — I13-2")
- Re-run `node scripts/validate-submission.mjs` and confirm it still passes.

**AC**:

- [ ] `grep -r PLACEHOLDER_UPLOAD_RAILBIRD_PITCH .` → no hits.
- [ ] The `demoVideo` URL resolves to a playable video (manual check).

**Commit message**: `docs(initia): publish demo video URL and drop placeholders`

**Depends on**: I0-5 (video should show the live rollup).

---

### I0-7 — Make `validate-submission.mjs` strict enough to catch placeholders

**Goal**: The current validator accepts any non-empty string, so every
`PLACEHOLDER_*` token in `submission.json` passes. A submission with zero live
addresses and a broken video URL currently prints "Submission validation PASSED".
That's a landmine.

**Scope**:

- Add shape checks:
  - `rollupChainId` must be parseable as a positive integer (or a string that
    converts cleanly to one).
  - `rpcUrl` must start with `http://` or `https://` (and preferably
    `https://` outside of local dev).
  - `explorerUrl` same.
  - `demoVideo` must match a YouTube / Loom / Vimeo / direct MP4 URL pattern.
  - Every `contracts[*].address` must match `/^0x[0-9a-f]{40}$/i` and not be
    `0x0000...0000`.
  - Reject any value that contains `PLACEHOLDER` (case-insensitive).
- Keep the existing presence checks.
- Update the script's output so the user sees precisely which field failed.
- Add to `.github/workflows/ci.yml` (see I3-1).

**AC**:

- [ ] With the current `.initia/submission.json` (pre-I0-4/5/6), the
      validator fails with a clear message per placeholder.
- [ ] After I0-4/5/6, the validator passes.
- [ ] New unit/shell assertion in `scripts/` or a simple node test covers
      at least: zero-address rejection, placeholder rejection, URL shape.

**Commit message**: `chore(scripts): tighten validate-submission.mjs to reject placeholders`

---

## M-I1 — INTEGRATION CORRECTNESS (make claimed features actually work)

### I1-1 — Verify (and fix) `.init` username API endpoint

**Goal**: `apps/web/src/lib/initiaUsername.ts:31` calls
`${NAMES_API}/initia/usernames/v1/username/${address}`. The Initia Names
module query path may not match this exactly — the Cosmos-SDK REST
convention is usually `/initia/usernames/v1/username_by_address/{addr}` or
similar, and the response field may be `username` vs `name` vs nested.
The code tolerates either field today (`data.username ?? data.name`) but
still assumes the URL path. If the path is wrong, **every `.init` lookup
silently returns null** — the feature appears to work but always falls
back to shortened hex, and we lose a native-feature point on scoring.

**Scope**:

- Verify the actual path against `rest.testnet.initia.xyz` for a known
  registered `.init` address (ask in Initia discord or fetch a known
  name from `app.initia.xyz`).
- If the URL path or field names differ, fix the fetch in
  `initiaUsername.ts`.
- Replace the blanket `catch` so transient errors vs "no username"
  distinguish in logs (helps judges' reviewers understand the demo).
- Add one unit test with a mocked `fetch` for the success, 404, and
  transport-error branches.

**AC**:

- [ ] For a known `.init` address, `fetchInitUsername(addr)` returns the
      expected `"name.init"` string against the live testnet API.
- [ ] Unit tests cover success/404/error paths.
- [ ] `screenshots/initia-username-in-leaderboard.png` (or similar)
      captured for the pitch/video.

**Commit message**: `fix(web): correct .init username REST path and add lookup tests`

---

### I1-2 — Verify Interwoven Bridge deeplink parameters

**Goal**: `apps/web/src/app/agent/[token]/page.tsx:1272` builds
`https://app.initia.xyz/bridge?toChainId=…&toAddress=…`. The parameter
names (`toChainId`, `toAddress`) have to match what the live Interwoven
Bridge app reads today. If they're wrong, the deeplink still opens but
the destination isn't pre-filled — the feature doesn't deliver its demo
value.

**Scope**:

- Open `app.initia.xyz/bridge` with fake params, inspect which keys the
  app actually reads (DevTools → URL → what bridging fields get populated).
- If different, update the deeplink template. Consider surfacing a
  `bridgeUrl` helper in `packages/shared` so the URL isn't embedded in
  JSX.
- Add a snapshot/Playwright test that asserts the href matches the
  agreed shape.

**AC**:

- [ ] Clicking "Bridge via Interwoven" on an agent page pre-fills
      destination chain + address (manual verification, screenshot).
- [ ] Test asserts the href contains the current rollup `chainId` and
      the vault/owner address.

**Commit message**: `fix(web): align Interwoven Bridge deeplink params with live app`

---

### I1-3 — Honour `NEXT_PUBLIC_ENABLE_*` feature flags everywhere

**Goal**: `.env.initia` declares
`NEXT_PUBLIC_ENABLE_INIT_USERNAMES`, `NEXT_PUBLIC_ENABLE_AUTOSIGN`,
`NEXT_PUBLIC_ENABLE_TRADING_WIDGET`, but:

- `initiaUsername.ts` never reads `NEXT_PUBLIC_ENABLE_INIT_USERNAMES`
  — it always fetches.
- `useAutoSignSession.ts` reads `NEXT_PUBLIC_ENABLE_AUTOSIGN` (good),
  but only once at module load; no way to toggle at runtime.
- `NEXT_PUBLIC_ENABLE_TRADING_WIDGET` — verify the trading widget is
  actually hidden when the flag is `false` (ADR-020 says it is, spot-check).

**Scope**:

- Short-circuit `fetchInitUsername` when the flag is `false` (skip fetch,
  return null).
- Add a tiny `featureFlags.ts` in `apps/web/src/lib/` so all flags go
  through one module and the defaults are explicit.
- Grep the codebase for any `process.env.NEXT_PUBLIC_ENABLE_*` read and
  route each through the module.
- Update `nav`/`TableViewer` to hide auto-sign UI cleanly when disabled.

**AC**:

- [ ] Setting `NEXT_PUBLIC_ENABLE_INIT_USERNAMES=false` stops all
      `fetchInitUsername` network calls (verify via network tab or unit test
      with a spy).
- [ ] Setting `NEXT_PUBLIC_ENABLE_AUTOSIGN=false` hides the auto-sign
      toggle in the table header.
- [ ] `trading-widget` references only render when the flag is true.

**Commit message**: `feat(web): honour NEXT_PUBLIC_ENABLE_* feature flags across Initia features`

---

### I1-4 — Remove legacy-chain fallbacks from bot chain clients

**Goal**: `bots/{agent,keeper,vrf-operator}/src/chain/client.ts` default
`chain.id=133`, a legacy chain name, and a legacy native symbol when env
vars are absent. Safe in prod (env is always set) but a silent
mis-boot vector when someone forgets to export — the bot will happily
connect to the wrong chain against the wrong RPC. Plus `bots/agent/src/bot.ts:251`
has the legacy chain object hardcoded inside `updateStrategy`.

**Scope**:

- Replace defaults with `throw` when `CHAIN_ENV !== "local"` and
  `CHAIN_ID` is not set. Allow `CHAIN_ENV=local` to keep a localhost
  default.
- Read chain name/symbol from `CHAIN_NAME` / `NATIVE_SYMBOL` as today,
  but also require them when `CHAIN_ENV=initia-testnet`.
- Fix the hardcoded legacy chain literal inside `bot.ts` → read from
  `this.config.chain`.

**AC**:

- [ ] Boot the agent with only `CHAIN_ENV=initia-testnet` and no other
      chain vars → it refuses to start with a clear error (not a silent
      legacy default).
- [ ] `grep -n 'legacy chain\\|legacy symbol' bots/` returns zero hits outside
      `legacy/` and comments.
- [ ] Existing bot unit tests still pass.

**Commit message**: `chore(bots): remove legacy default fallbacks from chain clients`

---

### I1-5 — Fix silent chain-ID fallback `7777777` in web config

**Goal**: `packages/shared/src/chainConfig.ts:25` and
`apps/web/src/app/providers.tsx:27` both fall back to `"7777777"` when
`INITIA_CHAIN_ID` / `NEXT_PUBLIC_INTERWOVEN_CHAIN_ID` are missing. The
web app will render and look healthy while pointing InterwovenKit at a
fictitious chain.

**Scope**:

- `chainConfig.ts`: if `env==="initia-testnet"` and `INITIA_CHAIN_ID` is
  unset, throw `ChainConfigError` at the same level as the other
  missing-var errors.
- `providers.tsx`: if `NEXT_PUBLIC_INTERWOVEN_CHAIN_ID` is unset when
  `isInitiaEnv`, render a fatal error banner (or throw at dev time) —
  not a silent fallback.
- Update tests that relied on the fallback.

**AC**:

- [ ] Starting the web dev server with `NEXT_PUBLIC_CHAIN_ENV=initia-testnet`
      but no `NEXT_PUBLIC_INTERWOVEN_CHAIN_ID` shows a clear
      misconfiguration error instead of rendering.
- [ ] `chainConfig` unit tests cover the missing-ID case.

**Commit message**: `fix(config): fail loud when Initia chain ID env vars are missing`

---

### I1-6 — Session-revoke route must actually revoke the InterwovenKit session

**Goal**: `services/ownerview/src/routes/session.ts` stores revocations
in an in-memory `Map<address, SessionRecord>` but doesn't invalidate the
client's InterwovenKit session key, because no real session key exists
yet (blocked on I0-2). Once I0-2 lands, wire the revoke endpoint to the
client so it calls `iwkAutoSign.revoke()` server-confirmed.

**Scope**:

- Add a client call in `useAutoSignSession.revoke()` that POSTs to
  `${NEXT_PUBLIC_OWNERVIEW_URL}/session/revoke` before local teardown,
  so the server-side audit log picks up the revocation regardless of
  browser-tab lifecycle.
- On the server side, when a POST comes in, record
  `{address, revokedAt, via}` and persist beyond in-memory (at minimum
  log via the existing pino logger so it survives restarts — production
  swap to Redis is fine to defer).
- Surface server revocations back to the client on the next session
  activation attempt, so a user who revoked on another device is forced
  to re-consent.

**AC**:

- [ ] End-to-end: activate auto-sign in tab A → revoke from tab B →
      tab A's next action triggers re-consent.
- [ ] Supertest covers the revoke happy path and auth failures.
- [ ] Pino log line present per revocation.

**Commit message**: `feat(ownerview): propagate session revocations back to clients`

**Depends on**: I0-2.

---

### I1-7 — VRF doc: fill real TX hashes after the E2E run

**Goal**: `docs/initia/vrf.md:42-44` contains `PLACEHOLDER` for
`VRFRequested tx`, `VRFFulfilled tx`, `Community cards revealed at hand`.
Judges reading the VRF doc hit empty evidence.

**Scope**:

- After I3-2 runs, extract the first `VRFRequested` / `VRFFulfilled`
  TXs from the rollup explorer and paste into `docs/initia/vrf.md`.
- Optionally add an explorer URL helper in the doc.

**AC**:

- [ ] No `PLACEHOLDER` in `docs/initia/vrf.md`.
- [ ] Both TX hashes resolve on the rollup explorer.

**Commit message**: `docs(initia): fill VRF evidence TX hashes from live rollup`

**Depends on**: I3-2.

---

## M-I2 — HARDENING (defaults, env flags, misconfig guards)

### I2-1 — Remove legacy deploy scripts from the active path

**Goal**: ADR-020 §"Items Removed / Disabled" claims
legacy deploy scripts and RPC URLs were moved out of active config.
Actually: old deploy scripts still lived under tracked script paths and
legacy RPC URLs were still present in `foundry.toml`.

**Scope**:

- Remove obsolete deploy scripts from the repo's active tree.
- Remove legacy RPC / explorer entries from `foundry.toml`.
- Update ADR-020 to reflect that these paths were removed rather than relocated.

**AC**:

- [ ] `ls contracts/script/` contains only live scripts.
- [ ] `forge build` uses only active Initia/local config.
- [ ] ADR-020 reflects removal, not relocation to a legacy path.

**Commit message**: `chore(contracts): remove legacy deploy scripts and stale rpc config`

---

### I2-2 — Drop legacy comments and docstrings mentioning prior chains

**Goal**: Minor but low-effort polish. `apps/web/src/app/providers.tsx:11`,
`apps/web/src/lib/wallet/interwoven.ts:17` and the pokerTableClient
comments still talk about old chain/local fallback. This is dead code if
I0-2 + I0-3 actually eliminate the non-Initia branches for production
builds. Keep the local branch for dev ergonomics but drop the legacy
references from copy.

**Scope**:

- Replace prior-chain references in comments with "local" and
  "Initia".
- `pokerTableClient.ts` default `nativeSymbol` → either throw
  (if I1-5 already does) or "INIT". Same for `chainName`.
- No behavioural change beyond what I1-4/I1-5 already did.

**AC**:

- [ ] `grep -ri 'legacy chain\|legacy symbol\|monad\|nad\.fun' apps/web/src services bots packages --include="*.ts" --include="*.tsx"`
      returns only comments inside legacy ADR files.

**Commit message**: `chore: strip prior-chain references from active Initia code paths`

---

### I2-3 — Tune Initia block-time-sensitive knobs

**Goal**: ADR-020 §"Block Time Impact" says to drop poll to 250ms and
widen reorg window to 20 blocks. `.env.initia` sets `POLL_INTERVAL_MS=250`
and `LOG_BLOCK_RANGE=100`, but:

- `LOG_BLOCK_RANGE=100` at 100ms blocks means a fetch window ≈ 10
  seconds of chain activity. Possibly fine, possibly too large on a
  loaded rollup. Validate.
- Reorg-safety window (indexer, keeper, vrf-operator): check each
  service honours a `CONFIRMATIONS` / `MIN_CONFIRMATIONS` knob ≥ 20
  and `.env.initia` sets it.
- `VRF_OPERATOR_MIN_CONFIRMATIONS=3` in `.env.initia` — too small for
  100ms blocks; ADR says 20.

**Scope**:

- Audit each consumer of `CONFIRMATIONS` / `MIN_CONFIRMATIONS` /
  `REORG_WINDOW` / `BLOCK_RANGE` in `services/indexer`,
  `bots/keeper`, `bots/vrf-operator`.
- Bump `.env.initia` defaults to match ADR-020 guidance.
- Add a one-line comment per knob explaining why the value is set.

**AC**:

- [ ] `VRF_OPERATOR_MIN_CONFIRMATIONS=20` (or explicit documented
      deviation) in `.env.initia`.
- [ ] Indexer / keeper configs align with ADR-020 table.
- [ ] Existing tests still pass.

**Commit message**: `chore(config): tune reorg/confirmation knobs for Initia 100ms blocks`

---

### I2-4 — KYC gate: enforce `KYC_SBT_ADDRESS=0x0` at runtime

**Goal**: ADR-020 disables KYC on Initia and the deploy script asserts
`KYC_SBT_ADDRESS` is unset. The web app and bots should also refuse to
start if `KYC_SBT_ADDRESS` is set to anything non-zero on Initia — the
contract would enforce it and seat registration would silently fail
in the browser. Defence-in-depth, cheap.

**Scope**:

- Add a tiny check in `packages/shared/src/chainConfig.ts`: if
  `env==="initia-testnet"` and `KYC_SBT_ADDRESS` is set and not
  `0x0000000000000000000000000000000000000000`, throw.
- Mirror in the web client at boot (so devs see a clear error).

**AC**:

- [ ] With bad `KYC_SBT_ADDRESS` on Initia, boot fails with a specific
      message.
- [ ] Default/empty → accepted.

**Commit message**: `chore(config): refuse non-zero KYC_SBT_ADDRESS on Initia`

---

## M-I3 — VERIFICATION & CI (prove it stays green)

### I3-1 — Run `validate-submission.mjs` in CI

**Goal**: The validator exists but isn't in the pipeline. After I0-7
tightens it, we want it to block merges that accidentally re-introduce
placeholders.

**Scope**:

- Add a `submission:` job in `.github/workflows/ci.yml` that runs
  `node scripts/validate-submission.mjs`.
- Depend on it from the required-checks list (or leave it as a standalone
  job that just has to pass).

**AC**:

- [ ] CI has a visible "Submission" (or similar) job that passes.
- [ ] Adding `PLACEHOLDER_X` to `submission.json` locally causes the
      job to fail (manual test via dry-run push to a branch).

**Commit message**: `ci: add submission.json validation job`

**Depends on**: I0-7.

---

### I3-2 — Run the E2E smoke and commit real evidence

**Goal**: `docs/initia/e2e-evidence.md` is a template full of
`PLACEHOLDER` tokens. Judges reading the evidence file see nothing.

**Scope**:

- After I0-4/I0-5/I0-6 land, run `bash scripts/e2e-smoke.initia.sh 3`
  end-to-end with bots live.
- Let the script populate `docs/initia/e2e-evidence.md` with real
  seat-registration TXs, HandSettled TXs, and rollup block numbers.
- Manually execute one auto-sign action via the browser and paste the
  TX hash into the `Autosign Evidence` section (until I3-3 automates
  this).
- Commit the populated evidence file.

**AC**:

- [ ] No `PLACEHOLDER` in `docs/initia/e2e-evidence.md`.
- [ ] Every TX listed resolves on the rollup explorer.
- [ ] At least one TX is an auto-sign action (method = `call` / `raise` /
      `fold` / `check`).

**Commit message**: `docs(initia): publish real E2E evidence from Initia rollup smoke run`

**Depends on**: I0-4, I0-5, I0-2, I0-3.

---

### I3-3 — Automated Playwright run that captures the auto-sign screenshot set

**Goal**: `docs/initia/scoring-rehearsal.md` demands a screenshot of
`.init` in leaderboard, auto-sign countdown, bridge deeplink. The repo
has `apps/web/playwright` configured but nothing Initia-specific.

**Scope**:

- Add a Playwright spec `apps/web/tests/e2e/initia.spec.ts` that, when
  `CHAIN_ENV=initia-testnet` and against a running rollup:
  - Navigates to `/leaderboard`, asserts at least one row owner renders
    as `*.init`, screenshots it.
  - Navigates to a live table, asserts the auto-sign toggle exists,
    screenshots it post-activation (mocked session if needed).
  - Navigates to an agent page, asserts the "Bridge via Interwoven"
    card, screenshots.
- Gate the spec behind `process.env.CI_INITIA === "1"` so it doesn't
  run in the default CI (no rollup available there).
- Wire a manual-dispatch CI workflow that runs it and uploads the
  `screenshots/` artifact.

**AC**:

- [ ] Running the spec locally against a live rollup produces three
      PNGs under `apps/web/tests/e2e/screenshots/`.
- [ ] Spec runs under 2 minutes.
- [ ] Screenshots are referenced from `docs/initia/*.md`.

**Commit message**: `test(e2e): capture Initia UI screenshots for scoring evidence`

**Depends on**: I3-2.

---

### I3-4 — Manual submission-ready checklist runbook

**Goal**: Lock in a single checklist that the next human runs before
clicking "Submit" on the hackathon portal. Right now the information
is scattered across `INITIA_SUBMISSION.md`, `docs/initia/scoring-rehearsal.md`,
and the remaining Initia submission support docs.

**Scope**:

- Pick one of the three files (recommend `docs/initia/scoring-rehearsal.md`)
  as the canonical pre-submit runbook; keep the others as narrative
  scoring responses only.
- In the chosen file, keep only the **actionable** list (rollup up,
  contracts deployed, demo video live, submission.json validated,
  evidence populated, screenshots captured).
- Each item has an exact shell command that proves it's done.

**AC**:

- [ ] One file exists whose numbered checklist walks a human
      from fresh clone → "submit now" in under 30 minutes.
- [ ] The other two files drop the checklist (keep the narrative).

**Commit message**: `docs(initia): consolidate pre-submit checklist in scoring-rehearsal.md`

---

## M-I4 — DOCS & CLEANUP

### I4-1 — Refresh auto-memory project notes for the Initia pivot

**Goal**: `MEMORY.md` still points at `g_series_status.md` and
`production_todo.md`; the latter describes `TODO.md` as the production
roadmap, but `TODO.md` was deleted in commit `dbfd70c`. Memory will
confuse future runners.

**Scope**:

- Update `project_overview.md` in the auto-memory dir to note the
  Initia pivot (deployment target, InterwovenKit, MiniEVM).
- Either delete `production_todo.md` or rewrite it to say "the TODO.md
  file was deleted in the Initia pivot; see this TICKET.md instead".
- Add a fresh memory entry `initia_port_status.md` that points at this
  TICKET.md.

**AC**:

- [ ] `MEMORY.md` index reflects the current file set.
- [ ] No memory file claims `TODO.md` exists at the repo root.

**Commit message**: `chore(memory): refresh auto-memory to reflect Initia pivot`

**Note**: This is a memory-system ticket, not a code ticket — user's
CLAUDE.md memory files live outside the repo. Expect the diff to be
in `~/.claude/projects/-Users-inch-Projects-railbird/memory/` only.

---

### I4-2 — Delete the `apps/web/src/types/interwovenkit.d.ts` stub

**Goal**: Small follow-up if I0-1 didn't already delete it. Keep it
listed separately because I0-1 could defer the deletion if the real
types need adaptation.

**Scope**:

- Delete the file. Fix any consumer that falls off.

**AC**:

- [ ] File doesn't exist.
- [ ] Typecheck/build still pass.

**Commit message**: `chore(web): remove legacy InterwovenKit type stub`

**Depends on**: I0-1.

---

### I4-3 — README "Quick Start" should actually work end-to-end

**Goal**: `README.md` Quick Start (lines 94-109) claims 4 commands take
you from checkout to running demo. Today, step 3 (`bash scripts/deploy/initia.sh`)
will fail because the rollup isn't provisioned, and step 4
(`scripts/run-4agents.sh`) predates Initia.

**Scope**:

- Reorder: step 1 = `pnpm install`, step 2 = `bash scripts/initia/launch-minitia.sh`,
  step 3 = `bash scripts/deploy/initia.sh`, step 4 = `bash scripts/e2e-smoke.initia.sh`,
  step 5 = `bash scripts/run-4agents.sh` (if still the right entrypoint).
- Verify `scripts/run-4agents.sh` still points at Initia env; it was
  authored before the Initia port; verify the repo's helper scripts now
  point only at the Initia/local flow.
- Add a note: rollup launch is a **one-time** operation; step 2 can be
  skipped if `infra/initia/rollup.json` is already populated.

**AC**:

- [ ] A fresh clone + these steps in order takes a new operator from zero
      to running demo (happy path, ideally under 30 minutes).
- [ ] README no longer references the previous chain migration as the primary
      path — only as a "Legacy" appendix.

**Commit message**: `docs(readme): rewrite Quick Start for the Initia path`

---

## Appendix — What we deliberately did NOT add

- **Revenue model / monetization tickets.** `INITIA_SUBMISSION.md` §5
  notes this is intentionally absent for a hackathon. Judges' rubric
  gives 10% to Market Understanding and accepts "token economy is the
  path" narrative. Don't over-invest pre-submission.
- **Treasury rebalancing / nad.fun integration.** ADR-020 disabled both
  (`ENABLE_REBALANCING=false`, `NEXT_PUBLIC_ENABLE_TRADING_WIDGET=false`).
  Re-enabling requires an Initia DEX and is out of scope.
- **Move / CosmWasm rewrites.** ADR-020 kept MiniEVM; no reason to
  revisit.
- **Adding Chainlink VRF.** `docs/initia/vrf.md` explains why not.
- **KYC SBT replacement.** Initia has no equivalent and the hackathon
  does not require it.
