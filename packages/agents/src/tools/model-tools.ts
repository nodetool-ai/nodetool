/**
 * `list_provider_models` — the language models one provider offers.
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
import { listProviderModels } from "../capabilities/models.js";

export class ListProviderModelsTool extends CapabilityTool {
  constructor(providers: Record<string, BaseProvider>) {
    super(listProviderModels.spec, listProviderModels.impl, (context) =>
      createCapabilityRun({ context, gate: UNGATED, providers })
    );
  }
}
