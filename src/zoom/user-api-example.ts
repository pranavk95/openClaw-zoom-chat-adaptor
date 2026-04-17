/**
 * Example: Using user-level OAuth tokens for Zoom APIs
 *
 * This demonstrates how to use the stored user tokens to access
 * user-level APIs like Zoom Docs, Meetings, etc.
 */

import { loadConfig } from "../config/config.js";
import { resolveZoomAccount } from "./config.js";
import { getUserToken, loadUserTokens } from "./monitor.js";

/**
 * Example: List user's Zoom Docs files
 */
export async function listUserDocs(): Promise<void> {
  const cfg = loadConfig();
  const account = resolveZoomAccount({ cfg });

  try {
    // Get valid user access token (auto-refreshes if expired)
    const accessToken = await getUserToken(account);

    // Make API call to Zoom Docs
    const response = await fetch(`${account.apiHost}/v2/docs/files`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list docs: ${response.status} ${error}`);
    }

    const data = await response.json();
    console.log("User's Zoom Docs:", data);
  } catch (error) {
    console.error("Error listing docs:", error);
    throw error;
  }
}

/**
 * Example: Call MCP server with user token
 */
export async function callMCPServer(
  mcpEndpoint: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  const cfg = loadConfig();
  const account = resolveZoomAccount({ cfg });

  try {
    // Get valid user access token
    const accessToken = await getUserToken(account);

    // Make JSON-RPC call to MCP server
    const response = await fetch(mcpEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: method,
        params: params,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MCP server error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error("Error calling MCP server:", error);
    throw error;
  }
}

/**
 * Example: Check token status
 */
export function checkTokenStatus(): void {
  const tokens = loadUserTokens();

  if (!tokens) {
    console.log("❌ No user tokens found. Please install the Zoom app first.");
    return;
  }

  const now = Date.now();
  const expiresIn = Math.floor((tokens.expires_at - now) / 1000 / 60); // minutes

  console.log("✅ User tokens found:");
  console.log(`  - Token expires in: ${expiresIn} minutes`);
  console.log(`  - Token type: ${tokens.token_type}`);
  console.log(`  - Scopes: ${tokens.scope}`);
  console.log(`  - Has refresh token: ${!!tokens.refresh_token}`);

  if (expiresIn < 5) {
    console.log("  ⚠️  Token will be auto-refreshed on next use");
  }
}

// Example usage:
//
// import { checkTokenStatus, listUserDocs, callMCPServer } from './user-api-example.js';
//
// // Check token status
// checkTokenStatus();
//
// // List user's docs
// await listUserDocs();
//
// // Call MCP server
// const result = await callMCPServer(
//   'https://mcp-gateway.zoomdev.us/mcp/i_6E0e31637cC99cC7/streamable',
//   'tools/list',
//   {}
// );
