/**
 * LocalGetNodeInfoTool -- get full metadata for a specific node type.
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
import { getNodeInfo } from "../capabilities/nodes.js";

/**
 * @deprecated Ported to the `nodes` capability module
 * (`../capabilities/nodes.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class LocalGetNodeInfoTool extends CapabilityTool {
  constructor(registry: NodeRegistry) {
    super(getNodeInfo.spec, getNodeInfo.impl, (context: ProcessingContext) =>
      createCapabilityRun({ context, gate: UNGATED, nodeRegistry: registry })
    );
  }
}
