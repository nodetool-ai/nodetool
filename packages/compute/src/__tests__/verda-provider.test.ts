import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VerdaProvider } from "../providers/verda.js";
import { VerdaApiClient, assertSafeId } from "../providers/verda-api.js";
import type { WorkerSpec } from "../providers/types.js";

// ---------------------------------------------------------------------------
// Setup — mock the global fetch the Verda transport uses. Every test drives the
// provider through recorded response shapes taken from the published OpenAPI
// schema (https://api.verda.com/v1/openapi.json), so no live calls are made.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  const partial: Pick<Response, "ok" | "status" | "json" | "text" | "headers"> =
    {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(body === null ? "" : text),
      headers: new Headers(headers),
    };
  // SAFETY: the code under test reads only ok/status/json/text/headers.
  return partial as Response;
}

const CREDENTIALS = { clientId: "client-id", clientSecret: "client-secret" };

/** The token every authenticated call is preceded by. */
function tokenResponse(): Response {
  return response({
    access_token: "access-token",
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "refresh-token",
    scope: "cloud-api-v1",
  });
}

const OS_IMAGES = [
  { id: "img-1", image_type: "ubuntu-22.04", name: "Ubuntu 22.04" },
  {
    id: "img-2",
    image_type: "ubuntu-24.04-cuda-12.8-docker",
    name: "Ubuntu 24.04 + CUDA 12.8 + Docker",
  },
];

const AVAILABILITY = [
  { location_code: "FIN-01", availabilities: ["1H100.80S.30V"] },
  { location_code: "ICE-01", availabilities: ["1H100.80S.30V", "1V100.6V"] },
];

function runningInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    ip: "203.0.113.9",
    status: "running",
    hostname: "hf-worker",
    instance_type: "1H100.80S.30V",
    location: "FIN-01",
    os_volume_id: "22222222-2222-2222-2222-222222222222",
    volume_ids: [],
    ssh_key_ids: [],
    startup_script_id: "33333333-3333-3333-3333-333333333333",
    price_per_hour: 2.45,
    ...overrides,
  };
}

function baseSpec(overrides: Partial<WorkerSpec> = {}): WorkerSpec {
  return {
    name: "HF Worker",
    image: "ghcr.io/nodetool-ai/nodetool-worker:0.7.3",
    target: "verda",
    gpu: "1H100.80S.30V",
    token: "worker-secret",
    ...overrides,
  };
}

/**
 * Queue the responses a successful provision consumes, in order:
 * token, images, availability, script create, instance create, then the poll.
 */
function queueProvision(instance = runningInstance()): void {
  mockFetch
    .mockResolvedValueOnce(tokenResponse())
    .mockResolvedValueOnce(response(OS_IMAGES))
    .mockResolvedValueOnce(response(AVAILABILITY))
    .mockResolvedValueOnce(response({ id: instance.startup_script_id }, 201))
    .mockResolvedValueOnce(response({ id: instance.id }, 202))
    .mockResolvedValueOnce(response(instance));
}

/** Every request body sent to a given path, parsed. */
function bodiesFor(path: string): Array<Record<string, unknown>> {
  return mockFetch.mock.calls
    .filter(([url]) => String(url).endsWith(path))
    .map(([, init]) => JSON.parse(String(init?.body ?? "{}")));
}

function newProvider(): VerdaProvider {
  return new VerdaProvider(CREDENTIALS);
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("VerdaProvider.provision", () => {
  it("creates an instance with an explicit location and a CUDA+Docker image", async () => {
    queueProvision();
    const result = await newProvider().provision(baseSpec());

    const [create] = bodiesFor("/v1/instances");
    // Since March 2026 a create without location_code is rejected outright.
    expect(create.location_code).toBe("FIN-01");
    expect(create.instance_type).toBe("1H100.80S.30V");
    // The guest OS image is a VM image, NOT the worker's Docker image.
    expect(create.image).toBe("ubuntu-24.04-cuda-12.8-docker");
    expect(create.contract).toBe("PAY_AS_YOU_GO");
    // Dynamic pricing is removed from the API; never offer it.
    expect(create.pricing).toBeUndefined();
    expect(result.wsUrl).toBe("ws://203.0.113.9:7777");
    expect(result.costUsd).toBe(2.45);
    expect(result.status).toBe("running");
  });

  it("refuses to launch a worker with no bearer token", async () => {
    // The bootstrap publishes 7777 with Docker, which a UFW rule does not
    // block — an unauthenticated worker would be exposed on a public IP.
    await expect(
      newProvider().provision(baseSpec({ token: undefined }))
    ).rejects.toThrow(/bearer token is required/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("requires an instance type rather than guessing one", async () => {
    await expect(
      newProvider().provision(baseSpec({ gpu: undefined }))
    ).rejects.toThrow(/instance type/i);
  });

  it("rejects a region where the instance type has no capacity", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response(OS_IMAGES))
      .mockResolvedValueOnce(response(AVAILABILITY));

    await expect(
      newProvider().provision(baseSpec({ region: "USA-01" }))
    ).rejects.toThrow(/not available in "USA-01"/);
  });

  it("rejects an OS image that is not in the live catalog", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response(OS_IMAGES))
      .mockResolvedValueOnce(response(AVAILABILITY));

    await expect(
      newProvider().provision(baseSpec({ osImage: "ubuntu-99.04" }))
    ).rejects.toThrow(/not in the catalog/);
  });

  it("reports no capacity distinctly when the create is refused with 503", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response(OS_IMAGES))
      .mockResolvedValueOnce(response(AVAILABILITY))
      .mockResolvedValueOnce(response({ id: "script-1" }, 201))
      // The transport retries 503 before giving up; answer every attempt.
      // `retry-after: 0` keeps the real backoff from dominating the test.
      .mockResolvedValue(response("no capacity", 503, { "retry-after": "0" }));

    await expect(newProvider().provision(baseSpec())).rejects.toThrow(
      /no capacity/i
    );
  });

  it("destroys the instance and its new volume when readiness fails", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response(OS_IMAGES))
      .mockResolvedValueOnce(response(AVAILABILITY))
      .mockResolvedValueOnce(response({ id: "script-1" }, 201))
      .mockResolvedValueOnce(response({ id: "inst-1" }, 202))
      .mockResolvedValueOnce(response(runningInstance({ status: "error" })))
      // The teardown re-reads the instance to learn which volumes to delete.
      .mockResolvedValueOnce(
        response(
          runningInstance({
            id: "inst-1",
            status: "error",
            volume_ids: ["66666666-6666-6666-6666-666666666666"],
          })
        )
      )
      .mockResolvedValueOnce(response(null, 202));

    await expect(newProvider().provision(baseSpec())).rejects.toThrow(
      /terminal status/
    );

    // A create that is never persisted must not leave a billing resource: the
    // failed machine AND the volumes it just created are destroyed rather than
    // left for the reconcile scan, which never sees an unrecorded ref.
    const deletes = bodiesFor("/v1/instances").filter(
      (body) => body.action === "delete"
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0].id).toBe("inst-1");
    // An EMPTY list here would retain every disk — a silent billing leak.
    expect(deletes[0].volume_ids).toEqual([
      "22222222-2222-2222-2222-222222222222",
      "66666666-6666-6666-6666-666666666666",
    ]);
    expect(deletes[0].delete_permanently).toBe(true);
  });

  it("writes a rerun-safe bootstrap script that publishes the worker port", async () => {
    queueProvision();
    await newProvider().provision(baseSpec({ env: { EXTRA: "value" } }));

    const [script] = bodiesFor("/v1/scripts");
    const body = String(script.script);
    // Verda runs the script on EVERY boot, including after a resume.
    expect(body).toContain("docker inspect nodetool-worker");
    expect(body).toContain("docker start nodetool-worker");
    expect(body).toContain("-p 7777:7777");
    expect(body).toContain("HF_HOME=/workspace/huggingface");
    expect(body).toContain("EXTRA=value");
    expect(body).toContain("NODETOOL_WORKER_TOKEN=worker-secret");
  });
});

describe("VerdaProvider.stop", () => {
  it("releases compute while retaining every volume", async () => {
    queueProvision();
    const provider = newProvider();
    const { providerRef } = await provider.provision(baseSpec());

    mockFetch.mockResolvedValueOnce(response(null, 202));
    await provider.stop(providerRef);

    const [action] = bodiesFor("/v1/instances").filter(
      (body) => body.action === "delete"
    );
    expect(action.id).toBe("11111111-1111-1111-1111-111111111111");
    // An EMPTY list retains all volumes; OMITTING the field would delete the
    // OS volume and with it the cached models.
    expect(action.volume_ids).toEqual([]);
    expect(action.delete_permanently).toBeUndefined();
  });

  it("refuses to pause a worker with no retained volume to resume from", async () => {
    queueProvision(runningInstance({ os_volume_id: "" }));
    const provider = newProvider();
    const { providerRef } = await provider.provision(baseSpec());

    await expect(provider.stop(providerRef)).rejects.toThrow(
      /no recorded OS volume/
    );
  });
});

describe("VerdaProvider.resume", () => {
  it("boots a new machine from the retained OS volume and returns its new ref", async () => {
    queueProvision();
    const provider = newProvider();
    const original = await provider.provision(baseSpec());

    const resumed = runningInstance({
      id: "44444444-4444-4444-4444-444444444444",
      ip: "203.0.113.20",
    });
    mockFetch
      // The old instance is gone after the pause.
      .mockResolvedValueOnce(response(runningInstance({ status: "notfound" })))
      .mockResolvedValueOnce(response({ id: resumed.id }, 202))
      .mockResolvedValueOnce(response(resumed));

    const result = await provider.resume(original.providerRef);

    const create = bodiesFor("/v1/instances").at(-1);
    // The retained OS volume id stands in for an image type: the machine boots
    // the old disk, model cache and all.
    expect(create?.image).toBe("22222222-2222-2222-2222-222222222222");
    expect(create?.location_code).toBe("FIN-01");
    expect(create?.os_volume).toBeUndefined();
    expect(result.wsUrl).toBe("ws://203.0.113.20:7777");
    // The handle CHANGED — the manager must persist it or lose the live machine.
    expect(result.providerRef).not.toBe(original.providerRef);
  });

  it("keeps the retained volume when the resumed machine fails to come up", async () => {
    queueProvision();
    const provider = newProvider();
    const original = await provider.provision(baseSpec());

    mockFetch
      .mockResolvedValueOnce(response(runningInstance({ status: "notfound" })))
      .mockResolvedValueOnce(response({ id: "inst-2" }, 202))
      .mockResolvedValueOnce(
        response(runningInstance({ id: "inst-2", status: "error" }))
      )
      .mockResolvedValueOnce(response(null, 202));

    await expect(provider.resume(original.providerRef)).rejects.toThrow(
      /terminal status/
    );

    const cleanup = bodiesFor("/v1/instances").at(-1);
    // The volume predates this attempt and holds the user's models.
    expect(cleanup?.volume_ids).toEqual([]);
    expect(cleanup?.delete_permanently).toBeUndefined();
  });
});

describe("VerdaProvider.terminate", () => {
  it("names every attached volume and deletes them permanently", async () => {
    queueProvision(
      runningInstance({ volume_ids: ["55555555-5555-5555-5555-555555555555"] })
    );
    const provider = newProvider();
    const { providerRef } = await provider.provision(baseSpec());

    mockFetch
      .mockResolvedValueOnce(
        response(
          runningInstance({
            volume_ids: ["55555555-5555-5555-5555-555555555555"],
          })
        )
      )
      .mockResolvedValueOnce(response(null, 202));

    await provider.terminate(providerRef);

    const action = bodiesFor("/v1/instances").at(-1);
    // Omitting a volume would only DETACH it, leaving it billable.
    expect(action?.volume_ids).toEqual([
      "22222222-2222-2222-2222-222222222222",
      "55555555-5555-5555-5555-555555555555",
    ]);
    // Trashed volumes still hold quota and can be restored at a charge.
    expect(action?.delete_permanently).toBe(true);
  });

  it("deletes the retained volume when compute was already released", async () => {
    queueProvision();
    const provider = newProvider();
    const { providerRef } = await provider.provision(baseSpec());

    mockFetch
      .mockResolvedValueOnce(response(runningInstance({ status: "notfound" })))
      .mockResolvedValueOnce(response(null, 202));

    await provider.terminate(providerRef);

    const [volumeAction] = bodiesFor("/v1/volumes");
    expect(volumeAction).toMatchObject({
      action: "delete",
      id: "22222222-2222-2222-2222-222222222222",
      is_permanent: true,
    });
  });
});

describe("VerdaProvider.status and list", () => {
  it("reports a released worker as stopped, not missing", async () => {
    queueProvision();
    const provider = newProvider();
    const { providerRef } = await provider.provision(baseSpec());

    mockFetch.mockResolvedValueOnce(response("not found", 404));
    expect(await provider.status(providerRef)).toBe("stopped");
  });

  it("maps an unknown provider state to error rather than progress", async () => {
    queueProvision();
    const provider = newProvider();
    const { providerRef } = await provider.provision(baseSpec());

    mockFetch.mockResolvedValueOnce(
      response(runningInstance({ status: "installation_failed" }))
    );
    expect(await provider.status(providerRef)).toBe("error");
  });

  it("encodes the same handle in list() as in provision(), so reconcile matches", async () => {
    queueProvision();
    const provider = newProvider();
    const provisioned = await provider.provision(baseSpec());

    mockFetch.mockResolvedValueOnce(response([runningInstance()]));
    const listed = await provider.list();

    // A mismatch here would make the manager treat every tracked Verda worker
    // as an orphan and mark the live one dead.
    expect(listed).toEqual([
      { providerRef: provisioned.providerRef, status: "running" },
    ]);
  });
});

describe("Verda input safety", () => {
  it.each([
    "../../v1/instances",
    "abc/def",
    "id?query=1",
    "id with space",
  ])("rejects the traversal-shaped id %s", (id) => {
    expect(() => assertSafeId(id, "instance id")).toThrow(/Unsafe Verda/);
  });

  it("accepts a normal uuid", () => {
    expect(
      assertSafeId("11111111-1111-1111-1111-111111111111", "instance id")
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("rejects a handle that is not a Verda handle", async () => {
    await expect(newProvider().status("runpod-pod-id")).rejects.toThrow(
      /Not a Verda worker handle/
    );
  });
});

describe("VerdaApiClient", () => {
  it("mints one token for concurrent calls and reuses it", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValue(response([]));

    const client = new VerdaApiClient(CREDENTIALS);
    await Promise.all([
      client.request("GET", "/v1/locations"),
      client.request("GET", "/v1/images"),
    ]);
    await client.request("GET", "/v1/instances");

    const tokenCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/oauth2/token")
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("never echoes the client secret when authentication fails", async () => {
    mockFetch.mockResolvedValueOnce(
      response({ message: "bad client_secret=client-secret" }, 401)
    );
    const client = new VerdaApiClient(CREDENTIALS);
    await expect(client.request("GET", "/v1/instances")).rejects.toThrow(
      /Check VERDA_CLIENT_ID and VERDA_CLIENT_SECRET/
    );
    const [[, init]] = mockFetch.mock.calls;
    expect(String(init?.body)).toContain("client_credentials");
  });

  it("retries a rate-limited call after Retry-After and then succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response("slow down", 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(response([{ code: "FIN-01" }]));

    const client = new VerdaApiClient(CREDENTIALS);
    const { status, body } = await client.request("GET", "/v1/locations");
    expect(status).toBe(200);
    expect(body).toEqual([{ code: "FIN-01" }]);
  });

  it("re-authenticates once after a 401 on an authenticated call", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response("expired", 401))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response([]));

    const client = new VerdaApiClient(CREDENTIALS);
    await client.request("GET", "/v1/instances");

    const tokenCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).endsWith("/v1/oauth2/token")
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it("returns 204 as an already-satisfied action, not an error", async () => {
    mockFetch
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response(null, 204));

    const client = new VerdaApiClient(CREDENTIALS);
    const { status, body } = await client.request("PUT", "/v1/instances", {
      action: "delete",
      id: "inst-1",
    });
    expect(status).toBe(204);
    expect(body).toBeNull();
  });

  it("surfaces a partially failed bulk action (207) as a failure", async () => {
    queueProvision();
    const provider = newProvider();
    const { providerRef } = await provider.provision(baseSpec());

    mockFetch.mockResolvedValueOnce(
      response(
        [{ instanceId: "inst-1", status: "error", message: "still deploying" }],
        207
      )
    );
    await expect(provider.stop(providerRef)).rejects.toThrow(
      /still deploying/
    );
  });

  it("requires both halves of the credential pair", () => {
    expect(
      () => new VerdaApiClient({ clientId: "id", clientSecret: "" })
    ).toThrow(/VERDA_CLIENT_ID and VERDA_CLIENT_SECRET/);
  });
});
