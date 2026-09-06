import { restFetch } from "../../lib/rest-fetch";
import { stub } from "../../test-utils/doubles";
import { exportTimelineZip, importTimelineZip } from "../timelineBundle";

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
  return stub<Response>({
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    blob: async () => opts.blob ?? new Blob([new Uint8Array([1, 2, 3])]),
    json: async () => opts.json ?? null,
    text: async () => opts.text ?? "",
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-disposition"
          ? (opts.disposition ?? null)
          : null
    }
  });
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

const importedTimeline = {
  id: "tl-new",
  name: "Imported video",
  projectId: "default"
};

describe("exportTimelineZip", () => {
  it("fetches the export route with an encoded id and saves the file", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: true,
        disposition: 'attachment; filename="My Video.zip"'
      })
    );

    await exportTimelineZip("tl/1", "My Video");

    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/timelines/tl%2F1/export-zip",
      { method: "GET" }
    );
    expect(lastAnchor?.download).toBe("My Video.zip");
  });

  it("falls back to a sanitized name when no content-disposition is present", async () => {
    mockRestFetch.mockResolvedValue(fakeResponse({ ok: true }));
    await exportTimelineZip("tl-2", "Has Spaces!");
    expect(lastAnchor?.download).toBe("Has_Spaces_.zip");
  });

  it("throws the server text on failure", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({ ok: false, status: 404, text: "Timeline not found" })
    );
    await expect(exportTimelineZip("missing", "x")).rejects.toThrow(
      "Timeline not found"
    );
  });
});

describe("importTimelineZip", () => {
  it("uploads the file and the project id as multipart", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: true,
        json: {
          timeline: importedTimeline,
          imported: 3,
          missing: [],
          checksum_mismatches: []
        }
      })
    );

    const file = new File([new Uint8Array([1])], "video.zip");
    const result = await importTimelineZip(file, { projectId: "proj-1" });

    const [url, init] = mockRestFetch.mock.calls[0];
    expect(url).toBe("/api/timelines/import-zip");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toBe(file);
    expect(body.get("project_id")).toBe("proj-1");
    expect(body.get("name")).toBeNull();
    expect(result.timeline.id).toBe("tl-new");
    expect(result.imported).toBe(3);
  });

  it("sends the name override when given", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: true,
        json: {
          timeline: importedTimeline,
          imported: 0,
          missing: [],
          checksum_mismatches: []
        }
      })
    );

    await importTimelineZip(new File([], "v.zip"), {
      projectId: "proj-1",
      name: "Renamed"
    });

    const body = mockRestFetch.mock.calls[0][1].body as FormData;
    expect(body.get("name")).toBe("Renamed");
  });

  it("throws the server-provided detail on failure", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 400,
        json: { detail: "Invalid archive: boom" }
      })
    );
    await expect(
      importTimelineZip(new File([], "bad.zip"), { projectId: "p" })
    ).rejects.toThrow("Invalid archive: boom");
  });

  it("throws a status-based message when the error body has no detail", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({ ok: false, status: 500, json: {} })
    );
    await expect(
      importTimelineZip(new File([], "bad.zip"), { projectId: "p" })
    ).rejects.toThrow("Import failed (500)");
  });

  it("rejects a 200 body that is not the documented shape", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({ ok: true, json: { timeline: { id: "tl-new" } } })
    );
    await expect(
      importTimelineZip(new File([], "v.zip"), { projectId: "p" })
    ).rejects.toThrow("Unexpected response format from import endpoint");
  });
});
