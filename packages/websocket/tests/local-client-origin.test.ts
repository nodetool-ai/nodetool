import { describe, it, expect } from "vitest";
import { isLocalClientRequest } from "../src/lib/local-client-origin.js";

const TOKEN = "a".repeat(64);

function allowed(
  origin: string | undefined,
  extra: { host?: string; presentedToken?: string; fetchSite?: string } = {}
): boolean {
  return isLocalClientRequest({
    origin,
    host: extra.host ?? "127.0.0.1:7777",
    presentedToken: extra.presentedToken,
    expectedToken: TOKEN,
    fetchSite: extra.fetchSite
  });
}

describe("isLocalClientRequest", () => {
  it("allows clients that send no Origin", () => {
    expect(allowed(undefined)).toBe(true);
    expect(allowed("")).toBe(true);
  });

  // A cross-site `<img>` or top-level navigation sends no Origin either.
  it("refuses a request without Origin that another site sent", () => {
    expect(allowed(undefined, { fetchSite: "cross-site" })).toBe(false);
    expect(allowed(undefined, { fetchSite: "Cross-Site" })).toBe(false);
    expect(allowed(undefined, { fetchSite: "same-origin" })).toBe(true);
    expect(allowed(undefined, { fetchSite: "same-site" })).toBe(true);
    expect(allowed(undefined, { fetchSite: "none" })).toBe(true);
    expect(
      allowed(undefined, { fetchSite: "cross-site", presentedToken: TOKEN })
    ).toBe(true);
  });

  it("allows the server's own UI, localhost dev servers and file://", () => {
    expect(allowed("http://127.0.0.1:7777")).toBe(true);
    expect(allowed("http://192.168.1.20:17777", { host: "192.168.1.20:17777" })).toBe(true);
    expect(allowed("http://localhost:3000")).toBe(true);
    expect(allowed("file://")).toBe(true);
  });

  it("allows browser extensions", () => {
    expect(allowed("chrome-extension://abcdefghijklmnop")).toBe(true);
    expect(allowed("moz-extension://0f1e2d3c-aaaa-bbbb-cccc-1234567890ab")).toBe(true);
  });

  // The cross-site WebSocket case: any page can open ws://127.0.0.1:7777/ws.
  it("refuses another website", () => {
    expect(allowed("https://evil.example")).toBe(false);
    expect(allowed("http://evil.example:7777")).toBe(false);
  });

  // Sandboxed iframes send Origin: null, and so does Electron's file://
  // renderer, which therefore needs the launch token.
  it("refuses Origin: null without the launch token", () => {
    expect(allowed("null")).toBe(false);
    expect(allowed("null", { presentedToken: TOKEN })).toBe(true);
    expect(allowed("null", { presentedToken: "b".repeat(64) })).toBe(false);
  });

  it("ignores a presented token when none is configured", () => {
    expect(
      isLocalClientRequest({
        origin: "null",
        host: "127.0.0.1:7777",
        presentedToken: "",
        expectedToken: null
      })
    ).toBe(false);
  });

  it("refuses an unparseable Origin", () => {
    expect(allowed("not a url")).toBe(false);
  });
});
