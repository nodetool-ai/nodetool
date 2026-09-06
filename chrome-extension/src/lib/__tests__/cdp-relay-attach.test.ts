/**
 * Tab selection for `chrome.debugger.attach`.
 *
 * Chrome refuses to debug its own pages, another extension's pages and the
 * Web Store, and reports the refusal as a bare string ("Cannot access a
 * chrome-extension:// URL of different extension") that reaches the agent as
 * an unexplained tool error. These cases pin the pre-check that replaces it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachBlockReason, findAttachableTab } from "../cdp-relay.js";

interface FakeTab {
  id?: number;
  url?: string;
  active?: boolean;
  lastAccessed?: number;
}

let tabs: FakeTab[] = [];

function installChrome(extensionId = "own-extension-id"): void {
  (globalThis as Record<string, unknown>).chrome = {
    runtime: { id: extensionId },
    tabs: {
      query: vi.fn(async (info: { active?: boolean }) =>
        info.active ? tabs.filter((t) => t.active) : tabs,
      ),
    },
  };
}

beforeEach(() => {
  tabs = [];
  installChrome();
});

describe("attachBlockReason", () => {
  it("blocks another extension's page", () => {
    expect(attachBlockReason("chrome-extension://other-id/page.html")).toMatch(
      /another Chrome extension/,
    );
  });

  it("allows this extension's own page", () => {
    expect(
      attachBlockReason("chrome-extension://own-extension-id/sidepanel.html"),
    ).toBeNull();
  });

  it("blocks chrome:// and devtools:// pages and the Web Store", () => {
    expect(attachBlockReason("chrome://settings")).toMatch(/chrome:/);
    expect(attachBlockReason("devtools://devtools/bundled/x.html")).toMatch(
      /devtools:/,
    );
    expect(
      attachBlockReason("https://chromewebstore.google.com/detail/x"),
    ).toMatch(/Web Store/);
  });

  it("allows an ordinary web page", () => {
    expect(attachBlockReason("https://example.com/")).toBeNull();
    expect(attachBlockReason("http://localhost:3000/")).toBeNull();
  });

  it("blocks a tab with no URL", () => {
    expect(attachBlockReason(undefined)).not.toBeNull();
  });
});

describe("findAttachableTab", () => {
  it("takes the active tab when Chrome can debug it", async () => {
    tabs = [{ id: 7, url: "https://example.com/", active: true }];
    expect(await findAttachableTab()).toEqual({ id: 7 });
  });

  it("falls back to the most recent web page when the active tab is another extension", async () => {
    tabs = [
      { id: 1, url: "chrome-extension://other-id/page.html", active: true },
      { id: 2, url: "https://a.example/", lastAccessed: 100 },
      { id: 3, url: "https://b.example/", lastAccessed: 500 },
      { id: 4, url: "chrome://settings" },
    ];
    expect(await findAttachableTab()).toEqual({ id: 3 });
  });

  it("returns null when no tab is debuggable", async () => {
    tabs = [
      { id: 1, url: "chrome://newtab", active: true },
      { id: 2, url: "chrome-extension://other-id/x.html" },
    ];
    expect(await findAttachableTab()).toBeNull();
  });
});
