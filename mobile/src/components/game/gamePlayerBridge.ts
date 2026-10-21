/**
 * The narrow contract between the native game screen and the web player it
 * hosts.
 *
 * The player page is the exported web build, served by the API under one
 * signed play URL. It carries no credentials and gets no native API: the
 * WebView exposes only `postMessage`, the script below sends five message
 * kinds through it, and anything else the page posts is dropped. The native
 * side never evaluates page data; it only reads these messages and injects the
 * fixed pause call below.
 */

import { z } from 'zod';

/**
 * Runs before the page's own scripts. It reports what the web view can draw
 * with, mirrors the player's status line, says when the player is ready, and
 * forwards uncaught errors. Injected scripts are not subject to the page's
 * CSP, which forbids inline script.
 */
export const GAME_PLAYER_BRIDGE_SCRIPT = `(function () {
  var post = function (message) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (error) { /* bridge gone */ }
  };
  var webgl2 = false;
  try { webgl2 = !!document.createElement('canvas').getContext('webgl2'); } catch (error) { webgl2 = false; }
  post({ type: 'capabilities', webgl2: webgl2, webgpu: !!navigator.gpu, secureContext: !!window.isSecureContext });
  window.addEventListener('error', function (event) { post({ type: 'error', message: String(event.message || 'Script error') }); });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    post({ type: 'error', message: String((reason && reason.message) || reason || 'Unhandled rejection') });
  });
  var lastStatus = null;
  var lastLandscape = null;
  var ready = false;
  var watch = function () {
    var status = document.getElementById('status');
    var text = status ? String(status.textContent || '').trim() : '';
    if (text && text !== lastStatus) { lastStatus = text; post({ type: 'status', text: text.slice(0, 500) }); }
    // The player sets the layout class from its first frame, so the layout is only final once it is ready.
    if (!ready) { return; }
    var landscape = !!(document.body && document.body.classList.contains('landscape-game'));
    if (landscape !== lastLandscape) { lastLandscape = landscape; post({ type: 'layout', landscape: landscape }); }
  };
  var readyTimer = setInterval(function () {
    if (window.nativeGamePlayer) { clearInterval(readyTimer); ready = true; watch(); post({ type: 'ready' }); return; }
    watch();
  }, 250);
  document.addEventListener('DOMContentLoaded', function () {
    watch();
    new MutationObserver(watch).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  });
})();
true;`;

/**
 * Pauses the game, which also suspends its audio, and releases held inputs.
 * The player's blur handler lets go of every key, touch stick and button, so
 * no control is stuck down when the app comes back.
 */
export const GAME_PLAYER_PAUSE_SCRIPT = `(function () {
  try { if (window.nativeGamePlayer) { window.nativeGamePlayer.pause(); } } catch (error) { /* not started */ }
  window.dispatchEvent(new Event('blur'));
})();
true;`;

const bridgeMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('capabilities'),
    webgl2: z.boolean(),
    webgpu: z.boolean(),
    secureContext: z.boolean(),
  }),
  z.object({ type: z.literal('status'), text: z.string().max(500) }),
  z.object({ type: z.literal('layout'), landscape: z.boolean() }),
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('error'), message: z.string().transform((text) => text.slice(0, 500)) }),
]);

export type GamePlayerBridgeMessage = z.infer<typeof bridgeMessage>;

/** One message from the page, or null for anything outside the contract. */
export function parseGamePlayerMessage(data: string): GamePlayerBridgeMessage | null {
  if (data.length > 4096) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  const parsed = bridgeMessage.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The directory every file of one play session lives under, as an absolute
 * URL: `https://host/api/game-play/<token>/`. Null when the server answered a
 * path of another shape, so the screen never opens a page it did not ask for.
 */
export function gamePlayBaseUrl(apiHost: string, path: string): string | null {
  const match = /^\/api\/game-play\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/index\.html$/.exec(path);
  if (!match) {
    return null;
  }
  let origin: string;
  try {
    const host = new URL(apiHost);
    if (host.protocol !== 'https:' && host.protocol !== 'http:') {
      return null;
    }
    origin = host.origin;
  } catch {
    return null;
  }
  return `${origin}/api/game-play/${match[1]}/`;
}

/**
 * Whether the web view may load `url`: the session's own files, and the blank
 * page it starts on. Every other navigation — a link, a redirect, a script
 * assigning `location` — is refused.
 */
export function isGamePlayUrl(url: string, baseUrl: string): boolean {
  if (url === 'about:blank') {
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const base = new URL(baseUrl);
  if (parsed.origin !== base.origin || !parsed.pathname.startsWith(base.pathname)) {
    return false;
  }
  // `URL` has already resolved dot segments, so the prefix check above holds for the resolved path.
  return parsed.username === '' && parsed.password === '';
}

/** What the screen tells a player who cannot run this game on this device. */
export function unsupportedReason(
  dimension: '2d' | '3d',
  capabilities: { webgl2: boolean; secureContext: boolean }
): string | null {
  if (!capabilities.secureContext) {
    return 'The game player needs a secure connection. Connect to the server over HTTPS to play on this device.';
  }
  if (dimension === '3d' && !capabilities.webgl2) {
    return "This 3D game needs WebGL2, which this device's web view does not provide. Play it in the desktop or web app.";
  }
  return null;
}
