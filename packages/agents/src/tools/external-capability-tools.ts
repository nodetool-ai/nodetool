/**
 * Apify and SerpAPI agent tools — the two capability modules that talk to a
 * paid third-party service and have no `nodetool.*` namespace of their own.
 *
 * Both modules were reachable only by import
 * (`@nodetool-ai/sandbox-nodetool/apify`) until they sat on the belt. That was
 * a discoverability hole: `nodetool.searchTools("apify")` searches the belt,
 * so a chat asked to "download via Apify" found `web_search` and nothing else,
 * and the sandbox-package prompt says every specifier not listed fails. On the
 * belt they are found by name, listed in the catalog, and gated by
 * `gateTools` like every other tool.
 *
 * The implementations live in `../capabilities/apify.ts` and `serpapi.ts` and
 * arrive through the registry's eager spec table: each name becomes a `Tool`
 * whose spec is read synchronously and whose implementation loads at first
 * call. Neither is gated on configuration — a missing token is reported at
 * call time by the module, naming the secret to set, which is more useful to
 * the user than a tool that silently does not exist.
 *
 * `run` matters for Apify: in `discovery` mode the actor policy asks the run's
 * gate to approve an actor the install has not allowlisted. A host with a
 * permission gate passes a run source that carries it; the default ungated
 * run auto-approves that second question, so it is right only where the host
 * has no prompt to show (the MCP bridge).
 */

import type { Tool } from "./base-tool.js";
import { apifySpecs } from "../capabilities/apify.specs.js";
import { serpApiSpecs } from "../capabilities/serpapi.specs.js";
import type { CapabilityRunSource } from "../capabilities/adapters.js";
import { toolFromLazyCapability } from "../capabilities/lazy-tool.js";

/** Every Apify tool name, in registry order. */
export const APIFY_TOOL_NAMES: readonly string[] = apifySpecs.map(
  (spec) => spec.name
);

/** Every SerpAPI tool name, in registry order. */
export const SERPAPI_TOOL_NAMES: readonly string[] = serpApiSpecs.map(
  (spec) => spec.name
);

/** One fresh instance per Apify tool. */
export function getApifyTools(run?: CapabilityRunSource): Tool[] {
  return apifySpecs.map((spec) => toolFromLazyCapability(spec, run));
}

/** One fresh instance per SerpAPI tool. */
export function getSerpApiTools(run?: CapabilityRunSource): Tool[] {
  return serpApiSpecs.map((spec) => toolFromLazyCapability(spec, run));
}
