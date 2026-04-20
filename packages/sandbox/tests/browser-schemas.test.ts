import { describe, it, expect } from "vitest";
import {
  BrowserViewInput,
  BrowserNavigateInput,
  BrowserClickInput,
  BrowserInputTextInput,
  BrowserScrollInput,
  BrowserSelectOptionInput,
  BrowserConsoleExecInput
} from "../src/schemas/index.js";

describe("browser schemas", () => {
  it("defaults browser_view to empty object input", () => {
    const parsed = BrowserViewInput.parse({});
    expect(parsed.include_screenshot).toBeUndefined();
  });

  it("requires url on browser_navigate", () => {
    expect(() => BrowserNavigateInput.parse({})).toThrow();
  });

  it("rejects an unknown wait_until value", () => {
    expect(() =>
      BrowserNavigateInput.parse({ url: "https://x", wait_until: "oops" })
    ).toThrow();
  });

  it("accepts index-only browser_click", () => {
    const parsed = BrowserClickInput.parse({ index: 3 });
    expect(parsed.index).toBe(3);
  });

  it("accepts coord-only browser_click", () => {
    const parsed = BrowserClickInput.parse({
      coordinate_x: 100,
      coordinate_y: 200
    });
    expect(parsed.coordinate_x).toBe(100);
  });

  it("rejects browser_click with neither index nor full coords", () => {
    expect(() => BrowserClickInput.parse({ coordinate_x: 100 })).toThrow();
    expect(() => BrowserClickInput.parse({})).toThrow();
  });

  it("requires either index or full coords on browser_input", () => {
    const ok = BrowserInputTextInput.parse({
      text: "hi",
      coordinate_x: 10,
      coordinate_y: 20
    });
    expect(ok.text).toBe("hi");
    expect(() =>
      BrowserInputTextInput.parse({ text: "hi" })
    ).toThrow();
  });

  it("accepts to_top / to_bottom / pixels on browser_scroll", () => {
    expect(BrowserScrollInput.parse({ to_top: true }).to_top).toBe(true);
    expect(BrowserScrollInput.parse({ pixels: 500 }).pixels).toBe(500);
  });

  it("requires non-empty javascript on console_exec", () => {
    expect(() => BrowserConsoleExecInput.parse({ javascript: "" })).toThrow();
  });

  it("requires option on browser_select_option", () => {
    expect(() => BrowserSelectOptionInput.parse({ index: 0 })).toThrow();
  });
});
