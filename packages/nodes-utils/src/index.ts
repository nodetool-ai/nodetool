/**
 * @nodetool-ai/nodes-utils — shared helpers for every `*-nodes` package.
 *
 * A few small concerns live here so each per-domain package can depend on
 * a single utility crate instead of duplicating these helpers or pulling
 * the entire base-nodes barrel just to access them:
 *
 *   - `platform-tags.ts` — `tagAsServer` / `tagAsHybrid` / `tagAsUniversal`
 *     helpers that stamp `static platforms` on `_NODES` arrays.
 *   - `node-only-modules.ts` — lazy loaders for `node:fs` / `node:path` /
 *     etc. so non-portable code paths don't block module init on
 *     non-Node runtimes.
 *   - `template.ts` — `{{ variable }}` / `{variable}` substitution shared by
 *     the Prompt, Format Text and Agent nodes.
 *   - `base64.ts` — Buffer-free base64 encode/decode usable in Node and the
 *     browser bundle alike.
 *   - `file-watch-match.ts` — glob matching + debounce shared by the
 *     `FileWatchTrigger` node and the host-owned file-watch adapter.
 */

export {
  tagAsServer,
  tagAsNode,
  tagAsHybrid,
  tagAsBrowserGpu,
  tagAsUniversal,
  tagAsContentCard
} from "./platform-tags.js";

export {
  loadNodeFsPromises,
  loadNodeFsSync,
  loadNodePath,
  loadNodeOs,
  loadNodeUrl
} from "./node-only-modules.js";

export { renderTemplate, referencedVariables } from "./template.js";

export { base64ToBytes, bytesToBase64 } from "./base64.js";

export {
  matchesGlob,
  shouldProcessFile,
  EventDebouncer
} from "./file-watch-match.js";
