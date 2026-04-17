#!/usr/bin/env node
/**
 * CLI tool to check Zoom user token status
 *
 * Usage:
 *   node --import tsx src/zoom/check-user-token.ts
 *   node --import tsx src/zoom/check-user-token.ts --refresh
 */

import { loadConfig } from "../config/config.js";
import { resolveZoomAccount } from "./config.js";
import { loadUserTokens, refreshUserToken, getUserToken } from "./monitor.js";

async function main() {
  const args = process.argv.slice(2);
  const shouldRefresh = args.includes("--refresh");

  console.log("🔍 Checking Zoom User Token Status...\n");

  // Load tokens
  const tokens = loadUserTokens();

  if (!tokens) {
    console.log("❌ No user tokens found!");
    console.log("\nTo get tokens:");
    console.log("1. Make sure your Zoom app is configured");
    console.log("2. Visit: https://your-domain.com/api/zoomapp/auth");
    console.log("3. Complete the OAuth flow");
    process.exit(1);
  }

  // Calculate expiry
  const now = Date.now();
  const expiresAt = new Date(tokens.expires_at);
  const expiresInMs = tokens.expires_at - now;
  const expiresInMinutes = Math.floor(expiresInMs / 1000 / 60);
  const expiresInSeconds = Math.floor(expiresInMs / 1000);
  const isExpired = expiresInMs <= 0;

  // Display status
  console.log("✅ User tokens found\n");
  console.log("📋 Token Details:");
  console.log(`   Type: ${tokens.token_type}`);
  console.log(`   Scopes: ${tokens.scope}`);
  console.log(`   Has Refresh Token: ${tokens.refresh_token ? "✅ Yes" : "❌ No"}`);
  console.log();

  console.log("⏰ Expiry Information:");
  console.log(`   Expires At: ${expiresAt.toLocaleString()}`);

  if (isExpired) {
    console.log(`   Status: ❌ EXPIRED (${Math.abs(expiresInMinutes)} minutes ago)`);
  } else if (expiresInMinutes < 5) {
    console.log(`   Status: ⚠️  EXPIRING SOON (${expiresInSeconds} seconds remaining)`);
  } else if (expiresInMinutes < 30) {
    console.log(`   Status: ⚠️  Will expire in ${expiresInMinutes} minutes`);
  } else {
    console.log(`   Status: ✅ Valid (${expiresInMinutes} minutes remaining)`);
  }
  console.log();

  console.log("🔑 Token Snippets:");
  console.log(`   Access Token: ${tokens.access_token.substring(0, 20)}...`);
  console.log(`   Refresh Token: ${tokens.refresh_token.substring(0, 20)}...`);
  console.log();

  // Refresh if requested
  if (shouldRefresh) {
    console.log("🔄 Refreshing token...");
    try {
      const cfg = loadConfig();
      const account = resolveZoomAccount({ cfg });
      const newTokens = await refreshUserToken(account);

      const newExpiresAt = new Date(newTokens.expires_at);
      const newExpiresInMinutes = Math.floor((newTokens.expires_at - Date.now()) / 1000 / 60);

      console.log("✅ Token refreshed successfully!");
      console.log(`   New Expires At: ${newExpiresAt.toLocaleString()}`);
      console.log(`   Valid For: ${newExpiresInMinutes} minutes`);
    } catch (error) {
      console.error("❌ Failed to refresh token:", error);
      process.exit(1);
    }
  } else {
    console.log("💡 To refresh the token now, run:");
    console.log("   node --import tsx src/zoom/check-user-token.ts --refresh");
  }

  console.log();

  // Test getUserToken function
  if (!shouldRefresh && (isExpired || expiresInMinutes < 5)) {
    console.log("🧪 Testing auto-refresh...");
    try {
      const cfg = loadConfig();
      const account = resolveZoomAccount({ cfg });
      await getUserToken(account);
      console.log("✅ getUserToken() successfully auto-refreshed the token");
    } catch (error) {
      console.error("❌ getUserToken() failed:", error);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
