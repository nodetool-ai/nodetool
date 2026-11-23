/**
 * The `browser_*` page actions against a faked Chrome, end to end below the
 * agent layer.
 *
 * `capabilities-browser.test.ts` mocks `@nodetool-ai/browser` whole, so it
 * proves dispatch but never runs an action. Here the real action loop and the
 * real `CdpPage` run, and only Chrome is replaced, at the two modules the
 * local transport launches it through: `chrome-launcher` (start a process) and
 * `chrome-remote-interface` (talk CDP to it). The fake CDP client serves a
 * recorded page into jsdom and executes the exact expressions and serialized
 * functions `CdpPage` sends, the same way `packages/browser/tests/cdp-page.test.ts`
 * does. Each case asserts the action's own result and what reached the page
 * or the wire.
 *
 * jsdom has no layout engine, so the two layout facts the actions read —
 * element boxes and the scroll position — are modelled below in a few lines.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** A recorded page, keyed by URL, with the status its document came back with. */
const PAGES: Record<string, { status: number; html: string }> = {
  "https://shop.example.test/checkout": {
    status: 200,
    html: `<!doctype html><html><head><title>Checkout</title></head><body>
      <h1>Checkout</h1>
      <form>
        <label>Email <input id="email" name="email" type="email"></label>
        <label>Shipping
          <select id="shipping" name="shipping">
            <option value="standard">Standard</option>
            <option value="express">Express</option>
          </select>
        </label>
        <button id="pay" type="button">Pay</button>
      </form>
    </body></html>`
  },
  "https://shop.example.test/thanks": {
    status: 200,
    html: `<!doctype html><html><head><title>Thank you</title></head><body><p>Order placed.</p></body></html>`
  }
};

const NOT_FOUND = {
  status: 404,
  html: `<!doctype html><html><head><title>Not Found</title></head><body>404</body></html>`
};

/** Every CDP command the fake client received, in order. */
const commands: { method: string; params: Record<string, unknown> }[] = [];
let launches = 0;
let closes = 0;

type Handler = (event: unknown) => void;

/** One CDP connection to the fake Chrome. */
function fakeCdpClient() {
  const handlers = new Map<string, Set<Handler>>();
  const on = (event: string) => (handler: Handler) => {
    const set = handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    handlers.set(event, set);
    return () => set.delete(handler);
  };
  const emit = (event: string, payload: unknown) => {
    for (const handler of [...(handlers.get(event) ?? [])]) handler(payload);
  };
  const record = (method: string, params: Record<string, unknown> = {}) => {
    commands.push({ method, params });
  };

  /** The page's console, reported the way Chrome reports it over CDP. */
  const pageConsole = Object.fromEntries(
    ["log", "info", "warn", "error", "debug"].map((type) => [
      type,
      (...args: unknown[]) =>
        emit("Runtime.consoleAPICalled", {
          type: type === "warn" ? "warning" : type,
          args: args.map((value) => ({ value }))
        })
    ])
  );

  /** Compile page code with the page's console in scope. */
  const compile = (source: string): unknown =>
    new win.Function("console", `return (${source});`)(pageConsole);

  const evaluate = async (source: string, awaitPromise: boolean) => {
    try {
      const value = compile(source);
      return { result: { value: awaitPromise ? await value : value } };
    } catch (error) {
      return { exceptionDetails: { exception: { description: String(error) } } };
    }
  };

  const load = (url: string) => {
    const page = PAGES[url] ?? NOT_FOUND;
    const parsed = new win.DOMParser().parseFromString(page.html, "text/html");
    doc.replaceChild(
      doc.importNode(parsed.documentElement, true),
      doc.documentElement
    );
    Object.defineProperty(doc.documentElement, "scrollHeight", {
      configurable: true,
      get: () => PAGE_HEIGHT
    });
    scrollY = 0;
    setTimeout(() => {
      emit("Network.responseReceived", {
        type: "Document",
        response: { status: page.status }
      });
      emit("Page.loadEventFired", {});
    }, 0);
  };

  return {
    Page: {
      enable: async () => record("Page.enable"),
      navigate: async (params: { url: string }) => {
        record("Page.navigate", params);
        load(params.url);
        return { frameId: "main" };
      },
      captureScreenshot: async () => ({ data: "" }),
      loadEventFired: on("Page.loadEventFired"),
      domContentEventFired: on("Page.domContentEventFired")
    },
    Runtime: {
      enable: async () => record("Runtime.enable"),
      evaluate: async (params: { expression: string; awaitPromise?: boolean }) =>
        params.expression === "globalThis"
          ? { result: { objectId: "global" } }
          : evaluate(params.expression, params.awaitPromise === true),
      callFunctionOn: async (params: {
        functionDeclaration: string;
        arguments: { value: unknown }[];
      }) => {
        try {
          const fn = compile(params.functionDeclaration) as (
            ...args: unknown[]
          ) => unknown;
          return {
            result: {
              value: await fn(...params.arguments.map((arg) => arg.value))
            }
          };
        } catch (error) {
          return {
            exceptionDetails: { exception: { description: String(error) } }
          };
        }
      },
      releaseObject: async () => undefined,
      consoleAPICalled: on("Runtime.consoleAPICalled")
    },
    Network: {
      enable: async () => record("Network.enable"),
      responseReceived: on("Network.responseReceived"),
      requestWillBeSent: on("Network.requestWillBeSent"),
      loadingFinished: on("Network.loadingFinished"),
      loadingFailed: on("Network.loadingFailed"),
      getResponseBody: async () => ({ body: "", base64Encoded: false })
    },
    DOM: { enable: async () => record("DOM.enable") },
    Console: { enable: async () => record("Console.enable") },
    Emulation: {
      setDeviceMetricsOverride: async (params: Record<string, unknown>) =>
        record("Emulation.setDeviceMetricsOverride", params)
    },
    Input: {
      dispatchMouseEvent: async (params: {
        type: string;
        x: number;
        y: number;
      }) => {
        record("Input.dispatchMouseEvent", params);
        if (params.type === "mouseMoved") {
          doc.dispatchEvent(
            new win.MouseEvent("mousemove", {
              bubbles: true,
              clientX: params.x,
              clientY: params.y
            })
          );
        }
      },
      dispatchKeyEvent: async (params: { type: string; key: string; code: string }) => {
        record("Input.dispatchKeyEvent", params);
        const type =
          params.type === "keyDown" ? "keydown" : params.type === "keyUp" ? "keyup" : null;
        if (type) {
          (doc.activeElement ?? doc.body).dispatchEvent(
            new win.KeyboardEvent(type, {
              bubbles: true,
              key: params.key,
              code: params.code
            })
          );
        }
      }
    },
    close: async () => {
      closes += 1;
    }
  };
}

vi.mock("chrome-launcher", () => ({
  launch: async () => {
    launches += 1;
    return { port: 9222, kill: async () => undefined };
  }
}));

vi.mock("chrome-remote-interface", () => ({
  default: async () => fakeCdpClient()
}));

/** jsdom's layout model: a scroll position the page's own calls move. */
let scrollY = 0;
const PAGE_HEIGHT = 3000;

const { closeBrowserSession } = await import("@nodetool-ai/browser");
const { UNGATED, createCapabilityRun } = await import(
  "../src/capabilities/index.js"
);

const { JSDOM } = await import("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "about:blank",
  runScripts: "outside-only"
});
const win = dom.window as unknown as Window & typeof globalThis;
const doc = win.document;

const run = createCapabilityRun({
  context: {} as unknown as ProcessingContext,
  gate: UNGATED
});

const call = (
  name: string,
  args: Record<string, unknown> = {}
): Promise<Record<string, unknown>> =>
  run.invoke(name, args) as Promise<Record<string, unknown>>;

const sent = (method: string) =>
  commands.filter((c) => c.method === method).map((c) => c.params);

let savedTransport: string | undefined;

beforeAll(() => {
  savedTransport = process.env.NODETOOL_BROWSER_TRANSPORT;
  delete process.env.NODETOOL_BROWSER_TRANSPORT;

  // Every element has a box, so `browser_view` indexes it.
  win.Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, width: 120, height: 24, top: 0, left: 0, right: 120, bottom: 24, toJSON: () => ({}) } as DOMRect;
  };
  Object.defineProperty(win, "scrollY", {
    configurable: true,
    get: () => scrollY
  });
  const clamp = (y: number) => Math.max(0, Math.min(PAGE_HEIGHT, y));
  win.scrollTo = ((options: ScrollToOptions) => {
    scrollY = clamp(options.top ?? scrollY);
  }) as typeof win.scrollTo;
  win.scrollBy = ((options: ScrollToOptions) => {
    scrollY = clamp(scrollY + (options.top ?? 0));
  }) as typeof win.scrollBy;
});

afterAll(async () => {
  await closeBrowserSession();
  if (savedTransport === undefined) delete process.env.NODETOOL_BROWSER_TRANSPORT;
  else process.env.NODETOOL_BROWSER_TRANSPORT = savedTransport;
});

beforeEach(() => {
  commands.length = 0;
});

describe("browser page actions against a recorded page", () => {
  it("browser_navigate loads the page and reports its URL, title and status", async () => {
    const result = await call("browser_navigate", {
      url: "https://shop.example.test/checkout"
    });

    expect(result).toEqual({
      url: "https://shop.example.test/checkout",
      title: "Checkout",
      status: 200
    });
    expect(launches).toBe(1);
    expect(sent("Page.navigate")).toEqual([
      { url: "https://shop.example.test/checkout" }
    ]);
    expect(doc.querySelector("h1")?.textContent).toBe("Checkout");
  });

  it("browser_navigate passes a failing status through instead of hiding it", async () => {
    const result = await call("browser_navigate", {
      url: "https://shop.example.test/missing"
    });

    expect(result).toEqual({
      url: "https://shop.example.test/missing",
      title: "Not Found",
      status: 404
    });
    // One shared session: the second navigation reused the first launch.
    expect(launches).toBe(1);
  });

  it("browser_select_option sets the indexed <select> and reports the value it holds", async () => {
    await call("browser_navigate", { url: "https://shop.example.test/checkout" });
    const changes: string[] = [];
    doc
      .getElementById("shipping")
      ?.addEventListener("change", (e) =>
        changes.push((e.target as HTMLSelectElement).value)
      );

    const view = await call("browser_view", { include_screenshot: false });
    const elements = view.elements as Array<{ index: number; tag: string }>;
    const select = elements.find((e) => e.tag === "select");
    expect(select).toBeDefined();

    const result = await call("browser_select_option", {
      index: select!.index,
      option: "express"
    });

    expect(result).toEqual({ selected: ["express"] });
    expect((doc.getElementById("shipping") as HTMLSelectElement).value).toBe(
      "express"
    );
    expect(changes).toEqual(["express"]);
  });

  it("browser_select_option fails as a sentence when the index names nothing", async () => {
    const result = await call("browser_select_option", { index: 999, option: "x" });

    expect(result).toEqual({ error: 'Element not found: [data-nt-idx="999"]' });
  });

  it("browser_move_mouse sends one mouseMoved event at the coordinates", async () => {
    const seen: Array<[number, number]> = [];
    doc.addEventListener("mousemove", (e) => seen.push([e.clientX, e.clientY]), {
      once: true
    });

    const result = await call("browser_move_mouse", {
      coordinate_x: 40,
      coordinate_y: 75
    });

    expect(result).toEqual({ moved: true });
    expect(sent("Input.dispatchMouseEvent")).toEqual([
      { type: "mouseMoved", x: 40, y: 75 }
    ]);
    expect(seen).toEqual([[40, 75]]);
  });

  it("browser_press_key sends keyDown then keyUp, mapped to Chrome's key codes", async () => {
    (doc.getElementById("email") as HTMLInputElement).focus();
    const keys: string[] = [];
    doc
      .getElementById("email")
      ?.addEventListener("keydown", (e) => keys.push(`${e.key}/${e.code}`));

    const result = await call("browser_press_key", { key: "Enter" });

    expect(result).toEqual({ pressed: true });
    expect(sent("Input.dispatchKeyEvent")).toEqual([
      {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r"
      },
      { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }
    ]);
    expect(keys).toEqual(["Enter/Enter"]);
  });

  it("browser_scroll moves by pixels, to the bottom and to the top, and reports where it landed", async () => {
    await expect(call("browser_scroll", { pixels: 400 })).resolves.toEqual({
      scroll_y: 400
    });
    await expect(call("browser_scroll", { pixels: 250 })).resolves.toEqual({
      scroll_y: 650
    });
    await expect(call("browser_scroll", { to_bottom: true })).resolves.toEqual({
      scroll_y: PAGE_HEIGHT
    });
    await expect(call("browser_scroll", { to_top: true })).resolves.toEqual({
      scroll_y: 0
    });
  });

  it("browser_console_exec evaluates in the page and returns the value as JSON", async () => {
    const result = await call("browser_console_exec", {
      javascript:
        "(console.log('checking out', 2), { title: document.title, fields: document.querySelectorAll('input, select').length })"
    });

    expect(JSON.parse(String(result.result_json))).toEqual({
      title: "Checkout",
      fields: 2
    });
  });

  it("browser_console_exec reports a page exception as an error result", async () => {
    const result = await call("browser_console_exec", {
      javascript: "missingFunction()"
    });

    expect(String(result.error)).toContain("missingFunction");
  });

  it("browser_console_view returns what the page logged, newest last, capped by max_lines", async () => {
    await call("browser_console_exec", {
      javascript: "(console.warn('low stock'), console.error('card declined'), null)"
    });

    const all = await call("browser_console_view");
    const messages = all.messages as Array<{ type: string; text: string; timestamp: number }>;
    expect(messages.map((m) => [m.type, m.text])).toEqual([
      ["log", "checking out 2"],
      ["warning", "low stock"],
      ["error", "card declined"]
    ]);
    expect(messages.every((m) => typeof m.timestamp === "number")).toBe(true);

    const last = await call("browser_console_view", { max_lines: 1 });
    expect((last.messages as Array<{ text: string }>).map((m) => m.text)).toEqual([
      "card declined"
    ]);
  });

  it("browser_restart tears the session down, relaunches Chrome and opens the URL", async () => {
    const closesBefore = closes;

    const result = await call("browser_restart", {
      transport: "local",
      url: "https://shop.example.test/thanks"
    });

    expect(result).toEqual({
      url: "https://shop.example.test/thanks",
      transport: "local"
    });
    expect(closes).toBe(closesBefore + 1);
    expect(launches).toBe(2);
    expect(sent("Page.navigate")).toEqual([
      { url: "https://shop.example.test/thanks" }
    ]);
    expect(doc.title).toBe("Thank you");
    // A fresh session starts with an empty console buffer.
    await expect(call("browser_console_view")).resolves.toEqual({ messages: [] });
  });
});
