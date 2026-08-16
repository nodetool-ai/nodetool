import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { getMaxUploadBytes } from "@nodetool-ai/storage";
import {
  buildSdkV1Capabilities,
  type SdkV1CapabilityLimits,
  type SdkV1ProfileStatus,
  type SdkV1PythonBridgeStatus
} from "./sdk-capabilities-service.js";
import { isFunctionValue } from "../lib/wire-values.js";

type Resolvable<T> = T | (() => T);

export interface CreateNodeToolSdkV1CapabilitiesProviderOptions {
  nodetoolVersion: string;
  registry: Pick<NodeRegistry, "revision">;
  pythonBridge: Resolvable<SdkV1PythonBridgeStatus>;
  profiles: Resolvable<Readonly<Record<string, SdkV1ProfileStatus>>>;
  authModes: Resolvable<ReadonlyArray<"trusted_local" | "bearer">>;
  assetUriSchemes: Resolvable<readonly string[]>;
  /**
   * Every advertised limit must already be enforced by the current transport
   * or lifecycle service. The upload limit may be omitted because NodeTool's
   * storage layer exposes its authoritative configured value.
   */
  limits: Omit<SdkV1CapabilityLimits, "maxUploadBytes"> & {
    maxUploadBytes?: number;
  };
  now?: () => Date;
  getConfiguredMaxUploadBytes?: () => number;
}

function resolve<T>(value: Resolvable<T>): T {
  return isFunctionValue(value) ? (value as () => T)() : value;
}

/**
 * Composes the public capability document from live server state.
 *
 * The returned function reads dynamic values on every invocation, so registry
 * reloads, Python bridge transitions, and profile changes do not leave clients
 * with a snapshot captured at server startup. This remains transport-neutral.
 */
export function createNodeToolSdkV1CapabilitiesProvider(
  options: CreateNodeToolSdkV1CapabilitiesProviderOptions
) {
  const getConfiguredMaxUploadBytes =
    options.getConfiguredMaxUploadBytes ?? getMaxUploadBytes;

  return () =>
    buildSdkV1Capabilities({
      nodetoolVersion: options.nodetoolVersion,
      registryRevision: options.registry.revision,
      pythonBridge: resolve(options.pythonBridge),
      profiles: resolve(options.profiles),
      authModes: resolve(options.authModes),
      assetUriSchemes: resolve(options.assetUriSchemes),
      limits: {
        ...options.limits,
        maxUploadBytes:
          options.limits.maxUploadBytes ?? getConfiguredMaxUploadBytes()
      },
      now: options.now?.()
    });
}
