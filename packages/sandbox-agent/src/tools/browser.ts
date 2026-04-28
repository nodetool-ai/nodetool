/**
 * Browser tools — Playwright-driven Chromium with element-index + coordinate
 * addressing.
 *
 * A single Browser/Context/Page is kept alive for the lifetime of the
 * container; the agent shares one session across calls so cookies and auth
 * persist. `browser_restart` tears down and re-creates the page.
 *
 * Element indexing: on each browser_view, a JS expression runs in the page
 * that selects all interactive elements (button, link, input, select,
 * textarea, [role="button"], [onclick], [tabindex]) and assigns a numeric
 * data-nt-idx attribute. The assignment is deterministic within a view call
 * but IS rebuilt each time the DOM changes, so callers should always call
 * browser_view before relying on an index.
 *
 * Console capture: page.on("console") pushes into an in-memory ring buffer
 * so browser_console_view can return recent messages.
 */

import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Page
} from "playwright";
import type {
  BrowserViewInput,
  BrowserViewOutput,
  BrowserNavigateInput,
  BrowserNavigateOutput,
  BrowserRestartInput,
  BrowserRestartOutput,
  BrowserClickInput,
  BrowserClickOutput,
  BrowserInputTextInput,
  BrowserInputTextOutput,
  BrowserMoveMouseInput,
  BrowserMoveMouseOutput,
  BrowserPressKeyInput,
  BrowserPressKeyOutput,
  BrowserSelectOptionInput,
  BrowserSelectOptionOutput,
  BrowserScrollInput,
  BrowserScrollOutput,
  BrowserConsoleExecInput,
  BrowserConsoleExecOutput,
  BrowserConsoleViewInput,
  BrowserConsoleViewOutput,
  BrowserElement,
  BrowserConsoleMessage
} from "@nodetool-ai/sandbox/schemas";

const CONSOLE_BUFFER_MAX = 500;

interface BrowserState {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  consoleMessages: BrowserConsoleMessage[];
}

let state: BrowserState | null = null;

/** Injectable for tests: replace the Playwright launcher. */
export interface PlaywrightAdapter {
  launch(): Promise<Browser>;
}

let adapter: PlaywrightAdapter | null = null;

/** Test hook — override the Playwright launcher. */
export function setPlaywrightAdapter(a: PlaywrightAdapter | null): void {
  adapter = a;
}

async function ensureState(): Promise<BrowserState> {
  if (state) return state;

  let browser: Browser;
  if (adapter) {
    browser = await adapter.launch();
  } else {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: process.env.NODETOOL_BROWSER_HEADLESS === "true",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,900"
      ]
    });
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  const consoleMessages: BrowserConsoleMessage[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: Date.now()
    });
    if (consoleMessages.length > CONSOLE_BUFFER_MAX) {
      consoleMessages.splice(0, consoleMessages.length - CONSOLE_BUFFER_MAX);
    }
  });

  state = { browser, context, page, consoleMessages };
  return state;
}

export async function browserView(
  input: BrowserViewInput
): Promise<BrowserViewOutput> {
  const s = await ensureState();
  const { page } = s;

  // Index interactive elements and pull their geometry.
  const elements = (await page.evaluate(() => {
    const SELECTOR =
      "a, button, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='menuitem'], [role='tab'], [onclick], [tabindex]";
    const nodes = Array.from(document.querySelectorAll(SELECTOR));
    return nodes.flatMap((el, i) => {
      const he = el as HTMLElement;
      const rect = he.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      const style = window.getComputedStyle(he);
      if (style.visibility === "hidden" || style.display === "none") return [];
      he.setAttribute("data-nt-idx", String(i));
      const attrs: Record<string, string> = {};
      for (const a of Array.from(he.attributes)) {
        if (a.name.startsWith("data-nt-")) continue;
        attrs[a.name] = a.value;
      }
      return [
        {
          index: i,
          tag: he.tagName.toLowerCase(),
          role: he.getAttribute("role"),
          text: (he.innerText || he.getAttribute("value") || "").slice(0, 200),
          attributes: attrs,
          bbox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        }
      ];
    });
  })) as BrowserElement[];

  const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
  const url = page.url();
  const title = await page.title();

  const want =
    input.include_screenshot === undefined ? true : input.include_screenshot;
  let screenshot: string | null = null;
  if (want) {
    const buf = await page.screenshot({ type: "png", fullPage: false });
    screenshot = buf.toString("base64");
  }

  return {
    url,
    title,
    viewport,
    elements,
    screenshot_png_b64: screenshot
  };
}

export async function browserNavigate(
  input: BrowserNavigateInput
): Promise<BrowserNavigateOutput> {
  const s = await ensureState();
  const waitUntil = input.wait_until ?? "load";
  const res = await s.page.goto(input.url, { waitUntil });
  return {
    url: s.page.url(),
    title: await s.page.title(),
    status: res?.status() ?? null
  };
}

export async function browserRestart(
  input: BrowserRestartInput
): Promise<BrowserRestartOutput> {
  if (state) {
    try {
      await state.browser.close();
    } catch {
      // ignore
    }
    state = null;
  }
  const s = await ensureState();
  if (input.url) {
    await s.page.goto(input.url, { waitUntil: "load" });
  }
  return { url: s.page.url() };
}

export async function browserClick(
  input: BrowserClickInput
): Promise<BrowserClickOutput> {
  const s = await ensureState();
  if (input.index !== undefined) {
    await s.page.click(`[data-nt-idx="${input.index}"]`);
  } else {
    await s.page.mouse.click(input.coordinate_x!, input.coordinate_y!);
  }
  return { clicked: true };
}

export async function browserInput(
  input: BrowserInputTextInput
): Promise<BrowserInputTextOutput> {
  const s = await ensureState();
  if (input.index !== undefined) {
    const sel = `[data-nt-idx="${input.index}"]`;
    await s.page.fill(sel, input.text);
    if (input.press_enter) {
      await s.page.press(sel, "Enter");
    }
  } else {
    await s.page.mouse.click(input.coordinate_x!, input.coordinate_y!);
    await s.page.keyboard.type(input.text);
    if (input.press_enter) {
      await s.page.keyboard.press("Enter");
    }
  }
  return { typed: true };
}

export async function browserMoveMouse(
  input: BrowserMoveMouseInput
): Promise<BrowserMoveMouseOutput> {
  const s = await ensureState();
  await s.page.mouse.move(input.coordinate_x, input.coordinate_y);
  return { moved: true };
}

export async function browserPressKey(
  input: BrowserPressKeyInput
): Promise<BrowserPressKeyOutput> {
  const s = await ensureState();
  await s.page.keyboard.press(input.key);
  return { pressed: true };
}

export async function browserSelectOption(
  input: BrowserSelectOptionInput
): Promise<BrowserSelectOptionOutput> {
  const s = await ensureState();
  const sel = `[data-nt-idx="${input.index}"]`;
  const selected = await s.page.selectOption(sel, input.option);
  return { selected };
}

export async function browserScroll(
  input: BrowserScrollInput
): Promise<BrowserScrollOutput> {
  const s = await ensureState();
  const scrollY = (await s.page.evaluate(
    (args: { top: boolean; bottom: boolean; pixels: number | null }) => {
      if (args.top) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } else if (args.bottom) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant" as ScrollBehavior
        });
      } else if (args.pixels !== null) {
        window.scrollBy({
          top: args.pixels,
          behavior: "instant" as ScrollBehavior
        });
      }
      return window.scrollY;
    },
    {
      top: input.to_top === true,
      bottom: input.to_bottom === true,
      pixels: input.pixels ?? null
    }
  )) as number;
  return { scroll_y: scrollY };
}

export async function browserConsoleExec(
  input: BrowserConsoleExecInput
): Promise<BrowserConsoleExecOutput> {
  const s = await ensureState();
  const result = await s.page.evaluate(
    (code: string) =>
      // eslint-disable-next-line no-new-func
      new Function(`return (async () => { return (${code}); })()`)(),
    input.javascript
  );
  return { result_json: JSON.stringify(result ?? null) };
}

export async function browserConsoleView(
  input: BrowserConsoleViewInput
): Promise<BrowserConsoleViewOutput> {
  const s = await ensureState();
  const max = input.max_lines ?? 100;
  const messages = s.consoleMessages.slice(-max);
  return { messages };
}

/** Test hook — tear down the browser singleton. */
export async function _shutdownForTests(): Promise<void> {
  if (state) {
    try {
      await state.browser.close();
    } catch {
      // ignore
    }
    state = null;
  }
}
