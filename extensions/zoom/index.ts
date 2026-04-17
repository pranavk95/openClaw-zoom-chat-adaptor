import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";

export default defineBundledChannelEntry({
  id: "zoom",
  name: "Zoom Team Chat",
  description: "Zoom Team Chat channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "zoomPlugin",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setZoomRuntime",
  },
});
