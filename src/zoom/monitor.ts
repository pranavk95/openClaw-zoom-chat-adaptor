import crypto from "crypto";
import fs from "fs";
import type { Server } from "http";
import os from "os";
import path from "path";
import express from "express";
import { loadConfig } from "../config/config.js";
import type { OpenClawConfig } from "../config/config.js";
import type { SessionScope } from "../config/sessions/types.js";
import type { RuntimeEnv } from "../runtime.js";
import type { ResolvedZoomAccount } from "./config.js";
import { resolveZoomAccount } from "./config.js";
import type { ZoomMonitorContext } from "./context.js";
import { handleZoomMessage } from "./message-handler.js";

export type MonitorZoomOpts = {
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  port?: number;
};

type ZoomWebhookPayload = {
  event: string;
  payload: {
    accountId: string;
    userJid: string;
    userName: string;
    robotJid: string;
    cmd: string;
    timestamp: number;
    toJid: string;
    userId: string;
    plainToken?: string;
  };
};

let cachedBotToken: { token: string; expiresAt: number } | null = null;

// Dedupe cache for Zoom webhook messages (prevents duplicate processing on retries)
const ZOOM_DEDUPE_TTL_MS = 60_000; // 60 seconds
const ZOOM_DEDUPE_MAX_SIZE = 1000;
const zoomDedupeCache = new Map<string, number>();

function isZoomDuplicate(key: string): boolean {
  const now = Date.now();
  // Clean expired entries
  for (const [k, time] of zoomDedupeCache) {
    if (now - time > ZOOM_DEDUPE_TTL_MS) {
      zoomDedupeCache.delete(k);
    }
  }
  // Limit cache size
  if (zoomDedupeCache.size > ZOOM_DEDUPE_MAX_SIZE) {
    const oldest = zoomDedupeCache.keys().next().value;
    if (oldest) {
      zoomDedupeCache.delete(oldest);
    }
  }
  // Check for duplicate
  if (zoomDedupeCache.has(key)) {
    return true;
  }
  zoomDedupeCache.set(key, now);
  return false;
}

// User-level OAuth tokens (from authorization code flow)
type UserOAuthTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in milliseconds
  token_type: string;
  scope: string;
};

// Path to store user OAuth tokens
function getTokenStorePath(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "zoom-user-tokens.json");
}

// Load user OAuth tokens from file
function loadUserTokens(): UserOAuthTokens | null {
  try {
    const tokenPath = getTokenStorePath();
    if (!fs.existsSync(tokenPath)) {
      return null;
    }
    const data = fs.readFileSync(tokenPath, "utf-8");
    return JSON.parse(data) as UserOAuthTokens;
  } catch (error) {
    console.error("Failed to load user tokens:", error);
    return null;
  }
}

// Save user OAuth tokens to file
function saveUserTokens(tokens: UserOAuthTokens): void {
  try {
    const tokenPath = getTokenStorePath();
    const stateDir = path.dirname(tokenPath);

    // Ensure directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    console.log(`zoom: Saved user tokens to ${tokenPath}`);
  } catch (error) {
    console.error("Failed to save user tokens:", error);
    throw error;
  }
}

// Refresh user access token using refresh token
async function refreshUserToken(account: ResolvedZoomAccount): Promise<UserOAuthTokens> {
  const tokens = loadUserTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error("No refresh token available");
  }

  const { clientId, clientSecret, oauthHost } = account;
  if (!clientId || !clientSecret) {
    throw new Error("Zoom clientId and clientSecret required");
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenParams = new URLSearchParams();
  tokenParams.set("grant_type", "refresh_token");
  tokenParams.set("refresh_token", tokens.refresh_token);

  const response = await fetch(`${oauthHost}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };

  const newTokens: UserOAuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };

  saveUserTokens(newTokens);
  console.log("zoom: Refreshed user access token");
  return newTokens;
}

// Get valid user access token (refresh if expired)
async function getUserToken(account: ResolvedZoomAccount): Promise<string> {
  let tokens = loadUserTokens();

  if (!tokens) {
    throw new Error("No user tokens found. Please install the app first.");
  }

  // Check if token is expired or about to expire (5 min buffer)
  const now = Date.now();
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes

  if (tokens.expires_at < now + expiryBuffer) {
    console.log("zoom: User token expired or about to expire, refreshing...");
    tokens = await refreshUserToken(account);
  }

  return tokens.access_token;
}

function encryptToken(token: string, secretToken: string): string {
  const hash = crypto.createHmac("sha256", secretToken).update(token).digest("hex");
  return hash;
}

export async function getBotToken(account: ResolvedZoomAccount): Promise<string> {
  // Use cached token if valid
  if (cachedBotToken && cachedBotToken.expiresAt > Date.now()) {
    return cachedBotToken.token;
  }

  const { clientId, clientSecret, oauthHost } = account;
  if (!clientId || !clientSecret) {
    throw new Error("Zoom clientId and clientSecret required");
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${oauthHost}/oauth/token?grant_type=client_credentials`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get bot token: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  cachedBotToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

async function sendZoomMessage(params: {
  account: ResolvedZoomAccount;
  toJid: string;
  accountId: string;
  message: string;
  runtime?: RuntimeEnv;
}): Promise<void> {
  const { account, toJid, accountId, message, runtime } = params;
  const { botJid, apiHost } = account;

  if (!botJid) {
    throw new Error("Zoom botJid required");
  }

  const accessToken = await getBotToken(account);

  const response = await fetch(`${apiHost}/v2/im/chat/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      robot_jid: botJid,
      to_jid: toJid,
      account_id: accountId,
      user_jid: toJid,
      content: {
        settings: {},
        body: [
          {
            type: "section",
            layout: "horizontal",
            sections: [
              {
                type: "message",
                text: message,
                is_markdown_support: true,
              },
            ],
          },
        ],
      },
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status} ${responseText}`);
  }

  // Log response even on success to debug delivery issues
  try {
    const responseData = JSON.parse(responseText);
    if (responseData.message_id) {
      // Success - message was accepted by Zoom API
      runtime?.log?.(`zoom: API response OK, message_id=${responseData.message_id}`);
    } else {
      // API returned 200 but no message_id - might indicate a problem
      runtime?.error?.(
        `zoom: API returned 200 but no message_id. Response: ${JSON.stringify(responseData).substring(0, 300)}`,
      );
    }
  } catch {
    // Response is not JSON, log it anyway
    if (responseText.trim()) {
      runtime?.error?.(`zoom: API response (non-JSON): ${responseText.substring(0, 300)}`);
    } else {
      runtime?.log?.(`zoom: API response OK (empty body)`);
    }
  }
}

export async function monitorZoomProvider(opts: MonitorZoomOpts = {}): Promise<void> {
  const { config, runtime, abortSignal, port = 3001 } = opts;

  // Load config and resolve account (matching Slack/Telegram pattern)
  const cfg = config ?? loadConfig();
  const account = resolveZoomAccount({
    cfg,
    accountId: opts.accountId,
  });

  if (!runtime) {
    throw new Error("Runtime required for Zoom provider");
  }

  const { secretToken } = account;
  if (!secretToken) {
    throw new Error("Zoom secretToken required for webhook verification");
  }

  // Build monitor context internally (moved from channel.ts)
  const sessionScope: SessionScope = cfg.session?.scope ?? "per-sender";

  const ctx: ZoomMonitorContext = {
    cfg,
    accountId: account.accountId,
    account,
    runtime,
    historyLimit: 10,
    channelHistories: new Map(),
    sessionScope,
    mainKey: "", // Not used for Zoom (sessions are per-user)
    dmEnabled: account.enabled,
    dmPolicy: account.config.dm?.policy ?? "open",
    allowFrom: (account.config.dm?.allowFrom ?? []).map((entry) => String(entry)),
    textLimit: 4000,
    replyToMode: "off",
    removeAckAfterReply: false,
  };

  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "zoom-webhook" });
  });

  // OAuth callback endpoint (for app installation)
  app.get("/api/zoomapp/auth", async (req, res) => {
    const code = req.query.code as string;

    if (!code) {
      runtime.log("zoom: OAuth callback missing code parameter");
      return res.status(400).send("Missing authorization code");
    }

    runtime.log(`zoom: OAuth callback received, exchanging code for tokens...`);

    try {
      // Exchange authorization code for access token
      const tokenUrl = `${account.oauthHost}/oauth/token`;
      const tokenParams = new URLSearchParams();
      tokenParams.set("grant_type", "authorization_code");
      // Use configured redirectUri or fall back to dynamically built one
      const redirectUri =
        account.redirectUri || `${req.protocol}://${req.get("host")}/api/zoomapp/auth`;
      tokenParams.set("redirect_uri", redirectUri);
      tokenParams.set("code", code);

      const authHeader = Buffer.from(`${account.clientId}:${account.clientSecret}`).toString(
        "base64",
      );

      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authHeader}`,
        },
        body: tokenParams.toString(),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        runtime.error?.(`zoom: Token exchange failed: ${tokenResponse.status} ${error}`);
        return res.status(500).send("Failed to complete installation");
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
        scope: string;
      };
      runtime.log("zoom: Successfully exchanged code for access token");

      // Save user tokens to file
      const userTokens: UserOAuthTokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
      };
      saveUserTokens(userTokens);
      runtime.log("zoom: Saved user OAuth tokens (access + refresh)");

      // Get deep link to redirect user back to Zoom app
      const deepLinkResponse = await fetch(`${account.apiHost}/v2/zoomapp/deeplink`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "go" }),
      });

      if (deepLinkResponse.ok) {
        const deepLinkData = (await deepLinkResponse.json()) as { deeplink: string };
        runtime.log("zoom: Redirecting to Zoom app");
        return res.redirect(deepLinkData.deeplink);
      }

      // Fallback: show success page if deep link fails
      runtime.log("zoom: Deep link failed, showing success page");
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Zoom App Installed</title>
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
              .success { color: #16a34a; font-size: 48px; margin-bottom: 20px; }
              h1 { color: #333; }
              p { color: #666; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="success">✅</div>
            <h1>Zoom App Installed Successfully!</h1>
            <p>Your bot is now active. You can close this window and start messaging your bot in Zoom Team Chat.</p>
            <p><strong>Bot Name:</strong> Jarvis 🤖</p>
            <p>Send a message to get started!</p>
          </body>
        </html>
      `);
    } catch (error) {
      runtime.error?.(`zoom: OAuth error: ${String(error)}`);
      return res.status(500).send("Installation failed");
    }
  });

  // Webhook endpoint
  app.post("/webhooks/zoom", async (req, res) => {
    try {
      const body = req.body as ZoomWebhookPayload;

      // Handle URL validation
      if (body.event === "endpoint.url_validation") {
        const plainToken = body.payload.plainToken || "";
        const encryptedToken = encryptToken(plainToken, secretToken);

        runtime.log("zoom: URL validation successful");
        return res.json({
          plainToken,
          encryptedToken,
        });
      }

      // Handle bot notification
      if (body.event === "bot_notification") {
        const { userJid, userName, cmd, accountId, toJid, timestamp } = body.payload;

        // Dedupe: skip if we've seen this exact message recently (Zoom retries)
        const dedupeKey = `${userJid}|${cmd}|${timestamp}`;
        if (isZoomDuplicate(dedupeKey)) {
          runtime.log(`zoom: Skipping duplicate message from ${userName} (retry detected)`);
          return res.json({ success: true });
        }

        runtime.log(`zoom: Message from ${userName}: ${cmd}`);

        // Respond to Zoom immediately to prevent retry, then process asynchronously
        void handleZoomMessage({
          ctx,
          message: {
            userJid,
            userName,
            cmd,
            accountId,
            toJid,
            timestamp,
          },
          sendReply: async (replyText: string) => {
            runtime.log(
              `zoom: Sending response to userJid=${userJid}, toJid=${toJid}: ${replyText.substring(0, 80)}...`,
            );
            try {
              await sendZoomMessage({
                account,
                toJid: userJid,
                accountId,
                message: replyText,
                runtime,
              });
              runtime.log(`zoom: Response sent successfully to ${userJid}`);
            } catch (err) {
              runtime.error?.(`zoom: Failed to send response: ${String(err)}`);
              throw err;
            }
          },
        }).catch((err) => {
          runtime.error?.(`zoom: Message processing failed: ${String(err)}`);
        });

        return res.json({ success: true });
      }

      return res.json({ success: true });
    } catch (error) {
      runtime.error?.(`zoom: Webhook error: ${String(error)}`);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const server = await new Promise<Server>((resolve, reject) => {
    const srv = app.listen(port, () => {
      runtime.log(`zoom: Webhook server listening on port ${port}`);
      runtime.log(`zoom: Webhook URL: http://localhost:${port}/webhooks/zoom`);
      resolve(srv);
    });
    srv.on("error", reject);
  });

  // Graceful shutdown handler
  const stopServer = () => {
    runtime.log("zoom: Shutting down webhook server...");
    server.close(() => {
      runtime.log("zoom: Webhook server stopped");
    });
  };

  abortSignal?.addEventListener("abort", stopServer, { once: true });

  try {
    if (abortSignal?.aborted) {
      return;
    }
    // Wait for abort signal
    if (abortSignal) {
      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
    } else {
      // If no abort signal, wait forever (process will handle SIGINT/SIGTERM)
      await new Promise(() => {});
    }
  } finally {
    abortSignal?.removeEventListener("abort", stopServer);
    server.close();
  }
}

// Export user token management functions for external use
export { getUserToken, loadUserTokens, refreshUserToken };
export type { UserOAuthTokens };
