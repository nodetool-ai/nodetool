import {
  createPackCommandServices as createCoreServices,
  type PackCommandServiceOptions
} from "@nodetool-ai/pack-manager/packs/command-service";
import { resolveWorkflowPacks } from "../workflow-packs.js";
export async function createPackCommandServices(
  options: PackCommandServiceOptions = {}
) {
  return createCoreServices({
    ...options,
    resolveWorkflowPacks: (target, snapshot, catalog) =>
      resolveWorkflowPacks(target, snapshot, catalog, options.catalogNodes)
  });
}
