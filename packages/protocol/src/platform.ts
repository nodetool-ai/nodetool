/**
 * Deployment platform tags for nodes.
 *
 * A node declares the set of runtimes it supports via `static platforms` on
 * its class. The registry filters by platform at bundle time, and the
 * workflow runner enforces it at run time.
 *
 * Semantics:
 *   - "node"    Full Node.js runtime. Native modules, subprocess, sync FS.
 *               Electron, RunPod, Vercel Node functions, plain VMs.
 *   - "workers" V8 isolate with Cloudflare's nodejs_compat_v2 shim. Async FS
 *               polyfill, node:crypto, no native modules, no subprocess.
 *               Cloudflare Workers + Durable Objects.
 *   - "edge"    V8 isolate, Web APIs only. Strictest server runtime. Vercel
 *               Edge Runtime, Deno Deploy. No WebGPU, no DOM.
 *   - "browser" V8 isolate with browser APIs: WebGPU, DOM, Canvas, IndexedDB.
 *               Distinct from "edge" — browsers and Edge runtimes have
 *               disjoint API surfaces (WebGPU vs no-WebGPU, DOM vs no-DOM).
 *               Used for nodes that ship a browser execution path, e.g.
 *               WebGPU shader filters for in-editor real-time preview.
 *
 * A node lists every target it actually works on. The empty list is not
 * permitted; the unset default is ["node"] (most restrictive — opt-in to
 * broader portability).
 */

export type Platform = "node" | "workers" | "edge" | "browser";

/** Literally every defined platform — all 4. */
export const ALL_PLATFORMS: readonly Platform[] = [
  "node",
  "workers",
  "edge",
  "browser"
] as const;

/**
 * Every server-shaped runtime — Node plus the two V8-isolate server
 * targets. Excludes "browser" because most server-portable nodes can't
 * cross into a browser tab unmodified (CORS, no env secrets, etc.).
 */
export const SERVER_PLATFORMS: readonly Platform[] = [
  "node",
  "workers",
  "edge"
] as const;

/**
 * Hybrid set for nodes that have a Node execution path AND a browser one,
 * but no Workers/Edge path — typical of WebGPU-backed nodes (Workers and
 * Edge runtimes lack WebGPU).
 */
export const NODE_AND_BROWSER_PLATFORMS: readonly Platform[] = [
  "node",
  "browser"
] as const;

export const DEFAULT_PLATFORMS: readonly Platform[] = ["node"] as const;

/**
 * Normalize a platforms input to a non-empty list. Falsy or empty values
 * collapse to {@link DEFAULT_PLATFORMS}.
 */
export function normalizePlatforms(
  value: readonly Platform[] | undefined | null
): readonly Platform[] {
  if (!value || value.length === 0) return DEFAULT_PLATFORMS;
  return value;
}

/** True iff `platforms` declares support for `target`. */
export function supportsPlatform(
  platforms: readonly Platform[] | undefined | null,
  target: Platform
): boolean {
  return normalizePlatforms(platforms).includes(target);
}

