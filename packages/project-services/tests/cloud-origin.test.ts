/**
 * The origin the transfer client sends the access token to (SR3): a bare
 * https origin or http to loopback, the server key as `native/account`
 * computes it, and a fetch that stays on the origin and follows no redirect.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CloudOriginError, cloudOriginFetch, cloudServerKey, normalizeCloudOrigin } from "../src/cloud-origin.js";

describe("the cloud server origin", () => {
  it("accepts a bare https origin, LAN hosts included, and http only to loopback", () => {
    expect(normalizeCloudOrigin("https://api.nodetool.ai")).toBe("https://api.nodetool.ai");
    expect(normalizeCloudOrigin("https://192.168.1.20:8443")).toBe("https://192.168.1.20:8443");
    expect(normalizeCloudOrigin("http://127.0.0.1:7777")).toBe("http://127.0.0.1:7777");
    expect(normalizeCloudOrigin("http://localhost:7777")).toBe("http://localhost:7777");
    expect(normalizeCloudOrigin("http://[::1]:7777")).toBe("http://[::1]:7777");
  });

  it("refuses plain http elsewhere, paths, user info and other schemes", () => {
    for (const origin of [
      "http://api.nodetool.ai",
      "http://192.168.1.20",
      "https://api.nodetool.ai/",
      "https://api.nodetool.ai/api",
      "https://user:pw@api.nodetool.ai",
      "file:///etc/passwd",
      "not a url"
    ]) {
      expect(() => normalizeCloudOrigin(origin), origin).toThrow(CloudOriginError);
    }
  });

  it("keys a server by the SHA-256 of its origin, as the native account library does", () => {
    const expected = createHash("sha256").update("https://a.example").digest("hex").slice(0, 16);
    expect(cloudServerKey("https://a.example")).toBe(expected);
    expect(cloudServerKey("https://a.example")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("sends only to the origin and asks for redirects by hand", async () => {
    const seen: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
    const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
      seen.push({ url, redirect: init.redirect });
      return new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } });
    };
    const guarded = cloudOriginFetch("https://cloud.example", fetchImpl);
    const answer = await guarded("https://cloud.example/trpc/receive.capture", { method: "POST" });
    expect(answer.status).toBe(302);
    expect(seen).toEqual([{ url: "https://cloud.example/trpc/receive.capture", redirect: "manual" }]);
    await expect(guarded("https://elsewhere.example/trpc/x", { method: "GET" })).rejects.toThrow(CloudOriginError);
    await expect(guarded("https://cloud.example.evil.test/x", { method: "GET" })).rejects.toThrow(CloudOriginError);
    expect(seen).toHaveLength(1);
  });
});
