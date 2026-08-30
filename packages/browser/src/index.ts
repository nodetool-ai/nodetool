/**
 * `@nodetool-ai/browser` — driving one real Chrome page.
 *
 * The page is either a headless Chrome this process launched or, through the
 * NodeTool Chrome extension's `/ws/extension` relay, the tab the user is
 * already signed in to. Nothing above {@link ensureSession} knows which: the
 * action loop is transport-agnostic, so the only two entry points that mention
 * transports are {@link browserStatus}, which reports the one in force, and
 * {@link browserRestart}, which changes it.
 *
 * The package deliberately knows nothing about NodeTool's agents, nodes,
 * assets or workflows. It takes plain inputs, returns plain data — a
 * screenshot comes back as base64, not as a persisted asset — so the layer
 * that has a `ProcessingContext` decides what to do with the bytes. That is
 * what lets the agent capabilities and the `lib.browser.Screenshot` node share
 * one implementation without either depending on the other.
 *
 * Chrome itself is reached through dynamic imports, so importing this package
 * loads no browser and launches no process until an action runs.
 */

export {
  CdpPage,
  launchBrowser,
  withPage,
  type WaitUntil,
  type LaunchOptions
} from "./cdp-page.js";

export {
  browserView,
  browserNavigate,
  browserRestart,
  browserClick,
  browserInput,
  browserMoveMouse,
  browserPressKey,
  browserSelectOption,
  browserScroll,
  browserConsoleExec,
  browserConsoleView,
  browserCaptureMedia,
  browserUploadAsset,
  browserStatus,
  closeBrowserSession
} from "./actions.js";

export * from "./schemas.js";

export { captureMediaInPage } from "./capture.js";
export { uploadAssetToInput } from "./upload.js";

export {
  parseExtensionFrame,
  isCdpResultFrame,
  isCdpEventFrame,
  type ExtensionFrame,
  type ExtensionHostToExtFrame,
  type ExtensionExtToHostFrame,
  type CdpCommandFrame,
  type CdpResultFrame,
  type CdpEventFrame,
  type AttachFrame,
  type AttachedFrame,
  type DetachFrame,
  type PingFrame,
  type PongFrame,
  type ErrorFrame,
  type AssetChunkFrame,
  type MediaChunkFrame,
  type MediaEndFrame
} from "./extension/protocol.js";

export {
  ExtensionCdpClient,
  type ExtensionChannel,
  type ExtensionCdpClientApi,
  type ExtensionCdpClientOptions
} from "./extension/client.js";

export {
  createExtensionPage,
  type ExtensionPageHandle
} from "./extension/page.js";

export {
  setExtensionChannelProvider,
  getInProcessExtensionChannel,
  type ExtensionChannelProvider
} from "./extension/channel.js";
