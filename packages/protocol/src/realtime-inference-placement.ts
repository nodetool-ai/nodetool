import type { RealtimeNodeProfile } from "./graph.js";
import type {
  RealtimeInferenceBackend,
  RealtimeInferenceEngine,
  RealtimeInferencePlacement
} from "./messages.js";

export type RealtimeInferenceRuntimeOwner =
  | "operator"
  | "desktop"
  | "node"
  | "worker";

export interface RealtimeInferencePlacementDefinition {
  placement: RealtimeInferencePlacement;
  owner: RealtimeInferenceRuntimeOwner;
  description: string;
  allowedEngines: readonly RealtimeInferenceEngine[];
  allowedBackends: readonly RealtimeInferenceBackend[];
  requiresBrowserCapability: boolean;
}

export interface RealtimeInferencePlacementValidationInput {
  placement: RealtimeInferencePlacement;
  engine: RealtimeInferenceEngine;
  backend: RealtimeInferenceBackend;
  profile?: RealtimeNodeProfile | null;
}

export interface RealtimeInferencePlacementValidationResult {
  valid: boolean;
  reasons: string[];
}

export const REALTIME_INFERENCE_PLACEMENTS: Record<
  RealtimeInferencePlacement,
  RealtimeInferencePlacementDefinition
> = {
  operator_browser: {
    placement: "operator_browser",
    owner: "operator",
    description:
      "Runs in the remote operator's browser using browser APIs, local browser caches, and WebRTC/media capture.",
    allowedEngines: ["tfjs", "transformersjs", "mediapipe", "custom"],
    allowedBackends: ["webgpu", "wasm", "webgl", "cpu", "unknown"],
    requiresBrowserCapability: true
  },
  electron_renderer: {
    placement: "electron_renderer",
    owner: "desktop",
    description:
      "Runs in the Electron renderer with browser APIs plus desktop packaging constraints.",
    allowedEngines: ["tfjs", "transformersjs", "mediapipe", "custom"],
    allowedBackends: ["webgpu", "wasm", "webgl", "cpu", "unknown"],
    requiresBrowserCapability: true
  },
  node_backend: {
    placement: "node_backend",
    owner: "node",
    description:
      "Runs in the TypeScript backend process beside the kernel/websocket runtime.",
    allowedEngines: ["custom"],
    allowedBackends: ["node", "cpu", "unknown"],
    requiresBrowserCapability: false
  },
  server_worker: {
    placement: "server_worker",
    owner: "worker",
    description:
      "Runs in a server-side worker such as the Python worker or a future model worker.",
    allowedEngines: ["custom"],
    allowedBackends: ["cuda", "cpu", "unknown"],
    requiresBrowserCapability: false
  }
};

export function validateRealtimeInferencePlacement(
  input: RealtimeInferencePlacementValidationInput
): RealtimeInferencePlacementValidationResult {
  const definition = REALTIME_INFERENCE_PLACEMENTS[input.placement];
  const reasons: string[] = [];

  if (!definition.allowedEngines.includes(input.engine)) {
    reasons.push(
      `engine ${input.engine} is not allowed for placement ${input.placement}`
    );
  }

  if (!definition.allowedBackends.includes(input.backend)) {
    reasons.push(
      `backend ${input.backend} is not allowed for placement ${input.placement}`
    );
  }

  if (
    definition.requiresBrowserCapability &&
    input.profile?.browser_capable !== true
  ) {
    reasons.push(
      `placement ${input.placement} requires realtime_profile.browser_capable`
    );
  }

  if (input.profile?.requires_webgpu === true && input.backend !== "webgpu") {
    reasons.push(`node requires WebGPU but backend ${input.backend} was selected`);
  }

  return {
    valid: reasons.length === 0,
    reasons
  };
}
