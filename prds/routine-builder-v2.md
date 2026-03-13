# Routine Builder v2 — Background Alerts & Unified Taxonomy

## Overview

Extend the existing routine builder (see `voice-routines-mobile.md`) with **background mode** — routines that run on a schedule and queue results as proactive alerts. Drop the routine/briefing distinction: they're all just routines, with an optional background toggle.

This builds on the proactive alerts infrastructure already shipped on the node (`AlertQueueService`, `LEDService`, `WhatsUpCommand`, `AgentSchedulerService` alert collection).

## Problem

1. Users can't create or customize routines from the mobile app (existing PRD, not yet built)
2. The hardcoded `NewsAlertAgent` and `CalendarAlertAgent` aren't user-configurable
3. The routine/briefing taxonomy is confusing ("briefing" means extended, "routine" means brief)
4. No way to opt into proactive alerts without editing code

## Key Decisions

### One concept: Routines

Everything is a routine. A routine is an ordered list of steps that Jarvis runs and composes into a spoken response. The only variable is **when** it runs:

| Mode | Trigger | Example |
|------|---------|---------|
| **On-demand** (default) | Voice phrase | "Good morning" → lights + weather + calendar |
| **Background** | Schedule (interval or cron) | Every 30 min → check news, alert if new |

### Background routines produce alerts, not speech

A background routine doesn't interrupt the user. It runs silently, and if the results differ from the last run (or meet alert criteria), it queues an alert. The user says "what's up" to hear pending alerts.

### Compact vs Detailed

Background routines have a **summary style** toggle that controls how the LLM composes the alert when delivered via "what's up":

| Style | Behavior | Example |
|-------|----------|---------|
| **Compact** | One sentence per alert, just the headline | "You have a meeting in 10 minutes and SpaceX launched Starship." |
| **Detailed** | Full narrative, covers each topic | "Your team standup is in 10 minutes. In other news, SpaceX successfully launched Starship to orbit today, marking their first fully orbital flight..." |

On-demand routines use the existing **response length** setting (short/medium/long) since they're spoken immediately and the user chose to hear them. A routine with both trigger phrases and background mode has both controls — `response_length` for voice-triggered delivery, `summary_style` for alert delivery.

### Add fields now, not later

The v1 `Routine` type and storage service should include `response_length`, `background` (nullable), and `summary_style` from day one. Default `background` to `null` and `response_length` to `"short"` so existing routines work unchanged. This avoids a near-term refactor.

### Mobile first, node second

The mobile app writes config — it doesn't need the node-side `RoutineAgent` to exist yet. Build the UI and push the config shape. The on-demand routine builder works end-to-end immediately since `RoutineCommand` already exists on the node. Background mode just won't produce alerts until the node-side `RoutineAgent` ships.

### Fixed pickers, not freeform

All interval and TTL values use fixed preset pickers. Freeform inputs are more error-prone and the UX is worse on mobile. The presets cover real use cases.

## Data Model Changes

### Routine definition (updated)

All routines include `response_length` and `background` fields. Existing on-demand routines default `background` to `null`.

```json
{
  "good_morning": {
    "trigger_phrases": ["good morning", "start my day"],
    "steps": [
      {"command": "get_weather", "args": {"resolved_datetimes": ["today"]}, "label": "weather"},
      {"command": "get_calendar_events", "args": {"resolved_datetimes": ["today"]}, "label": "calendar"},
      {"command": "get_news", "args": {"category": "general", "count": 3}, "label": "news"}
    ],
    "response_instruction": "Give a cheerful morning overview.",
    "response_length": "medium",
    "background": null
  }
}
```

### Background config (new, optional)

Two schedule modes: **interval** (repeat every N minutes) and **cron** (specific days/times).

#### Interval mode — "check every N minutes"

Best for monitoring tasks where you want continuous change detection.

```json
{
  "news_check": {
    "trigger_phrases": ["news update"],
    "steps": [
      {"command": "get_news", "args": {"category": "general", "count": 5}, "label": "news"}
    ],
    "response_instruction": "Summarize new headlines.",
    "response_length": "short",
    "background": {
      "enabled": true,
      "schedule_type": "interval",
      "interval_minutes": 30,
      "run_on_startup": true,
      "summary_style": "compact",
      "alert_priority": 1,
      "alert_ttl_minutes": 240
    }
  }
}
```

#### Cron mode — "run on specific days at a specific time"

Best for scheduled routines where timing matters (morning briefing, EOD summary).

```json
{
  "monday_briefing": {
    "trigger_phrases": ["monday briefing"],
    "steps": [
      {"command": "get_weather", "args": {"resolved_datetimes": ["today"]}, "label": "weather"},
      {"command": "get_calendar_events", "args": {"resolved_datetimes": ["today"]}, "label": "calendar"},
      {"command": "get_news", "args": {"category": "general", "count": 3}, "label": "news"}
    ],
    "response_instruction": "Give a Monday morning overview of the week ahead.",
    "response_length": "medium",
    "background": {
      "enabled": true,
      "schedule_type": "cron",
      "days": ["mon"],
      "time": "07:00",
      "summary_style": "detailed",
      "alert_priority": 2,
      "alert_ttl_minutes": 120
    }
  }
}
```

#### Field reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `response_length` | `string` | `"short"` | On-demand response length: `"short"`, `"medium"`, or `"long"` |
| `background` | `object \| null` | `null` | Null = on-demand only. Object = background mode config. |
| `background.enabled` | `bool` | `true` | Quick toggle without deleting config |
| `background.schedule_type` | `string` | `"interval"` | `"interval"` or `"cron"` |
| `background.interval_minutes` | `int` | `30` | Interval mode: how often to run. Presets: 5, 15, 30, 60, 120, 240 |
| `background.run_on_startup` | `bool` | `true` | Interval mode: run immediately when node starts |
| `background.days` | `string[]` | `["mon","tue","wed","thu","fri","sat","sun"]` | Cron mode: which days to run. Values: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` |
| `background.time` | `string` | `"08:00"` | Cron mode: local time to run (24h format) |
| `background.summary_style` | `string` | `"compact"` | `"compact"` or `"detailed"` — controls LLM prompt when alerts are delivered via "what's up" |
| `background.alert_priority` | `int` | `2` | 1=low, 2=medium, 3=high. Higher priority alerts are delivered first. |
| `background.alert_ttl_minutes` | `int` | `240` | Alert expires after this many minutes. Presets: 15, 30, 60, 240, 480, 1440 |

#### Mobile UI presets for days

The day picker should offer common presets plus custom:

| Preset | Days |
|--------|------|
| Every day | mon–sun |
| Weekdays | mon–fri |
| Weekends | sat–sun |
| Custom | individual day toggles |

### Default routines (seeded on first run)

Background routines are seeded **alongside** the existing on-demand defaults (good_morning, good_night, morning_briefing). They serve different purposes — on-demand routines are voice-triggered, background routines are monitoring. Nothing is removed.

#### On-demand defaults (existing, updated with new fields)

```json
{
  "good_morning": {
    "trigger_phrases": ["good morning", "morning routine", "start my day"],
    "steps": [
      {"command": "control_device", "args": {"floor": "Downstairs", "action": "turn_on"}, "label": "lights"},
      {"command": "get_weather", "args": {"resolved_datetimes": ["today"]}, "label": "weather"},
      {"command": "get_calendar_events", "args": {"resolved_datetimes": ["today"]}, "label": "calendar"}
    ],
    "response_instruction": "Give a cheerful morning briefing with weather and calendar highlights.",
    "response_length": "short",
    "background": null
  },
  "good_night": {
    "trigger_phrases": ["good night", "bedtime", "going to bed", "time for bed"],
    "steps": [
      {"command": "control_device", "args": {"floor": "Downstairs", "action": "turn_off"}, "label": "lights"},
      {"command": "get_calendar_events", "args": {"resolved_datetimes": ["tomorrow"]}, "label": "tomorrow"}
    ],
    "response_instruction": "Brief goodnight with tomorrow's first appointment if any.",
    "response_length": "short",
    "background": null
  },
  "morning_briefing": {
    "trigger_phrases": ["morning briefing", "daily briefing", "give me my briefing", "what's happening today", "catch me up", "daily update"],
    "steps": [
      {"command": "get_weather", "args": {"resolved_datetimes": ["today"]}, "label": "weather"},
      {"command": "get_calendar_events", "args": {"resolved_datetimes": ["today"]}, "label": "calendar"},
      {"command": "get_news", "args": {"category": "general", "count": 3}, "label": "news"}
    ],
    "response_instruction": "Deliver a morning briefing in a natural, flowing narrative style. Start with today's weather, then mention calendar events, then summarize the top news headlines. Sound like a personal news anchor, not a list of bullet points.",
    "response_length": "medium",
    "background": null
  }
}
```

#### Background defaults (new)

```json
{
  "news_alerts": {
    "trigger_phrases": ["news update"],
    "steps": [
      {"command": "get_news", "args": {"category": "general", "count": 5}, "label": "news"}
    ],
    "response_instruction": "Summarize the latest headlines.",
    "response_length": "short",
    "background": {
      "enabled": true,
      "schedule_type": "interval",
      "interval_minutes": 30,
      "run_on_startup": true,
      "summary_style": "compact",
      "alert_priority": 1,
      "alert_ttl_minutes": 240
    }
  },
  "calendar_check": {
    "trigger_phrases": ["calendar check"],
    "steps": [
      {"command": "get_calendar_events", "args": {"resolved_datetimes": ["today"]}, "label": "calendar"}
    ],
    "response_instruction": "Mention upcoming events and how soon they are.",
    "response_length": "short",
    "background": {
      "enabled": true,
      "schedule_type": "interval",
      "interval_minutes": 5,
      "run_on_startup": true,
      "summary_style": "compact",
      "alert_priority": 2,
      "alert_ttl_minutes": 30
    }
  }
}
```

These eventually replace the hardcoded `NewsAlertAgent` and `CalendarAlertAgent` — same behavior, but user-editable from the mobile app.

## Node Architecture Changes

### RoutineAgent (new) — replaces hardcoded agents

A single generic `RoutineAgent` class that wraps any routine definition with `background` config:

```python
class RoutineAgent(IJarvisAgent):
    """Generic agent that runs a routine on a schedule and produces alerts."""

    def __init__(self, routine_name: str, routine_def: dict):
        self._routine_name = routine_name
        self._config = routine_def["background"]
        self._routine_def = routine_def
        self._previous_results: dict | None = None
        self._alerts: list[Alert] = []

    @property
    def name(self) -> str:
        return f"routine_{self._routine_name}"

    @property
    def schedule(self) -> AgentSchedule:
        if self._config["schedule_type"] == "cron":
            # For cron, check every 60s and compare day/time
            return AgentSchedule(interval_seconds=60, run_on_startup=False)
        return AgentSchedule(
            interval_seconds=self._config["interval_minutes"] * 60,
            run_on_startup=self._config.get("run_on_startup", True),
        )

    @property
    def include_in_context(self) -> bool:
        return False  # alert-only

    async def run(self) -> None:
        # For cron mode: check if current day/time matches, skip if not
        # Execute routine steps locally (same as RoutineCommand.run)
        # Compare results to self._previous_results
        # If changed: produce Alert with configured priority/TTL/summary_style
        ...

    def get_alerts(self) -> list[Alert]:
        return self._alerts
```

### AgentDiscoveryService (updated)

In addition to discovering `agents/*.py` classes, also load routine definitions from the DB and create `RoutineAgent` instances for any with `background` config enabled.

### Migration path

1. Ship RoutineAgent + updated discovery
2. Default routines seeded with background config (alongside existing on-demand defaults)
3. Hardcoded `NewsAlertAgent` and `CalendarAlertAgent` deprecated, then removed
4. Mobile app pushes routine changes → node picks them up → agents restart

## Mobile App Screens

### Routines List (updated from v1 PRD)

Same as v1, plus:
- Badge on background routines showing schedule: "Every 30 min" or "Mon · 7:00 AM"
- Toggle switch on each card to quick-enable/disable background mode
- Filter tabs: "All" / "On-demand" / "Background"

### Create/Edit Routine (updated from v1 PRD)

All v1 fields, plus new sections:

#### Response Length

Segmented control: **Short** / **Medium** / **Long**

Always visible. Controls how Jarvis responds when the routine is triggered by voice (its trigger phrases).

#### Background Section

Collapsed by default with a toggle: **"Run in background"**

When expanded:

**Schedule type**: segmented control — **Repeating** / **Scheduled**

**Repeating mode** (interval):
- **Check every**: picker — 5 min, 15 min, 30 min, 1 hour, 2 hours, 4 hours
- **Run on startup**: toggle (default on)

**Scheduled mode** (cron):
- **Days**: preset picker (Every day / Weekdays / Weekends / Custom) with individual day toggles for custom
- **Time**: time picker (default 8:00 AM)

**Common to both modes:**
- **Summary style**: segmented control — Compact / Detailed
  - Helper text: "Controls how alerts sound when you ask 'what's up'"
- **Priority**: segmented control — Low / Medium / High
  - Helper text: "Higher priority alerts are delivered first"

### Delete Confirmation

Standard alert dialog (same as v1).

## LLM Prompt Integration

### On-demand delivery (existing)

```
{response_instruction}

Here are the results from each step:
{results_json}

{length_instruction}
```

Where `length_instruction` maps from `response_length`:
- `short` → "Respond in 2-4 spoken sentences, conversational tone."
- `medium` → "Respond in 6-10 spoken sentences, flowing narrative tone."
- `long` → "Respond in a detailed paragraph style, about 60 seconds of speech."

### Alert delivery via "what's up" (new)

The `WhatsUpCommand` already composes alerts via CC's `chat_text()`. The summary style is stored on each alert (via `Alert.metadata`) so mixed-style alerts from different routines compose correctly.

**Compact:**
```
Deliver these updates in one sentence each. Be brief and direct.

Alerts:
{alerts_json}
```

**Detailed:**
```
Deliver these updates conversationally, covering each topic with a
sentence or two. Sound like a friend catching you up.

Alerts:
{alerts_json}
```

When alerts have mixed summary styles, group by style and compose each group with its appropriate prompt, then concatenate.

## Config Push Flow

Same as v1 PRD:
1. User saves routine in the app
2. App writes to household config
3. Config push → all nodes in household
4. Node detects routine changes → restarts affected RoutineAgents

Step 4 is new: the `AgentSchedulerService` needs a `reload_routine_agents()` method that re-reads routine definitions and restarts background agents without restarting the whole node.

## Validation Rules

All v1 rules, plus:
- `response_length`: must be `"short"`, `"medium"`, or `"long"`
- `background.schedule_type`: must be `"interval"` or `"cron"`
- `background.interval_minutes`: must be one of [5, 15, 30, 60, 120, 240]
- `background.days`: non-empty array of valid day strings when schedule_type is `"cron"`
- `background.time`: valid 24h time string (HH:MM) when schedule_type is `"cron"`
- `background.summary_style`: must be `"compact"` or `"detailed"`
- `background.alert_priority`: must be 1, 2, or 3
- `background.alert_ttl_minutes`: must be one of [15, 30, 60, 240, 480, 1440]

## Edge Cases

All v1 edge cases, plus:
- **Background routine's command not installed**: Agent skips that step (logs warning), produces no alert for that step
- **All steps fail**: No alert produced (same as current agent behavior)
- **Interval too short**: Minimum 5 minutes enforced in mobile UI validation
- **Background routine also has trigger phrases**: Works both ways — runs on schedule AND responds to voice. "News update" triggers it immediately, background keeps running on schedule
- **Routine config pushed while agent is mid-run**: Current run completes, next run uses new config
- **Node has no commands matching a step**: Step skipped with warning (non-fatal)
- **Cron routine with no matching day this week**: Just doesn't run. No error.
- **Timezone for cron**: Uses the node's configured timezone (from config.json). All `time` values are local time.
- **Node restarts**: Interval agents with `run_on_startup: true` run immediately. Cron agents check if they missed their window (within last interval_seconds) and run if so.

## Implementation Order

### Phase 1: Mobile — Routine Builder with Background Config (2-3 sessions)
- Add `response_length`, `background` fields to Routine types and storage
- Seed defaults (on-demand + background) with new fields
- Routines list screen (cards, badges, filter tabs, quick-toggle)
- Create/edit screen (steps, triggers, response instruction, response length)
- Background config section (schedule type, interval/cron, summary style, priority)
- Config push integration
- This is the v1 PRD scope plus the new fields and background section

### Phase 2: Node — RoutineAgent (1 session)
- `agents/routine_agent.py` — generic background routine agent with interval + cron support
- Update `AgentDiscoveryService` to create RoutineAgents from routine DB
- Update default routine seeds to include background config
- Update `WhatsUpCommand` to respect `summary_style` from alert metadata
- Tests

### Phase 3: Hot Reload (1 session)
- `AgentSchedulerService.reload_routine_agents()`
- Config push callback triggers reload
- Tests for agent lifecycle (add/remove/update while running)

### Phase 4: Cleanup (0.5 session)
- Remove `NewsAlertAgent` and `CalendarAlertAgent`
- Migration: existing hardcoded agent behavior preserved via default background routines
- Update CLAUDE.md docs

## Out of Scope (v2)

- Push notifications to mobile (future — needs push token registration)
- Conditional steps (if weather is rainy, add umbrella reminder)
- Per-node step overrides
- Alert grouping/batching (e.g., "3 news alerts" instead of 3 separate)
- Alert snooze/dismiss from mobile
- Freeform interval/TTL inputs (fixed presets only)
