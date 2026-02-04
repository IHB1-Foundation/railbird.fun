# PlayerCo - Hackathon Submission Checklist

## Project Overview

**PlayerCo** turns a poker-playing AI agent into an on-chain "company" with:
- Wallet-based identity (no email/password)
- Public spectating + owner-only hole cards
- In-app nad.fun trading
- Per-hand accretive-only treasury rebalancing

## Pre-Submission Checklist

### Code Quality
- [x] All packages build successfully (`pnpm build`)
- [x] All tests pass (`pnpm test`)
- [x] No hardcoded addresses - uses chain config system
- [x] TypeScript strict mode enabled
- [x] No credentials in repository

### Smart Contracts (/contracts)
- [x] PokerTable - Heads-up Hold'em with VRF
- [x] PlayerRegistry - Agent token mapping
- [x] PlayerVault - Treasury with accretive-only rebalancing
- [x] MockVRFAdapter - For local testing
- [x] 200+ Foundry tests passing

### Backend Services
- [x] OwnerView - Wallet auth + hole card ACL (109 tests)
- [x] Indexer - Event ingestion + REST + WebSocket (50 tests)
- [x] Dealer service - Card dealing with commitments

### Frontend (/apps/web)
- [x] Public pages - Lobby, Table viewer, Agent, Leaderboard
- [x] Owner pages - My Agents, Table with hole cards
- [x] nad.fun trading widget - Buy/sell with slippage control
- [x] Real-time updates via WebSocket

### Bots
- [x] AgentBot - Automated poker play (17 tests)
- [x] KeeperBot - Liveness + rebalancing (13 tests)

### Documentation
- [x] README.md - Comprehensive setup guide
- [x] PROJECT.md - Full specification
- [x] TICKET.md - Implementation status
- [x] Demo script - `/scripts/demo.sh`

## Demo Flow

### 1. Public Spectating (No Wallet)
1. Visit http://localhost:3000 (Lobby)
2. Click any table to view live state
3. See community cards, pot, stacks, action log
4. Real-time updates via WebSocket

### 2. Owner Hole Cards
1. Connect wallet in header
2. Click "Sign In" to authenticate
3. If you own a seat, see your hole cards highlighted
4. Visit /me to see all your agents

### 3. Settlement
1. Watch hand play out to completion
2. See pot distributed to winner
3. Check leaderboard updates
4. View NAV history on agent page

### 4. Leaderboard
1. Visit /leaderboard
2. Toggle metrics: ROI, PnL, Winrate, MDD
3. Toggle periods: 24h, 7d, 30d, All
4. Click agent to view details

### 5. In-App Trading
1. Visit any agent page
2. See token stage (Bonding/Locked/Graduated)
3. Enter buy/sell amount
4. Set slippage tolerance
5. Execute trade or fallback to nad.fun

## Security Verification

### Hole Card Protection
- [ ] `/api/tables/:id` never returns hole cards
- [ ] WebSocket messages never include hole cards
- [ ] `/owner/holecards` requires JWT + seat ownership
- [ ] Non-owner requests return 403

### Treasury Protection
- [ ] Rebalancing only after settlement
- [ ] Accretive-only constraint enforced on-chain
- [ ] Buy: execution price <= NAV per share
- [ ] Sell: execution price >= NAV per share

### Access Control
- [ ] Wallet signature required for auth
- [ ] Operator can act for owner
- [ ] One action per block enforced
- [ ] 30-minute timeout enforced

## Testnet Deployment (Optional)

```bash
# Deploy to Monad testnet
cd contracts

# Set private key with testnet funds
export PRIVATE_KEY=0x...

# Deploy contracts
forge create src/PokerTable.sol:PokerTable \
  --constructor-args 1 5000000000000000 10000000000000000 <VRF_ADAPTER> \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PRIVATE_KEY

# Update environment variables with deployed addresses
# Configure nad.fun addresses for testnet
```

## Known Limitations (MVP)

1. **Showdown winner** - Currently determined by keeper (MVP), production needs hand evaluation
2. **VRF integration** - Uses mock adapter locally, needs real VRF for production
3. **Side pots** - Not implemented (heads-up only)
4. **Hand history** - Basic, could add replay
5. **Mobile UI** - Desktop-focused

## Repository Statistics

- **Languages**: Solidity, TypeScript, JavaScript
- **Packages**: 8 workspace packages
- **Smart Contract Tests**: 200+
- **Service Tests**: 170+
- **Bot Tests**: 30+

## Team

Built for hackathon by a single developer with Claude Code assistance.

## License

MIT
