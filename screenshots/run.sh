#!/usr/bin/env bash
#
# run.sh — E2E test suite for jarvis-node-mobile
#
# Runs Maestro flows against the iOS Simulator as integration tests.
# Screenshots are captured as side effects of passing tests.
#
# Usage:
#   ./run.sh                          # Run all tests (requires login)
#   ./run.sh --login user:pass        # Login first, then run all
#   ./run.sh --login user:pass nav    # Run only navigation tests
#   ./run.sh auth                     # Run auth tests (must be logged out)
#   ./run.sh nav home settings        # Run multiple categories
#   ./run.sh --setup multiuser        # Setup test data + run multiuser tests
#   ./run.sh --setup --teardown multiuser  # Setup + run + cleanup
#   ./run.sh multiuser                # Run multiuser (assumes setup already done)
#   ./run.sh --update-docs            # Copy screenshots to jarvis-docs
#   ./run.sh --list                   # List available test categories
#
# Categories:
#   auth       - Landing, login, register, validation, logout (requires logout for some)
#   nav        - Tab navigation: home, devices, routines, nodes, pantry
#   home       - Home screen: empty state, node selector, chat, quick actions
#   inbox      - Inbox modal: list, items, detail
#   settings   - Settings modal: account, theme, chat, connection, smart home
#   household  - Household management: switcher, join, edit, invite code
#   pantry     - Package store: browse, detail, search
#   nodes      - Node list, settings
#   devices    - Device list, room management
#   multiuser  - Multi-user/household flows (requires --setup or .e2e-env)
#
# Prerequisites:
#   - iOS Simulator running with the app installed
#   - Maestro CLI + Java 17+ (auto-installed if missing)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FLOWS_DIR="$SCRIPT_DIR/flows"
OUTPUT_DIR="$SCRIPT_DIR/output"
DOCS_DIR="$(cd "$SCRIPT_DIR/../../jarvis-docs/docs/assets/images/screenshots" 2>/dev/null && pwd || echo "")"
E2E_ENV_FILE="$SCRIPT_DIR/.e2e-env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[test]${NC} $*"; }
warn() { echo -e "${YELLOW}[test]${NC} $*"; }
err()  { echo -e "${RED}[test]${NC} $*" >&2; }
info() { echo -e "${CYAN}[test]${NC} $*"; }

# ── Install Java 17 if needed ─────────────────────────────────────

install_java() {
    local jdk_path="/opt/homebrew/opt/openjdk@17"
    if [[ -d "$jdk_path/bin" ]]; then
        export JAVA_HOME="$jdk_path"
        export PATH="$jdk_path/bin:$PATH"
    fi

    if command -v java &>/dev/null; then
        local java_ver
        java_ver=$(java -version 2>&1 | head -1 | sed 's/.*"\([0-9]*\).*/\1/')
        if [[ "$java_ver" -ge 17 ]] 2>/dev/null; then
            return 0
        fi
    fi

    log "Installing Java 17 via Homebrew..."
    brew install openjdk@17
    if [[ -d "$jdk_path/bin" ]]; then
        export JAVA_HOME="$jdk_path"
        export PATH="$jdk_path/bin:$PATH"
    fi
}

# ── Install Maestro if needed ──────────────────────────────────────

install_maestro() {
    export PATH="$HOME/.maestro/bin:$PATH"
    if command -v maestro &>/dev/null; then return 0; fi

    log "Installing Maestro..."
    curl -fsSL "https://get.maestro.mobile.dev" | bash
}

# ── Check simulator ────────────────────────────────────────────────

check_simulator() {
    local booted
    booted=$(xcrun simctl list devices booted 2>/dev/null | grep -c "Booted" || true)
    if [[ "$booted" -eq 0 ]]; then
        err "No iOS Simulator is booted."
        echo "  open -a Simulator && cd .. && npx expo run:ios"
        exit 1
    fi
}

# ── List categories ────────────────────────────────────────────────

list_categories() {
    echo ""
    echo -e "${BOLD}Available test categories:${NC}"
    echo ""
    for dir in "$FLOWS_DIR"/*/; do
        [[ -d "$dir" ]] || continue
        local cat_name
        cat_name=$(basename "$dir")
        [[ "$cat_name" == "helpers" ]] && continue
        local count
        count=$(ls "$dir"*.yaml 2>/dev/null | wc -l | tr -d ' ')
        local desc=""
        case "$cat_name" in
            auth)      desc="Landing, login, register, validation, logout" ;;
            nav)       desc="Tab navigation to all main screens" ;;
            home)      desc="Chat, quick actions, multi-turn, new conversation" ;;
            inbox)     desc="Inbox list, items, detail view" ;;
            settings)  desc="Account, theme, chat, connection, smart home" ;;
            household) desc="Switcher, join by code, edit dialog, invite field" ;;
            pantry)    desc="Browse packages, detail view, search" ;;
            nodes)     desc="Node list, node settings" ;;
            devices)   desc="Device list, room management" ;;
            routines)  desc="Routines list, empty state" ;;
            multiuser) desc="Multi-user/household (needs --setup or .e2e-env)" ;;
        esac
        printf "  ${CYAN}%-12s${NC} %s (%s flows)\n" "$cat_name" "$desc" "$count"
    done
    echo ""
    echo "Usage: ./run.sh [--login user:pass] [--setup] [--teardown] [category ...]"
}

# ── Run a single flow ──────────────────────────────────────────────

run_flow() {
    local flow_file="$1"
    local flow_name
    flow_name=$(basename "$flow_file" .yaml)
    local cat_name
    cat_name=$(basename "$(dirname "$flow_file")")

    local label="${cat_name}/${flow_name}"
    local log_file="$OUTPUT_DIR/${cat_name}_${flow_name}.log"
    mkdir -p "$OUTPUT_DIR"

    # Build env args inline
    local env_args=(--env "LOGIN_EMAIL=$LOGIN_EMAIL" --env "LOGIN_PASSWORD=$LOGIN_PASSWORD")
    local var
    for var in E2E_USER_A_EMAIL E2E_USER_A_PASSWORD E2E_USER_B_EMAIL E2E_USER_B_PASSWORD \
               E2E_HOUSEHOLD_A_ID E2E_HOUSEHOLD_A_NAME E2E_HOUSEHOLD_B_ID \
               E2E_INVITE_CODE E2E_NODE_KITCHEN_ID E2E_NODE_BEDROOM_ID; do
        if [[ -n "${!var:-}" ]]; then
            env_args+=(--env "$var=${!var}")
        fi
    done

    if maestro test "${env_args[@]}" \
        "$flow_file" --output "$OUTPUT_DIR/$cat_name/$flow_name" > "$log_file" 2>&1; then
        echo -e "  ${GREEN}✓${NC} $label"
        return 0
    else
        echo -e "  ${RED}✗${NC} $label  →  $log_file"
        return 1
    fi
}

# ── Collect screenshots ───────────────────────────────────────────

collect_screenshots() {
    local count=0
    for png in "$SCRIPT_DIR"/*.png; do
        [[ -f "$png" ]] || continue
        mv "$png" "$OUTPUT_DIR/"
        count=$((count + 1))
    done
    # Also check flow subdirs
    for dir in "$FLOWS_DIR"/*/; do
        for png in "$dir"*.png; do
            [[ -f "$png" ]] || continue
            mv "$png" "$OUTPUT_DIR/"
            count=$((count + 1))
        done
    done
    if [[ $count -gt 0 ]]; then
        log "Captured $count screenshot(s)"
    fi
}

# ── Copy to docs ──────────────────────────────────────────────────

update_docs() {
    if [[ -z "$DOCS_DIR" ]]; then
        warn "jarvis-docs not found — skipping"
        return 0
    fi
    mkdir -p "$DOCS_DIR"

    local count=0
    for png in "$OUTPUT_DIR"/*.png; do
        [[ -f "$png" ]] || continue
        cp "$png" "$DOCS_DIR/"
        count=$((count + 1))
    done
    if [[ $count -gt 0 ]]; then
        log "Updated $count screenshot(s) in jarvis-docs"
    else
        warn "No screenshots to copy"
    fi
}

# ── Main ──────────────────────────────────────────────────────────

main() {
    local do_update_docs=false
    local do_setup=false
    local do_teardown=false
    local categories=()
    export LOGIN_EMAIL=""
    export LOGIN_PASSWORD=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --list|-l)
                list_categories
                exit 0
                ;;
            --update-docs)
                do_update_docs=true
                ;;
            --setup)
                do_setup=true
                ;;
            --teardown)
                do_teardown=true
                ;;
            --login)
                shift
                if [[ -z "${1:-}" || "$1" != *:* ]]; then
                    err "Usage: --login email:password"
                    exit 1
                fi
                LOGIN_EMAIL="${1%%:*}"
                LOGIN_PASSWORD="${1#*:}"
                ;;
            --help|-h)
                echo "Usage: ./run.sh [--login email:pass] [--setup] [--teardown] [--update-docs] [--list] [category ...]"
                exit 0
                ;;
            *)
                categories+=("$1")
                ;;
        esac
        shift
    done

    install_java
    install_maestro
    check_simulator

    mkdir -p "$OUTPUT_DIR"

    # ── Multiuser setup ───────────────────────────────────────────
    local has_multiuser=false
    for cat in "${categories[@]}"; do
        [[ "$cat" == "multiuser" ]] && has_multiuser=true
    done

    if $do_setup && $has_multiuser; then
        info "Running multiuser setup..."
        if bash "$SCRIPT_DIR/setup-multiuser.sh"; then
            log "Multiuser setup complete"
        else
            err "Multiuser setup failed"
            exit 1
        fi
        echo ""
    fi

    # Source .e2e-env if running multiuser flows
    if $has_multiuser && [[ -f "$E2E_ENV_FILE" ]]; then
        info "Loading multiuser env from $E2E_ENV_FILE"
        set -a
        # shellcheck disable=SC1090
        source "$E2E_ENV_FILE"
        set +a
    elif $has_multiuser; then
        err "No .e2e-env file found. Run with --setup or run setup-multiuser.sh first."
        exit 1
    fi

    # Login if credentials provided
    if [[ -n "$LOGIN_EMAIL" ]]; then
        local login_flow="$FLOWS_DIR/auth/00_login.yaml"
        if [[ -f "$login_flow" ]]; then
            info "Logging in as $LOGIN_EMAIL..."
            if run_flow "$login_flow"; then
                log "Login successful"
            else
                warn "Login flow failed — may already be logged in"
            fi
            echo ""
        fi
    fi

    # Determine which flows to run
    # Auth and multiuser tests are excluded from "run all" mode.
    # Run them explicitly: ./run.sh auth  or  ./run.sh --setup multiuser
    local flows=()
    if [[ ${#categories[@]} -gt 0 ]]; then
        for cat in "${categories[@]}"; do
            local cat_dir="$FLOWS_DIR/$cat"
            if [[ ! -d "$cat_dir" ]]; then
                warn "Unknown category: $cat"
                continue
            fi
            for flow in "$cat_dir"/*.yaml; do
                [[ "$(basename "$flow")" == "00_"* ]] && continue
                flows+=("$flow")
            done
        done
    else
        # Run all categories except auth and multiuser (require special state)
        for dir in "$FLOWS_DIR"/*/; do
            [[ -d "$dir" ]] || continue
            local dir_name
            dir_name=$(basename "$dir")
            [[ "$dir_name" == "helpers" ]] && continue
            [[ "$dir_name" == "auth" ]] && continue
            [[ "$dir_name" == "multiuser" ]] && continue
            for flow in "$dir"/*.yaml; do
                [[ "$(basename "$flow")" == "00_"* ]] && continue
                flows+=("$flow")
            done
        done
    fi

    if [[ ${#flows[@]} -eq 0 ]]; then
        err "No test flows found"
        exit 1
    fi

    echo ""
    echo -e "${BOLD}Running ${#flows[@]} test(s)${NC}"
    echo ""

    local passed=0
    local failed=0
    local current_cat=""
    for flow in "${flows[@]}"; do
        local cat
        cat=$(basename "$(dirname "$flow")")
        if [[ "$cat" != "$current_cat" ]]; then
            current_cat="$cat"
            echo -e "${BOLD}  $cat${NC}"
        fi
        if run_flow "$flow"; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
        fi
    done

    echo ""
    collect_screenshots

    if $do_update_docs; then
        update_docs
    fi

    # ── Multiuser teardown ────────────────────────────────────────
    if $do_teardown && $has_multiuser; then
        echo ""
        info "Running multiuser teardown..."
        if bash "$SCRIPT_DIR/teardown-multiuser.sh"; then
            log "Multiuser teardown complete"
        else
            warn "Multiuser teardown had errors (see above)"
        fi
    fi

    echo ""
    if [[ $failed -eq 0 ]]; then
        log "${GREEN}${BOLD}All $passed test(s) passed${NC}"
    else
        log "${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
    fi

    [[ $failed -eq 0 ]] || exit 1
}

main "$@"
