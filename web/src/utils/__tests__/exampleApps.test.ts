import { restFetch } from "../../lib/rest-fetch";
import { installExampleApp, listExampleApps } from "../exampleApps";

jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));

const mockFetch = restFetch as jest.Mock;

const reply = (ok: boolean, status: number, body: unknown) => ({
  ok,
  status,
  json: async () => {
    if (body === undefined) {
      throw new Error("no body");
    }
    return body;
  }
});

beforeEach(() => mockFetch.mockReset());

describe("listExampleApps", () => {
  it("returns the parsed summaries", async () => {
    const summary = {
      slug: "s",
      name: "N",
      description: "d",
      workflows: ["w"],
      operationCount: 2,
      thumbnailUrl: null
    };
    mockFetch.mockResolvedValue(reply(true, 200, [summary]));
    await expect(listExampleApps()).resolves.toEqual([summary]);
    expect(mockFetch).toHaveBeenCalledWith("/api/applications/examples", {
      method: "GET"
    });
  });

  it("rejects a malformed list", async () => {
    mockFetch.mockResolvedValue(reply(true, 200, [{ slug: 1 }]));
    await expect(listExampleApps()).rejects.toThrow();
  });

  it("rejects with the server detail or a status fallback", async () => {
    mockFetch.mockResolvedValueOnce(reply(false, 500, { detail: "boom" }));
    await expect(listExampleApps()).rejects.toThrow("boom");
    mockFetch.mockResolvedValueOnce(reply(false, 503, undefined));
    await expect(listExampleApps()).rejects.toThrow(
      "Loading example apps failed (503)"
    );
  });
});

describe("installExampleApp", () => {
  it("posts the project id to the encoded slug and keeps only id and name", async () => {
    mockFetch.mockResolvedValue(
      reply(true, 200, { id: "a1", name: "App", extra: true })
    );
    await expect(installExampleApp("my slug", "p1")).resolves.toEqual({
      id: "a1",
      name: "App"
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/applications/examples/my%20slug/install");
    expect(JSON.parse(init.body)).toEqual({ projectId: "p1" });
  });

  it("defaults the project to default", async () => {
    mockFetch.mockResolvedValue(reply(true, 200, { id: "a", name: "n" }));
    await installExampleApp("s");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      projectId: "default"
    });
  });

  it("rejects with the server detail or a status fallback", async () => {
    mockFetch.mockResolvedValueOnce(reply(false, 409, { detail: "exists" }));
    await expect(installExampleApp("s")).rejects.toThrow("exists");
    mockFetch.mockResolvedValueOnce(reply(false, 500, undefined));
    await expect(installExampleApp("s")).rejects.toThrow(
      "Install failed (500)"
    );
  });
});
