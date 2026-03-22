#!/usr/bin/env bash
#
# teardown-multiuser.sh — Clean up multi-user test fixtures
#
# Deletes nodes and households created by setup-multiuser.sh.
# Reads .e2e-env for IDs and tokens.
#
# Usage:
#   ./screenshots/teardown-multiuser.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.e2e-env"

# Service URLs
AUTH_URL="${AUTH_URL:-http://localhost:7701}"
CC_URL="${CC_URL:-http://localhost:7703}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[teardown]${NC} $*"; }
warn() { echo -e "${YELLOW}[teardown]${NC} $*"; }
err()  { echo -e "${RED}[teardown]${NC} $*" >&2; }

main() {
    if [[ ! -f "$ENV_FILE" ]]; then
        warn "No .e2e-env file found — nothing to tear down"
        exit 0
    fi

    # shellcheck disable=SC1090
    source "$ENV_FILE"

    # Re-login users to get fresh tokens
    local token_a="" token_b=""

    log "Logging in as User A..."
    local resp
    if resp=$(curl -sf -X POST "$AUTH_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$E2E_USER_A_EMAIL\",\"password\":\"$E2E_USER_A_PASSWORD\"}" 2>/dev/null); then
        token_a=$(echo "$resp" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['access_token'])")
    else
        warn "Could not login as User A — skipping some cleanup"
    fi

    log "Logging in as User B..."
    if resp=$(curl -sf -X POST "$AUTH_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$E2E_USER_B_EMAIL\",\"password\":\"$E2E_USER_B_PASSWORD\"}" 2>/dev/null); then
        token_b=$(echo "$resp" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['access_token'])")
    else
        warn "Could not login as User B — skipping some cleanup"
    fi

    # ── Delete nodes via CC admin API ─────────────────────────────
    local cc_env_file
    cc_env_file="$(cd "$SCRIPT_DIR/../.." && pwd)/jarvis-command-center/.env"
    local admin_key=""
    if [[ -f "$cc_env_file" ]]; then
        admin_key=$(grep -E "^ADMIN_API_KEY=" "$cc_env_file" | cut -d= -f2- | tr -d '"' | tr -d "'")
    fi

    if [[ -n "$token_a" ]]; then
        for node_id in "${E2E_NODE_KITCHEN_ID:-}" "${E2E_NODE_BEDROOM_ID:-}"; do
            if [[ -n "$node_id" ]]; then
                if curl -sf -X DELETE "$CC_URL/api/v0/admin/nodes/$node_id" \
                    -H "Authorization: Bearer $token_a" > /dev/null 2>&1; then
                    log "Deleted node: $node_id"
                else
                    warn "Failed to delete node: $node_id"
                fi
            fi
        done
    fi

    # ── Remove User B from "Test Home" ────────────────────────────
    if [[ -n "$token_a" && -n "${E2E_HOUSEHOLD_A_ID:-}" ]]; then
        # Get User B's user_id from members list
        local members
        if members=$(curl -sf "$AUTH_URL/households/$E2E_HOUSEHOLD_A_ID/members" \
            -H "Authorization: Bearer $token_a"); then
            local b_user_id
            b_user_id=$(echo "$members" | python3 -c "
import sys, json
members = json.loads(sys.stdin.read())
for m in members:
    if m['email'] == '$E2E_USER_B_EMAIL':
        print(m['user_id']); sys.exit()
print('')
")
            if [[ -n "$b_user_id" ]]; then
                if curl -sf -X DELETE "$AUTH_URL/households/$E2E_HOUSEHOLD_A_ID/members/$b_user_id" \
                    -H "Authorization: Bearer $token_a" > /dev/null 2>&1; then
                    log "Removed User B from Test Home"
                else
                    warn "Failed to remove User B from Test Home"
                fi
            fi
        fi
    fi

    # ── Delete "Test Home" household ──────────────────────────────
    if [[ -n "$token_a" && -n "${E2E_HOUSEHOLD_A_ID:-}" ]]; then
        if curl -sf -X DELETE "$AUTH_URL/households/$E2E_HOUSEHOLD_A_ID" \
            -H "Authorization: Bearer $token_a" > /dev/null 2>&1; then
            log "Deleted household: Test Home ($E2E_HOUSEHOLD_A_ID)"
        else
            warn "Failed to delete Test Home (may have other members)"
        fi
    fi

    # ── Clean up env file ─────────────────────────────────────────
    rm -f "$ENV_FILE"
    log "Removed $ENV_FILE"

    echo ""
    log "Teardown complete"
}

main "$@"
