import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadRegistryDist, loadRegistryResponse, verifyRegistryTarball } from "../release/registry.mjs";

describe("release registry visibility", () => {
  it("reads an exact version even when the package index is stale", async () => {
    const fetchImpl = vi.fn(async url => new Response(JSON.stringify(
      url.endsWith("/1.2.3-rc.1")
        ? { name: "@nodetool-ai/cli", version: "1.2.3-rc.1", dist: { integrity: "sha512-original" } }
        : { versions: {}, "dist-tags": { latest: "1.2.2" } }
    )));
    await expect(loadRegistryDist({ name: "@nodetool-ai/cli", version: "1.2.3-rc.1" }, { fetchImpl })).resolves.toEqual({ integrity: "sha512-original" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://registry.npmjs.org/%40nodetool-ai%2Fcli/1.2.3-rc.1");
  });

  it("retries unavailable immutable versions within a bounded attempt count", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('"version not found"', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "pkg", version: "1.2.3", dist: { integrity: "original" } })));
    const sleep = vi.fn(async () => {});
    await expect(loadRegistryDist({ name: "pkg", version: "1.2.3" }, { fetchImpl, sleep, maxAttempts: 2 })).resolves.toEqual({ integrity: "original" });
    expect(sleep).toHaveBeenCalledOnce();
    const absent = vi.fn(async () => new Response("missing", { status: 404 }));
    await expect(loadRegistryResponse("https://registry.npmjs.org/pkg/1.2.3", { fetchImpl: absent, sleep, maxAttempts: 2 })).rejects.toThrow("HTTP 404");
    expect(absent).toHaveBeenCalledTimes(2);
  });

  it("does not retry authorization errors or incorrect successful metadata", async () => {
    const sleep = vi.fn();
    await expect(loadRegistryResponse("https://registry.npmjs.org/pkg/1.2.3", {
      fetchImpl: async () => new Response("forbidden", { status: 403 }), sleep
    })).rejects.toThrow("HTTP 403");
    await expect(loadRegistryDist({ name: "pkg", version: "1.2.3" }, {
      fetchImpl: async () => new Response(JSON.stringify({ name: "other", version: "1.2.3", dist: {} })), sleep
    })).rejects.toThrow("Registry version identity differs");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("shares a readiness deadline and refuses unsafe registry endpoints before fetching", async () => {
    const fetchImpl = vi.fn();
    await expect(loadRegistryResponse("https://registry.npmjs.org/pkg", { fetchImpl, deadline: 1, now: () => 2 })).rejects.toThrow("readiness deadline");
    for (const url of ["http://registry.npmjs.org/pkg", "https://registry.npmjs.org.evil.test/pkg", "https://user:pass@registry.npmjs.org/pkg"]) {
      await expect(loadRegistryResponse(url, { fetchImpl })).rejects.toThrow("Unexpected npm registry endpoint");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("registry tarball readiness", () => {
  const bytes = Buffer.from("published tarball");
  const pin = { name: "@nodetool-ai/websocket", version: "0.8.9", integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
  const dist = { tarball: "https://registry.npmjs.org/@nodetool-ai/websocket/-/websocket-0.8.9.tgz" };

  it("waits for tarball bytes after metadata becomes visible", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(bytes));
    const sleep = vi.fn(async () => {});
    await verifyRegistryTarball(pin, dist, { fetchImpl, sleep });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(dist.tarball);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("rejects changed bytes without retrying integrity failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("changed"));
    await expect(verifyRegistryTarball(pin, dist, { fetchImpl })).rejects.toThrow("tarball integrity differs");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
