import { hasConfiguredSecretInput } from "openclaw/plugin-sdk/secret-input";
import {
  createStandardChannelSetupStatus,
  DEFAULT_ACCOUNT_ID,
  patchChannelConfigForAccount,
  setSetupChannelEnabled,
  type ChannelSetupWizard,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/setup-runtime";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import { resolveZoomAccount } from "../../../src/zoom/config.js";

const channel = "zoom" as const;

function isZoomAccountConfigured(cfg: OpenClawConfig, accountId: string): boolean {
  const account = resolveZoomAccount({ cfg, accountId });
  return Boolean(
    account.clientId?.trim() &&
    account.clientSecret?.trim() &&
    account.botJid?.trim() &&
    account.secretToken?.trim(),
  );
}

function enableZoomAccount(cfg: OpenClawConfig, accountId: string): OpenClawConfig {
  return patchChannelConfigForAccount({
    cfg,
    channel,
    accountId,
    patch: { enabled: true },
  });
}

export const zoomSetupWizard: ChannelSetupWizard = {
  channel,

  status: createStandardChannelSetupStatus({
    channelLabel: "Zoom",
    configuredLabel: "configured",
    unconfiguredLabel: "not configured",
    configuredHint: "configured",
    unconfiguredHint: "not configured",
    configuredScore: 2,
    unconfiguredScore: 3,
    resolveConfigured: ({ cfg, accountId }) => {
      const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
      return isZoomAccountConfigured(cfg, resolvedAccountId);
    },
  }),

  credentials: [
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zoom-specific credential key not in base ChannelSetupInput
      inputKey: "clientId" as any,
      providerHint: "zoom",
      credentialLabel: "Zoom Client ID",
      preferredEnvVar: "ZOOM_CLIENT_ID",
      envPrompt: "ZOOM_CLIENT_ID detected. Use env var?",
      keepPrompt: "Zoom Client ID already configured. Keep it?",
      inputPrompt: "Enter Zoom Client ID",
      allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) => {
        const resolved = resolveZoomAccount({ cfg, accountId });
        const hasConfiguredValue = hasConfiguredSecretInput(resolved.config.clientId);
        return {
          accountConfigured: Boolean(resolved.clientId) || hasConfiguredValue,
          hasConfiguredValue,
          resolvedValue: normalizeOptionalString(resolved.clientId),
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? normalizeOptionalString(process.env.ZOOM_CLIENT_ID)
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
        enableZoomAccount(cfg, accountId),
      applySet: ({
        cfg,
        accountId,
        value,
      }: {
        cfg: OpenClawConfig;
        accountId: string;
        value: unknown;
      }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: {
            enabled: true,
            clientId: value,
          },
        }),
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zoom-specific credential key not in base ChannelSetupInput
      inputKey: "clientSecret" as any,
      providerHint: "zoom",
      credentialLabel: "Zoom Client Secret",
      preferredEnvVar: "ZOOM_CLIENT_SECRET",
      envPrompt: "ZOOM_CLIENT_SECRET detected. Use env var?",
      keepPrompt: "Zoom Client Secret already configured. Keep it?",
      inputPrompt: "Enter Zoom Client Secret",
      allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) => {
        const resolved = resolveZoomAccount({ cfg, accountId });
        const hasConfiguredValue = hasConfiguredSecretInput(resolved.config.clientSecret);
        return {
          accountConfigured: Boolean(resolved.clientSecret) || hasConfiguredValue,
          hasConfiguredValue,
          resolvedValue: normalizeOptionalString(resolved.clientSecret),
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? normalizeOptionalString(process.env.ZOOM_CLIENT_SECRET)
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
        enableZoomAccount(cfg, accountId),
      applySet: ({
        cfg,
        accountId,
        value,
      }: {
        cfg: OpenClawConfig;
        accountId: string;
        value: unknown;
      }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: {
            enabled: true,
            clientSecret: value,
          },
        }),
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zoom-specific credential key not in base ChannelSetupInput
      inputKey: "botJid" as any,
      providerHint: "zoom",
      credentialLabel: "Zoom Bot JID",
      preferredEnvVar: "ZOOM_BOT_JID",
      envPrompt: "ZOOM_BOT_JID detected. Use env var?",
      keepPrompt: "Zoom Bot JID already configured. Keep it?",
      inputPrompt: "Enter Zoom Bot JID (bot@xmpp.zoom.us or bot@xmppdev.zoom.us)",
      allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) => {
        const resolved = resolveZoomAccount({ cfg, accountId });
        const hasConfiguredValue = hasConfiguredSecretInput(resolved.config.botJid);
        return {
          accountConfigured: Boolean(resolved.botJid) || hasConfiguredValue,
          hasConfiguredValue,
          resolvedValue: normalizeOptionalString(resolved.botJid),
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? normalizeOptionalString(process.env.ZOOM_BOT_JID)
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
        enableZoomAccount(cfg, accountId),
      applySet: ({
        cfg,
        accountId,
        value,
      }: {
        cfg: OpenClawConfig;
        accountId: string;
        value: unknown;
      }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: {
            enabled: true,
            botJid: value,
          },
        }),
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zoom-specific credential key not in base ChannelSetupInput
      inputKey: "secretToken" as any,
      providerHint: "zoom",
      credentialLabel: "Zoom Secret Token",
      preferredEnvVar: "ZOOM_SECRET_TOKEN",
      envPrompt: "ZOOM_SECRET_TOKEN detected. Use env var?",
      keepPrompt: "Zoom Secret Token already configured. Keep it?",
      inputPrompt: "Enter Zoom Secret Token",
      allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) => {
        const resolved = resolveZoomAccount({ cfg, accountId });
        const hasConfiguredValue = hasConfiguredSecretInput(resolved.config.secretToken);
        return {
          accountConfigured: Boolean(resolved.secretToken) || hasConfiguredValue,
          hasConfiguredValue,
          resolvedValue: normalizeOptionalString(resolved.secretToken),
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? normalizeOptionalString(process.env.ZOOM_SECRET_TOKEN)
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
        enableZoomAccount(cfg, accountId),
      applySet: ({
        cfg,
        accountId,
        value,
      }: {
        cfg: OpenClawConfig;
        accountId: string;
        value: unknown;
      }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: {
            enabled: true,
            secretToken: value,
          },
        }),
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zoom-specific credential key not in base ChannelSetupInput
      inputKey: "redirectUri" as any,
      providerHint: "zoom",
      credentialLabel: "OAuth Redirect URL",
      preferredEnvVar: "ZOOM_REDIRECT_URI",
      envPrompt: "ZOOM_REDIRECT_URI detected. Use env var?",
      keepPrompt: "OAuth Redirect URL already configured. Keep it?",
      inputPrompt: "Enter OAuth Redirect URL (https://yourdomain.com/api/zoomapp/auth)",
      allowEnv: ({ accountId }: { accountId: string }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) => {
        const resolved = resolveZoomAccount({ cfg, accountId });
        const hasConfiguredValue = hasConfiguredSecretInput(resolved.config.redirectUri);
        return {
          accountConfigured: Boolean(resolved.redirectUri) || hasConfiguredValue,
          hasConfiguredValue,
          resolvedValue: normalizeOptionalString(resolved.redirectUri),
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? normalizeOptionalString(process.env.ZOOM_REDIRECT_URI)
              : undefined,
        };
      },
      applyUseEnv: ({ cfg, accountId }: { cfg: OpenClawConfig; accountId: string }) =>
        enableZoomAccount(cfg, accountId),
      applySet: ({
        cfg,
        accountId,
        value,
      }: {
        cfg: OpenClawConfig;
        accountId: string;
        value: unknown;
      }) =>
        patchChannelConfigForAccount({
          cfg,
          channel,
          accountId,
          patch: {
            enabled: true,
            redirectUri: value,
          },
        }),
    },
  ],

  disable: (cfg: OpenClawConfig) => setSetupChannelEnabled(cfg, channel, false),
};
