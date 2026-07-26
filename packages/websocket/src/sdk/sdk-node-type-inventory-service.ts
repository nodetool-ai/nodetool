import {
  buildNodeTypeInventory,
  type NodePackAvailabilityDiagnostic,
  type NodeRegistry,
  type NodeTypeInventory
} from "@nodetool-ai/node-sdk";
import {
  sdkNodeTypeInventoryOutput,
  type SdkNodeTypeInventoryInput
} from "@nodetool-ai/protocol/api-schemas/nodes.js";
import { getUnavailableBuiltinPackDiagnostics } from "../node-registry-setup.js";
import { getPackSnapshot } from "../pack-snapshot.js";
import { isSdkWorkflowInterfaceV1Enabled } from "./sdk-feature-flags.js";

export class SdkNodeTypeInventoryServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SdkNodeTypeInventoryServiceError";
  }
}

function unavailablePackDiagnostics(): NodePackAvailabilityDiagnostic[] {
  const builtins = getUnavailableBuiltinPackDiagnostics();
  const installed = getPackSnapshot()
    .filter((result) => result.status !== "loaded")
    .map((result) => ({
      id: result.pack.name,
      name: result.pack.name,
      reason: result.reason ?? result.status
    }));
  return [...builtins, ...installed]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 100);
}

export function getSdkNodeTypeInventory(args: {
  registry: NodeRegistry;
  pythonBridgeReady: boolean;
  input: SdkNodeTypeInventoryInput;
}): NodeTypeInventory {
  if (!isSdkWorkflowInterfaceV1Enabled()) {
    throw new SdkNodeTypeInventoryServiceError(
      "SDK node/type inventory v1 is disabled"
    );
  }
  return sdkNodeTypeInventoryOutput.parse(
    buildNodeTypeInventory(args.registry, {
      cursor: args.input.cursor,
      limit: args.input.limit,
      pythonBridgeReady: args.pythonBridgeReady,
      unavailablePacks: unavailablePackDiagnostics()
    })
  );
}
