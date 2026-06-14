/**
 * Platform tagging helpers for base-nodes.
 *
 * `tagAsServer(classes)` stamps `static platforms = SERVER_PLATFORMS` on
 * every class in a registration array — declaring support for `node`,
 * `workers`, and `edge` but **not** `browser`. This is the right default
 * for nodes that make outbound HTTP calls or read env secrets (most LLM,
 * HTTP, search, and integration nodes) — they can't be safely shipped to
 * a browser tab without a separate CORS/secrets story.
 *
 * `tagAsHybrid(classes)` stamps `["node", "browser"]` — for nodes with a
 * Node execution path AND a browser one but no V8-isolate path, typical
 * of WebGPU shader nodes (Workers and Edge runtimes lack WebGPU).
 *
 * `tagAsUniversal(classes)` stamps `ALL_PLATFORMS` — for nodes that
 * genuinely work on every runtime including the browser. Use sparingly:
 * the node must handle CORS / secret-exposure / bundle-size implications
 * itself.
 *
 * All three helpers leave alone any class that already declares its own
 * `static platforms` — per-class overrides always win. The mutation is a
 * one-time `Object.defineProperty` at module load.
 */

import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  ALL_PLATFORMS,
  NODE_AND_BROWSER_PLATFORMS,
  SERVER_PLATFORMS,
  type Platform
} from "@nodetool-ai/protocol";

function tagWith<T extends readonly NodeClass[]>(
  classes: T,
  platforms: readonly Platform[]
): T {
  for (const cls of classes) {
    if (cls.platforms !== undefined) continue;
    Object.defineProperty(cls, "platforms", {
      value: platforms,
      writable: false,
      configurable: true,
      enumerable: true
    });
  }
  return classes;
}

/** Tag every class in `classes` as supporting node + workers + edge. */
export function tagAsServer<T extends readonly NodeClass[]>(classes: T): T {
  return tagWith(classes, SERVER_PLATFORMS);
}

/**
 * Tag every class in `classes` as supporting node + browser (no V8 server
 * isolates). Use for WebGPU / Canvas / DOM-backed nodes that have both a
 * Node fallback and a browser-native execution path.
 */
export function tagAsHybrid<T extends readonly NodeClass[]>(classes: T): T {
  return tagWith(classes, NODE_AND_BROWSER_PLATFORMS);
}

/**
 * Tag every class in `classes` as supporting every defined platform.
 * Reserve for pure-JS nodes with no network calls, no secrets, and no
 * platform-specific side effects (e.g. text/data transforms).
 */
export function tagAsUniversal<T extends readonly NodeClass[]>(classes: T): T {
  return tagWith(classes, ALL_PLATFORMS);
}

/**
 * Like {@link tagAsHybrid} (node + browser) but additionally marks the classes
 * as requiring a WebGPU device in the browser. WebGPU shader nodes use this so
 * the in-browser runner routes graphs containing them to the server — where a
 * GPU is always available via Dawn — when `navigator.gpu` is missing, instead
 * of failing the run. Server execution is unchanged.
 *
 * `requiresGpu` is stamped only on classes that end up browser-capable: a class
 * already tagged server keeps its platforms and is left unmarked (it can't run
 * in the browser anyway). Per-class `static requiresGpu` overrides win.
 */
export function tagAsBrowserGpu<T extends readonly NodeClass[]>(classes: T): T {
  const tagged = tagWith(classes, NODE_AND_BROWSER_PLATFORMS);
  for (const cls of tagged) {
    const platforms = (cls as { platforms?: readonly Platform[] }).platforms;
    if (!platforms?.includes("browser")) continue;
    if ((cls as { requiresGpu?: unknown }).requiresGpu !== undefined) continue;
    Object.defineProperty(cls, "requiresGpu", {
      value: true,
      writable: false,
      configurable: true,
      enumerable: true
    });
  }
  return tagged;
}

/**
 * Stamp `static body = "content_card"` on every class in `classes` so the
 * editor renders them as a media content card (the image/video/audio preview
 * body) instead of the generic input/output layout. Leaves any class that
 * already declares its own `static body` alone — per-class overrides win.
 *
 * Apply to media-output node groups, composing with a platform tagger:
 * `tagAsHybrid(tagAsContentCard([...]))`.
 */
export function tagAsContentCard<T extends readonly NodeClass[]>(classes: T): T {
  for (const cls of classes) {
    if ((cls as { body?: unknown }).body !== undefined) continue;
    Object.defineProperty(cls, "body", {
      value: "content_card",
      writable: false,
      configurable: true,
      enumerable: true
    });
  }
  return classes;
}
