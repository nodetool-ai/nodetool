/**
 * The SDK download service's default Hugging Face starter resolves its host
 * and token through `resolveHfHubAccess`: server credentials go only to the
 * operator endpoint, and a shared server downloads from the operator endpoint.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import type { SdkV1ModelDownloadStartRequest } from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, string>,
  startDownload: vi.fn(async () => {})
}));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    getSecret: vi.fn(async (key: string) => mocks.values[key] ?? null)
  };
});

vi.mock("@nodetool-ai/huggingface", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/huggingface")>();
  return {
    ...actual,
    getDownloadManager: vi.fn(() => ({ startDownload: mocks.startDownload }))
  };
});

import { clearHfTokenCache } from "@nodetool-ai/huggingface";
import { createSdkV1ModelDownloadService } from "../src/sdk/sdk-model-download-service.js";

const request: SdkV1ModelDownloadStartRequest = {
  repo_id: "org/model",
  path: null,
  model_type: "hf.text_generation",
  scope: "local"
};

const ENV_KEYS = [
  "HF_TOKEN",
  "HF_API_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "HF_TOKEN_PATH",
  "HF_HOME",
  "HF_ENDPOINT",
  "NODETOOL_ENV",
  "NODETOOL_NODE_PROFILE",
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID"
];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env["HF_HOME"] = path.join(os.tmpdir(), "sdk-download-access-no-dir");
  process.env["HF_TOKEN"] = "hf_server";
  clearHfTokenCache();
  mocks.values = {};
  mocks.startDownload.mockClear();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  clearHfTokenCache();
});

async function startedWith(): Promise<Record<string, unknown>> {
  createSdkV1ModelDownloadService().start({ userId: "alice", request });
  await vi.waitFor(() => expect(mocks.startDownload).toHaveBeenCalled());
  return (mocks.startDownload.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
}

describe("SDK model download Hub access", () => {
  it("sends the server token to the operator endpoint", async () => {
    expect(await startedWith()).toMatchObject({
      endpoint: "https://huggingface.co",
      token: "hf_server"
    });
  });

  it("sends no token to an endpoint from the user's settings", async () => {
    mocks.values = { HF_ENDPOINT: "https://mirror.example.com" };
    expect(await startedWith()).toMatchObject({
      endpoint: "https://mirror.example.com",
      token: false
    });
  });

  it("downloads from the operator endpoint on the cloud profile", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    mocks.values = { HF_ENDPOINT: "https://mirror.example.com", HF_TOKEN: "hf_user" };
    expect(await startedWith()).toMatchObject({
      endpoint: "https://huggingface.co",
      token: "hf_user"
    });
  });
});
