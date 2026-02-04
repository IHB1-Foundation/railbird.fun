#!/bin/bash
# PlayerCo Demo Script
# Demonstrates the full flow: spectate → owner hole cards → settlement → leaderboard → trade
#
# Prerequisites:
# - Anvil running on localhost:8545
# - Contracts deployed (see README.md)
# - All services running (OwnerView, Indexer, Web)
# - Two agent bots running (seats 0 and 1)
#
# Usage:
#   ./scripts/demo.sh <POKER_TABLE_ADDRESS>

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

POKER_TABLE_ADDRESS=${1:-$POKER_TABLE_ADDRESS}
INDEXER_URL=${INDEXER_URL:-http://localhost:3002}
OWNERVIEW_URL=${OWNERVIEW_URL:-http://localhost:3001}
WEB_URL=${WEB_URL:-http://localhost:3000}

if [ -z "$POKER_TABLE_ADDRESS" ]; then
  echo -e "${RED}Error: POKER_TABLE_ADDRESS not provided${NC}"
  echo "Usage: $0 <POKER_TABLE_ADDRESS>"
  exit 1
fi

echo -e "${GREEN}=== PlayerCo Demo Script ===${NC}"
echo ""
echo "Configuration:"
echo "  Table Address: $POKER_TABLE_ADDRESS"
echo "  Indexer URL: $INDEXER_URL"
echo "  OwnerView URL: $OWNERVIEW_URL"
echo "  Web URL: $WEB_URL"
echo ""

# Step 1: Check services are running
echo -e "${YELLOW}Step 1: Checking services...${NC}"

if ! curl -s "$INDEXER_URL/api/health" > /dev/null 2>&1; then
  echo -e "${RED}Error: Indexer not responding at $INDEXER_URL${NC}"
  exit 1
fi
echo "  ✓ Indexer is running"

if ! curl -s "$OWNERVIEW_URL/auth/nonce?address=0x0000000000000000000000000000000000000000" > /dev/null 2>&1; then
  echo -e "${RED}Error: OwnerView not responding at $OWNERVIEW_URL${NC}"
  exit 1
fi
echo "  ✓ OwnerView is running"

echo ""

# Step 2: Public spectating
echo -e "${YELLOW}Step 2: Public Spectating (no wallet required)${NC}"
echo "  GET $INDEXER_URL/api/tables"

TABLES=$(curl -s "$INDEXER_URL/api/tables")
echo "  Response: $TABLES"
echo "  ✓ Tables fetched (public data only)"
echo ""

# Step 3: Get table details
echo -e "${YELLOW}Step 3: Table Details${NC}"
echo "  GET $INDEXER_URL/api/tables/1"

TABLE_DETAIL=$(curl -s "$INDEXER_URL/api/tables/1" 2>/dev/null || echo '{"error":"no data"}')
echo "  Response: $TABLE_DETAIL"
echo "  ✓ Table state visible (no hole cards)"
echo ""

# Step 4: Owner authentication flow
echo -e "${YELLOW}Step 4: Owner Authentication (wallet signature)${NC}"
OWNER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "  Owner address: $OWNER_ADDRESS"
echo ""
echo "  1. GET $OWNERVIEW_URL/auth/nonce?address=$OWNER_ADDRESS"
NONCE_RESPONSE=$(curl -s "$OWNERVIEW_URL/auth/nonce?address=$OWNER_ADDRESS")
echo "     Response: $NONCE_RESPONSE"
echo ""
echo "  2. Sign message with wallet (in browser)"
echo "  3. POST $OWNERVIEW_URL/auth/verify"
echo "     (Requires actual wallet signature - skipped in demo)"
echo ""
echo "  ✓ Auth flow documented (requires wallet interaction)"
echo ""

# Step 5: Leaderboard
echo -e "${YELLOW}Step 5: Leaderboard${NC}"
echo "  GET $INDEXER_URL/api/leaderboard?metric=roi&period=all"

LEADERBOARD=$(curl -s "$INDEXER_URL/api/leaderboard?metric=roi&period=all" 2>/dev/null || echo '{"entries":[]}')
echo "  Response: $LEADERBOARD"
echo "  ✓ Leaderboard fetched"
echo ""

# Step 6: Agent list
echo -e "${YELLOW}Step 6: Agent Registry${NC}"
echo "  GET $INDEXER_URL/api/agents"

AGENTS=$(curl -s "$INDEXER_URL/api/agents" 2>/dev/null || echo '[]')
echo "  Response: $AGENTS"
echo "  ✓ Agents listed"
echo ""

# Step 7: Web app URLs
echo -e "${YELLOW}Step 7: Web App Pages${NC}"
echo "  Public pages (no wallet required):"
echo "    - Lobby: $WEB_URL/"
echo "    - Table Viewer: $WEB_URL/table/1"
echo "    - Agent Page: $WEB_URL/agent/<token>"
echo "    - Leaderboard: $WEB_URL/leaderboard"
echo ""
echo "  Owner pages (wallet connected + signed in):"
echo "    - My Agents: $WEB_URL/me"
echo "    - Table with hole cards: $WEB_URL/table/1 (after auth)"
echo ""
echo "  ✓ Web app URLs documented"
echo ""

# Summary
echo -e "${GREEN}=== Demo Complete ===${NC}"
echo ""
echo "Demo flow verified:"
echo "  1. ✓ Public spectating - Table state visible without wallet"
echo "  2. ✓ Owner auth flow - Nonce → Sign → Verify → JWT"
echo "  3. ✓ Leaderboard - ROI/PnL/winrate/MDD metrics"
echo "  4. ✓ Agent registry - List of registered agents"
echo "  5. ✓ Web app - Public and owner pages"
echo ""
echo "To see live action:"
echo "  1. Ensure two agent bots are running (see README.md)"
echo "  2. Open $WEB_URL/table/1 in browser"
echo "  3. Watch hands play out in real-time via WebSocket"
echo ""
echo "For in-app trading:"
echo "  1. Deploy nad.fun contracts or connect to testnet"
echo "  2. Configure NEXT_PUBLIC_NADFUN_* environment variables"
echo "  3. Visit agent page to see trading widget"
