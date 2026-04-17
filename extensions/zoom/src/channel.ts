import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
  type ChannelPlugin,
} from "openclaw/plugin-sdk/channel-plugin-common";
import type { ResolvedZoomAccount } from "../../../src/zoom/config.js";
import { resolveZoomAccount } from "../../../src/zoom/config.js";
import { ZoomConfigSchema } from "../../../src/zoom/config.js";
import { monitorZoomProvider } from "../../../src/zoom/monitor.js";
import { looksLikeZoomTargetId, normalizeZoomMessagingTarget } from "./normalize.js";
import { zoomOutbound } from "./outbound.js";
import { zoomSetupAdapter } from "./setup-core.js";
import { zoomSetupWizard } from "./setup-surface.js";

const meta = getChatChannelMeta("zoom");

export const zoomPlugin: ChannelPlugin<ResolvedZoomAccount> = {
  id: "zoom",
  meta: {
    ...meta,
  },
  setupWizard: zoomSetupWizard,
  setup: zoomSetupAdapter,
  capabilities: {
    chatTypes: ["direct"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.zoom"] },
  configSchema: buildChannelConfigSchema(ZoomConfigSchema),
  outbound: zoomOutbound,
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg, accountId) => resolveZoomAccount({ cfg, accountId }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) => {
      if (!cfg.channels) {
        cfg.channels = {};
      }
      const channels = cfg.channels as Record<string, unknown>;
      if (!channels.zoom) {
        channels.zoom = {};
      }
      (channels.zoom as Record<string, unknown>).enabled = enabled;
      return cfg;
    },
    deleteAccount: ({ cfg }) => {
      if ((cfg.channels as Record<string, unknown>)?.zoom) {
        delete (cfg.channels as Record<string, unknown>).zoom;
      }
      return cfg;
    },
    isConfigured: (account) =>
      Boolean(
        account.clientId?.trim() &&
        account.clientSecret?.trim() &&
        account.botJid?.trim() &&
        account.secretToken?.trim(),
      ),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: "Zoom Team Chat",
      enabled: account.enabled,
      configured: Boolean(
        account.clientId?.trim() &&
        account.clientSecret?.trim() &&
        account.botJid?.trim() &&
        account.secretToken?.trim(),
      ),
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveZoomAccount({ cfg, accountId });
      return (account.config.dm?.allowFrom ?? []).map((entry) => String(entry));
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dm?.policy ?? "open",
      allowFrom: account.config.dm?.allowFrom ?? [],
      allowFromPath: "channels.zoom.dm.",
      approveHint: "Send a message to the bot to get started",
      normalizeEntry: (raw) => (raw ?? "").trim(),
    }),
    collectWarnings: () => [],
  },
  messaging: {
    normalizeTarget: (target) => normalizeZoomMessagingTarget(target ?? ""),
    targetResolver: {
      looksLikeId: (input) => looksLikeZoomTargetId(input),
      hint: "<userJid>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info(`[${account.accountId}] starting Zoom provider`);

      // Call monitor directly (imported from SDK)
      return monitorZoomProvider({
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        port: 3001, // Use 3001 to avoid conflict with gateway Control UI on 3000
      });
    },
  },
};
