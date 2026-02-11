# Provisioning Token Auth - Mobile App Implementation

## Overview

Update the mobile provisioning flow to obtain a short-lived provisioning token from command-center before sending credentials to the node. Command center generates the node's identity (a UUID) along with the token — no "Enter Node ID" screen needed.

See also:
- `jarvis-command-center/prds/provisioning-token-auth.md` — server-side token creation + node registration endpoints
- `jarvis-node-setup/prds/provisioning-token-auth.md` — full system design + node-side changes

## Current State

The mobile app sends this to the node during provisioning:

```typescript
// provisioningApi.ts, provision()
{
  wifi_ssid: "HomeWifi",
  wifi_password: "secret",
  room: "kitchen",
  command_center_url: "http://192.168.1.50:8002",
  household_id: "uuid"
}
```

The node then tries to register with command-center using an `admin_key`, but the mobile app never sends one — so the node either skips registration or it fails silently.

## New Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Mobile App                                                        │
│                                                                  │
│  1. User taps "Add Node"                                         │
│  2. App fetches provisioning token from CC (behind the scenes,   │
│     while still on home WiFi):                                   │
│     POST /api/v0/provisioning/token                              │
│     Authorization: Bearer <user_jwt>                             │
│     {household_id, room, name}                                   │
│     → receives {token, node_id (CC-generated UUID)}              │
│                                                                  │
│  3. Connect to node AP → GET /api/v1/info                        │
│  4. Scan networks → user picks WiFi + enters password + room     │
│  5. Send K2 key to node (existing step, on node AP)              │
│  6. POST node /api/v1/provision                                  │
│     {wifi_ssid, wifi_password, room, command_center_url,         │
│      household_id, node_id, provisioning_token}                  │
│                                                                  │
│  7. User switches to home WiFi → polls status → done             │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Token fetch is invisible.** Happens behind the scenes on "Add Node" tap, while still on home WiFi. No new screens.
- **CC generates the node_id.** The mobile app receives a UUID from the token endpoint and passes it to the node. No need to know the node_id upfront.
- **Only ONE WiFi switch.** Home WiFi → node AP → home WiFi. Same as current flow.
- **Auto-refresh.** If a token expires mid-flow (user is slow), the app can request a new token for the same UUID by passing `node_id` back to the token endpoint.

---

## Code Changes

### 1. New API: `commandCenterApi.ts`

New file for command-center API calls (provisioning token request):

```typescript
// src/api/commandCenterApi.ts
import axios from 'axios';
import { getCommandCenterUrl } from '../config/serviceConfig';

export interface ProvisioningTokenRequest {
  household_id: string;
  room?: string;
  name?: string;
  node_id?: string;  // Only for refresh (token expired mid-flow)
}

export interface ProvisioningTokenResponse {
  token: string;
  node_id: string;    // CC-generated UUID
  expires_at: string;
  expires_in: number;
}

export const requestProvisioningToken = async (
  request: ProvisioningTokenRequest,
  accessToken: string,
): Promise<ProvisioningTokenResponse> => {
  const url = `${getCommandCenterUrl()}/api/v0/provisioning/token`;

  const response = await axios.post<ProvisioningTokenResponse>(url, request, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  return response.data;
};
```

### 2. Update Types: `Provisioning.ts`

Add `node_id` and `provisioning_token` to API request:

```typescript
// Add to ApiProvisioningRequest
export interface ApiProvisioningRequest {
  wifi_ssid: string;
  wifi_password: string;
  room: string;
  command_center_url: string;
  household_id: string;
  node_id: string;              // CC-generated UUID (NEW)
  provisioning_token: string;   // NEW
}

// Add to ProvisioningRequest (internal)
export interface ProvisioningRequest {
  ssid: string;
  password: string;
  room_name: string;
  command_center_url?: string;
  household_id: string;
  node_id: string;              // CC-generated UUID (NEW)
  provisioning_token: string;   // NEW
}
```

### 3. Update `provisioningApi.ts`

Pass node_id and token through to the node:

```typescript
export const provision = async (
  request: ProvisioningRequest
): Promise<ProvisioningResult> => {
  const api = createNodeApi();

  const apiRequest: ApiProvisioningRequest = {
    wifi_ssid: request.ssid,
    wifi_password: request.password,
    room: request.room_name,
    command_center_url: request.command_center_url || getCommandCenterUrl(),
    household_id: request.household_id,
    node_id: request.node_id,                    // NEW
    provisioning_token: request.provisioning_token,  // NEW
  };

  const response = await api.post<ApiProvisionResponse>('/api/v1/provision', apiRequest);

  return {
    success: response.data.success,
    node_id: request.node_id,
    room_name: request.room_name,
    message: response.data.message,
  };
};
```

### 4. Update `useProvisioning.ts`

Fetch token behind the scenes when provisioning starts:

```typescript
// New state for token flow
const [provisioningToken, setProvisioningToken] = useState<string | null>(null);
const [ccNodeId, setCcNodeId] = useState<string | null>(null);

// Fetch provisioning token (called on "Add Node", while on home WiFi)
const fetchProvisioningToken = useCallback(
  async (householdId: string, room?: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      setStatusMessage('Preparing provisioning...');

      const response = await requestProvisioningToken(
        { household_id: householdId, room },
        accessToken,  // From auth context
      );

      setProvisioningToken(response.token);
      setCcNodeId(response.node_id);  // CC-generated UUID
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to prepare provisioning';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  },
  [accessToken]
);

// Refresh token if it expired mid-flow
const refreshProvisioningToken = useCallback(
  async (householdId: string): Promise<boolean> => {
    if (!ccNodeId) return false;

    try {
      const response = await requestProvisioningToken(
        { household_id: householdId, node_id: ccNodeId },
        accessToken,
      );

      setProvisioningToken(response.token);
      // ccNodeId stays the same
      return true;
    } catch (err) {
      setError('Failed to refresh provisioning token. Please try again.');
      return false;
    }
  },
  [accessToken, ccNodeId]
);

// Update startProvisioning to include token + node_id
const startProvisioning = useCallback(
  async (password: string, roomName: string, householdId: string) => {
    if (!provisioningToken || !ccNodeId) {
      setError('Provisioning not ready. Please try again.');
      return;
    }

    // ... existing K2 flow ...

    // Send WiFi credentials WITH token + node_id
    const result = await provision({
      ssid: selectedNetwork.ssid,
      password,
      room_name: roomName,
      household_id: householdId,
      node_id: ccNodeId,                    // CC-generated UUID
      provisioning_token: provisioningToken,
    });

    // ... rest of existing flow ...
  },
  [selectedNetwork, nodeInfo, provisioningToken, ccNodeId]
);
```

### 5. Update Navigation / Screens

**No new screens needed.** The token fetch happens behind the scenes.

Existing flow:
```
ScanForNodes → NodeInfo → SelectNetwork → EnterPassword → Progress → Success
```

The `ScanForNodes` screen (or wherever "Add Node" is triggered) should call `fetchProvisioningToken()` before navigating to the AP connection step. If the token fetch fails, show an error instead of proceeding.

### 6. Update Mock API

Update `mockProvisioningApi.ts` to include `node_id` and `provisioning_token` fields:

```typescript
// Mock token response
export const mockRequestProvisioningToken = async (
  request: ProvisioningTokenRequest,
): Promise<ProvisioningTokenResponse> => ({
  token: 'prov_mock_token_abc123',
  node_id: '550e8400-e29b-41d4-a716-446655440000',
  expires_at: new Date(Date.now() + 600000).toISOString(),
  expires_in: 600,
});
```

---

## Error Handling

| Error | When | User Message |
|-------|------|-------------|
| Token request fails (401) | JWT expired or invalid | "Please log in again" |
| Token request fails (network) | Not on home WiFi / CC unreachable | "Please connect to your home WiFi first" |
| Token expired (pre-send) | User was slow, token > 10 min old, detected before sending to node | Check `expires_at` client-side. Auto-refresh with same UUID, retry silently. |
| Token refresh fails | CC unreachable during refresh | "Provisioning token expired. Please try again." |
| Token expired (post-send) | Token already sent to node but expired before node could register | "Provisioning failed. Please restart the node and try again." |
| Provision fails (node rejects token) | Token invalid after reaching node | "Provisioning failed. Please try again." |

Token expiry (10 minutes) should be generous enough for the full flow. The app checks `expires_at` client-side before sending the provision request to the node. If expired, it auto-refreshes (requires home WiFi). If the token was already sent to the node and expired before the node could register with CC, the node will fail to register — show a message to restart the node and try again.

---

## Testing

### Unit Tests

```
1. test_requestProvisioningToken_success
   - Mock axios, assert correct URL, headers, body
   - Assert response includes token AND node_id
   - Assert node_id is omitted from request (new token, not refresh)

2. test_requestProvisioningToken_refresh
   - Mock axios with node_id in request
   - Assert node_id is included in request body
   - Assert response has same node_id

3. test_requestProvisioningToken_auth_failure
   - Mock 401 response
   - Assert error thrown

4. test_provision_includes_token_and_node_id
   - Mock provision call
   - Assert provisioning_token AND node_id in request body

5. test_useProvisioning_fetchToken_before_provision
   - Assert startProvisioning fails without token/node_id
   - Call fetchProvisioningToken, then startProvisioning
   - Assert startProvisioning succeeds

6. test_useProvisioning_token_error_handling
   - Mock token request failure
   - Assert error state set, provisioning blocked

7. test_useProvisioning_token_refresh
   - Simulate token expiry
   - Call refreshProvisioningToken
   - Assert new token, same node_id
```

---

## Implementation Order

1. Add `commandCenterApi.ts` with `requestProvisioningToken`
2. Update `Provisioning.ts` types — add `node_id` + `provisioning_token` fields
3. Update `provisioningApi.ts` — pass node_id + token in provision request
4. Update `useProvisioning.ts` — add `fetchProvisioningToken` + `refreshProvisioningToken`
5. Update `mockProvisioningApi.ts` — include token + node_id in mocks
6. Update screen that triggers "Add Node" — call `fetchProvisioningToken` on tap
7. Wire up error handling for token failures

---

## Dependencies

- **command-center** must implement `POST /api/v0/provisioning/token` first
- **jarvis-node-setup** must accept `node_id` + `provisioning_token` in `POST /api/v1/provision`
- Mobile app changes can be built against mocks and tested once backends are ready
