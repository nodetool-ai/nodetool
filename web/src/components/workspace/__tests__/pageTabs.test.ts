/**
 * @jest-environment node
 */
import { PAGE_TAB_TITLES, isPageTabKey } from "../pageTabs";
import type { PageTabKey } from "../pageTabs";

describe("PAGE_TAB_TITLES", () => {
  it("has entries for all known page tab keys", () => {
    const expected: PageTabKey[] = [
      "tutorials",
      "examples",
      "costs",
      "models",
      "packages",
      "collections",
      "workspaces",
      "settings"
    ];
    for (const key of expected) {
      expect(PAGE_TAB_TITLES[key]).toBeDefined();
      expect(PAGE_TAB_TITLES[key].length).toBeGreaterThan(0);
    }
  });

  it("has unique titles", () => {
    const titles = Object.values(PAGE_TAB_TITLES);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("isPageTabKey", () => {
  it("returns true for valid page tab keys", () => {
    expect(isPageTabKey("tutorials")).toBe(true);
    expect(isPageTabKey("settings")).toBe(true);
    expect(isPageTabKey("models")).toBe(true);
    expect(isPageTabKey("costs")).toBe(true);
  });

  it("returns false for invalid keys", () => {
    expect(isPageTabKey("")).toBe(false);
    expect(isPageTabKey("invalid")).toBe(false);
    expect(isPageTabKey("TUTORIALS")).toBe(false);
    expect(isPageTabKey("dashboard")).toBe(false);
  });
});
