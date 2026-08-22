/**
 * Shared harness for the Phase 0 SDK v1 golden tests
 * (sdk-v1-http-goldens, sdk-v1-ws-goldens, sdk-v1-route-inventory).
 *
 * Everything here exists to make captures byte-stable:
 *   - `Date` is frozen by the tests (vi.useFakeTimers, toFake: ["Date"]) so
 *     workflow timestamps and etags never move;
 *   - workflows are seeded with fixed ids;
 *   - every SDK service (capabilities, preflight, model catalog, model
 *     downloads) is an injected constant;
 *   - `NODETOOL_PACKS_CONFIG` points at a nonexistent file so the node-type
 *     inventory's `unavailable_packs` reflects only the in-repo pack catalog.
 *
 * Fixtures live in packages/protocol/fixtures/sdk-v1/. Regenerate with
 * NODETOOL_UPDATE_SDK_V1_GOLDENS=1 (see the README in that directory), then
 * rerun without the flag and review the diff.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { Workflow } from "@nodetool-ai/models";
import { NodeRegistry, type NodeMetadata } from "@nodetool-ai/node-sdk";
import type {
  SdkV1Capabilities,
  SdkV1PreflightRequest,
  SdkV1PreflightSummary
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import type {
  SdkV1ModelCatalog,
  SdkV1ModelDownloadState
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import type { HttpApiOptions } from "../src/http-api.js";
import { SdkModelDownloadServiceError } from "../src/sdk/sdk-model-download-service.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import { createSdkV1TemporaryAssetService } from "../src/sdk/sdk-temporary-asset-service.js";
import { getTempAdapter } from "../src/lib/storage.js";
import nodesRoutes from "../src/routes/nodes.js";
import workflowsRoutes from "../src/routes/workflows.js";
import assetsRoutes from "../src/routes/assets.js";

// ── Fixture IO ─────────────────────────────────────────────────────────────

export const FIXTURES_DIR = fileURLToPath(
  new URL("../../protocol/fixtures/sdk-v1/", import.meta.url)
);

export const UPDATE_GOLDENS =
  process.env.NODETOOL_UPDATE_SDK_V1_GOLDENS === "1";

export function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));
}

/**
 * Recursively sort object keys so fixture files diff cleanly. Arrays keep
 * their order. Not applied to WebSocket request/response objects, whose key
 * order must match the MessagePack wire bytes.
 */
export function sortJsonDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonDeep);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortJsonDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

export function writeFixture(
  name: string,
  value: unknown,
  options: { sortKeys: boolean }
): void {
  const body = options.sortKeys ? sortJsonDeep(value) : value;
  writeFileSync(
    `${FIXTURES_DIR}${name}`,
    `${JSON.stringify(body, null, 2)}\n`,
    "utf8"
  );
}

// ── Fixed identities ───────────────────────────────────────────────────────

/** Every capture runs with Date frozen at this instant. */
export const FROZEN_NOW = "2026-08-22T12:00:00.000Z";
/** `Workflow.beforeSave` bumps a same-instant `updated_at` by exactly 1 ms. */
export const FROZEN_REVISION = "2026-08-22T12:00:00.001Z";

export const GOLDEN_USER = "sdk-golden-user";
export const WORKFLOW_ONE_ID = "wf-sdk-golden-1";
export const WORKFLOW_TWO_ID = "wf-sdk-golden-2";
export const MISSING_WORKFLOW_ID = "wf-sdk-golden-missing";
export const UPLOAD_ID = "sdk-golden-upload";
export const UPLOAD_MAX_BYTES = 64;

/**
 * Baseline environment for every capture: both kill switches off, SDK auth
 * opt-in off, and the packs config pinned to a nonexistent file so a
 * developer's ~/.config/nodetool/packs.json cannot change `unavailable_packs`.
 */
export const GOLDEN_BASE_ENV: Record<string, string> = {
  NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: "0",
  NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0",
  NODETOOL_REQUIRE_SDK_AUTH_V1: "0",
  NODETOOL_PACKS_CONFIG: "/nonexistent/sdk-v1-golden-packs.json"
};

// ── Registry ───────────────────────────────────────────────────────────────

const STRING_INPUT_METADATA: NodeMetadata = {
  title: "String Input",
  description: "",
  namespace: "nodetool.input",
  node_type: "nodetool.input.StringInput",
  properties: [],
  outputs: [
    {
      name: "output",
      type: { type: "str", optional: false, type_args: [] }
    }
  ]
};

const OUTPUT_METADATA: NodeMetadata = {
  title: "Output",
  description: "",
  namespace: "nodetool.output",
  node_type: "nodetool.output.Output",
  properties: [],
  outputs: []
};

export function makeGoldenRegistry(): NodeRegistry {
  return new NodeRegistry({
    metadataByType: new Map([
      [STRING_INPUT_METADATA.node_type, STRING_INPUT_METADATA],
      [OUTPUT_METADATA.node_type, OUTPUT_METADATA]
    ])
  });
}

// ── Seeded workflows ───────────────────────────────────────────────────────

function goldenGraph(inputName: string) {
  return {
    nodes: [
      {
        id: "input-1",
        type: "nodetool.input.StringInput",
        properties: { name: inputName, value: "hello" }
      },
      {
        id: "output-1",
        type: "nodetool.output.Output",
        properties: { name: "text" }
      }
    ],
    edges: [
      {
        id: "edge-1",
        source: "input-1",
        sourceHandle: "output",
        target: "output-1",
        targetHandle: "value"
      }
    ]
  };
}

/** Requires a frozen clock (vi.useFakeTimers at FROZEN_NOW) and initTestDb(). */
export async function seedGoldenWorkflows(): Promise<void> {
  await Workflow.create({
    id: WORKFLOW_ONE_ID,
    user_id: GOLDEN_USER,
    name: "SDK Golden One",
    description: "Deterministic SDK v1 golden workflow",
    access: "private",
    graph: goldenGraph("prompt")
  });
  await Workflow.create({
    id: WORKFLOW_TWO_ID,
    user_id: GOLDEN_USER,
    name: "SDK Golden Two",
    description: "Second deterministic SDK v1 golden workflow",
    access: "private",
    graph: goldenGraph("subject")
  });
}

// ── Injected SDK services ──────────────────────────────────────────────────

export const GOLDEN_CAPABILITIES: SdkV1Capabilities = {
  protocol_version: "1",
  nodetool_version: "sdk-golden",
  server_time: FROZEN_NOW,
  supported_encodings: ["messagepack"],
  default_encoding: "messagepack",
  profiles: {},
  registry_revision: 0,
  python_bridge: "disabled",
  auth_modes: ["trusted_local"],
  asset_uri_schemes: ["asset"],
  limits: {
    max_rpc_batch: 1,
    max_inline_bytes: 0,
    max_upload_bytes: 1024,
    max_queued_jobs: 0,
    max_job_event_replay: 0,
    request_timeout_seconds: 30
  }
};

export const GOLDEN_PREFLIGHT_REQUEST: SdkV1PreflightRequest = {
  workflow_id: WORKFLOW_ONE_ID,
  workspace_id: null,
  workflow_etag: "sdk-golden-etag",
  interface_version: 1,
  level: "static",
  inputs: { prompt: "hello" }
};

export const GOLDEN_PREFLIGHT_SUMMARY: SdkV1PreflightSummary = {
  version: 1,
  level: "static",
  workflow_id: WORKFLOW_ONE_ID,
  workflow_etag: "sdk-golden-etag",
  runnable: true,
  issues: [],
  requirements: [],
  cost: null
};

export const GOLDEN_MODEL_CATALOG: SdkV1ModelCatalog = {
  version: "1",
  catalog_revision: "sdk-golden-catalog",
  scope: "local",
  entries: [
    {
      key: "sdk-golden-provider/sdk-golden-model",
      display_name: "SDK Golden Model",
      compatibility: "language_model",
      availability: "ready_remote",
      recommended: true,
      scope: "local",
      provider: "sdk-golden-provider",
      id: "sdk-golden-model",
      repo_id: null,
      path: null,
      supported_tasks: ["chat"],
      size_on_disk: null,
      wire_value: {
        type: "language_model",
        provider: "sdk-golden-provider",
        id: "sdk-golden-model"
      }
    }
  ],
  next_cursor: null
};

export const GOLDEN_DOWNLOAD_STATE: SdkV1ModelDownloadState = {
  version: "1",
  operation_id: "mdl_sdk_golden",
  scope: "local",
  repo_id: "sdk-golden/model",
  path: null,
  model_type: "hf.text_generation",
  status: "start",
  downloaded_bytes: 0,
  total_bytes: 0,
  downloaded_files: 0,
  current_files: [],
  total_files: 0,
  error: null,
  started_at: FROZEN_NOW,
  updated_at: FROZEN_NOW
};

export const CANCELLED_DOWNLOAD_STATE: SdkV1ModelDownloadState = {
  ...GOLDEN_DOWNLOAD_STATE,
  status: "cancelled"
};

/** Toggle to capture the redacted 500 body for `GET /api/sdk/v1/capabilities`. */
export const goldenFailureState = { capabilitiesFail: false };

export function makeGoldenApiOptions(registry: NodeRegistry): HttpApiOptions {
  return {
    registry,
    sdkV1Boundary: createSdkV1ImplementationBoundary(
      createSdkV1Service({
        getCapabilities: () => {
          if (goldenFailureState.capabilitiesFail) {
            throw new Error("secret capability backend detail");
          }
          return GOLDEN_CAPABILITIES;
        },
        preflightService: {
          preflight: async () => GOLDEN_PREFLIGHT_SUMMARY
        },
        modelCatalogService: {
          list: () => GOLDEN_MODEL_CATALOG
        },
        modelDownloadService: {
          start: () => GOLDEN_DOWNLOAD_STATE,
          list: () => ({ version: "1", downloads: [GOLDEN_DOWNLOAD_STATE] }),
          cancel: ({ operationId }) => {
            if (operationId !== GOLDEN_DOWNLOAD_STATE.operation_id) {
              throw new SdkModelDownloadServiceError(
                404,
                "MODEL_DOWNLOAD_NOT_FOUND",
                "Model download operation was not found."
              );
            }
            return CANCELLED_DOWNLOAD_STATE;
          }
        },
        temporaryAssetService: createSdkV1TemporaryAssetService({
          getStorage: getTempAdapter
        })
      })
    )
  };
}

// â”€â”€ Fastify app with the real SDK route plugins â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface GoldenApp {
  app: FastifyInstance;
  apiOptions: HttpApiOptions;
}

/**
 * Boots the three production route plugins that mount every SDK v1 HTTP
 * route (server.ts registers the same plugins). The onRequest hook mirrors
 * the server's authenticated-identity contract: `bridge()` forwards only
 * `request.userId`, so tests authenticate by sending `x-user-id`.
 */
export async function makeGoldenApp(): Promise<GoldenApp> {
  const apiOptions = makeGoldenApiOptions(makeGoldenRegistry());
  const app = Fastify({ logger: false });
  // Match server.ts: every body arrives as a raw Buffer and the Web API
  // handlers do their own parsing. Without this, Fastify's default parsers
  // would answer 415/400 before the SDK handlers run.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  app.addHook("onRequest", async (request) => {
    const userId = request.headers["x-user-id"];
    request.userId = typeof userId === "string" ? userId : null;
  });
  const routeOpts = { apiOptions };
  await app.register(assetsRoutes, routeOpts);
  await app.register(workflowsRoutes, routeOpts);
  await app.register(nodesRoutes, routeOpts);
  await app.ready();
  return { app, apiOptions };
}
