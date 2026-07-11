/**
 * Tests for workspace-api.ts — the binary file-download REST handler.
 *
 * Exercises the production guard, route matching, method restriction, user-id
 * resolution, workspace lookup (mocked @nodetool-ai/models), absolute-path and
 * path-traversal rejection, content-type guessing, and the success/404 paths
 * against a real temp workspace directory.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workspace: {
      ...actual.Workspace,
      find: vi.fn()
    }
  };
});

import { Workspace } from "@nodetool-ai/models";
import { handleWorkspaceRequest } from "../src/workspace-api.js";
import type { HttpApiOptions } from "../src/http-api.js";

const findMock = Workspace.find as unknown as ReturnType<typeof vi.fn>;

const options = {} as HttpApiOptions;

let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env["NODETOOL_ENV"];
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-api-test-"));
  findMock.mockResolvedValue({ id: "ws1", path: tmpDir });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRequest(
  urlPath: string,
  init?: { method?: string; headers?: Record<string, string> }
): Request {
  return new Request(`http://localhost${urlPath}`, {
    method: init?.method ?? "GET",
    headers: init?.headers
  });
}

describe("production guard", () => {
  it("returns 403 when NODETOOL_ENV is production", async () => {
    process.env["NODETOOL_ENV"] = "production";
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/hello.txt"),
      options
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.detail).toContain("production");
    // Guard runs before any DB lookup
    expect(findMock).not.toHaveBeenCalled();
  });
});

describe("route matching", () => {
  it("returns null for a non-matching path (falls through)", async () => {
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/list"),
      options
    );
    expect(res).toBeNull();
  });

  it("returns null for the workspaces collection root", async () => {
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces"),
      options
    );
    expect(res).toBeNull();
  });

  it("matches even with a trailing slash normalized away", async () => {
    await fs.writeFile(path.join(tmpDir, "hi.txt"), "hi");
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/hi.txt/"),
      options
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});

describe("method restriction", () => {
  it("rejects non-GET methods with 405", async () => {
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/hello.txt", {
        method: "POST"
      }),
      options
    );
    expect(res!.status).toBe(405);
  });
});

describe("user id resolution", () => {
  it("defaults to user '1' when no header present", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "x");
    await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/hello.txt"),
      options
    );
    expect(findMock).toHaveBeenCalledWith("1", "ws1");
  });

  it("uses x-user-id header when present", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "x");
    await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/hello.txt", {
        headers: { "x-user-id": "user-42" }
      }),
      options
    );
    expect(findMock).toHaveBeenCalledWith("user-42", "ws1");
  });

  it("honors a custom userIdHeader from options", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "x");
    await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/hello.txt", {
        headers: { "x-tenant": "tenant-9" }
      }),
      { userIdHeader: "x-tenant" } as HttpApiOptions
    );
    expect(findMock).toHaveBeenCalledWith("tenant-9", "ws1");
  });
});

describe("workspace lookup", () => {
  it("returns 404 when workspace not found", async () => {
    findMock.mockResolvedValue(null);
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/missing/download/hello.txt"),
      options
    );
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.detail).toContain("Workspace not found");
  });

  it("decodes URL-encoded workspace id and file path", async () => {
    const dir = path.join(tmpDir, "sub dir");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "a b.txt"), "spaced");
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws%201/download/sub%20dir/a%20b.txt"),
      options
    );
    expect(findMock).toHaveBeenCalledWith("1", "ws 1");
    expect(res!.status).toBe(200);
    expect(await res!.text()).toBe("spaced");
  });
});

describe("path safety", () => {
  it("rejects an absolute file path with 400", async () => {
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download//etc/passwd"),
      options
    );
    expect(res!.status).toBe(400);
    const body = await res!.json();
    expect(body.detail).toContain("Absolute paths");
  });

  it("blocks ../ path traversal with 403", async () => {
    const res = await handleWorkspaceRequest(
      makeRequest(
        "/api/workspaces/ws1/download/" +
          encodeURIComponent("../../../etc/passwd")
      ),
      options
    );
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.detail).toContain("traversal");
  });
});

describe("download success and content types", () => {
  it("downloads file content with attachment disposition", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "hello world");
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/hello.txt"),
      options
    );
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("text/plain");
    expect(res!.headers.get("content-disposition")).toBe(
      'attachment; filename="hello.txt"'
    );
    expect(await res!.text()).toBe("hello world");
  });

  it("guesses image/png for .png files", async () => {
    await fs.writeFile(path.join(tmpDir, "pic.png"), "PNGDATA");
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/pic.png"),
      options
    );
    expect(res!.headers.get("content-type")).toBe("image/png");
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    await fs.writeFile(path.join(tmpDir, "blob.xyz"), "raw");
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/blob.xyz"),
      options
    );
    expect(res!.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("returns 404 when the file does not exist", async () => {
    const res = await handleWorkspaceRequest(
      makeRequest("/api/workspaces/ws1/download/missing.txt"),
      options
    );
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.detail).toContain("File not found");
  });
});
