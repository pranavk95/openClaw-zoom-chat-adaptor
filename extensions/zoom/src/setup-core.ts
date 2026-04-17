import type { ChannelSetupInput } from "openclaw/plugin-sdk/channel-setup";
import {
  createEnvPatchedAccountSetupAdapter,
  type ChannelSetupAdapter,
} from "openclaw/plugin-sdk/setup-runtime";

const channel = "zoom" as const;

type ZoomSetupInput = ChannelSetupInput & {
  clientId?: string;
  clientSecret?: string;
  botJid?: string;
  secretToken?: string;
  redirectUri?: string;
};

export const zoomSetupAdapter: ChannelSetupAdapter = createEnvPatchedAccountSetupAdapter({
  channelKey: channel,
  defaultAccountOnlyEnvError: "Zoom env tokens can only be used for the default account.",
  missingCredentialError:
    "Zoom requires --client-id, --client-secret, --bot-jid, and --secret-token (or --use-env).",
  hasCredentials: (input) => {
    const zoomInput = input as ZoomSetupInput;
    return Boolean(
      zoomInput.clientId && zoomInput.clientSecret && zoomInput.botJid && zoomInput.secretToken,
    );
  },
  buildPatch: (input) => {
    const zoomInput = input as ZoomSetupInput;
    return {
      ...(zoomInput.clientId ? { clientId: zoomInput.clientId } : {}),
      ...(zoomInput.clientSecret ? { clientSecret: zoomInput.clientSecret } : {}),
      ...(zoomInput.botJid ? { botJid: zoomInput.botJid } : {}),
      ...(zoomInput.secretToken ? { secretToken: zoomInput.secretToken } : {}),
      ...(zoomInput.redirectUri ? { redirectUri: zoomInput.redirectUri } : {}),
    };
  },
});
