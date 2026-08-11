/**
 * `find_model` — pick a real {provider, model_id} for a generic AI node.
 *
 * @deprecated Ported to the `models` capability module
 * (`../capabilities/models.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
import type { BaseProvider } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import { findModel } from "../capabilities/models.js";

export class FindModelTool extends CapabilityTool {
  constructor(providers: Record<string, BaseProvider>) {
    super(findModel.spec, findModel.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED, providers })
    );
  }
}
