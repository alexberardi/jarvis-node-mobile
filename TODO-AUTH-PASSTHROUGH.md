# TODO: Update Provisioning to Use Auth Passthrough

## Background

Node registration now requires going through command center, which forwards
to jarvis-auth. This ensures both systems stay in sync.

**Current flow:**
```
Mobile App → Node (AP mode) → Command Center (legacy format)
```

**Required flow:**
```
Mobile App → Node (AP mode) → Command Center → jarvis-auth
                                   ↓
                            (local DB record)
```

## Changes Required

### 1. Update `ApiProvisioningRequest` in `src/types/Provisioning.ts`

Add `household_id` field:

```typescript
export interface ApiProvisioningRequest {
  wifi_ssid: string;
  wifi_password: string;
  room: string;
  command_center_url: string;
  household_id: string;  // NEW: Required for auth registration
}
```

### 2. Update provisioning screens to collect household_id

The authenticated user should have a household. Either:
- Auto-select their primary household
- Show a household picker if they're in multiple

Requires adding to `AuthContext`:
```typescript
interface AuthState {
  // ... existing fields
  households: Household[];
  activeHouseholdId: string | null;
}
```

### 3. Update `provisioningApi.ts` to send household_id

```typescript
const apiRequest: ApiProvisioningRequest = {
  wifi_ssid: request.ssid,
  wifi_password: request.password,
  room: request.room_name,
  command_center_url: request.command_center_url || COMMAND_CENTER_URL,
  household_id: request.household_id,  // NEW
};
```

### 4. Update node's provisioning API to accept household_id

The Pi node's `/api/v1/provision` endpoint needs to accept and forward
`household_id` to command center during registration.

See: `jarvis-node-setup/provisioning/api.py`
See: `jarvis-node-setup/provisioning/registration.py`

## API Reference

**Command Center node registration:**
```
POST /api/v0/admin/nodes
{
  "node_id": "my-pi-node",
  "household_id": "uuid-here",
  "room": "living room",
  "name": "Living Room Node"  // optional
}

Response:
{
  "node_id": "my-pi-node",
  "room": "living room",
  "node_key": "generated-secret-key"  // Only returned once!
}
```

## Testing

1. User logs in (has at least one household)
2. User connects to node's AP
3. User provisions with WiFi + room + household
4. Node registers with command center
5. Command center creates records in both systems
6. Node receives and stores node_key
7. Node can authenticate to command center

## Files to Modify

- `src/types/Provisioning.ts` - Add household_id to request types
- `src/api/provisioningApi.ts` - Send household_id in provision request
- `src/contexts/ProvisioningContext.tsx` - Track household selection
- `src/screens/Provisioning/*.tsx` - UI for household selection (if needed)
- `src/auth/AuthContext.tsx` - Expose households to provisioning flow
