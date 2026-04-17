import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk/core";
import { sendMessageZoom } from "../../../src/zoom/send.js";

export const zoomOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null, // Use default text chunking
  textChunkLimit: 4000, // Zoom's limit
  sendText: async ({
    to,
    text,
    accountId,
  }: {
    to: string;
    text: string;
    accountId?: string | null;
  }) => {
    const result = await sendMessageZoom(to, text, {
      accountId: accountId ?? undefined,
    });
    return { channel: "zoom", ...result };
  },
  sendMedia: async ({
    to,
    caption,
    mediaUrl,
    accountId,
  }: {
    to: string;
    caption?: string;
    mediaUrl?: string;
    accountId?: string | null;
  }) => {
    // Phase 1: No media support - send caption as text
    const text = caption || (mediaUrl ? `[Media: ${mediaUrl}]` : "[Media attachment]");
    const result = await sendMessageZoom(to, text, {
      accountId: accountId ?? undefined,
    });
    return { channel: "zoom", ...result };
  },
};
