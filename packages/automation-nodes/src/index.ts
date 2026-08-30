export * from "./nodes/lib-apple.js";
export * from "./nodes/lib-browser.js";
export * from "./nodes/triggers.js";
export * from "./nodes/lib-sqlite.js";

// The browser action layer behind the `browser_*` agent capabilities.
// `registerBrowserActions` hands it to @nodetool-ai/agents, which owns the
// capabilities but cannot import the actions (the dependency runs the other
// way). base-nodes calls it, so every host with a node registry serves them.
export {
  browserActionRunner,
  registerBrowserActions
} from "./lib/browser-actions.js";

// File-watch matching/debounce logic shared with the host file-watch adapter
// (packages/websocket/src/triggers/file-watch.ts) so both call sites stay in
// sync instead of duplicating pattern/debounce behavior.
export * from "./lib/file-watch-match.js";

// Registration seam for the in-process extension transport. The nodetool server
// (which owns the ExtensionBridge) registers its channel factory here at startup
// so the browser action loop can ride the live extension without this package
// depending on @nodetool-ai/websocket.
export {
  setExtensionChannelProvider,
  getInProcessExtensionChannel,
  type ExtensionChannelProvider
} from "./lib/extension-channel-provider.js";
