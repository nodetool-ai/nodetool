import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { SdkV1RequirementAvailability } from "./sdk-static-preflight-service.js";

interface CreateNodeToolSdkV1NodePackageProbeOptions {
  userId: string;
  timeoutMs?: number;
  /**
   * Reads the authoritative installed-package inventory for this principal.
   * It must not install, enable, import, or download packages.
   */
  listInstalledPackageIds: (
    userId: string
  ) => Promise<readonly string[]> | readonly string[];
}

function withTimeout<T>(
  value: Promise<T> | T,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Node package inventory probe timed out.")),
      timeoutMs
    );
    timer.unref?.();
    Promise.resolve(value).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Checks an explicitly-derived package id against a local inventory.
 *
 * Package ids are exact opaque identities. This probe deliberately performs no
 * namespace matching and cannot install or activate a package.
 */
export function createNodeToolSdkV1NodePackageProbe(
  options: CreateNodeToolSdkV1NodePackageProbeOptions
): (
  requirement: Readonly<SdkV1Requirement>
) => Promise<SdkV1RequirementAvailability> {
  const timeoutMs = options.timeoutMs ?? 5_000;

  return async (requirement) => {
    try {
      const installedIds = await withTimeout(
        options.listInstalledPackageIds(options.userId),
        timeoutMs
      );
      const installed = new Set(
        installedIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean)
      );
      return installed.has(requirement.id)
        ? { status: "available", message: null }
        : {
            status: "missing",
            message: "Required node package is not installed."
          };
    } catch {
      return {
        status: "unknown",
        message: "Node package inventory could not be checked."
      };
    }
  };
}
