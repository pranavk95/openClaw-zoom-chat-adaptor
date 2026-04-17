import { normalizeZoomMessagingTarget } from "../../extensions/zoom/src/normalize.js";
import { loadConfig } from "../config/config.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveZoomAccount } from "./config.js";
import { getBotToken } from "./monitor.js";

export type ZoomSendOpts = {
  accountId?: string;
  zoomAccountId?: string; // The actual Zoom account ID for the recipient
  token?: string; // For dependency injection override
  cfg?: OpenClawConfig;
};

export type ZoomSendResult = {
  messageId: string;
  toJid: string;
};

export async function sendMessageZoom(
  to: string,
  message: string,
  opts: ZoomSendOpts = {},
): Promise<ZoomSendResult> {
  // Normalize and validate target
  const normalized = normalizeZoomMessagingTarget(to);
  if (!normalized) {
    throw new Error(
      `Invalid Zoom target: ${to}. Expected format: user@xmpp.zoom.us or user@xmppdev.zoom.us`,
    );
  }

  // Validate JID format (must contain @xmpp or @xmppdev)
  if (!normalized.includes("@xmpp") && !normalized.includes("@xmppdev")) {
    throw new Error(
      `Invalid Zoom JID format: ${normalized}. Must contain @xmpp or @xmppdev domain`,
    );
  }

  // Validate message is not empty
  if (!message.trim()) {
    throw new Error("Zoom send requires non-empty text");
  }

  // Load config and resolve account
  const cfg = opts.cfg ?? loadConfig();
  const account = resolveZoomAccount({ cfg, accountId: opts.accountId });

  const { botJid, apiHost, clientId, clientSecret } = account;

  // Resolve Zoom account ID (recipient's org account, not OpenClaw account)
  // Priority: explicit opt > config default > extract from JID user part
  const zoomAccountId =
    opts.zoomAccountId ??
    (account.config as Record<string, unknown>).defaultZoomAccountId ??
    normalized.split("@")[0]; // Fallback to user ID part (may not work for all cases)

  // Validate required config
  if (!botJid?.trim()) {
    throw new Error("Zoom botJid not configured. Run: openclaw channels add zoom");
  }
  if (!clientId?.trim() || !clientSecret?.trim()) {
    throw new Error(
      "Zoom clientId and clientSecret not configured. Run: openclaw channels add zoom",
    );
  }

  // Get OAuth token (use override or fetch new one)
  const accessToken = opts.token ?? (await getBotToken(account));

  // Call Zoom API
  const response = await fetch(`${apiHost}/v2/im/chat/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      robot_jid: botJid,
      to_jid: normalized,
      account_id: zoomAccountId,
      user_jid: normalized,
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
    throw new Error(`Failed to send Zoom message: ${response.status} ${responseText}`);
  }

  // Parse response
  let responseData: { message_id?: string } = {};
  try {
    responseData = JSON.parse(responseText) as { message_id?: string };
  } catch {
    // Response is not JSON, but request succeeded
    return {
      messageId: "unknown",
      toJid: normalized,
    };
  }

  return {
    messageId: responseData.message_id || "unknown",
    toJid: normalized,
  };
}
