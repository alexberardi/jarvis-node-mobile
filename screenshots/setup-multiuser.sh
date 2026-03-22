#!/usr/bin/env bash
#
# setup-multiuser.sh — Create multi-user test fixtures via API
#
# Creates: User A (admin), User B (member), households, invite code, nodes
# Writes:  .e2e-env (sourced by run.sh for Maestro flows)
#
# Idempotent: checks if User A can login first; if yes, reuses existing data.
#
# Usage:
#   ./screenshots/setup-multiuser.sh              # Use default auth/CC URLs
#   AUTH_URL=http://host:7701 CC_URL=http://host:7703 ./screenshots/setup-multiuser.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.e2e-env"

# Service URLs (default to localhost)
AUTH_URL="${AUTH_URL:-http://localhost:7701}"
CC_URL="${CC_URL:-http://localhost:7703}"

# Test credentials
USER_A_EMAIL="e2e-admin@test.jarvis"
USER_A_PASSWORD="TestPass1A!"
USER_A_USERNAME="e2e-admin"

USER_B_EMAIL="e2e-member@test.jarvis"
USER_B_PASSWORD="TestPass1B!"
USER_B_USERNAME="e2e-member"

HOUSEHOLD_A_NAME="Test Home"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
err()  { echo -e "${RED}[setup]${NC} $*" >&2; }
info() { echo -e "${CYAN}[setup]${NC} $*"; }

# ── Helper: JSON field extraction (no jq dependency) ───────────────
# Usage: json_field '{"key":"value"}' key
json_field() {
    local json="$1" field="$2"
    echo "$json" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['$field'])"
}

# ── Disable iOS Simulator AutoFill (prevents password fields hijack) ──
disable_autofill() {
    local booted
    booted=$(xcrun simctl list devices booted 2>/dev/null | grep -c "Booted" || true)
    if [[ "$booted" -gt 0 ]]; then
        xcrun simctl spawn booted defaults write com.apple.Preferences AutoFillPasswords -bool NO 2>/dev/null || true
        log "Disabled iOS Simulator AutoFill passwords"
    fi
}

# ── Check services are reachable ──────────────────────────────────
check_services() {
    log "Checking services..."
    if ! curl -sf "$AUTH_URL/health" > /dev/null 2>&1; then
        err "jarvis-auth not reachable at $AUTH_URL"
        exit 1
    fi
    if ! curl -sf "$CC_URL/health" > /dev/null 2>&1; then
        err "jarvis-command-center not reachable at $CC_URL"
        exit 1
    fi
    log "Services OK"
}

# ── Try login (returns 0 if success, 1 if fail) ──────────────────
try_login() {
    local email="$1" password="$2"
    local resp
    resp=$(curl -sf -X POST "$AUTH_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}" 2>/dev/null) || return 1
    echo "$resp"
    return 0
}

# ── Register a user ──────────────────────────────────────────────
register_user() {
    local email="$1" password="$2" username="$3"
    local resp
    resp=$(curl -sf -X POST "$AUTH_URL/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\",\"username\":\"$username\"}") || {
        err "Failed to register $email"
        return 1
    }
    echo "$resp"
}

# ── Main setup ───────────────────────────────────────────────────
main() {
    disable_autofill
    check_services

    local token_a="" household_a="" token_b="" household_b=""
    local invite_code=""
    local existing=false

    # ── Step 1: Create or login User A ─────────────────────────────
    info "Step 1: User A ($USER_A_EMAIL)"
    local login_resp
    if login_resp=$(try_login "$USER_A_EMAIL" "$USER_A_PASSWORD"); then
        log "User A already exists, reusing"
        token_a=$(json_field "$login_resp" "access_token")
        existing=true
    else
        log "Registering User A..."
        local reg_resp
        reg_resp=$(register_user "$USER_A_EMAIL" "$USER_A_PASSWORD" "$USER_A_USERNAME")
        token_a=$(json_field "$reg_resp" "access_token")
        household_a=$(json_field "$reg_resp" "household_id")
        log "User A registered, household: $household_a"
    fi

    # ── Step 2: Get User A's households ────────────────────────────
    info "Step 2: Resolve User A households"
    local households_resp
    households_resp=$(curl -sf "$AUTH_URL/households" \
        -H "Authorization: Bearer $token_a")

    # Find "Test Home" or first household
    household_a=$(echo "$households_resp" | python3 -c "
import sys, json
hh = json.loads(sys.stdin.read())
# Prefer 'Test Home', fall back to first admin household
for h in hh:
    if h['name'] == '$HOUSEHOLD_A_NAME':
        print(h['id']); sys.exit()
for h in hh:
    if h['role'] == 'admin':
        print(h['id']); sys.exit()
print(hh[0]['id'] if hh else '')
")

    if [[ -z "$household_a" ]]; then
        err "Could not find household for User A"
        exit 1
    fi
    log "User A household: $household_a"

    # ── Step 3: Rename household to "Test Home" ────────────────────
    if ! $existing; then
        info "Step 3: Rename household to '$HOUSEHOLD_A_NAME'"
        curl -sf -X PATCH "$AUTH_URL/households/$household_a" \
            -H "Authorization: Bearer $token_a" \
            -H "Content-Type: application/json" \
            -d "{\"name\":\"$HOUSEHOLD_A_NAME\"}" > /dev/null
        log "Renamed"
    else
        # Check current name
        local current_name
        current_name=$(echo "$households_resp" | python3 -c "
import sys, json
hh = json.loads(sys.stdin.read())
for h in hh:
    if h['id'] == '$household_a':
        print(h['name']); sys.exit()
print('')
")
        if [[ "$current_name" != "$HOUSEHOLD_A_NAME" ]]; then
            info "Step 3: Rename household to '$HOUSEHOLD_A_NAME'"
            curl -sf -X PATCH "$AUTH_URL/households/$household_a" \
                -H "Authorization: Bearer $token_a" \
                -H "Content-Type: application/json" \
                -d "{\"name\":\"$HOUSEHOLD_A_NAME\"}" > /dev/null
            log "Renamed"
        else
            log "Step 3: Household already named '$HOUSEHOLD_A_NAME'"
        fi
    fi

    # ── Step 4: Create invite code ─────────────────────────────────
    info "Step 4: Create invite code"
    local invite_resp
    invite_resp=$(curl -sf -X POST "$AUTH_URL/households/$household_a/invites" \
        -H "Authorization: Bearer $token_a" \
        -H "Content-Type: application/json" \
        -d '{"default_role":"member","max_uses":5,"expires_in_days":1}')
    invite_code=$(json_field "$invite_resp" "code")
    log "Invite code: $invite_code"

    # ── Step 5: Create or login User B ─────────────────────────────
    info "Step 5: User B ($USER_B_EMAIL)"
    if login_resp=$(try_login "$USER_B_EMAIL" "$USER_B_PASSWORD"); then
        log "User B already exists, reusing"
        token_b=$(json_field "$login_resp" "access_token")
    else
        log "Registering User B..."
        local reg_resp_b
        reg_resp_b=$(register_user "$USER_B_EMAIL" "$USER_B_PASSWORD" "$USER_B_USERNAME")
        token_b=$(json_field "$reg_resp_b" "access_token")
        household_b=$(json_field "$reg_resp_b" "household_id")
        log "User B registered, household: $household_b"
    fi

    # Get User B's households
    local b_households
    b_households=$(curl -sf "$AUTH_URL/households" \
        -H "Authorization: Bearer $token_b")
    household_b=$(echo "$b_households" | python3 -c "
import sys, json
hh = json.loads(sys.stdin.read())
for h in hh:
    if h['role'] == 'admin':
        print(h['id']); sys.exit()
print(hh[0]['id'] if hh else '')
")

    # ── Step 6: User B joins "Test Home" via invite code ───────────
    info "Step 6: User B joins '$HOUSEHOLD_A_NAME'"
    local already_member
    already_member=$(echo "$b_households" | python3 -c "
import sys, json
hh = json.loads(sys.stdin.read())
for h in hh:
    if h['id'] == '$household_a':
        print('yes'); sys.exit()
print('no')
")

    if [[ "$already_member" == "yes" ]]; then
        log "User B already a member of '$HOUSEHOLD_A_NAME'"
    else
        curl -sf -X POST "$AUTH_URL/households/join" \
            -H "Authorization: Bearer $token_b" \
            -H "Content-Type: application/json" \
            -d "{\"invite_code\":\"$invite_code\"}" > /dev/null
        log "User B joined '$HOUSEHOLD_A_NAME'"
    fi

    # ── Step 7: Register test nodes ────────────────────────────────
    info "Step 7: Register test nodes"

    # Get ADMIN_API_KEY from command-center .env
    local cc_env_file
    cc_env_file="$(cd "$SCRIPT_DIR/../.." && pwd)/jarvis-command-center/.env"
    local admin_key=""
    if [[ -f "$cc_env_file" ]]; then
        admin_key=$(grep -E "^ADMIN_API_KEY=" "$cc_env_file" | cut -d= -f2- | tr -d '"' | tr -d "'")
    fi

    if [[ -z "$admin_key" ]]; then
        warn "ADMIN_API_KEY not found in $cc_env_file — skipping node creation"
        warn "Set ADMIN_API_KEY env var or add to jarvis-command-center/.env"
    else
        local ts
        ts=$(date +%s)
        local node_kitchen="e2e-kitchen-${ts}"
        local node_bedroom="e2e-bedroom-${ts}"

        # Create kitchen node
        local node_resp
        if node_resp=$(curl -sf -X POST "$CC_URL/api/v0/admin/nodes" \
            -H "X-Api-Key: $admin_key" \
            -H "Content-Type: application/json" \
            -d "{\"node_id\":\"$node_kitchen\",\"household_id\":\"$household_a\",\"room\":\"kitchen\",\"name\":\"E2E Kitchen\"}"); then
            log "Created node: $node_kitchen (kitchen)"
        else
            warn "Failed to create kitchen node (may already exist)"
        fi

        # Create bedroom node
        if node_resp=$(curl -sf -X POST "$CC_URL/api/v0/admin/nodes" \
            -H "X-Api-Key: $admin_key" \
            -H "Content-Type: application/json" \
            -d "{\"node_id\":\"$node_bedroom\",\"household_id\":\"$household_a\",\"room\":\"bedroom\",\"name\":\"E2E Bedroom\"}"); then
            log "Created node: $node_bedroom (bedroom)"
        else
            warn "Failed to create bedroom node (may already exist)"
        fi
    fi

    # ── Step 8: Write .e2e-env ─────────────────────────────────────
    info "Step 8: Writing $ENV_FILE"
    cat > "$ENV_FILE" <<EOF
# Auto-generated by setup-multiuser.sh — do not edit
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
E2E_USER_A_EMAIL="$USER_A_EMAIL"
E2E_USER_A_PASSWORD="$USER_A_PASSWORD"
E2E_USER_B_EMAIL="$USER_B_EMAIL"
E2E_USER_B_PASSWORD="$USER_B_PASSWORD"
E2E_HOUSEHOLD_A_ID="$household_a"
E2E_HOUSEHOLD_A_NAME="$HOUSEHOLD_A_NAME"
E2E_HOUSEHOLD_B_ID="${household_b:-}"
E2E_INVITE_CODE="$invite_code"
E2E_NODE_KITCHEN_ID="${node_kitchen:-}"
E2E_NODE_BEDROOM_ID="${node_bedroom:-}"
E2E_TOKEN_A="$token_a"
E2E_TOKEN_B="$token_b"
EOF
    log "Environment written to $ENV_FILE"

    echo ""
    log "Setup complete!"
    info "  User A: $USER_A_EMAIL (admin of '$HOUSEHOLD_A_NAME')"
    info "  User B: $USER_B_EMAIL (member of '$HOUSEHOLD_A_NAME')"
    info "  Invite: $invite_code"
    info "  Nodes:  ${node_kitchen:-none}, ${node_bedroom:-none}"
    echo ""
}

main "$@"
