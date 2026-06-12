/**
 * Registration seam for the in-process extension channel.
 *
 * The action loop (this package) must not depend on `@nodetool-ai/websocket`:
 * the dependency runs the other way (websocket → automation-nodes), so a static
 * import here would create a cycle. Instead the server registers its
 * `ExtensionBridge.getChannel` factory at startup via
 * {@link setExtensionChannelProvider}; the browser-tools singleton resolves it
 * lazily through {@link getInProcessExtensionChannel}.
 *
 * When no provider is registered (e.g. the action loop runs in a standalone CLI
 * process), callers fall back to the WS-URL transport handled by
 * {@link ExtensionCdpClient}.
 */

import type { ExtensionChannel } from "./extension-cdp-client.js";

/** Factory yielding a fresh in-process channel bound to the live extension. */
export type ExtensionChannelProvider = () => ExtensionChannel;

let provider: ExtensionChannelProvider | null = null;

/**
 * Register the in-process channel factory. Called once by the nodetool server
 * (which owns the `ExtensionBridge`). Pass `null` to clear.
 */
export function setExtensionChannelProvider(
  next: ExtensionChannelProvider | null
): void {
  provider = next;
}

/**
 * Resolve an in-process extension channel, or `null` when no provider is
 * registered (out-of-server execution).
 */
export function getInProcessExtensionChannel(): ExtensionChannel | null {
  return provider ? provider() : null;
}
