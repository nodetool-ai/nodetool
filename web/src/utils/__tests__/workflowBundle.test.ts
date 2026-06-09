import { restFetch } from "../../lib/rest-fetch";
import {
  exportWorkflowBundle,
  exportWorkflowsBundle,
  importWorkflowBundle
} from "../workflowBundle";

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));
jest.mock("../../stores/BASE_URL", () => ({
  BASE_URL: "",
  withApiBase: (u: string) => u
}));

const mockRestFetch = restFetch as jest.Mock;

function fakeResponse(opts: {
  ok: boolean;
  status?: number;
  blob?: Blob;
  json?: unknown;
  text?: string;
  disposition?: string;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    blob: async () => opts.blob ?? new Blob([new Uint8Array([1, 2, 3])]),
    json: async () => opts.json ?? null,
    text: async () => opts.text ?? "",
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-disposition" ? opts.disposition ?? null : null
    }
  } as unknown as Response;
}

let lastAnchor: HTMLAnchorElement | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  lastAnchor = null;
  Object.defineProperty(global.URL, "createObjectURL", {
    configurable: true,
    value: jest.fn(() => "blob:mock")
  });
  Object.defineProperty(global.URL, "revokeObjectURL", {
    configurable: true,
    value: jest.fn()
  });
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const origCreate = document.createElement.bind(document);
  jest
    .spyOn(document, "createElement")
    .mockImplementation((tag: string, ...rest: unknown[]) => {
      const el = origCreate(tag as never, ...(rest as []));
      if (tag === "a") {
        lastAnchor = el as HTMLAnchorElement;
      }
      return el;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("exportWorkflowBundle", () => {
  it("fetches the single-workflow export route and downloads the file", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: true,
        disposition: 'attachment; filename="My Flow.nodetool"'
      })
    );

    await exportWorkflowBundle("wf-1", "My Flow");

    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/workflows/wf-1/export-bundle",
      { method: "GET" }
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(lastAnchor?.download).toBe("My Flow.nodetool");
  });

  it("falls back to a sanitized name when no content-disposition is present", async () => {
    mockRestFetch.mockResolvedValue(fakeResponse({ ok: true }));
    await exportWorkflowBundle("wf-2", "Has Spaces!");
    expect(lastAnchor?.download).toBe("Has_Spaces_.nodetool");
  });

  it("throws when the server responds with an error", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({ ok: false, status: 404, text: "Workflow not found" })
    );
    await expect(exportWorkflowBundle("missing", "x")).rejects.toThrow(
      "Workflow not found"
    );
  });
});

describe("exportWorkflowsBundle", () => {
  it("POSTs workflow_ids to the multi-workflow export route", async () => {
    mockRestFetch.mockResolvedValue(fakeResponse({ ok: true }));
    await exportWorkflowsBundle(["a", "b"], "pack");
    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/workflows/export-bundle",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ workflow_ids: ["a", "b"] })
      })
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });
});

describe("importWorkflowBundle", () => {
  it("uploads the file as multipart and returns the created workflows", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: true,
        json: {
          workflows: [{ id: "new-1", name: "Imported" }],
          imported: 2,
          missing: [],
          checksum_mismatches: []
        }
      })
    );

    const file = new File([new Uint8Array([1])], "x.nodetool");
    const result = await importWorkflowBundle(file);

    const [url, init] = mockRestFetch.mock.calls[0];
    expect(url).toBe("/api/workflows/import-bundle");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect(result.workflows[0]).toEqual({ id: "new-1", name: "Imported" });
    expect(result.imported).toBe(2);
  });

  it("throws the server-provided detail on failure", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({ ok: false, status: 400, json: { detail: "Invalid bundle: boom" } })
    );
    await expect(
      importWorkflowBundle(new File([], "bad.nodetool"))
    ).rejects.toThrow("Invalid bundle: boom");
  });
});
