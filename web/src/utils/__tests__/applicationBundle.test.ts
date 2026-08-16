import { restFetch } from "../../lib/rest-fetch";
import { stub } from "../../test-utils/doubles";
import {
  exportApplicationBundle,
  importApplicationBundle
} from "../applicationBundle";

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
  json?: unknown;
  text?: string;
  disposition?: string;
}): Response {
  return stub<Response>({
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    blob: async () => new Blob(["{}"]),
    json: async () => opts.json ?? null,
    text: async () => opts.text ?? "",
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-disposition"
          ? opts.disposition ?? null
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

describe("exportApplicationBundle", () => {
  it("fetches the export route and downloads the named file", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: true,
        disposition: 'attachment; filename="Copywriter.app.json"'
      })
    );

    await exportApplicationBundle("app-1", "Copywriter");

    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/applications/app-1/export-bundle",
      { method: "GET" }
    );
    expect(lastAnchor?.download).toBe("Copywriter.app.json");
  });

  it("asks for the released snapshot when told to", async () => {
    mockRestFetch.mockResolvedValue(fakeResponse({ ok: true }));
    await exportApplicationBundle("app-1", "My App!", { released: true });
    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/applications/app-1/export-bundle?released=1",
      { method: "GET" }
    );
    expect(lastAnchor?.download).toBe("My_App_.app.json");
  });

  it("throws when the server responds with an error", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({ ok: false, status: 404, text: "Application not found" })
    );
    await expect(exportApplicationBundle("missing", "x")).rejects.toThrow(
      "Application not found"
    );
  });
});

describe("importApplicationBundle", () => {
  const bundleFile = (): File =>
    stub<File>({
      text: async () => JSON.stringify({ schemaVersion: 1, name: "Copywriter" })
    });

  it("posts the parsed bundle and returns the created app", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({ ok: true, json: { id: "app-9", name: "Copywriter" } })
    );

    const result = await importApplicationBundle(bundleFile(), "p2");

    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/applications/import-bundle",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          bundle: { schemaVersion: 1, name: "Copywriter" },
          projectId: "p2"
        })
      })
    );
    expect(result).toEqual({ id: "app-9", name: "Copywriter" });
  });

  it("surfaces the server's detail on failure", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 400,
        json: { detail: "Invalid application bundle" }
      })
    );
    await expect(importApplicationBundle(bundleFile())).rejects.toThrow(
      "Invalid application bundle"
    );
  });
});
