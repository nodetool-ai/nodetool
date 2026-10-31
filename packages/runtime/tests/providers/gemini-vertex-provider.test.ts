import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GeminiVertexProvider,
  vertexHost,
  type GeminiVertexSecrets
} from "../../src/providers/gemini-vertex-provider.js";
import {
  clearGoogleTokenCache,
  getGoogleAccessToken,
  parseGoogleCredentials,
  signServiceAccountAssertion,
  type GoogleCredentials
} from "../../src/providers/google-cloud-auth.js";

const MODEL = "gemini-3.5-flash";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048
});
const SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "key-project",
  private_key_id: "kid-1",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  client_email: "nodetool@key-project.iam.gserviceaccount.com",
  token_uri: TOKEN_URL
};
const AUTHORIZED_USER: GoogleCredentials = {
  type: "authorized_user",
  client_id: "client-id",
  client_secret: "client-secret",
  refresh_token: "refresh-token"
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const reply = () =>
  json({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] });

/** A fetch that answers the token endpoint and then `respond` for everything else. */
function fakeFetch(respond: (url: string, init?: RequestInit) => Response = reply) {
  return vi.fn(async (url: string, init?: RequestInit) =>
    url === TOKEN_URL
      ? json({ access_token: "ya29.token", expires_in: 3600 })
      : respond(url, init)
  );
}

function provider(
  fetchFn: ReturnType<typeof vi.fn>,
  secrets: GeminiVertexSecrets = {},
  readApplicationDefault: () => Promise<GoogleCredentials | null> = async () => null
): GeminiVertexProvider {
  return new GeminiVertexProvider(
    {
      GOOGLE_CLOUD_PROJECT: "my-project",
      GOOGLE_VERTEX_CREDENTIALS: JSON.stringify(SERVICE_ACCOUNT),
      ...secrets
    },
    {
      fetchFn: fetchFn as unknown as typeof fetch,
      sleepFn: async () => {},
      readApplicationDefault
    }
  );
}

function apiCalls(fetchFn: ReturnType<typeof vi.fn>) {
  return fetchFn.mock.calls.filter(([url]) => url !== TOKEN_URL) as Array<
    [string, RequestInit & { headers: Record<string, string> }]
  >;
}

const ask = (p: GeminiVertexProvider) =>
  p.generateMessage({
    model: MODEL,
    messages: [{ role: "user", content: "hi" }]
  });

beforeEach(() => clearGoogleTokenCache());

describe("GeminiVertexProvider endpoint", () => {
  it("calls the project's publisher model with a service account token", async () => {
    const fetchFn = fakeFetch();
    const result = await ask(provider(fetchFn));

    expect(result.content).toBe("Hello");
    const [[url, init]] = apiCalls(fetchFn);
    expect(url).toBe(
      `https://aiplatform.googleapis.com/v1beta1/projects/my-project/locations/global/publishers/google/models/${MODEL}:generateContent`
    );
    expect(init.headers.Authorization).toBe("Bearer ya29.token");
    expect(init.headers["x-goog-user-project"]).toBeUndefined();
    expect(init.headers["x-goog-api-key"]).toBeUndefined();
  });

  it("mints one token for several requests", async () => {
    const fetchFn = fakeFetch();
    const p = provider(fetchFn);
    await ask(p);
    await ask(provider(fetchFn));
    await ask(p);

    expect(fetchFn.mock.calls.filter(([url]) => url === TOKEN_URL)).toHaveLength(1);
  });

  it("streams through streamGenerateContent with alt=sse", async () => {
    const fetchFn = fakeFetch(
      () =>
        new Response(
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hi" }] } }] })}\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        )
    );
    const items = [];
    for await (const item of provider(fetchFn).generateMessages({
      model: MODEL,
      messages: [{ role: "user", content: "hi" }]
    })) {
      items.push(item);
    }

    expect(apiCalls(fetchFn)[0][0]).toBe(
      `https://aiplatform.googleapis.com/v1beta1/projects/my-project/locations/global/publishers/google/models/${MODEL}:streamGenerateContent?alt=sse`
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it.each([
    ["global", "aiplatform.googleapis.com"],
    ["us", "aiplatform.us.rep.googleapis.com"],
    ["eu", "aiplatform.eu.rep.googleapis.com"],
    ["us-central1", "us-central1-aiplatform.googleapis.com"]
  ])("routes location %s to %s", async (location, host) => {
    expect(vertexHost(location)).toBe(host);
    const fetchFn = fakeFetch();
    await ask(provider(fetchFn, { GOOGLE_CLOUD_LOCATION: location }));
    expect(apiCalls(fetchFn)[0][0]).toBe(
      `https://${host}/v1beta1/projects/my-project/locations/${location}/publishers/google/models/${MODEL}:generateContent`
    );
  });

  it("sends a Vertex API key on the project-less publisher path", async () => {
    const fetchFn = fakeFetch();
    await ask(
      provider(fetchFn, {
        GOOGLE_VERTEX_CREDENTIALS: "",
        GOOGLE_VERTEX_API_KEY: "vertex-key"
      })
    );

    const [[url, init]] = apiCalls(fetchFn);
    expect(url).toBe(
      `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${MODEL}:generateContent`
    );
    expect(init.headers["x-goog-api-key"]).toBe("vertex-key");
    expect(init.headers.Authorization).toBeUndefined();
    expect(fetchFn.mock.calls.some(([u]) => u === TOKEN_URL)).toBe(false);
  });

  it("prefers a service account key over a Vertex API key", async () => {
    const fetchFn = fakeFetch();
    await ask(provider(fetchFn, { GOOGLE_VERTEX_API_KEY: "vertex-key" }));
    const [[url, init]] = apiCalls(fetchFn);
    expect(url).toContain("/projects/my-project/");
    expect(init.headers.Authorization).toBe("Bearer ya29.token");
  });

  it("uses Application Default Credentials when allowed, billing quota to the project", async () => {
    const fetchFn = fakeFetch();
    const readAdc = vi.fn(async () => AUTHORIZED_USER);
    await ask(
      provider(
        fetchFn,
        { GOOGLE_VERTEX_CREDENTIALS: "", _allowApplicationDefault: true },
        readAdc
      )
    );

    const tokenCall = fetchFn.mock.calls.find(([url]) => url === TOKEN_URL);
    const form = new URLSearchParams(String(tokenCall?.[1]?.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("refresh-token");
    const [[, init]] = apiCalls(fetchFn);
    expect(init.headers.Authorization).toBe("Bearer ya29.token");
    expect(init.headers["x-goog-user-project"]).toBe("my-project");
  });

  it("never reads Application Default Credentials when not allowed", async () => {
    const fetchFn = fakeFetch();
    const readAdc = vi.fn(async () => AUTHORIZED_USER);
    const p = provider(fetchFn, { GOOGLE_VERTEX_CREDENTIALS: "" }, readAdc);

    await expect(ask(p)).rejects.toThrow(
      "No Google Cloud credentials found. Add a service account key or a Vertex AI API key."
    );
    expect(readAdc).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("tells a local user to run gcloud when no credential exists", async () => {
    const p = provider(fakeFetch(), {
      GOOGLE_VERTEX_CREDENTIALS: "",
      _allowApplicationDefault: true
    });
    await expect(ask(p)).rejects.toThrow("gcloud auth application-default login");
  });

  it("rejects a missing project and an invalid location", () => {
    expect(() => provider(fakeFetch(), { GOOGLE_CLOUD_PROJECT: "" })).toThrow(
      "GOOGLE_CLOUD_PROJECT is required"
    );
    expect(() =>
      provider(fakeFetch(), { GOOGLE_CLOUD_LOCATION: "us-central1/../x" })
    ).toThrow("GOOGLE_CLOUD_LOCATION is not a location");
  });

  it("keeps credentials out of container environments", () => {
    expect(provider(fakeFetch()).getContainerEnv()).toEqual({});
  });

  it("refuses media too large to send inline instead of using the Files API", async () => {
    const fetchFn = fakeFetch();
    const big = new Uint8Array(20 * 1024 * 1024);
    await expect(
      provider(fetchFn).videoToVideo(big, {
        model: { id: "gemini-omni-1.1-flash", name: "Omni", provider: "gemini_vertex" },
        prompt: "make it night"
      })
    ).rejects.toThrow("Vertex AI takes media inline up to 19 MB");
    expect(fetchFn.mock.calls.some(([url]) => String(url).includes("upload"))).toBe(false);
  });
});

describe("GeminiVertexProvider Veo", () => {
  afterEach(() => vi.useRealTimers());

  it("polls with fetchPredictOperation and returns the inline video", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const video = Buffer.from("vertex-mp4");
    const operation = "publishers/google/models/veo-3.1-generate-preview/operations/op-1";
    const fetchFn = fakeFetch((url) =>
      url.endsWith(":predictLongRunning")
        ? json({ name: operation, done: false })
        : json({
            name: operation,
            done: true,
            response: { videos: [{ bytesBase64Encoded: video.toString("base64") }] }
          })
    );

    // An API key keeps the run free of real async work (token signing), so
    // the fake clock alone decides when the poll fires.
    const pending = provider(fetchFn, {
      GOOGLE_VERTEX_CREDENTIALS: "",
      GOOGLE_VERTEX_API_KEY: "vertex-key"
    }).textToVideo({
      model: { id: "veo-3.1-generate-preview", name: "Veo", provider: "gemini_vertex" },
      prompt: "a paper boat"
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;

    expect(Buffer.from(result).toString()).toBe("vertex-mp4");
    const [submit, poll] = apiCalls(fetchFn);
    const model =
      "https://aiplatform.googleapis.com/v1beta1/publishers/google/models/veo-3.1-generate-preview";
    expect(submit[0]).toBe(`${model}:predictLongRunning`);
    expect(poll[0]).toBe(`${model}:fetchPredictOperation`);
    expect(poll[1].method).toBe("POST");
    expect(JSON.parse(String(poll[1].body))).toEqual({ operationName: operation });
  });
});

describe("GeminiVertexProvider models", () => {
  it("lists Gemini chat models from the publisher catalog", async () => {
    const fetchFn = fakeFetch(() =>
      json({
        publisherModels: [
          { name: "publishers/google/models/gemini-3.5-flash" },
          { name: "publishers/google/models/gemini-3.1-flash-image" },
          { name: "publishers/google/models/gemini-embedding-001" },
          { name: "publishers/google/models/imagen-4.0-generate-001" },
          { name: "publishers/google/models/gemini-3.1-pro" }
        ]
      })
    );

    const models = await provider(fetchFn).getAvailableLanguageModels();

    expect(apiCalls(fetchFn)[0][0]).toBe(
      "https://aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=100"
    );
    expect(models).toEqual([
      { id: "gemini-3.1-pro", name: "gemini-3.1-pro", provider: "gemini_vertex" },
      { id: "gemini-3.5-flash", name: "gemini-3.5-flash", provider: "gemini_vertex" }
    ]);
  });

  it("returns no chat models when listing fails", async () => {
    const fetchFn = fakeFetch(() => json({ error: { message: "denied" } }, 403));
    await expect(provider(fetchFn).getAvailableLanguageModels()).resolves.toEqual([]);
  });

  it("labels the media model lists as its own", async () => {
    const p = provider(fakeFetch());
    for (const models of [
      await p.getAvailableImageModels(),
      await p.getAvailableVideoModels(),
      await p.getAvailableEmbeddingModels()
    ]) {
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === "gemini_vertex")).toBe(true);
    }
  });
});

describe("google-cloud-auth", () => {
  it("signs a service account assertion Google can verify", async () => {
    const credentials = parseGoogleCredentials(JSON.stringify(SERVICE_ACCOUNT));
    if (credentials.type !== "service_account") throw new Error("wrong type");
    const jwt = await signServiceAccountAssertion(credentials, TOKEN_URL, 1_000);
    const [header, claims, signature] = jwt.split(".");

    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
      kid: "kid-1"
    });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: SERVICE_ACCOUNT.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: TOKEN_URL,
      iat: 1_000,
      exp: 4_600
    });
    const verify = createVerify("RSA-SHA256");
    verify.update(`${header}.${claims}`);
    expect(verify.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("refreshes a token shortly before it expires", async () => {
    let now = 0;
    const fetchFn = fakeFetch();
    const options = { fetchFn: fetchFn as unknown as typeof fetch, now: () => now };
    await getGoogleAccessToken(AUTHORIZED_USER, options);
    now = 3_000_000;
    await getGoogleAccessToken(AUTHORIZED_USER, options);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = 3_550_000;
    await getGoogleAccessToken(AUTHORIZED_USER, options);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("explains a rejected refresh token", async () => {
    const fetchFn = vi.fn(async () =>
      json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)
    );
    await expect(
      getGoogleAccessToken(AUTHORIZED_USER, { fetchFn: fetchFn as unknown as typeof fetch })
    ).rejects.toThrow(
      "Google Cloud sign-in failed: Token has been expired or revoked. Run `gcloud auth application-default login` again."
    );
  });

  it("rejects unsupported credential files", () => {
    expect(() => parseGoogleCredentials("not json")).toThrow("not valid JSON");
    expect(() =>
      parseGoogleCredentials(JSON.stringify({ type: "external_account" }))
    ).toThrow("Unsupported Google Cloud credentials (type: external_account)");
  });
});
