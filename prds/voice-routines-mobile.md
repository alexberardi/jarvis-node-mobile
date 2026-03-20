# Voice Routines — Mobile App PRD

## Overview

Add a dedicated **Routines** screen to the mobile app where users can create, edit, and delete voice routines. Routines are multi-step command sequences triggered by a phrase (e.g., "good morning") that execute locally on the node and produce a natural composed spoken response.

## Background

The node stores routines in its config JSON under the `routines` key. The existing config push service (settings snapshot → MQTT → node) handles syncing changes from mobile to node. No new API endpoints are needed.

### Data Format

Each routine is stored under a key (the routine ID) with this structure:

```json
{
  "routines": {
    "good_morning": {
      "trigger_phrases": ["good morning", "morning routine", "start my day"],
      "steps": [
        {"command": "control_device", "args": {"floor": "Downstairs", "action": "turn_on"}, "label": "lights"},
        {"command": "get_weather", "args": {}, "label": "weather"},
        {"command": "read_calendar", "args": {"timeframe": "today"}, "label": "calendar"}
      ],
      "response_instruction": "Give a cheerful morning briefing with weather and calendar highlights."
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `trigger_phrases` | `string[]` | Phrases that activate this routine (case-insensitive, substring match supported) |
| `steps` | `object[]` | Ordered list of sub-commands to execute |
| `steps[].command` | `string` | Command name (must match an installed command on the node) |
| `steps[].args` | `object` | Fixed arguments passed to the command |
| `steps[].label` | `string` | Key for the step's result in the LLM composition context |
| `response_instruction` | `string` | Hint for the LLM when composing the spoken response |

## User Stories

1. **As a user**, I want to see all my routines in one place so I can manage them.
2. **As a user**, I want to create a new routine with trigger phrases and steps so I can automate common sequences.
3. **As a user**, I want to edit an existing routine to adjust triggers, reorder steps, or change the response style.
4. **As a user**, I want to delete a routine I no longer need.
5. **As a user**, I want to pick from my node's available commands when adding steps, so I don't have to remember command names.

## Screens

### 1. Routines List

Accessible from the main navigation (tab bar or settings menu).

**Layout:**
- Header: "Routines" with a "+" button to create new
- List of routine cards, each showing:
  - Routine name (formatted from key: `good_morning` → "Good Morning")
  - Trigger phrases as chips/tags
  - Step count (e.g., "3 steps")
- Tap a card → Edit Routine screen
- Swipe to delete (with confirmation dialog)

**Empty state:** "No routines yet. Tap + to create your first routine."

### 2. Create/Edit Routine

Single screen for both creating and editing.

**Sections:**

#### Name
- Text input for the routine ID (auto-slugified: "Good Morning" → `good_morning`)
- Read-only when editing (routine key is immutable)

#### Trigger Phrases
- Chip input: type a phrase, press enter/return to add
- Tap X on a chip to remove
- Minimum 1 phrase required
- Helper text: "Say any of these phrases to activate the routine"

#### Steps (Ordered List)
- Each step is a card with:
  - **Command dropdown**: populated from the node's available command list (fetched from the settings snapshot)
  - **Label**: text input (auto-filled from command name, editable)
  - **Args form**: dynamic form based on selected command's parameters
    - For each parameter: input field with type-appropriate control (text, number, toggle, dropdown for enums)
    - Only show parameters that have fixed values for this routine step (not all command params)
  - Drag handle for reordering
  - Delete button (trash icon)
- "Add Step" button at the bottom
- Minimum 1 step required

#### Response Instruction
- Multi-line text input
- Placeholder: "Describe how Jarvis should deliver the results (e.g., 'Give a cheerful morning briefing')"
- Optional — defaults to "Summarize the results conversationally."

#### Actions
- "Save" button → validates, writes to config, triggers config push
- "Cancel" → discard changes, go back

### 3. Delete Confirmation

Standard alert dialog: "Delete routine 'Good Morning'? This cannot be undone."

## Available Commands

The list of available commands comes from the node's settings snapshot (already synced). The app should use the command schemas to:
- Populate the command dropdown in the step builder
- Show command descriptions as helper text
- Generate appropriate input fields for each command's parameters

## Scope: Household-Level Routines

Routines are **household-scoped**, not per-node or per-user. All nodes in a household share the same routine definitions. When a user saves a routine from the mobile app, it pushes to every node in that household.

This matches how routines work in practice — "good morning" should behave the same whether triggered from the kitchen node or the bedroom node. Per-node step overrides (e.g., "turn on kitchen lights" only from the kitchen) are out of scope for v1 but the data model supports it (see Future Extensions).

## Config Push Flow

1. User saves routine in the app
2. App writes updated `routines` object to the **household** config
3. Config push service encrypts with K2 and pushes to **all nodes** in the household
4. Each node downloads, decrypts, and writes updated config
5. Next routine invocation reads the new config from disk

## Validation Rules

- Routine name: required, alphanumeric + underscores, unique
- Trigger phrases: at least 1, non-empty strings
- Steps: at least 1, each must have a valid command name
- Labels: unique within a routine (used as keys in the LLM context)

## Edge Cases

- **Node offline**: Config push queues and retries when node reconnects
- **Command not installed**: Step shows warning icon; routine still saves (step will be skipped at runtime)
- **Duplicate trigger phrase across routines**: Show warning (first match wins at runtime)

## Design Notes

- Follow existing settings screen patterns (card-based layout, chip inputs)
- Routine cards should feel actionable — visual hierarchy matching the node settings cards
- Step reordering via drag handles (same pattern as recipe step reordering in jarvis-recipes)

## Out of Scope (v1)

- Parallel step execution
- Scheduled routines (time-based triggers)
- Per-node step overrides (e.g., only run "turn on kitchen lights" from the kitchen node)
- Step-level enable/disable toggle

## Future Extensions (Data Model Ready)

The step schema supports future conditional logic without breaking changes. A step could gain an optional `condition` field:

```json
{
  "command": "control_device",
  "args": {"floor": "Downstairs", "action": "turn_on"},
  "label": "lights",
  "condition": {"ref": "weather", "field": "description", "contains": "cloud"}
}
```

The current node implementation ignores unknown fields in step definitions, so adding `condition` later is backward-compatible. Similarly, per-node overrides could be added via an optional `node_filter` field on steps without changing the household-level push model.
