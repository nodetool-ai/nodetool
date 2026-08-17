import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SdkV1Requirement } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type { SdkV1RequirementAvailability } from "./sdk-static-preflight-service.js";

const execFileAsync = promisify(execFile);
const NODE_RUNTIMES = new Set(["node", "nodejs", "javascript", "typescript"]);
const EXECUTABLE_RUNTIMES = new Map([
  ["ffmpeg", "ffmpeg"],
  ["ffprobe", "ffprobe"]
]);

interface CreateNodeToolSdkV1RuntimeProbeOptions {
  getPythonBridgeReady: () => boolean;
  hasExecutable?: (command: string) => Promise<boolean>;
}

async function defaultHasExecutable(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ["-version"], {
      timeout: 2_000,
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
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
  const hasExecutable = options.hasExecutable ?? defaultHasExecutable;

  return async (requirement) => {
    const runtime = requirement.id.trim().toLowerCase();
    if (NODE_RUNTIMES.has(runtime)) {
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

    const executable = EXECUTABLE_RUNTIMES.get(runtime);
    if (executable) {
      return (await hasExecutable(executable))
        ? { status: "available", message: null }
        : {
            status: "missing",
            message: `The ${runtime} runtime is not installed or not on PATH.`
          };
    }

    return {
      status: "unknown",
      message: "Runtime availability has not been checked."
    };
  };
}
