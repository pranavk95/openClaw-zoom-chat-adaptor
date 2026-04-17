# Zoom User-Level OAuth Tokens

This document explains how OpenClaw manages user-level OAuth tokens for accessing Zoom APIs that require user authorization.

## Overview

OpenClaw now supports **two types of Zoom authentication**:

1. **Bot Token** (Client Credentials) - For bot operations like sending messages
2. **User Token** (Authorization Code) - For user-level APIs like Zoom Docs, Meetings, etc.

## How It Works

### Installation Flow

```
1. User installs Zoom app
   ↓
2. Zoom redirects to: /api/zoomapp/auth?code=ABC123
   ↓
3. OpenClaw exchanges code for tokens:
   - access_token (expires in 1 hour)
   - refresh_token (long-lived)
   ↓
4. Tokens saved to: ~/.openclaw/zoom-user-tokens.json
```

### Token Storage

Tokens are stored in `~/.openclaw/zoom-user-tokens.json`:

```json
{
  "access_token": "abcedfgj...",
  "refresh_token": "xtzi23rt...",
  "expires_at": 1769732065000,
  "token_type": "bearer",
  "scope": "docs:read:file docs:write:file meeting:write..."
}
```

**Security:** File permissions are set to `0600` (owner read/write only).

### Auto-Refresh

When you call `getUserToken()`:

```typescript
const token = await getUserToken(account);
```

The system automatically:

1. Checks if token is expired (or expires in < 5 minutes)
2. If expired, uses `refresh_token` to get new `access_token`
3. Saves updated tokens to file
4. Returns valid token

## API Reference

### Functions

#### `getUserToken(account)`

Get a valid user access token (auto-refreshes if needed).

```typescript
import { getUserToken } from "./monitor.js";
import { resolveZoomAccount } from "./config.js";
import { loadConfig } from "../config/config.js";

const cfg = loadConfig();
const account = resolveZoomAccount({ cfg });

const token = await getUserToken(account);
// Use token for API calls...
```

#### `loadUserTokens()`

Load tokens from file (raw, no refresh).

```typescript
import { loadUserTokens } from "./monitor.js";

const tokens = loadUserTokens();
if (tokens) {
  console.log("Token expires at:", new Date(tokens.expires_at));
}
```

#### `refreshUserToken(account)`

Manually refresh the token.

```typescript
import { refreshUserToken } from "./monitor.js";

const newTokens = await refreshUserToken(account);
console.log("New token expires at:", new Date(newTokens.expires_at));
```

## Usage Examples

### Example 1: List User's Zoom Docs

```typescript
import { getUserToken } from "./monitor.js";

async function listDocs() {
  const token = await getUserToken(account);

  const response = await fetch("https://api.zoom.us/v2/docs/files", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const docs = await response.json();
  console.log(docs);
}
```

### Example 3: Check Token Status

```typescript
import { loadUserTokens } from "./monitor.js";

const tokens = loadUserTokens();
if (!tokens) {
  console.log("No tokens found. Install app first.");
} else {
  const expiresIn = (tokens.expires_at - Date.now()) / 1000 / 60;
  console.log(`Token expires in ${expiresIn.toFixed(0)} minutes`);
}
```

## Token Lifecycle

```
┌─────────────────────────────────────────────────────┐
│ App Installation                                    │
│  - User authorizes app                              │
│  - Tokens saved to disk                             │
└──────────────┬──────────────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────────────┐
│ Normal Usage (< 55 minutes old)                     │
│  - getUserToken() returns cached token              │
│  - No API call needed                               │
└──────────────┬──────────────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────────────┐
│ Token Expiring (> 55 minutes old)                   │
│  - getUserToken() detects expiry                    │
│  - Calls /oauth/token with refresh_token            │
│  - Gets new access_token + refresh_token            │
│  - Saves to disk                                    │
│  - Returns new token                                │
└──────────────┬──────────────────────────────────────┘
               │
               ↓ (repeat)
```

## Required Scopes

To access user APIs, your Zoom app must request appropriate scopes during installation:

**For Zoom Docs:**

```
docs:read:file
docs:write:file
docs:read:list_children
docs:update:file
docs:delete:file
```

**For Meetings:**

```
meeting:read:admin
meeting:write:admin
```

Configure scopes in your Zoom App Marketplace settings.

## Troubleshooting

### "No user tokens found"

**Cause:** App hasn't been installed yet.

**Solution:** Install the app via the OAuth flow (visit the redirect URI).

### "Failed to refresh token"

**Cause:** Refresh token is invalid or expired.

**Solution:**

1. Delete `~/.openclaw/zoom-user-tokens.json`
2. Reinstall the app

### "403 Forbidden" when calling API

**Cause:** Token doesn't have required scopes.

**Solution:**

1. Add scopes in Zoom App Marketplace
2. Reinstall the app to get new token with scopes

## Security Notes

1. **File Permissions:** Token file is `0600` (owner only)
2. **State Directory:** Token file is in `~/.openclaw/` (configurable via `OPENCLAW_STATE_DIR`)
3. **Refresh Tokens:** Long-lived, treat as sensitive credentials
4. **Access Tokens:** Short-lived (1 hour), auto-refreshed

## Comparison: Bot Token vs User Token

| Aspect            | Bot Token          | User Token                |
| ----------------- | ------------------ | ------------------------- |
| **Flow**          | Client Credentials | Authorization Code        |
| **Represents**    | The app/bot        | Specific user             |
| **Refresh Token** | ❌ No              | ✅ Yes                    |
| **Storage**       | In-memory cache    | Persistent file           |
| **Scopes**        | Bot operations     | User data access          |
| **Use For**       | Sending messages   | Docs, Meetings, User APIs |
| **Function**      | `getBotToken()`    | `getUserToken()`          |

## See Also

- [user-api-example.ts](./user-api-example.ts) - Complete working examples
- [monitor.ts](./monitor.ts) - Implementation details
- [Zoom OAuth Documentation](https://developers.zoom.us/docs/integrations/oauth/)
