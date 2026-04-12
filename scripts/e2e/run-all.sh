#!/bin/bash
# scripts/e2e/run-all.sh
# Run all Railbird E2E scenarios in sequence and report results.
#
# Each scenario runs in an isolated subshell with its own anvil instance
# so failures in one scenario don't block others.
#
# Usage:
#   ./scripts/e2e/run-all.sh [SCENARIO_FILTER]
#   SCENARIO_FILTER: optional glob, e.g. "01" runs only scenario 01
#
# Environment:
#   SKIP_REORG=1   — skip scenario 05 (requires DB)
#   INDEXER_DB_URL — enable scenario 05 if set
#
# Exit code: 0 if all scenarios pass, 1 if any fail.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="$SCRIPT_DIR/scenarios"
FILTER="${1:-*}"

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

declare -a RESULTS=()

run_scenario() {
  local script="$1"
  local name
  name=$(basename "$script" .sh)
  TOTAL=$((TOTAL + 1))

  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}Running: $name${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  local start_time
  start_time=$(date +%s)

  local exit_code=0
  bash "$script" || exit_code=$?

  local end_time
  end_time=$(date +%s)
  local elapsed=$((end_time - start_time))

  if [ $exit_code -eq 0 ]; then
    PASSED=$((PASSED + 1))
    RESULTS+=("${GREEN}PASS${NC} [$((elapsed))s] $name")
  else
    FAILED=$((FAILED + 1))
    RESULTS+=("${RED}FAIL${NC} [$((elapsed))s] $name (exit=$exit_code)")
  fi
}

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Railbird E2E Test Suite                                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo "  Scenarios dir: $SCENARIOS_DIR"
echo "  Filter: $FILTER"
echo ""

# Build scenario list
SCENARIO_FILES=()
while IFS= read -r -d '' f; do
  SCENARIO_FILES+=("$f")
done < <(find "$SCENARIOS_DIR" -name "${FILTER}*.sh" -print0 | sort -z)

if [ ${#SCENARIO_FILES[@]} -eq 0 ]; then
  echo -e "${YELLOW}No scenarios found matching pattern '${FILTER}*.sh'${NC}"
  exit 0
fi

echo "  Found ${#SCENARIO_FILES[@]} scenario(s):"
for f in "${SCENARIO_FILES[@]}"; do
  echo "    - $(basename "$f")"
done

# Run scenarios
for script in "${SCENARIO_FILES[@]}"; do
  name=$(basename "$script" .sh)

  # Skip reorg scenario unless explicitly enabled
  if [[ "$name" == "05-reorg" ]] && [ "${SKIP_REORG:-1}" = "1" ] && [ -z "${INDEXER_DB_URL:-}" ]; then
    TOTAL=$((TOTAL + 1))
    SKIPPED=$((SKIPPED + 1))
    RESULTS+=("${YELLOW}SKIP${NC} [0s] $name (set INDEXER_DB_URL to enable)")
    echo ""
    echo -e "${YELLOW}Skipping $name (INDEXER_DB_URL not set)${NC}"
    continue
  fi

  run_scenario "$script"
done

# Final report
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           E2E Test Results                                           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
for result in "${RESULTS[@]}"; do
  echo -e "  $result"
done
echo ""
echo -e "  Total:   $TOTAL"
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
echo -e "  ${YELLOW}Skipped: $SKIPPED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "  ${RED}Failed:  $FAILED${NC}"
else
  echo -e "  Failed:  $FAILED"
fi
echo ""

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}E2E SUITE FAILED ($FAILED/$TOTAL)${NC}"
  exit 1
else
  echo -e "${GREEN}E2E SUITE PASSED ($PASSED/$TOTAL, $SKIPPED skipped)${NC}"
  exit 0
fi
