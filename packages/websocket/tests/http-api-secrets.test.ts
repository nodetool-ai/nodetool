import { describe, it, expect, beforeEach } from "vitest";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Secret,
} from "@nodetool/models";
import { setMasterKey } from "@nodetool/security";
import { handleApiRequest } from "../src/http-api.js";

const TEST_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  userId = "user-1"
): Request {
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost${url}`, init);
}

describe("HTTP API: settings/secrets", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    setMasterKey(TEST_MASTER_KEY);
    await Secret.createTable();
  });

  it("GET /api/settings/secrets returns all registry secrets initially (none configured)", async () => {
    const res = await handleApiRequest(makeRequest("GET", "/api/settings/secrets"));
    expect(res.status).toBe(200);

    const data = (await jsonBody(res)) as { secrets: Array<Record<string, unknown>>; next_key: unknown };
    expect(data.secrets.length).toBeGreaterThan(0);
    // All secrets should be unconfigured initially
    for (const s of data.secrets) {
      expect(s.is_configured).toBe(false);
    }
  });

  it("PUT /api/settings/secrets/:key creates a secret", async () => {
    const res = await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/OPENAI_API_KEY", {
        value: "sk-test-123",
        description: "My OpenAI key",
      })
    );
    expect(res.status).toBe(200);

    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.key).toBe("OPENAI_API_KEY");
    expect(data.description).toBe("My OpenAI key");
    expect(data.is_configured).toBe(true);
    expect(data.user_id).toBe("user-1");
    expect(data).not.toHaveProperty("encrypted_value");
    expect(data).not.toHaveProperty("value");
  });

  it("GET /api/settings/secrets lists created secrets with is_configured flag", async () => {
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/OPENAI_API_KEY", { value: "sk-test-a" })
    );
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/ANTHROPIC_API_KEY", { value: "sk-ant-b" })
    );

    const res = await handleApiRequest(makeRequest("GET", "/api/settings/secrets"));
    expect(res.status).toBe(200);

    const data = (await jsonBody(res)) as { secrets: Array<Record<string, unknown>> };
    // Should return all registry secrets
    expect(data.secrets.length).toBeGreaterThan(0);

    const configured = data.secrets.filter((s) => s.is_configured);
    const configuredKeys = configured.map((s) => s.key).sort();
    expect(configuredKeys).toContain("ANTHROPIC_API_KEY");
    expect(configuredKeys).toContain("OPENAI_API_KEY");

    // Should not include encrypted values
    for (const s of data.secrets) {
      expect(s).not.toHaveProperty("encrypted_value");
      expect(s).not.toHaveProperty("value");
    }
  });

  it("GET /api/settings/secrets/:key returns secret metadata", async () => {
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/GROQ_API_KEY", {
        value: "gsk-test",
        description: "desc",
      })
    );

    const res = await handleApiRequest(
      makeRequest("GET", "/api/settings/secrets/GROQ_API_KEY")
    );
    expect(res.status).toBe(200);

    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.key).toBe("GROQ_API_KEY");
    expect(data.description).toBe("desc");
    expect(data.is_configured).toBe(true);
    expect(data).not.toHaveProperty("value");
  });

  it("GET /api/settings/secrets/:key?decrypt=true returns decrypted value", async () => {
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/GEMINI_API_KEY", {
        value: "super-secret-value",
      })
    );

    const res = await handleApiRequest(
      makeRequest("GET", "/api/settings/secrets/GEMINI_API_KEY?decrypt=true")
    );
    expect(res.status).toBe(200);

    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.key).toBe("GEMINI_API_KEY");
    expect(data.value).toBe("super-secret-value");
  });

  it("GET /api/settings/secrets/:key returns 404 when not found", async () => {
    const res = await handleApiRequest(
      makeRequest("GET", "/api/settings/secrets/NONEXISTENT")
    );
    expect(res.status).toBe(404);
  });

  it("PUT /api/settings/secrets/:key updates an existing secret", async () => {
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/MISTRAL_API_KEY", {
        value: "original",
        description: "v1",
      })
    );

    const res = await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/MISTRAL_API_KEY", {
        value: "updated",
        description: "v2",
      })
    );
    expect(res.status).toBe(200);

    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.description).toBe("v2");

    // Verify updated value
    const getRes = await handleApiRequest(
      makeRequest("GET", "/api/settings/secrets/MISTRAL_API_KEY?decrypt=true")
    );
    const getData = (await jsonBody(getRes)) as Record<string, unknown>;
    expect(getData.value).toBe("updated");
  });

  it("PUT /api/settings/secrets/:key returns 400 for missing value", async () => {
    const res = await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/FAL_API_KEY", {
        description: "no value",
      })
    );
    expect(res.status).toBe(400);
  });

  it("DELETE /api/settings/secrets/:key deletes a secret", async () => {
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/ELEVENLABS_API_KEY", { value: "to-delete" })
    );

    const res = await handleApiRequest(
      makeRequest("DELETE", "/api/settings/secrets/ELEVENLABS_API_KEY")
    );
    expect(res.status).toBe(200);

    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.message).toBe("Secret deleted successfully");

    // Verify it's gone (GET by key returns 404 when not in DB)
    const getRes = await handleApiRequest(
      makeRequest("GET", "/api/settings/secrets/ELEVENLABS_API_KEY")
    );
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/settings/secrets/:key returns 404 when not found", async () => {
    const res = await handleApiRequest(
      makeRequest("DELETE", "/api/settings/secrets/NONEXISTENT")
    );
    expect(res.status).toBe(404);
  });

  it("isolates secrets between users", async () => {
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/OPENAI_API_KEY", { value: "user1-val" }, "user-1")
    );
    await handleApiRequest(
      makeRequest("PUT", "/api/settings/secrets/OPENAI_API_KEY", { value: "user2-val" }, "user-2")
    );

    const res1 = await handleApiRequest(
      makeRequest("GET", "/api/settings/secrets/OPENAI_API_KEY?decrypt=true", undefined, "user-1")
    );
    const data1 = (await jsonBody(res1)) as Record<string, unknown>;
    expect(data1.value).toBe("user1-val");

    const res2 = await handleApiRequest(
      makeRequest("GET", "/api/settings/secrets/OPENAI_API_KEY?decrypt=true", undefined, "user-2")
    );
    const data2 = (await jsonBody(res2)) as Record<string, unknown>;
    expect(data2.value).toBe("user2-val");
  });
});
