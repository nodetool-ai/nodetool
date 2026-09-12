/**
 * The `generations` module's specs — data only, no implementation.
 *
 * A generation is one provider media call tracked as a ledger row from before
 * the call to its terminal state (docs/media-generation-tracking-design.md).
 * Five of these read, wait on, stop and reconcile that record; the generation
 * capabilities themselves (`generate_image`, …) return the `generation_id`
 * they take. The last two read the *provider's* own record instead, for
 * generations this installation never ran and for the price it actually
 * billed (`packages/runtime/src/providers/provider-generations.ts`).
 */

import type { CapabilitySpec } from "./types.js";

export const LIST_GENERATIONS_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["running", "completed", "failed", "cancelled", "interrupted"],
      description: "Only generations in this state."
    },
    provider: { type: "string", description: "Only this provider." },
    capability: {
      type: "string",
      description:
        "Only this capability, e.g. text_to_image, image_to_video, text_to_speech."
    },
    thread_id: {
      type: "string",
      description: "Only generations a given chat thread asked for."
    },
    job_id: {
      type: "string",
      description: "Only generations a given workflow run asked for."
    },
    since: {
      type: "string",
      description: "ISO timestamp; generations created before it are left out."
    },
    limit: {
      type: "number",
      description: "How many to return (1–500).",
      default: 50
    },
    start_key: {
      type: "string",
      description: "The `next` cursor from a previous page."
    }
  },
  required: []
} as const;

export const listGenerationsSpec: CapabilitySpec = {
  name: "list_generations",
  description:
    "List this account's media generations — image, video, audio and 3D " +
    "calls to a provider — newest first, with status, cost, and the assets " +
    "each produced. A running one is still at the provider; a failed, " +
    "cancelled or interrupted one may still have been billed. Filter by " +
    "status, provider, capability, thread or job.",
  inputSchema: LIST_GENERATIONS_SCHEMA,
  category: "read",
  userMessage: (params) =>
    params["status"]
      ? `Listing ${String(params["status"])} generations`
      : "Listing generations"
};

export const getGenerationSpec: CapabilitySpec = {
  name: "get_generation",
  description:
    "Read one generation in full: status, provider and model, the request " +
    "parameters it was given, what it cost and how that price was arrived " +
    "at, the provider's request id and reconcile state, the assets it " +
    "produced, and who asked for it. The id is the `generation_id` a " +
    "generation capability returned.",
  inputSchema: {
    type: "object",
    properties: {
      generation_id: { type: "string", description: "The generation id." }
    },
    required: ["generation_id"]
  },
  category: "read",
  userMessage: (params) => `Reading generation ${params["generation_id"]}`
};

export const awaitGenerationSpec: CapabilitySpec = {
  name: "await_generation",
  description:
    "Wait for a generation started with `background: true` to settle, and " +
    "return its record — status, cost and assets. Returns " +
    "`status: \"running\"` with the seconds waited when the timeout passes " +
    "first; call again to keep waiting.",
  inputSchema: {
    type: "object",
    properties: {
      generation_id: { type: "string", description: "The generation id." },
      timeout_seconds: {
        type: "number",
        description: "How long to wait before returning (1–1800).",
        default: 300
      }
    },
    required: ["generation_id"]
  },
  category: "read",
  userMessage: (params) => `Waiting for generation ${params["generation_id"]}`
};

export const cancelGenerationSpec: CapabilitySpec = {
  name: "cancel_generation",
  description:
    "Stop a running generation. The provider call is aborted and the record " +
    "closes as cancelled; a provider that bills at submit still bills, so the " +
    "row keeps its request id and is reconciled. A generation that already " +
    "settled, or one belonging to another user, comes back `cancelled: false`.",
  inputSchema: {
    type: "object",
    properties: {
      generation_id: { type: "string", description: "The generation id." }
    },
    required: ["generation_id"]
  },
  category: "write",
  userMessage: (params) => `Cancelling generation ${params["generation_id"]}`
};

export const reconcileGenerationSpec: CapabilitySpec = {
  name: "reconcile_generation",
  description:
    "Ask the provider what it billed for a generation, now, by its request " +
    "id, and replace the estimate on the record. Returns the cost before and " +
    "after and whether the provider answered. Providers without a billing " +
    "API leave the estimate in place.",
  inputSchema: {
    type: "object",
    properties: {
      generation_id: { type: "string", description: "The generation id." }
    },
    required: ["generation_id"]
  },
  category: "external",
  userMessage: (params) =>
    `Reconciling the cost of generation ${params["generation_id"]}`
};

export const listProviderGenerationsSpec: CapabilitySpec = {
  name: "list_provider_generations",
  description:
    "List what the provider itself recorded, not what this installation " +
    "recorded: generations made from any machine or from the provider's own " +
    "site, at the price the provider billed. Use it to find a generation " +
    "with no local row, or to check the local record against the provider. " +
    "Only providers with a history API answer — fal_ai does; a provider " +
    "that does not says so. Some listings report a charge without an " +
    "outcome, and say that in `note`; pass a `model` to fal_ai for status, " +
    "timings and output urls.",
  inputSchema: {
    type: "object",
    properties: {
      provider: {
        type: "string",
        description: "Provider id, e.g. fal_ai."
      },
      model: {
        type: "string",
        description:
          "Only this endpoint / model id. Comma-separate a few to widen it."
      },
      status: {
        type: "string",
        enum: ["running", "completed", "failed", "cancelled", "unknown"],
        description: "Only generations in this state, where the provider filters by it."
      },
      since: {
        type: "string",
        description: "ISO timestamp; generations started before it are left out."
      },
      until: {
        type: "string",
        description: "ISO timestamp, exclusive upper bound."
      },
      limit: {
        type: "number",
        description: "How many to return (1-100).",
        default: 50
      },
      cursor: {
        type: "string",
        description: "The `next_cursor` from a previous page."
      }
    },
    required: ["provider"]
  },
  category: "external",
  userMessage: (params) =>
    `Listing generations recorded by ${params["provider"]}`
};

export const getProviderGenerationSpec: CapabilitySpec = {
  name: "get_provider_generation",
  description:
    "Ask a provider about one generation by its own request id — the " +
    "`provider_request_id` a local generation record carries. Returns the " +
    "provider's status, what it billed, and the output urls it still hosts, " +
    "which is how a lost asset is recovered. fal_ai and atlascloud answer; " +
    "pass `model` when you know the endpoint, so the lookup can narrow.",
  inputSchema: {
    type: "object",
    properties: {
      provider: { type: "string", description: "Provider id, e.g. fal_ai." },
      request_id: {
        type: "string",
        description: "The provider's own request / prediction id."
      },
      model: {
        type: "string",
        description: "The endpoint / model id, when known."
      }
    },
    required: ["provider", "request_id"]
  },
  category: "external",
  userMessage: (params) =>
    `Reading ${params["provider"]} generation ${params["request_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const generationsSpecs: readonly CapabilitySpec[] = [
  listGenerationsSpec,
  getGenerationSpec,
  awaitGenerationSpec,
  cancelGenerationSpec,
  reconcileGenerationSpec,
  listProviderGenerationsSpec,
  getProviderGenerationSpec
];
