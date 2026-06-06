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
