import type { CapabilitySpec } from "./types.js";

export const listExampleTimelinesSpec: CapabilitySpec = {
  name: "list_example_timelines",
  description:
    "List the read-only timeline examples shipped with NodeTool, including exact slugs, structural stats and package poster/video locators. No repository filesystem or user library is needed. Study an example with get_example_timeline.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Filter slug, name or description by this text."
      }
    },
    additionalProperties: false
  },
  category: "read",
  userMessage: () => "Listing example timelines"
};

export const getExampleTimelineSpec: CapabilitySpec = {
  name: "get_example_timeline",
  description:
    "Study a shipped example by exact slug: metadata, structural stats, scene group catalog and a bounded scene excerpt with authored clip styles, keyframes and effects. Defaults to the first scene. The excerpt includes descendants and overlapping global layers. Page clips with next_clip_offset until truncated is false. Times remain in the original timeline clock. These references are read-only and have no saved timeline id.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description:
          "Exact slug from list_example_timelines, such as kite or prism."
      },
      scene_id: {
        type: "string",
        description:
          "Exact group clip id from this example's scenes catalog. Omit for its first scene."
      },
      clip_offset: {
        type: "integer",
        minimum: 0,
        description:
          "Clip page offset. Use next_clip_offset from the preceding excerpt."
      },
      clip_limit: {
        type: "integer",
        minimum: 1,
        maximum: 40,
        description:
          "Maximum clips per excerpt, default 12. Clip payloads are also capped at 12000 characters. A partial excerpt is not a complete renderable scene."
      }
    },
    required: ["slug"],
    additionalProperties: false
  },
  category: "read",
  userMessage: (params) => `Reading example timeline ${String(params["slug"])}`
};

export const exampleTimelinesSpecs: readonly CapabilitySpec[] = [
  listExampleTimelinesSpec,
  getExampleTimelineSpec
];
