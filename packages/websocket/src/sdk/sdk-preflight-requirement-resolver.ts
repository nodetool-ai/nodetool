import { Asset, getSecret } from "@nodetool-ai/models";
import {
  isProviderConfigured,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { SdkV1RequirementResolver } from "./sdk-preflight-orchestrator.js";
import type { SdkV1RequirementAvailability } from "./sdk-static-preflight-service.js";

type RequirementKind = SdkV1Requirement["kind"];
type RequirementProbe = (
  requirement: Readonly<SdkV1Requirement>
) => Promise<SdkV1RequirementAvailability> | SdkV1RequirementAvailability;

/**
 * Just enough of an asset row for a preflight check: the resolver only asks
 * whether the asset exists.
 */
interface AssetIdentity {
  id: string;
}

export interface CreateNodeToolSdkV1RequirementResolverOptions {
  userId: string;
  /**
   * Optional probes for readiness that is deployment-specific or potentially
   * expensive. They must be read-only and must not download a model, provision
   * a worker, reserve capacity, or contact a paid inference operation.
   */
  probes?: Partial<Record<RequirementKind, RequirementProbe>>;
  getCredential?: (userId: string, key: string) => Promise<string | null>;
  findAsset?: (
    userId: string,
    assetId: string
  ) => Promise<AssetIdentity | null>;
  listProviderIds?: () => readonly string[];
  isProviderReady?: (userId: string, providerId: string) => Promise<boolean>;
}

function unknown(message: string): SdkV1RequirementAvailability {
  return { status: "unknown", message };
}

/**
 * Creates NodeTool's read-only availability resolver.
 *
 * Credentials, providers, and assets reuse the same stores and provider
 * registry as normal execution. Other requirement kinds stay unknown unless
 * the server bootstrap supplies an authoritative probe.
 */
export function createNodeToolSdkV1RequirementResolver(
  options: CreateNodeToolSdkV1RequirementResolverOptions
): SdkV1RequirementResolver {
  const getCredential =
    options.getCredential ??
    ((userId: string, key: string) => getSecret(key, userId));
  const findAsset =
    options.findAsset ??
    ((userId: string, assetId: string) => Asset.find(userId, assetId));
  const listProviderIds =
    options.listProviderIds ?? (() => listRegisteredProviderIds());
  const isProviderReady =
    options.isProviderReady ??
    ((userId: string, providerId: string) =>
      isProviderConfigured(providerId, (key) =>
        getCredential(userId, key).then((value) => value ?? undefined)
      ));

  return async (requirement) => {
    const customProbe = options.probes?.[requirement.kind];
    if (customProbe) return customProbe(requirement);

    switch (requirement.kind) {
      case "credential":
        return (await getCredential(options.userId, requirement.id))
          ? { status: "available", message: null }
          : {
              status: "missing",
              message: "Required credential is not configured."
            };
      case "provider": {
        if (!listProviderIds().includes(requirement.id)) {
          return {
            status: "unavailable",
            message: "Required provider is not registered."
          };
        }
        return (await isProviderReady(options.userId, requirement.id))
          ? { status: "available", message: null }
          : {
              status: "missing",
              message: "Required provider is not configured."
            };
      }
      case "asset":
        return (await findAsset(options.userId, requirement.id))
          ? { status: "available", message: null }
          : {
              status: "missing",
              message: "Required asset was not found."
            };
      case "model":
        return unknown("Model availability has not been checked.");
      case "runtime":
        return unknown("Runtime availability has not been checked.");
      case "node_pack":
        return unknown("Node package availability has not been checked.");
      case "worker":
        return unknown("Worker availability has not been checked.");
      case "approval":
        return unknown("Approval status has not been checked.");
    }
  };
}
