/** Data-only specs for the shared AI-video production operations. */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { CapabilitySpec } from "./types.js";

const DESTINATION_SCHEMA = {
  type: "object",
  properties: {
    document_id: { type: "string", description: "Owning document id." },
    target_type: {
      type: "string",
      enum: ["timeline_clip", "storyboard_shot", "script_line"],
      description: "Destination kind shared with the editor contract."
    },
    target_id: { type: "string", description: "Stable destination slot id." },
    target_revision: {
      type: "string",
      description: "Optional expected revision. Preparation captures the live value."
    }
  },
  required: ["document_id", "target_type", "target_id"]
} as const;

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["reviewed"] },
    plan_fingerprint: {
      type: "string",
      description: "Fingerprint of every authoring input read by the reviewed plan."
    }
  },
  required: ["status", "plan_fingerprint"]
} as const;

const TIMING_SCHEMA = {
  type: "object",
  properties: {
    requested_duration_ms: { type: "number" },
    playable_start_ms: { type: "number" },
    playable_duration_ms: { type: "number" },
    measured_source_duration_ms: { type: "number" }
  },
  required: ["requested_duration_ms"]
} as const;

const SPEECH_SCHEMA = {
  type: "object",
  properties: {
    script_id: { type: "string" },
    script_line_id: { type: "string" },
    take_id: { type: "string" },
    text: { type: "string" },
    direction: { type: "string" },
    entity_id: { type: "string" },
    audio_asset_id: { type: "string" },
    measured_duration_ms: { type: "number" },
    voice: { type: "object" },
    word_timings: { type: "array", items: { type: "object" } }
  }
} as const;

export const PREPARE_VIDEO_PRODUCTION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    batch_id: {
      type: "string",
      description: "Optional stable batch id. Reuse it for recovery or related slots."
    },
    project_id: {
      type: "string",
      description: "Owning project. The server verifies the document and assets against it."
    },
    destination: DESTINATION_SCHEMA,
    review: REVIEW_SCHEMA,
    operation: {
      type: "string",
      enum: ["initial_generation", "new_take", "change_line_delivery", "edit_video"]
    },
    visual_treatment: {
      type: "string",
      enum: [
        "actor_to_camera",
        "product_close_up",
        "lifestyle_b_roll",
        "generated_scene"
      ]
    },
    speech_mode: {
      type: "string",
      enum: ["none", "off_camera", "on_camera"]
    },
    speech: SPEECH_SCHEMA,
    route: {
      type: "string",
      enum: ["reference_to_video", "text_to_video", "audio_driven_performance"],
      description:
        "Reviewed execution route. On-camera speech requires audio_driven_performance."
    },
    provider: { type: "string", description: "Provider id from find_model." },
    model: { type: "string", description: "Model id from find_model." },
    prompt: { type: "string", description: "Reviewed visual direction." },
    required_reference_asset_ids: {
      type: "array",
      items: { type: "string" },
      description: "References that the selected route must consume."
    },
    reference_asset_ids: {
      type: "array",
      items: { type: "string" },
      description: "Approved references supplied to the selected route."
    },
    character_reference_asset_id: { type: "string" },
    performance_source_asset_id: {
      type: "string",
      description: "Face video consumed by the existing lip-sync adapter."
    },
    timing: TIMING_SCHEMA,
    candidate_count: {
      type: "number",
      description: "Number of alternatives, from one through three."
    },
    output_format: { type: "string" },
    generation_params: {
      type: "object",
      description: "Reviewed provider parameters frozen in every candidate snapshot."
    }
  },
  required: [
    "project_id",
    "destination",
    "review",
    "operation",
    "visual_treatment",
    "speech_mode",
    "route",
    "provider",
    "model",
    "prompt",
    "timing"
  ]
};

export const SUBMIT_VIDEO_PRODUCTION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    prepared: {
      type: "object",
      description:
        "Complete manifest returned by prepare_video_production. Its captured request must not be edited."
    }
  },
  required: ["prepared"]
};

export const INSPECT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      description: "Candidate entries returned by submit_video_production."
    },
    preview: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["preview_take", "preview_draft"] },
        batch_id: { type: "string" },
        document_id: { type: "string" },
        selection: {
          type: "object",
          description: "Explicit destination id to candidate id map."
        }
      },
      required: ["kind", "batch_id", "document_id", "selection"]
    }
  },
  required: ["candidates"]
};

const ACCEPTANCE_TARGET_SCHEMA = {
  type: "object",
  properties: {
    destination_id: { type: "string" },
    destination_kind: {
      type: "string",
      enum: ["timeline_clip", "storyboard_shot", "script_line"]
    },
    expected_target_revision: { type: "string" }
  },
  required: ["destination_id", "destination_kind", "expected_target_revision"]
} as const;

export const ACCEPT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["use_take", "use_draft"] },
    batch_id: { type: "string" },
    document_id: { type: "string" },
    project_id: { type: "string" },
    candidates: {
      type: "array",
      description: "Inspected candidates carrying immutable snapshots."
    },
    selection: {
      type: "object",
      description: "Explicit destination id to candidate id map."
    },
    targets: {
      type: "array",
      items: ACCEPTANCE_TARGET_SCHEMA,
      description: "Current target preconditions. The server rechecks them before apply."
    }
  },
  required: [
    "action",
    "batch_id",
    "document_id",
    "project_id",
    "candidates",
    "selection",
    "targets"
  ]
};

export const prepareVideoProductionSpec: CapabilitySpec = {
  name: "prepare_video_production",
  description:
    "Validate a reviewed AI-video request and return a non-mutating manifest. " +
    "The server resolves linked script speech, verifies the owner, project, " +
    "target, references, capability route, and timing, then freezes one-to-three " +
    "stable candidate and request identities before provider spend.",
  inputSchema: PREPARE_VIDEO_PRODUCTION_SCHEMA,
  category: "write",
  userMessage: () => "Preparing reviewed AI-video candidates"
};

export const submitVideoProductionSpec: CapabilitySpec = {
  name: "submit_video_production",
  description:
    "Submit a prepared AI-video manifest through the existing generation " +
    "adapter. Preflight and authorization run again. Existing request ids are " +
    "recovered instead of resubmitted. Results stay inactive and unaccepted.",
  inputSchema: SUBMIT_VIDEO_PRODUCTION_SCHEMA,
  category: "write",
  userMessage: () => "Submitting AI-video candidates"
};

export const inspectVideoProductionCandidatesSpec: CapabilitySpec = {
  name: "inspect_video_production_candidates",
  description:
    "Refresh candidate state and optionally build a Preview take or Preview " +
    "draft artifact from an explicit selection. Inspection and preview never " +
    "write accepted media, autosave state, or export state.",
  inputSchema: INSPECT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA,
  category: "read",
  userMessage: () => "Inspecting AI-video candidates"
};

export const acceptVideoProductionCandidatesSpec: CapabilitySpec = {
  name: "accept_video_production_candidates",
  description:
    "Explicit Use take or Use draft. Validate the complete candidate map, " +
    "authorization, current targets, revisions, and timing before routing one " +
    "atomic manifest to the host's shared destination adapter. A destination " +
    "without that adapter is rejected and no media is changed.",
  inputSchema: ACCEPT_VIDEO_PRODUCTION_CANDIDATES_SCHEMA,
  category: "write",
  userMessage: (params) =>
    params["action"] === "use_take"
      ? "Using the selected AI-video take"
      : "Using the selected AI-video draft"
};

export const videoProductionSpecs: readonly CapabilitySpec[] = [
  prepareVideoProductionSpec,
  submitVideoProductionSpec,
  inspectVideoProductionCandidatesSpec,
  acceptVideoProductionCandidatesSpec
];
