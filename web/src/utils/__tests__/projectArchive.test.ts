import {
  PROJECT_FILE_EXTENSION,
  exportProjectFile,
  importProjectFile
} from "../projectArchive";

const mockRestFetch = jest.fn();
const mockSaveResponseAsFile = jest.fn();

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => mockRestFetch(...args)
}));
jest.mock("../downloadResponse", () => ({
  saveResponseAsFile: (...args: unknown[]) => mockSaveResponseAsFile(...args)
}));

const fakeResponse = (status: number, json: () => Promise<unknown>): Response =>
  ({ ok: status >= 200 && status < 300, status, json }) as unknown as Response;

const jsonResponse = (body: unknown, status = 200): Response =>
  fakeResponse(status, async () => body);

describe("exportProjectFile", () => {
  beforeEach(() => {
    mockRestFetch.mockReset();
    mockSaveResponseAsFile.mockReset();
  });

  it("requests the encoded project id and saves a sanitized file name", async () => {
    const res = jsonResponse({});
    mockRestFetch.mockResolvedValue(res);

    await exportProjectFile("a/b", "My Project: v2");

    expect(mockRestFetch).toHaveBeenCalledWith("/api/projects/a%2Fb/export", {
      method: "GET"
    });
    expect(mockSaveResponseAsFile).toHaveBeenCalledWith(
      res,
      `My_Project_v2${PROJECT_FILE_EXTENSION}`
    );
  });

  it("falls back to project for an empty name", async () => {
    mockRestFetch.mockResolvedValue(jsonResponse({}));

    await exportProjectFile("p1", "");

    expect(mockSaveResponseAsFile.mock.calls[0][1]).toBe(
      `project${PROJECT_FILE_EXTENSION}`
    );
  });

  it("throws the server detail on failure", async () => {
    mockRestFetch.mockResolvedValue(jsonResponse({ detail: "no access" }, 403));

    await expect(exportProjectFile("p1", "x")).rejects.toThrow("no access");
    expect(mockSaveResponseAsFile).not.toHaveBeenCalled();
  });

  it("throws a status message when the error body is not JSON", async () => {
    mockRestFetch.mockResolvedValue(
      fakeResponse(500, async () => {
        throw new SyntaxError("not json");
      })
    );

    await expect(exportProjectFile("p1", "x")).rejects.toThrow(
      "Export failed (500)"
    );
  });
});

describe("importProjectFile", () => {
  const file = new File(["data"], "x.nodetool-project");
  const valid = {
    project: { id: "p1", name: "Imported" },
    counts: { workflows: 2 },
    missing: [],
    checksum_mismatches: [],
    skipped: []
  };

  beforeEach(() => {
    mockRestFetch.mockReset();
  });

  it("posts the file as form data and returns the parsed response", async () => {
    mockRestFetch.mockResolvedValue(jsonResponse(valid));

    await expect(importProjectFile(file)).resolves.toEqual(valid);

    const [url, init] = mockRestFetch.mock.calls[0];
    expect(url).toBe("/api/projects/import");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("throws the server detail on failure", async () => {
    mockRestFetch.mockResolvedValue(
      jsonResponse({ detail: "bad archive" }, 400)
    );

    await expect(importProjectFile(file)).rejects.toThrow("bad archive");
  });

  it("throws a status message when the error has no detail", async () => {
    mockRestFetch.mockResolvedValue(jsonResponse({}, 413));

    await expect(importProjectFile(file)).rejects.toThrow(
      "Import failed (413)"
    );
  });

  it.each([
    ["a non-object body", null],
    ["a missing project", { missing: [] }],
    ["a project without a string name", { project: { id: "p1" }, missing: [] }],
    ["a non-array missing list", { project: valid.project, missing: "x" }]
  ])("rejects %s", async (_label, body) => {
    mockRestFetch.mockResolvedValue(jsonResponse(body));

    await expect(importProjectFile(file)).rejects.toThrow(
      "Unexpected response format from import endpoint"
    );
  });
});
