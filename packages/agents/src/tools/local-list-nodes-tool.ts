/**
 * LocalListNodesTool -- list available node types from the registry.
 *
 * A thin subclass now: the implementation lives in the `nodes` capability
 * module (`../capabilities/nodes.ts`), and the registry this took as a
 * constructor argument is stored on the run the wrapper builds.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import { listNodes } from "../capabilities/nodes.js";

/**
 * @deprecated Ported to the `nodes` capability module
 * (`../capabilities/nodes.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class LocalListNodesTool extends CapabilityTool {
  constructor(registry: NodeRegistry) {
    super(listNodes.spec, listNodes.impl, (context: ProcessingContext) =>
      createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry })
    );
  }
}
