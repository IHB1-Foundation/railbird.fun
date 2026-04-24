# Auto-sign Session Design — Initia Hackathon

**Status**: Accepted  
**Date**: 2026-04-19

---

## Overview

Poker hands involve 10-50 on-chain actions (fold/call/raise/check) across betting rounds. Requiring a wallet popup for each action destroys UX. InterwovenKit's auto-sign (session key) feature allows pre-approving a set of contract calls for a limited time window.

This document defines the session scope, threat model, and implementation approach for Railbird.

---

## Session Scope

### Allowed methods (session key may execute without re-prompt)

| Method                                        | Contract   | Rationale                                 |
| --------------------------------------------- | ---------- | ----------------------------------------- |
| `fold`                                        | PokerTable | In-hand action, bounded risk              |
| `call`                                        | PokerTable | In-hand action, bounded risk              |
| `raise`                                       | PokerTable | In-hand action, bounded risk              |
| `check`                                       | PokerTable | In-hand action, zero cost                 |
| `forceTimeout`                                | PokerTable | Liveness action, no funds transfer        |
| `approve(RCHIP, tableAddress, sessionAmount)` | ChipToken  | Pre-approved only for table buy-in amount |

### Strictly forbidden methods (require explicit wallet prompt every time)

| Method                          | Reason                                               |
| ------------------------------- | ---------------------------------------------------- |
| `registerSeat`                  | Irreversible buy-in, high-value action               |
| `leaveSeat`                     | Funds withdrawal, irreversible                       |
| `setOperator`                   | Security-critical — changes who can act for the seat |
| `vault.withdraw`                | Funds withdrawal                                     |
| `vault.deposit`                 | Funds transfer                                       |
| `approve` with unlimited amount | Financial risk                                       |
| Any admin/governance method     | Admin-only, high privilege                           |

---

## Session Parameters

| Parameter                 | Default                                          | Notes                                               |
| ------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| Duration                  | 30 minutes                                       | Auto-expires; user re-prompted after expiry         |
| Scope                     | Per-table, per-session                           | Session tied to specific table address              |
| Re-approval UX            | In-table banner "Session expired — tap to renew" | Non-blocking                                        |
| Max chip loss per session | stack at session start                           | Session cannot increase buy-in beyond initial stack |

---

## Session Lifecycle

```
User enters table
    │
    ▼
"Enable Auto-sign?" prompt
    │ Accept
    ▼
InterwovenKit creates session key
    │
    ▼
Session active (30 min timer visible in UI)
    │
    ├── Action in hand → dispatched without popup
    │
    └── Session expires OR user revokes
            │
            ▼
        Re-approval prompt
```

---

## Threat Model

### What can a leaked session key do?

- **Execute fold/call/raise/check** on the table the session was created for.
- At worst, the attacker can play sub-optimally and lose the chip stack registered at session creation.
- **Cannot** withdraw funds from vault.
- **Cannot** change seat operator or registry entries.
- **Cannot** register new seats or spend more chips than the pre-approved amount.

### Maximum loss with a compromised session key

```
Max loss = chip stack at session start (≤ buy-in amount)
```

The stack is bounded by the table buy-in. A typical 4-agent Railbird session uses 1,000 RCHIP buy-ins, so max session-key loss is 1,000 RCHIP per compromised session.

### Mitigations

| Risk                                        | Mitigation                                             |
| ------------------------------------------- | ------------------------------------------------------ |
| Session key exfiltrated from browser memory | Short TTL (30 min), narrow allowlist                   |
| Attacker replays session key after expiry   | InterwovenKit enforces expiry on-chain                 |
| User leaves session active on shared device | "Revoke Session" button always visible in table header |
| Session used for `registerSeat`             | Explicitly excluded from allowlist                     |

---

## Operator Key vs Session Key Separation

| Key Type                                  | Who holds it                      | Scope                                                   |
| ----------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| **Owner key** (MetaMask/InterwovenKit)    | User's hardware/cloud wallet      | Full permissions, used for registerSeat, withdraw, etc. |
| **Session key** (InterwovenKit ephemeral) | Browser memory, scoped to session | fold/call/raise/check only                              |
| **Bot operator key**                      | Server-side secret                | Used by AgentBot to submit automated actions            |

The bot operator key and the session key serve different roles: the operator key is for automated bots, the session key is for human players using auto-sign UX.

---

## Implementation References

- Hook: `apps/web/src/lib/wallet/useAutoSignSession.ts` (I4-2)
- Table UI toggle: `apps/web/src/app/table/[id]/page.tsx` (I4-2)
- Session revocation: `services/ownerview/src/routes/session.ts` (I4-3)
- InterwovenKit auto-sign API: `@initia/interwovenkit-react` — `useAutoSign(allowedMethods)`
