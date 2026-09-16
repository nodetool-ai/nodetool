import type { CapabilityExport, CapabilityRun } from "./types.js";
import { isRecord } from "../utils/type-guards.js";

export const VIDEO_PRODUCTION_ACCEPTANCE_ADAPTER =
  "apply_video_production_acceptance_manifest" as const;

export type VideoProductionAcceptanceAction = "use_take" | "use_draft";

export interface VideoProductionAcceptanceManifest {
  readonly schema_version: string;
  readonly action: VideoProductionAcceptanceAction;
  readonly batch_id: string;
  readonly document_id: string;
  readonly authorization: {
    readonly owner_id: string;
    readonly project_id: string;
  };
  readonly selection: Readonly<Record<string, string>>;
  readonly targets: readonly Readonly<Record<string, unknown>>[];
  readonly candidates: readonly Readonly<Record<string, unknown>>[];
}

export interface VideoProductionAcceptanceAdapterResult {
  readonly ok: boolean;
  readonly applied?: boolean;
  readonly error?: string;
  readonly code?: string;
  readonly [key: string]: unknown;
}

export type VideoProductionAcceptanceAdapter = (
  run: CapabilityRun,
  manifest: VideoProductionAcceptanceManifest
) => Promise<VideoProductionAcceptanceAdapterResult>;

function isAcceptanceManifest(
  value: unknown
): value is VideoProductionAcceptanceManifest {
  return (
    isRecord(value) &&
    typeof value["schema_version"] === "string" &&
    (value["action"] === "use_take" || value["action"] === "use_draft") &&
    typeof value["batch_id"] === "string" &&
    typeof value["document_id"] === "string" &&
    isRecord(value["authorization"]) &&
    isRecord(value["selection"]) &&
    Array.isArray(value["targets"]) &&
    Array.isArray(value["candidates"])
  );
}

/** Wrap one host apply implementation as the private shared adapter capability. */
export function createVideoProductionAcceptanceAdapter(
  adapter: VideoProductionAcceptanceAdapter
): CapabilityExport {
  return {
    spec: {
      name: VIDEO_PRODUCTION_ACCEPTANCE_ADAPTER,
      description:
        "Host-only adapter for applying one validated AI-video acceptance manifest.",
      inputSchema: {
        type: "object",
        properties: { manifest: { type: "object" } },
        required: ["manifest"]
      },
      category: "write",
      userMessage: () => "Applying the validated AI-video selection"
    },
    impl: async (run, params) => {
      const manifest = params["manifest"];
      if (!isAcceptanceManifest(manifest)) {
        return {
          ok: false,
          code: "acceptance_manifest_invalid",
          error: "The video-production acceptance manifest is invalid."
        };
      }
      return adapter(run, manifest);
    }
  };
}
