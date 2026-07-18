/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://app.nodetool.ai/"}
 */

let mockIsElectron = false;
jest.mock("../env", () => ({
  get isElectron() {
    return mockIsElectron;
  }
}));

import { initAnalytics } from "../analytics";

declare global {
  interface Window {
    plausible?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  }
}

describe("initAnalytics", () => {
  afterEach(() => {
    mockIsElectron = false;
    delete window.plausible;
    document
      .querySelectorAll("script[data-domain]")
      .forEach((el) => el.remove());
  });

  it("does nothing in electron even on the production domain", () => {
    mockIsElectron = true;

    initAnalytics();

    expect(document.querySelector("script[data-domain]")).toBeNull();
    expect(window.plausible).toBeUndefined();
  });

  it("injects the Plausible script on the production domain", () => {
    initAnalytics();

    const script = document.querySelector(
      'script[data-domain="app.nodetool.ai"]'
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script!.src).toContain("plausible.io");
    expect(script!.defer).toBe(true);
  });

  it("does not inject a second script on repeated calls", () => {
    initAnalytics();
    initAnalytics();

    const scripts = document.querySelectorAll(
      'script[data-domain="app.nodetool.ai"]'
    );
    expect(scripts.length).toBe(1);
  });

  it("sets up the plausible event queue shim", () => {
    initAnalytics();

    expect(typeof window.plausible).toBe("function");
    window.plausible!("pageview");
    expect(window.plausible!.q).toEqual([["pageview"]]);
  });

  it("preserves an existing plausible function", () => {
    const existing = jest.fn();
    window.plausible = existing;

    initAnalytics();

    expect(window.plausible).toBe(existing);
  });
});
