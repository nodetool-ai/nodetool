export * from "./nodes/lib-apple.js";
export * from "./nodes/lib-browser.js";
export * from "./nodes/triggers.js";
export * from "./nodes/lib-sqlite.js";

// Browser-automation helpers exposed for sibling packages (code-nodes calls
// buildBrowserAgentToolClasses to register the browser_* agent tools).
export * from "./lib/browser-agent-tools.js";

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
