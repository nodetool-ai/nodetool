import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { SdkV1RequirementAvailability } from "./sdk-static-preflight-service.js";

/**
 * Runtimes the server carries itself: Node, and libav (node-av), which stands
 * in for the ffmpeg and ffprobe binaries older requirements name.
 */
const BUILT_IN_RUNTIMES = new Set([
  "node",
  "nodejs",
  "javascript",
  "typescript",
  "ffmpeg",
  "ffprobe"
]);

interface CreateNodeToolSdkV1RuntimeProbeOptions {
  getPythonBridgeReady: () => boolean;
}

/**
 * Checks only locally authoritative runtime state. It never installs software,
 * starts a model download, provisions a worker, or calls an inference API.
 */
export function createNodeToolSdkV1RuntimeProbe(
  options: CreateNodeToolSdkV1RuntimeProbeOptions
): (
  requirement: Readonly<SdkV1Requirement>
) => Promise<SdkV1RequirementAvailability> {
  return async (requirement) => {
    const runtime = requirement.id.trim().toLowerCase();
    if (BUILT_IN_RUNTIMES.has(runtime)) {
      return { status: "available", message: null };
    }
    if (runtime === "python") {
      return options.getPythonBridgeReady()
        ? { status: "available", message: null }
        : {
            status: "unavailable",
            message: "The Python runtime is not ready."
          };
    }

    return {
      status: "unknown",
      message: "Runtime availability has not been checked."
    };
  };
}
