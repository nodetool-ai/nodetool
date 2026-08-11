/**
 * `list_models` — enumerate the models the configured providers offer.
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
import { listModels } from "../capabilities/models.js";

export class ListModelsTool extends CapabilityTool {
  constructor(providers: Record<string, BaseProvider>) {
    super(listModels.spec, listModels.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED, providers })
    );
  }
}
