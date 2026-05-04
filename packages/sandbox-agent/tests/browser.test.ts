/**
 * Browser tool unit tests.
 *
 * The tests install a fake BrowserAdapter that returns a scripted CDP-like
 * page — this keeps the test suite off Chromium (which isn't available in CI
 * by default) while still exercising the full route handling and DOM-shaping
 * logic.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  browserView,
  browserNavigate,
  browserClick,
  browserInput,
  browserConsoleView,
  setBrowserAdapter,
  _shutdownForTests
} from "../src/tools/browser.js";

interface RecordedCall {
  method: string;
  args: unknown[];
}

function makeFakeBrowser(): {
  calls: RecordedCall[];
  adapter: { launch: () => Promise<{ page: unknown; close: () => Promise<void> }> };
  emitConsole: (msg: { type: string; text: string }) => void;
  setViewState: (state: {
    url: string;
    title: string;
    elements: unknown[];
  }) => void;
} {
  const calls: RecordedCall[] = [];
  let onConsole: ((msg: { type: string; text: string }) => void) | null = null;
  const viewState = {
    url: "about:blank",
    title: "",
    elements: [] as unknown[]
  };

  const page = {
    url: () => viewState.url,
    title: async () => viewState.title,
    viewportSize: () => ({ width: 1280, height: 900 }),
    evaluate: async (_fn: unknown, _arg?: unknown) => viewState.elements,
    screenshot: async () => Buffer.from("fake-png"),
    goto: async (url: string) => {
      calls.push({ method: "goto", args: [url] });
      viewState.url = url;
      viewState.title = `title of ${url}`;
      return { status: 200 };
    },
    click: async (selector: string) => {
      calls.push({ method: "click", args: [selector] });
    },
    fill: async (selector: string, text: string) => {
      calls.push({ method: "fill", args: [selector, text] });
    },
    press: async (selector: string, key: string) => {
      calls.push({ method: "press", args: [selector, key] });
    },
    selectOption: async (selector: string, option: string) => {
      calls.push({ method: "selectOption", args: [selector, option] });
      return [option];
    },
    mouse: {
      move: async (x: number, y: number) =>
        calls.push({ method: "mouse.move", args: [x, y] }),
      click: async (x: number, y: number) =>
        calls.push({ method: "mouse.click", args: [x, y] })
    },
    keyboard: {
      type: async (text: string) =>
        calls.push({ method: "keyboard.type", args: [text] }),
      press: async (key: string) =>
        calls.push({ method: "keyboard.press", args: [key] })
    },
    on: (event: string, handler: (msg: { type: string; text: string }) => void) => {
      if (event === "console") onConsole = handler;
    }
  };

  const close = async () => {
    calls.push({ method: "close", args: [] });
  };

  return {
    calls,
    adapter: {
      launch: async () => ({ page, close })
    },
    emitConsole: (msg) => {
      if (onConsole) onConsole(msg);
    },
    setViewState: (s) => {
      viewState.url = s.url;
      viewState.title = s.title;
      viewState.elements = s.elements;
    }
  };
}

let harness: ReturnType<typeof makeFakeBrowser>;

beforeEach(async () => {
  harness = makeFakeBrowser();
  setBrowserAdapter(harness.adapter as never);
});

afterEach(async () => {
  await _shutdownForTests();
  setBrowserAdapter(null);
});

describe("browserNavigate", () => {
  it("navigates and returns status + title", async () => {
    const out = await browserNavigate({ url: "https://example.com" });
    expect(out.url).toBe("https://example.com");
    expect(out.title).toBe("title of https://example.com");
    expect(out.status).toBe(200);
    expect(harness.calls[0]).toEqual({
      method: "goto",
      args: ["https://example.com"]
    });
  });
});

describe("browserView", () => {
  it("returns elements and a screenshot by default", async () => {
    harness.setViewState({
      url: "https://example.com",
      title: "Example",
      elements: [
        {
          index: 0,
          tag: "button",
          role: null,
          text: "Submit",
          attributes: {},
          bbox: { x: 0, y: 0, width: 10, height: 10 }
        }
      ]
    });
    const out = await browserView({});
    expect(out.url).toBe("https://example.com");
    expect(out.title).toBe("Example");
    expect(out.elements).toHaveLength(1);
    expect(out.screenshot_png_b64).toBe(
      Buffer.from("fake-png").toString("base64")
    );
  });

  it("omits screenshot when include_screenshot=false", async () => {
    const out = await browserView({ include_screenshot: false });
    expect(out.screenshot_png_b64).toBeNull();
  });
});

describe("browserClick", () => {
  it("clicks by index using the data-nt-idx selector", async () => {
    await browserClick({ index: 5 });
    expect(harness.calls.pop()).toEqual({
      method: "click",
      args: ['[data-nt-idx="5"]']
    });
  });

  it("clicks by coordinates using mouse.click", async () => {
    await browserClick({ coordinate_x: 42, coordinate_y: 99 });
    expect(harness.calls.pop()).toEqual({
      method: "mouse.click",
      args: [42, 99]
    });
  });
});

describe("browserInput", () => {
  it("fills the indexed element and optionally presses Enter", async () => {
    await browserInput({ index: 2, text: "hi", press_enter: true });
    expect(harness.calls).toContainEqual({
      method: "fill",
      args: ['[data-nt-idx="2"]', "hi"]
    });
    expect(harness.calls).toContainEqual({
      method: "press",
      args: ['[data-nt-idx="2"]', "Enter"]
    });
  });

  it("types into coord target after clicking", async () => {
    await browserInput({
      text: "hello",
      coordinate_x: 50,
      coordinate_y: 50
    });
    expect(harness.calls).toContainEqual({
      method: "mouse.click",
      args: [50, 50]
    });
    expect(harness.calls).toContainEqual({
      method: "keyboard.type",
      args: ["hello"]
    });
  });
});

describe("browserConsoleView", () => {
  it("captures console messages and returns the latest N", async () => {
    // Force state creation so the console listener is wired up.
    await browserNavigate({ url: "https://x.test" });
    harness.emitConsole({ type: "log", text: "hello" });
    harness.emitConsole({ type: "warn", text: "warn!" });
    const out = await browserConsoleView({ max_lines: 10 });
    expect(out.messages.map((m) => m.text)).toEqual(["hello", "warn!"]);
    expect(out.messages[0].type).toBe("log");
  });
});
