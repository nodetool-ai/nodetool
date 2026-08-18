/**
 * Which addresses untrusted code may reach.
 *
 * The literal table is exercised through the fetch bridge elsewhere; what is
 * pinned here is the shape both callers share — including the resolution step
 * `yt_dlp` needs, because a hostname is not a literal and the downloader opens
 * its own sockets.
 */
import { describe, expect, it } from "vitest";
import {
  assertFetchUrlAllowed,
  assertResolvedHostAllowed,
  isBlockedIpLiteral
} from "../src/network-guard.js";

describe("isBlockedIpLiteral", () => {
  it.each([
    "169.254.169.254", // instance metadata
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "100.64.0.1", // CGNAT
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:169.254.169.254", // IPv4-mapped
    "64:ff9b::a9fe:a9fe" // NAT64
  ])("blocks %s", (host) => {
    expect(isBlockedIpLiteral(host)).toBe(true);
  });

  it.each(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "allows the public address %s",
    (host) => {
      expect(isBlockedIpLiteral(host)).toBe(false);
    }
  );
});

describe("assertFetchUrlAllowed", () => {
  it("refuses the metadata service", () => {
    expect(() =>
      assertFetchUrlAllowed("http://169.254.169.254/latest/meta-data/")
    ).toThrow(/internal\/private address/);
  });

  it("refuses localhost by name", () => {
    expect(() => assertFetchUrlAllowed("http://localhost:7777/api")).toThrow(
      /localhost/
    );
  });

  it("refuses a non-http scheme", () => {
    expect(() => assertFetchUrlAllowed("file:///etc/passwd")).toThrow(
      /unsupported scheme/
    );
  });

  it("allows a public URL", () => {
    expect(() =>
      assertFetchUrlAllowed("https://example.com/video.mp4")
    ).not.toThrow();
  });
});

describe("assertResolvedHostAllowed", () => {
  it("refuses a name that resolves to the metadata address", async () => {
    await expect(
      assertResolvedHostAllowed(
        "https://metadata.example.com/x",
        "yt_dlp",
        async () => ["169.254.169.254"]
      )
    ).rejects.toThrow(/resolves to the internal address "169\.254\.169\.254"/);
  });

  it("refuses when any answer is internal, not only the first", async () => {
    await expect(
      assertResolvedHostAllowed("https://split.example.com/x", "yt_dlp", async () => [
        "93.184.216.34",
        "127.0.0.1"
      ])
    ).rejects.toThrow(/127\.0\.0\.1/);
  });

  it("allows a name that resolves publicly", async () => {
    await expect(
      assertResolvedHostAllowed("https://example.com/x", "yt_dlp", async () => [
        "93.184.216.34"
      ])
    ).resolves.toBeUndefined();
  });

  it("leaves a name that does not resolve to the downloader to report", async () => {
    await expect(
      assertResolvedHostAllowed("https://nope.example/x", "yt_dlp", async () => {
        throw new Error("ENOTFOUND");
      })
    ).resolves.toBeUndefined();
  });

  it("does not re-resolve a literal", async () => {
    let called = false;
    await assertResolvedHostAllowed("http://93.184.216.34/x", "yt_dlp", async () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
  });
});
