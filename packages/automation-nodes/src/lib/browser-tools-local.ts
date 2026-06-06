/**
 * Local browser-action functions backed by Chrome DevTools Protocol.
 *
 * Mirrors `packages/sandbox-agent/src/tools/browser.ts` but runs inside the
 * host process — the agent shares a single Chrome instance across calls so
 * cookies, navigation history, and indexed elements persist between actions.
 *
 * Element indexing on `browser_view`: a JS expression assigns a sequential
 * `data-nt-idx` attribute to interactive elements; subsequent click/input/
 * select_option tools address by that index. Indexes are rebuilt on every
 * view, so callers must view before relying on an index.
 */

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
import type { CdpPage } from "./cdp-page.js";

const CONSOLE_BUFFER_MAX = 500;

interface BrowserState {
  page: CdpPage;
  close: () => Promise<void>;
  consoleMessages: BrowserConsoleMessage[];
}

let state: BrowserState | null = null;
let shutdownHooked = false;

function hookShutdown(): void {
  if (shutdownHooked || typeof process === "undefined") return;
  shutdownHooked = true;
  const onExit = (): void => {
    if (state) {
      // Best-effort, synchronous fire-and-forget — process is exiting.
      state.close().catch(() => undefined);
      state = null;
    }
  };
  process.once("SIGINT", onExit);
  process.once("SIGTERM", onExit);
  process.once("exit", onExit);
}

async function ensureState(): Promise<BrowserState> {
  if (state) return state;
  const { launchBrowser, CdpPage: CdpPageCls } = await import("./cdp-page.js");
  const headless = process.env.NODETOOL_BROWSER_HEADLESS !== "false";
  const session = await launchBrowser({
    headless,
    viewport: { width: 1280, height: 900 }
  });
  const page = await CdpPageCls.create(session.client, {
    width: 1280,
    height: 900
  });

  const consoleMessages: BrowserConsoleMessage[] = [];
  page.on("console", (msg) => {
    consoleMessages.push({
      type: msg.type,
      text: msg.text,
      timestamp: Date.now()
    });
    if (consoleMessages.length > CONSOLE_BUFFER_MAX) {
      consoleMessages.splice(
        0,
        consoleMessages.length - CONSOLE_BUFFER_MAX
      );
    }
  });

  state = { page, close: session.close, consoleMessages };
  hookShutdown();
  return state;
}

export async function browserView(
  input: BrowserViewInput
): Promise<BrowserViewOutput> {
  const s = await ensureState();
  const { page } = s;

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

  const viewport = page.viewportSize();
  const url = page.url();
  const title = await page.title();

  const want =
    input.include_screenshot === undefined ? true : input.include_screenshot;
  let screenshot: string | null = null;
  if (want) {
    const buf = await page.screenshot({ fullPage: false });
    screenshot = buf.toString("base64");
  }

  return { url, title, viewport, elements, screenshot_png_b64: screenshot };
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
    status: res.status
  };
}

export async function browserRestart(
  input: BrowserRestartInput
): Promise<BrowserRestartOutput> {
  if (state) {
    try {
      await state.close();
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
  const args = {
    top: input.to_top === true,
    bottom: input.to_bottom === true,
    pixels: input.pixels ?? null
  };
  const scrollY = await s.page.evaluate(
    (a: { top: boolean; bottom: boolean; pixels: number | null }) => {
      if (a.top) {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } else if (a.bottom) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "instant" as ScrollBehavior
        });
      } else if (a.pixels !== null) {
        window.scrollBy({
          top: a.pixels,
          behavior: "instant" as ScrollBehavior
        });
      }
      return window.scrollY;
    },
    args
  );
  return { scroll_y: scrollY as number };
}

export async function browserConsoleExec(
  input: BrowserConsoleExecInput
): Promise<BrowserConsoleExecOutput> {
  const s = await ensureState();
  const result = await s.page.evaluate(input.javascript);
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

export async function _shutdownLocalBrowser(): Promise<void> {
  if (state) {
    try {
      await state.close();
    } catch {
      // ignore
    }
    state = null;
  }
}
