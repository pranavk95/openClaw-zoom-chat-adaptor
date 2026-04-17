// Keep bundled setup entry imports narrow so setup loads do not pull the
// broader Zoom channel plugin surface.
export { zoomSetupPlugin } from "./src/channel.setup.js";
