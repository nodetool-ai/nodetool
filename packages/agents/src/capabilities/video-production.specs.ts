/**
 * The `video-production` capability specs — data only, no implementation.
 *
 * These operations are the headless side of the AI-video production contract:
 * prepare a reviewed batch, submit it through the existing generation seam,
 * inspect its candidates, and validate an explicit acceptance map.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

const DESTINATION_SCHEMA = {
  type: "object",
  properties: {
    document_id: { type: "string", description: "Owning document id." },
    target_type: {
      type: "string",
      description: "Destination kind, for example timeline_clip or storyboard_shot."
    },
    target_id: { type: "string", description: "Stable destination slot id." },
    target_revision: {
      type: "string",
      description: "Optional revision captured for acceptance preconditions."
    }
  },
  required: ["document_id", "target_type", "target_id"]
} as const;

const PRODUCTION_FIELDS = {
  batch_id: {
    type: "string",
    description: "Optional stable batch id. Reuse it when retrying preparation."
  },
  destination: DESTINATION_SCHEMA,
  route: {
    type: "string",
    enum: ["reference_to_video", "text_to_video"],
    description:
      "Generation route. Required references can only use reference_to_video."
  },
  provider: { type: "string", description: "Provider id from find_model." },
  model: { type: "string", description: "Video model id from find_model." },
  prompt: { type: "string", description: "Reviewed visual direction." },
  required_reference_asset_ids: {
    type: "array",
    items: { type: "string" },
    description:
      "Asset ids that must reach the provider. Missing ids or a text-only route are rejected before spend."
  },
  reference_asset_ids: {
    type: "array",
    items: { type: "string" },
    description: "All approved asset ids supplied to the reference route."
  },
  candidate_count: {
    type: "number",
    description: "Number of alternatives to prepare, from one through three."
  },
  generation_params: {
    type: "object",
    description: "Reviewed provider parameters captured before submission."
  }
} as const;

export const PREPARE_VIDEO_PRODUCTION_SCHEMA: JsonSchema = {
  type: "object",
  properties: PRODUCTION_FIELDS,
  required: ["destination", "route", "provider", "model", "prompt"]
};

export const SUBMIT_VIDEO_PRODUCTION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    prepared: {
      type: "object",
      description:
        "The complete manifest returned by prepare_video_production. Do not edit its captured request."
    }
  },
  required: ["prepared"]
};

export const INSPECT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      description:
        "Candidate manifest entries returned by submit_video_production."
    }
  },
  required: ["candidates"]
};

export const ACCEPT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      description: "Candidate manifest entries to validate against the target."
    },
    candidate_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "Explicit candidate selection map. One candidate per destination slot."
    },
    expected_target_revision: {
      type: "string",
      description: "Optional current revision required by every selected target."
    }
  },
  required: ["candidates", "candidate_ids"]
};

export const prepareVideoProductionSpec: CapabilitySpec = {
  name: "prepare_video_production",
  description:
    "Validate a reviewed AI-video request and create a non-mutating batch " +
    "manifest. It captures the destination, route, prompt, required reference " +
    "asset ids, and one-to-three stable candidate/request identities before " +
    "any provider call. Required references cannot use text_to_video.",
  inputSchema: PREPARE_VIDEO_PRODUCTION_SCHEMA,
  category: "write",
  userMessage: () => "Preparing AI-video production candidates"
};

export const submitVideoProductionSpec: CapabilitySpec = {
  name: "submit_video_production",
  description:
    "Submit a prepared AI-video batch through NodeTool's existing generation " +
    "seam. Preflight runs again before any provider spend, approved reference " +
    "asset ids are resolved to bytes, and every result is returned as an " +
    "inactive candidate with its existing generation id. Nothing is accepted " +
    "or attached to an editor by this operation.",
  inputSchema: SUBMIT_VIDEO_PRODUCTION_SCHEMA,
  category: "write",
  userMessage: () => "Submitting AI-video production candidates"
};

export const inspectVideoProductionCandidatesSpec: CapabilitySpec = {
  name: "inspect_video_production_candidates",
  description:
    "Inspect submitted AI-video candidates and refresh their state from the " +
    "existing generation ledger when generation ids are present. Inspection " +
    "is read-only and never changes accepted media or selection state.",
  inputSchema: INSPECT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA,
  category: "read",
  userMessage: () => "Inspecting AI-video production candidates"
};

export const acceptVideoProductionCandidatesSpec: CapabilitySpec = {
  name: "accept_video_production_candidates",
  description:
    "Validate an explicit candidate selection map, target revision, readiness, " +
    "and one-candidate-per-slot rule. This capability reports a validated " +
    "acceptance request but does not mutate a timeline, storyboard, or script " +
    "until a destination-specific apply adapter is available.",
  inputSchema: ACCEPT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA,
  category: "write",
  userMessage: () => "Validating AI-video candidate acceptance"
};

export const videoProductionSpecs: readonly CapabilitySpec[] = [
  prepareVideoProductionSpec,
  submitVideoProductionSpec,
  inspectVideoProductionCandidatesSpec,
  acceptVideoProductionCandidatesSpec
];
