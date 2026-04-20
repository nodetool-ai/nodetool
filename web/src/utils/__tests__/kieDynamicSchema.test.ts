/**
 * @jest-environment node
 */

import { resolveKieSchemaClient } from "../kieDynamicSchema";

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe("resolveKieSchemaClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws when modelInfo is empty", async () => {
    await expect(resolveKieSchemaClient("")).rejects.toThrow(
      "Paste kie.ai API documentation to load the schema."
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when modelInfo is only whitespace", async () => {
    await expect(resolveKieSchemaClient("   ")).rejects.toThrow(
      "Paste kie.ai API documentation to load the schema."
    );
  });

  it("posts to the correct endpoint with default base URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        dynamic_properties: { prop1: "val" },
        dynamic_inputs: {},
        dynamic_outputs: {},
        model_id: "test-model"
      })
    });

    await resolveKieSchemaClient("some model info");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/kie/resolve-dynamic-schema",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_info: "some model info" })
      })
    );
  });

  it("uses custom apiBaseUrl", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        dynamic_properties: {},
        dynamic_outputs: {}
      })
    });

    await resolveKieSchemaClient("info", "http://localhost:7777");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7777/api/kie/resolve-dynamic-schema",
      expect.any(Object)
    );
  });

  it("returns resolved schema on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        dynamic_properties: { key: "value" },
        dynamic_inputs: { input1: { type: "string" } },
        dynamic_outputs: { output1: { type: "image" } },
        model_id: "my-model"
      })
    });

    const result = await resolveKieSchemaClient("model docs");

    expect(result).toEqual({
      dynamic_properties: { key: "value" },
      dynamic_inputs: { input1: { type: "string" } },
      dynamic_outputs: { output1: { type: "image" } },
      model_id: "my-model"
    });
  });

  it("defaults missing fields to empty objects", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    const result = await resolveKieSchemaClient("model docs");

    expect(result.dynamic_properties).toEqual({});
    expect(result.dynamic_inputs).toEqual({});
    expect(result.dynamic_outputs).toEqual({});
    expect(result.model_id).toBeUndefined();
  });

  it("throws specific error for 501 status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 501,
      statusText: "Not Implemented",
      text: async () => "not implemented"
    });

    await expect(resolveKieSchemaClient("info")).rejects.toThrow(
      "Kie.ai schema resolution requires the backend with nodetool-base installed."
    );
  });

  it("throws error message from JSON detail for 400 status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => JSON.stringify({ detail: "Missing required field" })
    });

    await expect(resolveKieSchemaClient("info")).rejects.toThrow(
      "Missing required field"
    );
  });

  it("throws plain text error for 400 without JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "plain error text"
    });

    await expect(resolveKieSchemaClient("info")).rejects.toThrow(
      "plain error text"
    );
  });

  it("throws generic error for other HTTP errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "server broke"
    });

    await expect(resolveKieSchemaClient("info")).rejects.toThrow(
      "server broke"
    );
  });

  it("trims modelInfo before sending", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        dynamic_properties: {},
        dynamic_outputs: {}
      })
    });

    await resolveKieSchemaClient("  trimmed info  ");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model_info).toBe("trimmed info");
  });
});
