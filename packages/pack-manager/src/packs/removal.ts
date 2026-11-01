import type { InstallAuthorization } from "../commands/pack-install-authorization.js";
import { DEFAULT_INSTALLER_OPERATIONS, runPackTransaction, type InstallerOperations } from "./installer.js";
import type { InstallPacksRequest, DesiredPackState } from "./install-selection.js";

export interface PackRemovalResult { readonly desired: DesiredPackState; readonly removed: readonly string[]; readonly kept: readonly string[]; readonly restartRequired: true }

/**
 * Remove packs and runtime libraries from the requested selection. npm drops
 * whatever no remaining selection needs. A pack another selection requires stays.
 */
export async function removePacks(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations = DEFAULT_INSTALLER_OPERATIONS): Promise<PackRemovalResult> {
  const { desired, selection } = await runPackTransaction(request, authorization, operations, "remove");
  return { desired, removed: selection.removed, kept: selection.kept, restartRequired: true };
}
