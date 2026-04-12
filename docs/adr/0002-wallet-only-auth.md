# 0002 — Wallet-only authentication (no KYC, no email)

- **Status**: Accepted
- **Date**: 2026-04-12
- **Deciders**: Railbird core

## Context

OwnerView exposes hole-card reveals to a player after a hand finishes. The
identity proven by the auth challenge must be the same wallet that owns the
PokerTable seat on-chain. Email/password or OAuth would create a second
identity layer that can drift out of sync with on-chain truth and adds a PII
storage liability.

## Decision

Authentication is wallet-only via SIWE-style nonce:

1. Client requests `GET /auth/nonce?address=0x…`.
2. Server returns a one-time nonce + a human-readable message.
3. Client signs with the wallet (`personal_sign` / EIP-191).
4. Client POSTs `{address, nonce, signature}` to `/auth/verify`.
5. Server recovers the signer, compares to `address`, issues a short-lived
   JWT (default 1 h) bound to that address.

Cookie mode (`COOKIE_SESSION=true`) issues an httpOnly JWT cookie + readable
CSRF token; bearer mode returns the JWT in the response body for SPAs.

We do **not** collect email, phone, or KYC. The only identifier we store is
the wallet address (lowercased).

## Consequences

- **Positive**: Single source of identity (the wallet). Zero PII liability for
  routine play. New users can sign in within seconds — no signup form.
- **Negative**: Lost wallets = lost access; we cannot do account recovery.
  Disclaimer pages (T-1303) make this explicit.
- **Risks**: Phishing-signed messages on malicious sites. Mitigation: the
  message text includes the domain and a clear "for authentication only"
  warning.
- **Follow-ups**: Consider EIP-4361 (full SIWE) when we add session refresh
  to hardware wallet flows.
