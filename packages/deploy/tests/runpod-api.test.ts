import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GPUType,
  ComputeType,
  CPUFlavor,
  DataCenter,
  CUDAVersion,
  enumValues,
  printEnumOptions,
  runGraphqlQuery,
  makeRunpodApiCall,
  createNetworkVolume,
  listNetworkVolumes,
  getNetworkVolume,
  updateNetworkVolume,
  getRunpodTemplateByName,
  deleteRunpodTemplateByName,
  updateRunpodTemplate,
  createOrUpdateRunpodTemplate,
  getRunpodEndpointByName,
  updateRunpodEndpoint,
  deleteRunpodEndpointByName,
  createOrUpdateRunpodEndpoint,
  createRunpodEndpointGraphql
} from "../src/runpod-api.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers()
  } as unknown as Response;
}

function textResponse(text: string, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(JSON.parse(text)),
    text: () => Promise.resolve(text),
    headers: new Headers()
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubEnv("RUNPOD_API_KEY", "test-api-key-123");
  mockFetch.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Enum helpers
// ---------------------------------------------------------------------------

describe("enumValues", () => {
  it("returns all values of GPUType", () => {
    const vals = enumValues(GPUType);
    expect(vals).toContain("ADA_24");
    expect(vals).toContain("HOPPER_141");
    expect(vals.length).toBe(Object.keys(GPUType).length);
  });

  it("returns all values of ComputeType", () => {
    expect(enumValues(ComputeType)).toEqual(["CPU", "GPU"]);
  });

  it("returns all values of CPUFlavor", () => {
    const vals = enumValues(CPUFlavor);
    expect(vals).toContain("cpu3c");
    expect(vals).toContain("cpu5g");
  });
});

describe("printEnumOptions", () => {
  it("logs enum values with title", () => {
    const spy = vi.spyOn(console, "log");
    printEnumOptions(ComputeType, "Compute Types");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Compute Types"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("CPU"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("GPU"));
  });
});

// ---------------------------------------------------------------------------
// makeRunpodApiCall
// ---------------------------------------------------------------------------

describe("makeRunpodApiCall", () => {
  it("makes GET request with auth header", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const result = await makeRunpodApiCall("endpoints", "GET");
    expect(result).toEqual({ items: [] });
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://rest.runpod.io/v1/endpoints");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test-api-key-123");
  });

  it("sends body for POST requests", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "tpl-1" }));
    await makeRunpodApiCall("templates", "POST", { name: "test" });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "test" });
  });

  it("sends body for PATCH requests", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await makeRunpodApiCall("templates/t1", "PATCH", { name: "updated" });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "updated" });
  });

  it("does NOT send body for GET even if data provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    await makeRunpodApiCall("templates", "GET", { foo: "bar" });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it("returns empty object for DELETE 204", async () => {
    mockFetch.mockResolvedValueOnce(textResponse("", 204, true));
    // We need ok = true for 204
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
      headers: new Headers()
    } as unknown as Response);
    const result = await makeRunpodApiCall("templates/t1", "DELETE");
    expect(result).toEqual({});
  });

  it("returns empty object when response body is empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
      headers: new Headers()
    } as unknown as Response);
    const result = await makeRunpodApiCall("endpoints", "GET");
    expect(result).toEqual({});
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
      headers: new Headers()
    } as unknown as Response);
    await expect(makeRunpodApiCall("templates", "GET")).rejects.toThrow(
      /failed with status 500/
    );
  });

  it("throws when RUNPOD_API_KEY is not set", async () => {
    vi.stubEnv("RUNPOD_API_KEY", "");
    // Remove the env var entirely
    delete process.env.RUNPOD_API_KEY;
    await expect(makeRunpodApiCall("endpoints", "GET")).rejects.toThrow(
      "RUNPOD_API_KEY environment variable is not set"
    );
  });

  it("throws when fetch itself throws (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    await expect(makeRunpodApiCall("endpoints", "GET")).rejects.toThrow(
      "Network error"
    );
  });
});

// ---------------------------------------------------------------------------
// runGraphqlQuery
// ---------------------------------------------------------------------------

describe("runGraphqlQuery", () => {
  it("sends query and returns data", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { myself: { id: "user-1" } } })
    );
    const result = await runGraphqlQuery("{ myself { id } }");
    expect(result).toEqual({ data: { myself: { id: "user-1" } } });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.runpod.io/graphql");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ query: "{ myself { id } }" });
  });

  it("uses custom base URL from env", async () => {
    vi.stubEnv("RUNPOD_API_BASE_URL", "https://custom.runpod.io");
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }));
    await runGraphqlQuery("{ test }");
    expect(mockFetch.mock.calls[0][0]).toBe("https://custom.runpod.io/graphql");
  });

  it("throws on 401 unauthorized", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));
    await expect(runGraphqlQuery("{ test }")).rejects.toThrow("Unauthorized");
  });

  it("throws on GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: "Bad query syntax" }] })
    );
    await expect(runGraphqlQuery("{ bad }")).rejects.toThrow(
      "Bad query syntax"
    );
  });

  it("throws when API key is missing", async () => {
    delete process.env.RUNPOD_API_KEY;
    await expect(runGraphqlQuery("{ test }")).rejects.toThrow("RUNPOD_API_KEY");
  });
});

// ---------------------------------------------------------------------------
// Network Volume CRUD
// ---------------------------------------------------------------------------

describe("Network Volume functions", () => {
  it("createNetworkVolume sends correct payload", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "vol-1" }));
    const result = await createNetworkVolume("my-vol", 50, "US-TX-3");
    expect(result).toEqual({ id: "vol-1" });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("networkvolumes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      dataCenterId: "US-TX-3",
      name: "my-vol",
      size: 50
    });
  });

  it("listNetworkVolumes makes GET request", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ id: "vol-1" }]));
    const result = await listNetworkVolumes();
    expect(mockFetch.mock.calls[0][0]).toContain("networkvolumes");
    expect(mockFetch.mock.calls[0][1].method).toBe("GET");
    expect(result).toEqual([{ id: "vol-1" }]);
  });

  it("getNetworkVolume makes GET with volume ID", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "vol-1", name: "my-vol" })
    );
    const result = await getNetworkVolume("vol-1");
    expect(mockFetch.mock.calls[0][0]).toContain("networkvolumes/vol-1");
    expect(result).toEqual({ id: "vol-1", name: "my-vol" });
  });

  it("updateNetworkVolume sends PATCH with partial data", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "vol-1" }));
    await updateNetworkVolume("vol-1", "renamed");
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "renamed" });
  });

  it("updateNetworkVolume sends both name and size", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "vol-1" }));
    await updateNetworkVolume("vol-1", "renamed", 100);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ name: "renamed", size: 100 });
  });

  it("updateNetworkVolume with no name or size sends empty object", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "vol-1" }));
    await updateNetworkVolume("vol-1");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Template Management
// ---------------------------------------------------------------------------

describe("getRunpodTemplateByName", () => {
  it("returns template when found in array response", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { id: "t1", name: "my-template" },
        { id: "t2", name: "other" }
      ])
    );
    const tpl = await getRunpodTemplateByName("my-template");
    expect(tpl).toEqual({ id: "t1", name: "my-template" });
  });

  it("returns template when found in object response", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        templates: [
          { id: "t1", name: "my-template" },
          { id: "t2", name: "other" }
        ]
      })
    );
    const tpl = await getRunpodTemplateByName("my-template");
    expect(tpl).toEqual({ id: "t1", name: "my-template" });
  });

  it("returns null when template not found", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ templates: [] }));
    const tpl = await getRunpodTemplateByName("nonexistent");
    expect(tpl).toBeNull();
  });

  it("returns null on API error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("API down"));
    const tpl = await getRunpodTemplateByName("my-template");
    expect(tpl).toBeNull();
  });
});

describe("deleteRunpodTemplateByName", () => {
  it("deletes existing template", async () => {
    // First call: list templates
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ templates: [{ id: "t1", name: "my-tpl" }] })
    );
    // Second call: delete
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
      headers: new Headers()
    } as unknown as Response);
    const result = await deleteRunpodTemplateByName("my-tpl");
    expect(result).toBe(true);
  });

  it("returns true when template does not exist", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ templates: [] }));
    const result = await deleteRunpodTemplateByName("nonexistent");
    expect(result).toBe(true);
  });

  it("returns false on delete error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ templates: [{ id: "t1", name: "my-tpl" }] })
    );
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server error"),
      headers: new Headers()
    } as unknown as Response);
    const result = await deleteRunpodTemplateByName("my-tpl");
    expect(result).toBe(false);
  });
});

describe("updateRunpodTemplate", () => {
  it("updates template with new image", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const tplData = {
      id: "t1",
      name: "my-tpl",
      containerDiskInGb: 30,
      ports: ["8000/http"],
      volumeInGb: 10,
      volumeMountPath: "/data",
      isPublic: false,
      env: {}
    };
    const result = await updateRunpodTemplate(tplData, "myimage", "v1");
    expect(result).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.imageName).toBe("myimage:v1");
    expect(body.env.PORT).toBe("8000");
  });

  it("includes optional fields when present", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const tplData = {
      id: "t1",
      name: "my-tpl",
      dockerEntrypoint: "/start.sh",
      dockerStartCmd: "serve",
      readme: "# Hello"
    };
    await updateRunpodTemplate(tplData, "img", "latest");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.dockerEntrypoint).toBe("/start.sh");
    expect(body.dockerStartCmd).toBe("serve");
    expect(body.readme).toBe("# Hello");
  });

  it("returns false on API error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fail"));
    const result = await updateRunpodTemplate(
      { id: "t1", name: "t" },
      "img",
      "v1"
    );
    expect(result).toBe(false);
  });
});

describe("createOrUpdateRunpodTemplate", () => {
  it("creates new template when none exists", async () => {
    // getRunpodTemplateByName -> no match
    mockFetch.mockResolvedValueOnce(jsonResponse({ templates: [] }));
    // createTemplate POST
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-tpl-1" }));
    const id = await createOrUpdateRunpodTemplate("my-tpl", "myimg", "v1", {
      KEY: "val"
    });
    expect(id).toBe("new-tpl-1");
  });

  it("updates existing template", async () => {
    // getRunpodTemplateByName -> found
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        templates: [{ id: "t1", name: "my-tpl", imageName: "old:v0" }]
      })
    );
    // updateRunpodTemplate PATCH
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const id = await createOrUpdateRunpodTemplate("my-tpl", "myimg", "v2");
    expect(id).toBe("t1");
  });

  it("throws when create returns no ID", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ templates: [] }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    await expect(
      createOrUpdateRunpodTemplate("my-tpl", "img", "v1")
    ).rejects.toThrow("No template ID returned");
  });

  it("throws when update fails", async () => {
    // getRunpodTemplateByName -> found
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ templates: [{ id: "t1", name: "my-tpl" }] })
    );
    // updateRunpodTemplate fails
    mockFetch.mockRejectedValueOnce(new Error("update failed"));
    await expect(
      createOrUpdateRunpodTemplate("my-tpl", "img", "v1")
    ).rejects.toThrow("Failed to update template");
  });
});

// ---------------------------------------------------------------------------
// Endpoint Management
// ---------------------------------------------------------------------------

describe("getRunpodEndpointByName", () => {
  it("finds exact match", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        endpoints: [
          { id: "ep1", name: "my-endpoint" },
          { id: "ep2", name: "other" }
        ]
      })
    );
    const ep = await getRunpodEndpointByName("my-endpoint");
    expect(ep).toEqual({ id: "ep1", name: "my-endpoint" });
  });

  it("finds prefix match when no exact match", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        endpoints: [{ id: "ep1", name: "my-endpoint-v2" }]
      })
    );
    const ep = await getRunpodEndpointByName("my-endpoint");
    expect(ep).toEqual({ id: "ep1", name: "my-endpoint-v2" });
  });

  it("returns null when no match", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    const ep = await getRunpodEndpointByName("missing");
    expect(ep).toBeNull();
  });

  it("handles array response format", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ id: "ep1", name: "my-ep" }])
    );
    const ep = await getRunpodEndpointByName("my-ep");
    expect(ep).toEqual({ id: "ep1", name: "my-ep" });
  });

  it("quiet mode suppresses logs", async () => {
    const logSpy = vi.spyOn(console, "log");
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    await getRunpodEndpointByName("test", true);
    // quiet mode should not log "Looking for endpoint" etc.
    const lookingCalls = logSpy.mock.calls.filter((c) =>
      String(c[0]).includes("Looking for endpoint")
    );
    expect(lookingCalls.length).toBe(0);
  });
});

describe("updateRunpodEndpoint", () => {
  it("updates endpoint with template ID", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const result = await updateRunpodEndpoint("ep1", "tpl1");
    expect(result).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.templateId).toBe("tpl1");
  });

  it("merges extra fields and removes undefined", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await updateRunpodEndpoint("ep1", "tpl1", {
      workersMin: 1,
      foo: undefined
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.workersMin).toBe(1);
    expect(body).not.toHaveProperty("foo");
  });

  it("returns false on error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fail"));
    const result = await updateRunpodEndpoint("ep1", "tpl1");
    expect(result).toBe(false);
  });
});

describe("deleteRunpodEndpointByName", () => {
  it("deletes endpoint by exact name match", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        endpoints: [{ id: "ep1", name: "my-ep" }]
      })
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
      headers: new Headers()
    } as unknown as Response);
    const result = await deleteRunpodEndpointByName("my-ep");
    expect(result).toBe(true);
  });

  it("deletes endpoint by case-insensitive match", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        endpoints: [{ id: "ep1", name: "My-EP" }]
      })
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
      headers: new Headers()
    } as unknown as Response);
    const result = await deleteRunpodEndpointByName("my-ep");
    expect(result).toBe(true);
  });

  it("returns true when endpoint not found", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    const result = await deleteRunpodEndpointByName("missing");
    expect(result).toBe(true);
  });

  it("returns false on delete error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ endpoints: [{ id: "ep1", name: "my-ep" }] })
    );
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("error"),
      headers: new Headers()
    } as unknown as Response);
    const result = await deleteRunpodEndpointByName("my-ep");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createOrUpdateRunpodEndpoint
// ---------------------------------------------------------------------------

describe("createOrUpdateRunpodEndpoint", () => {
  it("creates new endpoint when none exists", async () => {
    // getRunpodEndpointByName -> not found
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    // createEndpoint POST
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "ep-new",
        name: "test-ep",
        gpuTypeIds: ["ADA_24"],
        workersMin: 0,
        workersMax: 3
      })
    );
    const id = await createOrUpdateRunpodEndpoint({
      templateId: "tpl1",
      name: "test-ep"
    });
    expect(id).toBe("ep-new");
  });

  it("updates existing endpoint", async () => {
    // getRunpodEndpointByName -> found
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        endpoints: [{ id: "ep1", name: "test-ep", templateId: "tpl-old" }]
      })
    );
    // updateRunpodEndpoint PATCH
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const id = await createOrUpdateRunpodEndpoint({
      templateId: "tpl-new",
      name: "test-ep"
    });
    expect(id).toBe("ep1");
  });

  it("uses default GPU type for GPU compute", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "ep1" }));
    await createOrUpdateRunpodEndpoint({
      templateId: "tpl1",
      name: "test"
    });
    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.gpuTypeIds).toEqual(["NVIDIA GeForce RTX 4090"]);
    expect(body.computeType).toBe("GPU");
  });

  it("uses CPU config for CPU compute type", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "ep1" }));
    await createOrUpdateRunpodEndpoint({
      templateId: "tpl1",
      name: "test",
      computeType: ComputeType.CPU
    });
    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.cpuFlavorIds).toEqual(["cpu3c"]);
    expect(body).not.toHaveProperty("gpuTypeIds");
  });

  it("throws when no endpoint ID returned", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    await expect(
      createOrUpdateRunpodEndpoint({ templateId: "tpl1", name: "test" })
    ).rejects.toThrow("No endpoint ID returned");
  });

  it("coordinates with network volume data center", async () => {
    // getRunpodEndpointByName -> not found
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "vol-1", dataCenterId: "US-TX-3" })
    );
    // getRunpodEndpointByName (the actual endpoint check)
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    // create endpoint
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "ep-1" }));
    const id = await createOrUpdateRunpodEndpoint({
      templateId: "tpl1",
      name: "test",
      networkVolumeId: "vol-1"
    });
    expect(id).toBe("ep-1");
    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.dataCenterIds).toEqual(["US-TX-3"]);
    expect(body.networkVolumeId).toBe("vol-1");
  });

  it("falls back to creating new endpoint when update fails", async () => {
    // getRunpodEndpointByName -> found
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ endpoints: [{ id: "ep1", name: "test-ep" }] })
    );
    // updateRunpodEndpoint -> fails
    mockFetch.mockRejectedValueOnce(new Error("update fail"));
    // deleteRunpodEndpointByName -> list
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ endpoints: [{ id: "ep1", name: "test-ep" }] })
    );
    // deleteRunpodEndpointByName -> delete
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
      headers: new Headers()
    } as unknown as Response);
    // createEndpoint POST
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "ep-new" }));
    const id = await createOrUpdateRunpodEndpoint({
      templateId: "tpl1",
      name: "test-ep"
    });
    expect(id).toBe("ep-new");
  });
});

// ---------------------------------------------------------------------------
// createRunpodEndpointGraphql
// ---------------------------------------------------------------------------

describe("createRunpodEndpointGraphql", () => {
  it("creates endpoint via GraphQL mutation", async () => {
    // deleteRunpodEndpointByName -> list endpoints (REST)
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    // GraphQL mutation
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          saveEndpoint: {
            id: "ep-gql-1",
            name: "test-ep",
            gpuIds: "AMPERE_24",
            workersMin: 0,
            workersMax: 3,
            scalerType: "REQUEST_COUNT"
          }
        }
      })
    );
    const id = await createRunpodEndpointGraphql({
      templateId: "tpl1",
      name: "test-ep"
    });
    expect(id).toBe("ep-gql-1");
  });

  it("appends -fb suffix when flashboot enabled", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          saveEndpoint: { id: "ep-1", name: "test-ep-fb" }
        }
      })
    );
    await createRunpodEndpointGraphql({
      templateId: "tpl1",
      name: "test-ep",
      flashboot: true
    });
    const gqlBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(gqlBody.query).toContain("test-ep-fb");
  });

  it("throws on GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: "Mutation failed" }] })
    );
    await expect(
      createRunpodEndpointGraphql({ templateId: "tpl1", name: "test" })
    ).rejects.toThrow("Mutation failed");
  });

  it("throws when no endpoint ID returned", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { saveEndpoint: {} } })
    );
    await expect(
      createRunpodEndpointGraphql({ templateId: "tpl1", name: "test" })
    ).rejects.toThrow("No endpoint ID returned");
  });

  it("includes network volume and data centers in mutation", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ endpoints: [] }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: { saveEndpoint: { id: "ep-1", name: "test" } }
      })
    );
    await createRunpodEndpointGraphql({
      templateId: "tpl1",
      name: "test",
      networkVolumeId: "vol-1",
      dataCenterIds: ["US-TX-3"]
    });
    const gqlBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(gqlBody.query).toContain('networkVolumeId: "vol-1"');
    expect(gqlBody.query).toContain('["US-TX-3"]');
  });

  it("throws when API key missing", async () => {
    delete process.env.RUNPOD_API_KEY;
    await expect(
      createRunpodEndpointGraphql({ templateId: "tpl1", name: "test" })
    ).rejects.toThrow("RUNPOD_API_KEY");
  });
});
