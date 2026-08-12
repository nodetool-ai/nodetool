/**
 * The process-wide JS script resolver.
 *
 * A Code node with a `script` link needs the pinned version's document, and a
 * node cannot reach the database: it gets a {@link ProcessingContext}. This is
 * the same seam `SandboxModuleCatalog` uses — the host that owns the database
 * installs one resolver at startup, and every context built afterwards falls
 * back to it unless its constructor was handed something else.
 *
 * The interface itself lives in `@nodetool-ai/protocol` so the models layer can
 * implement it without depending on this package.
 */
import type { JsScriptResolver } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

let processResolver: JsScriptResolver | null = null;

/**
 * Install the resolver every {@link ProcessingContext} in this process falls
 * back to. A caller that passes `jsScriptResolver` explicitly — including
 * `null` — always wins.
 */
export function setProcessJsScriptResolver(
  resolver: JsScriptResolver | null
): void {
  processResolver = resolver;
}

/** The process-wide resolver, or null when no host installed one. */
export function getProcessJsScriptResolver(): JsScriptResolver | null {
  return processResolver;
}
