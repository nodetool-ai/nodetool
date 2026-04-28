import { describe, it, expect, vi } from "vitest";
import {
  parseMemLimit,
  DEFAULT_SANDBOX_IMAGE,
  TOOL_SERVER_PORT,
  VNC_WS_PORT,
  waitForHttpReady
} from "../src/DockerSandbox.js";

describe("parseMemLimit", () => {
  it("parses megabytes", () => {
    expect(parseMemLimit("512m")).toBe(512 * 1024 * 1024);
  });

  it("parses gigabytes", () => {
    expect(parseMemLimit("2g")).toBe(2 * 1024 * 1024 * 1024);
  });

  it("parses kilobytes", () => {
    expect(parseMemLimit("1024k")).toBe(1024 * 1024);
  });

  it("falls back to 2GiB for garbage input", () => {
    expect(parseMemLimit("oops")).toBe(2 * 1024 * 1024 * 1024);
  });

  it("accepts an uppercase M", () => {
    expect(parseMemLimit("256M")).toBe(256 * 1024 * 1024);
  });

  it("accepts a bare byte count", () => {
    expect(parseMemLimit("1024")).toBe(1024);
  });
});

describe("waitForHttpReady", () => {
  it("retries transient fetch failures until /health responds", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    globalThis.fetch = fetchMock;

    try {
      await expect(waitForHttpReady("http://sandbox/health", 1)).resolves.toBe(
        true
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false when the HTTP endpoint does not become ready", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("nope", { status: 503 }));
    globalThis.fetch = fetchMock;

    try {
      await expect(
        waitForHttpReady("http://sandbox/health", 0.01)
      ).resolves.toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("DockerSandbox constants", () => {
  it("exposes the expected default image tag", () => {
    expect(DEFAULT_SANDBOX_IMAGE).toBe("nodetool/sandbox-agent:latest");
  });

  it("uses port 7788 for the tool server", () => {
    expect(TOOL_SERVER_PORT).toBe(7788);
  });

  it("uses port 6080 for the VNC websocket", () => {
    expect(VNC_WS_PORT).toBe(6080);
  });
});
