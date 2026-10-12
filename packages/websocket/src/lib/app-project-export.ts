/**
 * Export an application as a standalone JavaScript project, zipped.
 *
 * The bundle comes from the same path as `export-bundle`; the project itself
 * is built by `@nodetool-ai/app-export`. This module adds what only the
 * server knows: the node registry (which credentials the graphs need), the
 * provider keys, and where the `package://` sample files live.
 */
import { strToU8, zipSync } from "fflate";
import { parseApplicationBundle } from "@nodetool-ai/app-runtime";
import {
  buildStandaloneProject,
  packageAssetUris,
  readPackageAssets,
  requiredSecretNames
} from "@nodetool-ai/app-export";
import {
  getProviderSecretKey,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import {
  getWorkflowRuntimeEnvironment,
  type HttpApiOptions
} from "../http-api.js";
import { exportApplicationBundle } from "./applications-service.js";

export interface ApplicationProjectZip {
  /** `<project-name>.zip`. */
  fileName: string;
  /** Every project file under a `<project-name>/` folder. */
  zip: Uint8Array;
  warnings: string[];
}

export async function exportApplicationProject(
  userId: string,
  id: string,
  apiOptions: HttpApiOptions,
  options: { released?: boolean } = {}
): Promise<ApplicationProjectZip> {
  const bundle = parseApplicationBundle(
    await exportApplicationBundle(userId, id, options)
  );
  if (!bundle) {
    throwApiError(ApiErrorCode.INTERNAL_ERROR, "Application could not be bundled");
  }
  const registry =
    apiOptions.registry ??
    (await getWorkflowRuntimeEnvironment(apiOptions)).registry;
  const project = buildStandaloneProject(bundle, {
    secrets: requiredSecretNames(bundle, registry, getProviderSecretKey),
    providerSecrets: listRegisteredProviderIds()
      .map(getProviderSecretKey)
      .filter((key): key is string => Boolean(key)),
    packageAssets: readPackageAssets(
      packageAssetUris(bundle),
      apiOptions.packageAssetsRoots ?? []
    )
  });
  const entries: Record<string, Uint8Array> = {};
  for (const file of project.files) {
    entries[`${project.name}/${file.path}`] =
      typeof file.content === "string" ? strToU8(file.content) : file.content;
  }
  return {
    fileName: `${project.name}.zip`,
    zip: zipSync(entries),
    warnings: project.warnings
  };
}
