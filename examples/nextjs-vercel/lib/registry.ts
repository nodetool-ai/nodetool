/**
 * Build the NodeRegistry this deployment can execute.
 *
 * The workflow runner is node-set-agnostic — you choose which nodes ship with
 * your deployment. We import node groups from their **per-file subpaths**
 * (`@nodetool-ai/core-nodes/nodes/*`), never the package index: the index
 * re-exports `VECTOR_NODES`, which pulls in `sqlite-vec` / `better-sqlite3`
 * native bindings that can't bundle for a serverless runtime.
 *
 * Every core group below is tagged `tagAsUniversal`, so it declares support for
 * the `node`, `workers`, and `edge` platforms. `forPlatform(platform)` keeps
 * only the nodes valid for the deployment target; the runner then rejects any
 * graph that references an unsupported node type before it executes a single
 * actor.
 */
import { NodeRegistry, type NodeClass } from "@nodetool-ai/node-sdk";
import type { Platform } from "@nodetool-ai/protocol";

import { COMPARE_NODES } from "@nodetool-ai/core-nodes/nodes/compare";
import { CONSTANT_NODES } from "@nodetool-ai/core-nodes/nodes/constant";
import { CONTROL_NODES } from "@nodetool-ai/core-nodes/nodes/control";
import { INPUT_NODES } from "@nodetool-ai/core-nodes/nodes/input";
import { LIB_DATETIME_NODES } from "@nodetool-ai/core-nodes/nodes/lib-datetime";
import { LIB_VALIDATE_NODES } from "@nodetool-ai/core-nodes/nodes/lib-validate";
import { LIST_NODES } from "@nodetool-ai/core-nodes/nodes/list";

// OpenAI nodes (WebSearch, Moderation, Embedding, image/audio, …). Tagged
// `tagAsServer` (node + workers + edge). Each declares its `requiredSettings`
// (e.g. OPENAI_API_KEY), which the runtime resolves from the request context's
// secret resolver before `process()` — see the route's `createContext` hook.
// This subpath imports cleanly (no native keychain/`agents` chain); only
// included when `includeLlm` is set so the default registry stays key-free.
import { OPENAI_NODES } from "@nodetool-ai/llm-nodes/openai";

/**
 * The pure-JS, dependency-light node set this example ships. No native modules,
 * no `child_process`, no filesystem — safe for any serverless/edge runtime.
 */
export const EDGE_SAFE_NODES: readonly NodeClass[] = [
  ...CONSTANT_NODES,
  ...LIST_NODES,
  ...COMPARE_NODES,
  ...CONTROL_NODES,
  ...INPUT_NODES,
  ...LIB_VALIDATE_NODES,
  ...LIB_DATETIME_NODES
];

export interface RegistryOptions {
  /** Also register the LLM/agent nodes (needs a provider key at run time). */
  includeLlm?: boolean;
}

/** A NodeRegistry scoped to the nodes that support `platform`. */
export function createEdgeRegistry(
  platform: Platform,
  opts: RegistryOptions = {}
): NodeRegistry {
  const classes: readonly NodeClass[] = opts.includeLlm
    ? [...EDGE_SAFE_NODES, ...OPENAI_NODES]
    : EDGE_SAFE_NODES;

  const registry = new NodeRegistry();
  for (const nodeClass of classes) {
    if (!nodeClass?.nodeType) continue;
    registry.register(nodeClass);
  }
  return registry.forPlatform(platform);
}
