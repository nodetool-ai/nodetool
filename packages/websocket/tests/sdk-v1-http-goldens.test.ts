/**
 * Phase 0 golden replay for every implemented SDK v1 HTTP operation
 * (docs/sdk/sdk-trpc-consolidation.md § Phase 0).
 *
 * Each operation has one fixture in packages/protocol/fixtures/sdk-v1/
 * recording request, success response, and the reachable error responses
 * (feature-disabled, auth failure, canonical 4xx). The test replays each
 * capture through the real dispatch paths — the production Fastify route
 * plugins, the `handleApiRequest` dispatcher, or the multipart upload
 * handler — and asserts status, content type, and the exact JSON body.
 *
 * Regenerate with NODETOOL_UPDATE_SDK_V1_GOLDENS=1, then rerun without the
 * flag and review the fixture diff before committing.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { handleApiRequest } from "../src/http-api.js";
import { handleSdkV1TemporaryAssetUpload } from "../src/sdk/sdk-temporary-asset-upload-http-handler.js";
import { createSdkV1TemporaryAssetService } from "../src/sdk/sdk-temporary-asset-service.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";
import {
  FROZEN_NOW,
  GOLDEN_BASE_ENV,
  GOLDEN_PREFLIGHT_REQUEST,
  GOLDEN_USER,
  MISSING_WORKFLOW_ID,
  UPDATE_GOLDENS,
  UPLOAD_ID,
  UPLOAD_MAX_BYTES,
  WORKFLOW_ONE_ID,
  WORKFLOW_TWO_ID,
  goldenFailureState,
  makeGoldenApp,
  readFixture,
  seedGoldenWorkflows,
  writeFixture,
  type GoldenApp
} from "./sdk-v1-golden-harness.js";

// ── Capture model ──────────────────────────────────────────────────────────

interface MultipartSpec {
  field: string;
  filename: string | null;
  content_type: string;
  size: number;
}

interface HttpRequestSpec {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  multipart: MultipartSpec | null;
}

type CaptureVia = "fastify" | "http-api-dispatcher" | "handler";

interface CaptureSpec {
  name: string;
  via: CaptureVia;
  /** Overrides applied on top of {@link GOLDEN_BASE_ENV}. */
  env: Record<string, string>;
  request: HttpRequestSpec;
  /** Optional service-failure toggle around the request. */
  mutate?: () => void;
  restore?: () => void;
}

interface RouteMeta {
  method: string;
  path: string;
  owner: string;
  in_http_api_dispatcher: boolean;
  auth: "discovery" | "authenticated";
  feature_flag: string | null;
}

interface OperationSpec {
  fixture: string;
  operation: string;
  route: RouteMeta;
  not_captured: Record<string, string>;
  captures: CaptureSpec[];
}

interface CapturedResponse {
  status: number;
  content_type: string | null;
  body: unknown;
}

interface OperationFixture {
  fixture_version: number;
  operation: string;
  route: RouteMeta;
  not_captured: Record<string, string>;
  captures: Record<
    string,
    {
      via: CaptureVia;
      env: Record<string, string>;
      request: HttpRequestSpec;
      response: CapturedResponse;
    }
  >;
}

const SDK_FLAG_NAMES = [
  "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1",
  "NODETOOL_DISABLE_SDK_LIFECYCLE_V1",
  "NODETOOL_REQUIRE_SDK_AUTH_V1"
] as const;

/** The three SDK flags with the capture's effective values. */
function effectiveFlags(
  overrides: Record<string, string>
): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const flag of SDK_FLAG_NAMES) {
    flags[flag] = overrides[flag] ?? GOLDEN_BASE_ENV[flag];
  }
  return flags;
}

function get(
  path: string,
  headers: Record<string, string> = {}
): HttpRequestSpec {
  return { method: "GET", path, headers, body: null, multipart: null };
}

function postJson(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): HttpRequestSpec {
  return {
    method: "POST",
    path,
    headers: { "content-type": "application/json", ...headers },
    body,
    multipart: null
  };
}

const AUTH = { "x-user-id": GOLDEN_USER };

const NO_AUTH_CAPTURE_NOTE =
  "No in-route 401: getUserId falls back to x-user-id/'1' and server.ts " +
  "enforces authentication in its onRequest hook (server.ts:897) before " +
  'routing, answering 401 {"error":"Unauthorized"} outside the handlers.';

const NO_FLAG_NOTE =
  "No feature flag applies: the handler checks neither " +
  "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1 nor NODETOOL_DISABLE_SDK_LIFECYCLE_V1.";

// ── The 11-operation capture matrix ────────────────────────────────────────

const OPERATIONS: OperationSpec[] = [
  {
    fixture: "http-get-node-types.json",
    operation: "node_type_inventory",
    route: {
      method: "GET",
      path: "/api/sdk/v1/node-types",
      owner: "packages/websocket/src/routes/nodes.ts",
      in_http_api_dispatcher: true,
      auth: "discovery",
      feature_flag: "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1"
    },
    not_captured: { auth_failure: NO_AUTH_CAPTURE_NOTE },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/node-types?limit=50", AUTH)
      },
      {
        name: "feature_disabled",
        via: "fastify",
        env: { NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: "1" },
        request: get("/api/sdk/v1/node-types?limit=50", AUTH)
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/node-types?limit=0", AUTH)
      },
      {
        // Legacy {detail} body — only reachable through the second
        // dispatcher; the Fastify mount has no POST binding (404 instead).
        name: "method_not_allowed",
        via: "http-api-dispatcher",
        env: {},
        request: {
          method: "POST",
          path: "/api/sdk/v1/node-types",
          headers: AUTH,
          body: null,
          multipart: null
        }
      }
    ]
  },
  {
    fixture: "http-get-capabilities.json",
    operation: "capabilities",
    route: {
      method: "GET",
      path: "/api/sdk/v1/capabilities",
      owner: "packages/websocket/src/routes/nodes.ts",
      in_http_api_dispatcher: true,
      auth: "discovery",
      feature_flag: "NODETOOL_DISABLE_SDK_LIFECYCLE_V1"
    },
    not_captured: {
      auth_failure: NO_AUTH_CAPTURE_NOTE,
      bad_input: "The operation takes no input."
    },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/capabilities", AUTH)
      },
      {
        name: "feature_disabled",
        via: "fastify",
        env: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1" },
        request: get("/api/sdk/v1/capabilities", AUTH)
      },
      {
        name: "internal_error_redacted",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/capabilities", AUTH),
        mutate: () => {
          goldenFailureState.capabilitiesFail = true;
        },
        restore: () => {
          goldenFailureState.capabilitiesFail = false;
        }
      },
      {
        name: "method_not_allowed",
        via: "http-api-dispatcher",
        env: {},
        request: {
          method: "POST",
          path: "/api/sdk/v1/capabilities",
          headers: AUTH,
          body: null,
          multipart: null
        }
      }
    ]
  },
  {
    fixture: "http-get-models.json",
    operation: "model_catalog",
    route: {
      method: "GET",
      path: "/api/sdk/v1/models",
      owner: "packages/websocket/src/routes/nodes.ts",
      in_http_api_dispatcher: false,
      auth: "discovery",
      feature_flag: null
    },
    not_captured: {
      feature_disabled: NO_FLAG_NOTE,
      auth_failure: NO_AUTH_CAPTURE_NOTE,
      method_not_allowed:
        "The Fastify server has no POST binding for this path, so a wrong " +
        "method answers Fastify's 404 (see wrong_method_unrouted). The " +
        "standalone handler's 405 is pinned by " +
        "tests/sdk-model-catalog-http-handler.test.ts."
    },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: get(
          "/api/sdk/v1/models?compatibility=language_model&limit=25",
          AUTH
        )
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/models?limit=501", AUTH)
      },
      {
        name: "wrong_method_unrouted",
        via: "fastify",
        env: {},
        request: postJson("/api/sdk/v1/models", {}, AUTH)
      }
    ]
  },
  {
    fixture: "http-get-model-downloads.json",
    operation: "model_download_list",
    route: {
      method: "GET",
      path: "/api/sdk/v1/model-downloads",
      owner: "packages/websocket/src/routes/nodes.ts",
      in_http_api_dispatcher: false,
      auth: "authenticated",
      feature_flag: null
    },
    not_captured: {
      feature_disabled: NO_FLAG_NOTE,
      auth_failure: NO_AUTH_CAPTURE_NOTE
    },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/model-downloads", AUTH)
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/model-downloads?scope=bogus", AUTH)
      },
      {
        name: "wrong_method_unrouted",
        via: "fastify",
        env: {},
        request: {
          method: "PUT",
          path: "/api/sdk/v1/model-downloads",
          headers: { "content-type": "application/json", ...AUTH },
          body: {},
          multipart: null
        }
      }
    ]
  },
  {
    fixture: "http-post-model-downloads.json",
    operation: "model_download_start",
    route: {
      method: "POST",
      path: "/api/sdk/v1/model-downloads",
      owner: "packages/websocket/src/routes/nodes.ts",
      in_http_api_dispatcher: false,
      auth: "authenticated",
      feature_flag: null
    },
    not_captured: {
      feature_disabled: NO_FLAG_NOTE,
      auth_failure: NO_AUTH_CAPTURE_NOTE,
      method_not_allowed:
        "GET on this path is the list operation and PUT answers Fastify's " +
        "404; the standalone handler's 405 is pinned by " +
        "tests/sdk-model-download-http-handler.test.ts."
    },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: postJson(
          "/api/sdk/v1/model-downloads",
          { repo_id: "sdk-golden/model", model_type: "hf.text_generation" },
          AUTH
        )
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: postJson("/api/sdk/v1/model-downloads", {}, AUTH)
      }
    ]
  },
  {
    fixture: "http-post-model-downloads-cancel.json",
    operation: "model_download_cancel",
    route: {
      method: "POST",
      path: "/api/sdk/v1/model-downloads/cancel",
      owner: "packages/websocket/src/routes/nodes.ts",
      in_http_api_dispatcher: false,
      auth: "authenticated",
      feature_flag: null
    },
    not_captured: {
      feature_disabled: NO_FLAG_NOTE,
      auth_failure: NO_AUTH_CAPTURE_NOTE
    },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: postJson(
          "/api/sdk/v1/model-downloads/cancel",
          { operation_id: "mdl_sdk_golden" },
          AUTH
        )
      },
      {
        name: "not_found",
        via: "fastify",
        env: {},
        request: postJson(
          "/api/sdk/v1/model-downloads/cancel",
          { operation_id: "mdl_missing" },
          AUTH
        )
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: postJson("/api/sdk/v1/model-downloads/cancel", {}, AUTH)
      },
      {
        name: "wrong_method_unrouted",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/model-downloads/cancel", AUTH)
      }
    ]
  },
  {
    fixture: "http-post-preflight.json",
    operation: "preflight",
    route: {
      method: "POST",
      path: "/api/sdk/v1/preflight",
      owner: "packages/websocket/src/routes/nodes.ts",
      in_http_api_dispatcher: true,
      auth: "authenticated",
      feature_flag: "NODETOOL_DISABLE_SDK_LIFECYCLE_V1"
    },
    not_captured: {},
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: postJson(
          "/api/sdk/v1/preflight",
          GOLDEN_PREFLIGHT_REQUEST,
          AUTH
        )
      },
      {
        name: "feature_disabled",
        via: "fastify",
        env: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1" },
        request: postJson(
          "/api/sdk/v1/preflight",
          GOLDEN_PREFLIGHT_REQUEST,
          AUTH
        )
      },
      {
        // The one operation with an in-handler 401: no authenticated
        // principal (bridge strips client x-user-id; no server identity).
        name: "auth_failure",
        via: "fastify",
        env: {},
        request: postJson("/api/sdk/v1/preflight", GOLDEN_PREFLIGHT_REQUEST)
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: postJson("/api/sdk/v1/preflight", {}, AUTH)
      },
      {
        name: "unsupported_media_type",
        via: "fastify",
        env: {},
        request: {
          method: "POST",
          path: "/api/sdk/v1/preflight",
          headers: { "content-type": "text/plain", ...AUTH },
          body: "hello",
          multipart: null
        }
      },
      {
        name: "method_not_allowed",
        via: "http-api-dispatcher",
        env: {},
        request: get("/api/sdk/v1/preflight", AUTH)
      }
    ]
  },
  {
    fixture: "http-get-workflows.json",
    operation: "workflow_summaries",
    route: {
      method: "GET",
      path: "/api/sdk/v1/workflows",
      owner: "packages/websocket/src/routes/workflows.ts",
      in_http_api_dispatcher: true,
      auth: "discovery",
      feature_flag: "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1"
    },
    not_captured: { auth_failure: NO_AUTH_CAPTURE_NOTE },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/workflows?limit=50", AUTH)
      },
      {
        name: "feature_disabled",
        via: "fastify",
        env: { NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: "1" },
        request: get("/api/sdk/v1/workflows?limit=50", AUTH)
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: get("/api/sdk/v1/workflows?limit=0", AUTH)
      },
      {
        name: "method_not_allowed",
        via: "http-api-dispatcher",
        env: {},
        request: {
          method: "POST",
          path: "/api/sdk/v1/workflows",
          headers: AUTH,
          body: null,
          multipart: null
        }
      }
    ]
  },
  {
    fixture: "http-post-workflow-interfaces.json",
    operation: "workflow_interfaces",
    route: {
      method: "POST",
      path: "/api/sdk/v1/workflow-interfaces",
      owner: "packages/websocket/src/routes/workflows.ts",
      in_http_api_dispatcher: true,
      auth: "discovery",
      feature_flag: "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1"
    },
    not_captured: { auth_failure: NO_AUTH_CAPTURE_NOTE },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: postJson(
          "/api/sdk/v1/workflow-interfaces",
          {
            ids: [WORKFLOW_ONE_ID, MISSING_WORKFLOW_ID, WORKFLOW_TWO_ID],
            version: 1
          },
          AUTH
        )
      },
      {
        // Input validation runs first: a bad body answers 400 even when the
        // flag is off, so this capture uses a valid body.
        name: "feature_disabled",
        via: "fastify",
        env: { NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: "1" },
        request: postJson(
          "/api/sdk/v1/workflow-interfaces",
          { ids: [WORKFLOW_ONE_ID], version: 1 },
          AUTH
        )
      },
      {
        name: "bad_input",
        via: "fastify",
        env: {},
        request: postJson(
          "/api/sdk/v1/workflow-interfaces",
          { ids: [], version: 1 },
          AUTH
        )
      },
      {
        name: "method_not_allowed",
        via: "http-api-dispatcher",
        env: {},
        request: get("/api/sdk/v1/workflow-interfaces", AUTH)
      }
    ]
  },
  {
    fixture: "http-get-workflow-interface.json",
    operation: "workflow_interface",
    route: {
      method: "GET",
      path: "/api/workflows/:id/interface",
      owner: "packages/websocket/src/routes/workflows.ts",
      in_http_api_dispatcher: true,
      auth: "discovery",
      feature_flag: "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1"
    },
    not_captured: {
      auth_failure:
        "An unauthorized viewer receives the same 404 WORKFLOW_NOT_FOUND as " +
        "a missing id (see not_found); pinned across transports by " +
        "tests/sdk-workflow-interface-integration.test.ts."
    },
    captures: [
      {
        name: "success",
        via: "fastify",
        env: {},
        request: get(
          `/api/workflows/${WORKFLOW_ONE_ID}/interface?version=1`,
          AUTH
        )
      },
      {
        name: "feature_disabled",
        via: "fastify",
        env: { NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: "1" },
        request: get(
          `/api/workflows/${WORKFLOW_ONE_ID}/interface?version=1`,
          AUTH
        )
      },
      {
        // The version check runs before the feature flag: a missing or
        // unsupported version answers 400 even with the flag on.
        name: "bad_input",
        via: "fastify",
        env: {},
        request: get(`/api/workflows/${WORKFLOW_ONE_ID}/interface`, AUTH)
      },
      {
        name: "not_found",
        via: "fastify",
        env: {},
        request: get(
          `/api/workflows/${MISSING_WORKFLOW_ID}/interface?version=1`,
          AUTH
        )
      },
      {
        name: "method_not_allowed",
        via: "http-api-dispatcher",
        env: {},
        request: {
          method: "POST",
          path: `/api/workflows/${WORKFLOW_ONE_ID}/interface`,
          headers: AUTH,
          body: null,
          multipart: null
        }
      }
    ]
  },
  {
    fixture: "http-post-assets-temporary.json",
    operation: "temporary_asset_upload",
    route: {
      method: "POST",
      path: "/api/sdk/v1/assets/temporary",
      owner: "packages/websocket/src/routes/assets.ts",
      in_http_api_dispatcher: false,
      auth: "authenticated",
      feature_flag: "NODETOOL_DISABLE_SDK_LIFECYCLE_V1"
    },
    not_captured: {
      auth_failure: NO_AUTH_CAPTURE_NOTE,
      wrong_method_unrouted:
        "Captured as method_not_allowed: this operation is replayed through " +
        "the handler (the only injection point for createId and the upload " +
        "limit), which owns the 405."
    },
    captures: [
      {
        name: "success",
        via: "handler",
        env: {},
        request: {
          method: "POST",
          path: "/api/sdk/v1/assets/temporary",
          headers: { "content-type": "multipart/form-data" },
          body: null,
          multipart: {
            field: "file",
            filename: "input.png",
            content_type: "image/png",
            size: 3
          }
        }
      },
      {
        name: "feature_disabled",
        via: "handler",
        env: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1" },
        request: {
          method: "POST",
          path: "/api/sdk/v1/assets/temporary",
          headers: { "content-type": "multipart/form-data" },
          body: null,
          multipart: {
            field: "file",
            filename: "input.png",
            content_type: "image/png",
            size: 3
          }
        }
      },
      {
        name: "bad_input",
        via: "handler",
        env: {},
        request: postJson("/api/sdk/v1/assets/temporary", {})
      },
      {
        name: "missing_file_field",
        via: "handler",
        env: {},
        request: {
          method: "POST",
          path: "/api/sdk/v1/assets/temporary",
          headers: { "content-type": "multipart/form-data" },
          body: null,
          multipart: {
            field: "other",
            filename: "input.png",
            content_type: "image/png",
            size: 3
          }
        }
      },
      {
        // The harness pins the limit at UPLOAD_MAX_BYTES (64) through the
        // handler's getConfiguredMaxUploadBytes injection point; the server
        // default is getMaxUploadBytes() (1 GiB, NODETOOL_MAX_UPLOAD_BYTES).
        name: "too_large",
        via: "handler",
        env: {},
        request: {
          method: "POST",
          path: "/api/sdk/v1/assets/temporary",
          headers: { "content-type": "multipart/form-data" },
          body: null,
          multipart: {
            field: "file",
            filename: "big.bin",
            content_type: "application/octet-stream",
            size: 100
          }
        }
      },
      {
        name: "method_not_allowed",
        via: "handler",
        env: {},
        request: get("/api/sdk/v1/assets/temporary")
      }
    ]
  }
];

// ── Execution ──────────────────────────────────────────────────────────────

function parseBody(text: string, contentType: string | null): unknown {
  if (!text) return null;
  if (contentType?.includes("application/json")) {
    return JSON.parse(text);
  }
  return text;
}

function toWebRequest(spec: HttpRequestSpec): Request {
  if (spec.multipart) {
    const form = new FormData();
    const bytes = new Uint8Array(spec.multipart.size);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = (i % 3) + 1;
    }
    const blob = new Blob([bytes], { type: spec.multipart.content_type });
    if (spec.multipart.filename === null) {
      form.append(spec.multipart.field, blob);
    } else {
      form.append(spec.multipart.field, blob, spec.multipart.filename);
    }
    // FormData sets its own multipart content-type with a random boundary.
    const headers = new Headers();
    for (const [key, value] of Object.entries(spec.headers)) {
      if (key.toLowerCase() !== "content-type") headers.set(key, value);
    }
    return new Request(`http://localhost${spec.path}`, {
      method: spec.method,
      headers,
      body: form
    });
  }
  const hasBody = spec.body !== null;
  return new Request(`http://localhost${spec.path}`, {
    method: spec.method,
    headers: spec.headers,
    body: hasBody
      ? typeof spec.body === "string"
        ? spec.body
        : JSON.stringify(spec.body)
      : undefined
  });
}

describe("SDK v1 HTTP goldens", () => {
  let golden: GoldenApp;

  beforeAll(async () => {
    vi.useFakeTimers({ now: new Date(FROZEN_NOW), toFake: ["Date"] });
    for (const [key, value] of Object.entries(GOLDEN_BASE_ENV)) {
      vi.stubEnv(key, value);
    }
    initTestDb();
    await seedGoldenWorkflows();
    golden = await makeGoldenApp();
  });

  afterAll(async () => {
    await golden.app.close();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const [key, value] of Object.entries(GOLDEN_BASE_ENV)) {
      vi.stubEnv(key, value);
    }
  });

  async function execute(capture: CaptureSpec): Promise<CapturedResponse> {
    for (const [key, value] of Object.entries(capture.env)) {
      vi.stubEnv(key, value);
    }
    capture.mutate?.();
    try {
      if (capture.via === "fastify") {
        const spec = capture.request;
        const hasBody = spec.body !== null;
        const response = await golden.app.inject({
          method: spec.method as "GET" | "POST" | "PUT",
          url: spec.path,
          headers: spec.headers,
          payload: hasBody
            ? typeof spec.body === "string"
              ? spec.body
              : JSON.stringify(spec.body)
            : undefined
        });
        const contentType = response.headers["content-type"];
        return {
          status: response.statusCode,
          content_type: typeof contentType === "string" ? contentType : null,
          body: parseBody(
            response.body,
            typeof contentType === "string" ? contentType : null
          )
        };
      }
      const request = toWebRequest(capture.request);
      const response =
        capture.via === "http-api-dispatcher"
          ? await handleApiRequest(request, golden.apiOptions)
          : await handleSdkV1TemporaryAssetUpload(request, {
              boundary: createSdkV1ImplementationBoundary(
                createSdkV1Service({
                  temporaryAssetService: createSdkV1TemporaryAssetService({
                    getStorage: () => new InMemoryStorageAdapter(),
                    createId: () => UPLOAD_ID,
                    getConfiguredMaxUploadBytes: () => UPLOAD_MAX_BYTES
                  }),
                  getEnvironment: () => ({
                    ...GOLDEN_BASE_ENV,
                    ...capture.env
                  })
                })
              ),
              getConfiguredMaxUploadBytes: () => UPLOAD_MAX_BYTES
            });
      const contentType = response.headers.get("content-type");
      return {
        status: response.status,
        content_type: contentType,
        body: parseBody(await response.text(), contentType)
      };
    } finally {
      capture.restore?.();
      for (const key of Object.keys(capture.env)) {
        vi.stubEnv(key, GOLDEN_BASE_ENV[key] ?? "0");
      }
    }
  }

  for (const operation of OPERATIONS) {
    it(`replays ${operation.operation} (${operation.route.method} ${operation.route.path})`, async () => {
      if (UPDATE_GOLDENS) {
        const captures: OperationFixture["captures"] = {};
        for (const capture of operation.captures) {
          captures[capture.name] = {
            via: capture.via,
            env: effectiveFlags(capture.env),
            request: capture.request,
            response: await execute(capture)
          };
        }
        const recorded: OperationFixture = {
          fixture_version: 1,
          operation: operation.operation,
          route: operation.route,
          not_captured: operation.not_captured,
          captures
        };
        writeFixture(operation.fixture, recorded, { sortKeys: true });
      }

      const fixture = readFixture(operation.fixture) as OperationFixture;
      expect(fixture.fixture_version).toBe(1);
      expect(fixture.operation).toBe(operation.operation);
      expect(fixture.route).toEqual(operation.route);
      expect(fixture.not_captured).toEqual(operation.not_captured);
      expect(Object.keys(fixture.captures).sort()).toEqual(
        operation.captures.map((capture) => capture.name).sort()
      );

      for (const capture of operation.captures) {
        const recorded = fixture.captures[capture.name];
        const label = `${operation.operation}/${capture.name}`;
        expect(recorded.via, label).toBe(capture.via);
        expect(recorded.env, label).toEqual(effectiveFlags(capture.env));
        expect(recorded.request, label).toEqual(capture.request);

        const live = await execute(capture);
        expect(live.status, label).toBe(recorded.response.status);
        expect(live.content_type, label).toBe(recorded.response.content_type);
        expect(live.body, label).toEqual(recorded.response.body);
      }
    });
  }
});
