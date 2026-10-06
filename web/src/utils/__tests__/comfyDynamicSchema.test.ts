import { restFetch } from "../../lib/rest-fetch";
import {
  bytesToBase64,
  paramToDynInput,
  resolveComfyWorkflow,
  type ComfyParam
} from "../comfyDynamicSchema";

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

const mockRestFetch = restFetch as jest.MockedFunction<typeof restFetch>;

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 400 ? "Bad Request" : "OK",
    text: async () => JSON.stringify(body),
    json: async () => body
  }) as Response;

describe("resolveComfyWorkflow", () => {
  beforeEach(() => {
    mockRestFetch.mockReset();
  });

  it("posts the workflow to the server and returns its schema", async () => {
    const schema = {
      prompt: {},
      dynamic_inputs: {},
      dynamic_outputs: {
        "9:image": { type: "image", type_args: [], optional: false }
      },
      dynamic_properties: {},
      available_params: [],
      app_mode_inputs: false
    };
    mockRestFetch.mockResolvedValue(jsonResponse(200, schema));

    await expect(resolveComfyWorkflow({ workflow: "{}" })).resolves.toEqual(
      schema
    );
    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/comfy/resolve-workflow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ workflow: "{}" })
      })
    );
  });

  it("rejects with the server's explanation", async () => {
    mockRestFetch.mockResolvedValue(
      jsonResponse(400, {
        code: "INVALID_INPUT",
        detail: "This looks like a ComfyUI UI workflow."
      })
    );
    await expect(
      resolveComfyWorkflow({ workflow: '{"nodes":[]}' })
    ).rejects.toThrow("This looks like a ComfyUI UI workflow.");
  });
});

describe("bytesToBase64", () => {
  it("encodes bytes as base64", () => {
    const bytes = Uint8Array.from([104, 101, 108, 108, 111]); // "hello"
    expect(bytesToBase64(bytes.buffer)).toBe("aGVsbG8=");
  });
});

describe("paramToDynInput", () => {
  it("builds an optional typed slot declaration from a param", () => {
    const seed: ComfyParam = {
      handle: "3:seed",
      node_id: "3",
      field: "seed",
      class_type: "KSampler",
      label: "KSampler · seed",
      type: "int",
      default: 42
    };
    expect(paramToDynInput(seed)).toEqual({
      type: { type: "int", optional: true, type_args: [] },
      description: "KSampler · seed",
      default: 42
    });
  });
});
