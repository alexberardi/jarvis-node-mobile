# E2E Tests

End-to-end test suite for jarvis-node-mobile using [Maestro](https://maestro.mobile.dev). Tests run against the iOS Simulator and serve as the source of truth for mobile app health. Screenshots are captured as side effects of passing tests.

## Quick Start

```bash
# Ensure the Simulator is running with the app installed
open -a Simulator
cd .. && npx expo run:ios

# Run authenticated tests (most common)
./run.sh --login user@example.com:password nav home inbox settings

# Run auth tests (must be logged out first)
./run.sh auth

# Run everything
./run.sh --login user@example.com:password

# Update docs screenshots after tests pass
./run.sh --login user@example.com:password --update-docs
```

## Test Categories

| Category | Tests | Requires | What it covers |
|----------|-------|----------|----------------|
| `auth` | 4 | Logged out | Landing, login, register, login error |
| `nav` | 4 | Logged in | Tab navigation: home, devices, routines, nodes |
| `home` | 3 | Logged in | Empty state, node selector, chat input |
| `inbox` | 1 | Logged in | Inbox modal opens from bell icon |
| `settings` | 4 | Logged in | Account, scroll, theme toggle, version |

## Usage

```bash
./run.sh [--login email:password] [--update-docs] [--list] [category ...]
```

| Flag | Description |
|------|-------------|
| `--login email:pass` | Log in via the UI before running tests |
| `--update-docs` | Copy screenshots to `jarvis-docs/` after tests pass |
| `--list` | List available test categories |
| `category` | Run specific categories (e.g., `nav settings`) |

## Adding Tests

Create a YAML file in the appropriate `flows/<category>/` directory:

```yaml
appId: com.jarvis.nodemobile
---
- launchApp
- waitForAnimationToEnd
- tapOn:
    text: ".*localhost.*"
    index: 0
    optional: true
- waitForAnimationToEnd
- tapOn:
    text: "Continue"
    optional: true
- waitForAnimationToEnd
- extendedWaitUntil:
    visible: "Jarvis"
    timeout: 15000
# Your test steps here
- assertVisible: "Expected Text"
- takeScreenshot: screenshot-name
```

### Conventions

- **File naming**: `NN_description.yaml` — numbered for ordering
- **`00_` prefix**: Helper flows (login), skipped in normal runs
- **Assertions**: Use `assertVisible` for verifying UI state
- **Screenshots**: Use `takeScreenshot` to capture docs-worthy screens
- **Coordinates**: Use `point: "X%,Y%"` for icon buttons (integer percentages only)

### Key coordinates (iPhone 17 Pro Max)

| Element | Point | Notes |
|---------|-------|-------|
| Home tab | `12%,97%` | Bottom tab bar, 1st of 4 |
| Devices tab | `37%,97%` | Bottom tab bar, 2nd of 4 |
| Routines tab | `62%,97%` | Bottom tab bar, 3rd of 4 |
| Nodes tab | `87%,97%` | Bottom tab bar, 4th of 4 |
| Settings (cog) | `78%,9%` | Header icons, right side |
| Inbox (bell) | `89%,9%` | Header icons, rightmost |

## Output

- Test results are logged to stdout
- Screenshots saved to `output/` (gitignored)
- `--update-docs` copies to `jarvis-docs/docs/assets/images/screenshots/`

## Dependencies

- **Maestro CLI** (auto-installed)
- **Java 17+** via Homebrew `openjdk@17` (auto-installed)
- **Xcode** with iOS Simulator
- **Expo dev build** of jarvis-node-mobile
