

# PRD: OAuth Flow Rework — Command Center as Redirect Authority

## Overview

This PRD describes a re-architecture of the Jarvis OAuth authentication flow.

The new design centralizes OAuth callbacks and token exchange in **Jarvis Command Center (JCC)** instead of the mobile app, while preserving:

- Shared generic auth webview in mobile
- Provider-agnostic command-level auth declarations
- Encrypted token storage
- Node-level consumption of credentials
- Zero provider-specific logic in mobile

This change improves security, simplifies token lifecycle management, and aligns the architecture with a backend-owned authentication model.

---

# Problem Statement

The current OAuth design allows the mobile app to receive tokens (access + refresh) directly and post them to Command Center.

Issues with this model:

1. Refresh tokens temporarily exist on the mobile device.
2. Token lifecycle (refresh, revocation, expiration) becomes coupled to the mobile layer.
3. Mobile becomes a security-sensitive token handler.
4. Difficult to support non-mobile onboarding in the future.
5. Increased attack surface.

We need a model where:

- The mobile app is only responsible for UX + consent.
- Command Center owns token exchange and storage.
- Nodes consume credentials but do not participate in OAuth code exchange.

---

# High-Level Architecture

## Before (Old Flow)

Mobile WebView → Provider → Mobile Callback → Mobile Sends Tokens → JCC → Node

## After (New Flow)

Mobile WebView → Provider → JCC Callback → JCC Exchanges Code → JCC Stores Tokens → MQTT Notify → Node Pulls Credentials

Key change:

**OAuth redirect URI now points to Command Center.**

---

# Detailed Flow

## 1. Auth Required

- A command declares `AuthenticationConfig`.
- Node determines auth is required via `needs_auth()`.
- Node notifies JCC.
- JCC creates an `auth_session` record.

Auth session contains:

- auth_session_id
- provider
- user_id
- expires_at
- state
- PKCE code_verifier
- status = PENDING

---

## 2. Mobile Requests Auth URL

Mobile calls:

GET /auth/session/{auth_session_id}

JCC responds with:

- authorize_url (includes code_challenge + state)
- provider metadata

Mobile opens authorize_url in WebView.

Mobile does NOT generate PKCE verifier.
JCC generates and stores it.

---

## 3. Provider Redirects to JCC

Redirect URI:

https://<command-center>/oauth/callback

Provider returns:

- authorization code
- state

JCC:

- Validates state
- Retrieves auth_session
- Confirms session not expired

---

## 4. JCC Exchanges Code (PKCE)

JCC performs:

POST provider_token_endpoint

With:

- code
- code_verifier
- client_id
- redirect_uri

JCC receives:

- access_token
- refresh_token
- expires_in

JCC stores tokens encrypted in `command_auth` table.

Auth status updated to ACTIVE.

---

## 5. JCC Notifies Node

JCC publishes MQTT event:

jarvis/auth/provider_ready

Payload:

- provider
- user_id
- status = ACTIVE

Tokens are NOT sent over MQTT.

---

## 6. Node Retrieves Credentials

Node performs HTTPS request to JCC:

GET /auth/provider/{provider}

JCC returns encrypted token material over TLS.

Node:

- Stores tokens in local secrets DB
- Calls `store_auth_values()` if needed
- Marks provider ready locally

---

# Security Model

## Transport Encryption

All communication must occur over HTTPS.

Options:

- Public TLS certificate (recommended)
- Local CA installed during onboarding

OAuth providers require HTTPS redirect URIs.

---

## Token Storage

Command Center:

- Stores refresh + access tokens encrypted at rest
- Uses provider-scoped secret namespaces
- Tracks status (ACTIVE / EXPIRED / NEEDS_REAUTH)

Node:

- Stores only what it needs
- Does not perform OAuth exchange

Mobile:

- Never stores refresh tokens
- Never stores access tokens

---

# AuthenticationConfig Contract Changes

AuthenticationConfig should include:

- provider
- scopes
- authorize_url
- token_url
- result_keys (should only include authorization code metadata)
- supports_refresh

Mobile should:

- Render UI dynamically
- Never interpret provider-specific tokens
- Only manage WebView

---

# Benefits

1. Tokens never persist on mobile devices.
2. Command Center becomes the single auth authority.
3. Token refresh can be automated server-side.
4. Mobile remains provider-agnostic.
5. Easier support for desktop/browser onboarding later.
6. Reduced attack surface.

---

# Non-Goals

- End-to-end encryption bypassing TLS.
- Node-level OAuth exchange.
- Custom cryptographic transport layers.

---

# Migration Plan

1. Add JCC callback endpoint.
2. Implement auth_session table.
3. Implement PKCE generation server-side.
4. Modify mobile to fetch authorize_url from JCC.
5. Remove token parsing logic from mobile.
6. Add MQTT auth_ready event.
7. Implement node pull endpoint.
8. Add status tracking to command_auth table.

---

# Future Enhancements

- Background token refresh in JCC.
- Auth status UI indicators in mobile.
- Multi-instance provider support.
- Audit logs for auth flows.
- Automatic reauth triggering on 401.

---

# Success Criteria

- No refresh tokens ever exist on mobile.
- OAuth exchange only happens in Command Center.
- Commands requiring auth function without mobile retaining token state.
- Reauth flow works end-to-end.

---

End of PRD.