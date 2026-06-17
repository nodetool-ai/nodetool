import { describe, it, expect } from "vitest";
import {
  isSafePublicHttpsUrl,
  assertSafePublicHttpsUrl
} from "../../src/providers/safe-url.js";

describe("isSafePublicHttpsUrl", () => {
  it("accepts https URLs to public hosts", () => {
    expect(isSafePublicHttpsUrl("https://fal.media/files/result.png")).toBe(
      true
    );
    expect(isSafePublicHttpsUrl("https://example.com/a.mp4")).toBe(true);
    expect(isSafePublicHttpsUrl("https://8.8.8.8/x")).toBe(true);
  });

  it("rejects non-https schemes", () => {
    expect(isSafePublicHttpsUrl("http://fal.media/a.png")).toBe(false);
    expect(isSafePublicHttpsUrl("ftp://example.com/a.png")).toBe(false);
    expect(isSafePublicHttpsUrl("file:///etc/passwd")).toBe(false);
    expect(
      isSafePublicHttpsUrl("data:image/png;base64,AAAA")
    ).toBe(false);
  });

  it("rejects unparseable URLs", () => {
    expect(isSafePublicHttpsUrl("not a url")).toBe(false);
    expect(isSafePublicHttpsUrl("")).toBe(false);
  });

  it("rejects localhost and internal hostnames", () => {
    expect(isSafePublicHttpsUrl("https://localhost/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://foo.localhost/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://api.internal/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://db.local/x")).toBe(false);
  });

  it("rejects RFC1918 and loopback IPv4 literals", () => {
    expect(isSafePublicHttpsUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://10.0.0.5/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://172.16.0.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://172.31.255.255/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://192.168.1.1/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://0.0.0.0/x")).toBe(false);
  });

  it("rejects link-local and CGNAT IPv4 literals", () => {
    expect(isSafePublicHttpsUrl("https://169.254.169.254/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://100.64.0.1/x")).toBe(false);
  });

  it("rejects loopback / ULA / link-local IPv6 literals", () => {
    expect(isSafePublicHttpsUrl("https://[::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[fc00::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[fd12::1]/x")).toBe(false);
    expect(isSafePublicHttpsUrl("https://[fe80::1]/x")).toBe(false);
  });
});

describe("assertSafePublicHttpsUrl", () => {
  it("does not throw for safe URLs", () => {
    expect(() =>
      assertSafePublicHttpsUrl("https://fal.media/a.png")
    ).not.toThrow();
  });

  it("throws for unsafe URLs", () => {
    expect(() =>
      assertSafePublicHttpsUrl("http://169.254.169.254/latest/meta-data/")
    ).toThrow(/unsafe URL/);
    expect(() => assertSafePublicHttpsUrl("https://localhost/x")).toThrow(
      /unsafe URL/
    );
  });
});
