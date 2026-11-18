/**
 * Blind first-time-user participant for the `agentic-qa` skill.
 *
 * The coordinator knows NodeTool. The participant must not. This runner is the
 * boundary between them: it starts one fresh Claude session whose only inputs
 * are the participant protocol, one task packet, and viewport screenshots, and
 * whose only tools are coordinate/keyboard actions on a fresh Playwright
 * browser. The session gets no repository files, no CLAUDE.md, no memory, no
 * skills, no MCP connectors, no built-in tools, and no DOM or page text.
 *
 * The init message the SDK reports is audited before the first action. A
 * session that exposes anything beyond the browser tools is stopped as
 * `BLOCKED_ENVIRONMENT`. Private diagnostics (console, page errors, failed
 * requests) are written under `private/` and never reach the participant.
 *
 * Usage (from web/):
 *   npx tsx tests/agentic-qa/runParticipant.ts --packet <packet.json> --out <run-dir/session>
 *     [--model sonnet] [--headed] [--protocol <participant.md>]
 *
 * `--protocol` swaps the participant protocol, for example the `ux-research`
 * skill's think-aloud protocol. The default is the `agentic-qa` one.
 *
 * See .agents/skills/agentic-qa/references/runtime.md for the packet format.
 */

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type FileChooser,
  type Page
} from "@playwright/test";
import { z } from "zod";
import { installOriginGuard } from "./originGuard";
import {
  prepareOutDir,
  receiptLogger,
  runParticipantSession,
  textResult,
  toolResult,
  type ParticipantSurface,
  type Receipt
} from "./participantLoop";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(CURRENT_DIR, "../../..");
const DEFAULT_PROTOCOL_PATH = join(
  REPO_ROOT,
  ".agents/skills/agentic-qa/references/participant.md"
);

const DEFAULT_VIEWPORT = { width: 1440, height: 900 } as const;
const SERVER_NAME = "browser";
const SETTLE_MS = 700;
const MAX_WAIT_SECONDS = 10;

const PacketSchema = z.object({
  sessionId: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["discovery", "task", "continuation"]),
  entryUrl: z.string().url(),
  persona: z.string().min(1),
  goal: z.string().min(1),
  maxActions: z.number().int().positive(),
  maxMinutes: z.number().positive(),
  allowedOrigins: z.array(z.string().url()).min(1),
  permittedActions: z.string().min(1),
  /** Ordinary user-owned files. The participant sees only the names. */
  assets: z
    .array(z.object({ name: z.string(), path: z.string() }))
    .default([]),
  /**
   * Keys the persona owns and may paste when the app asks for one, such as a
   * test API key the fake runtime accepts. Never a real credential.
   */
  credentials: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .default([]),
  /** CSS pixels, device scale 1. A smaller laptop screen shows layout faults. */
  viewport: z
    .object({
      width: z.number().int().min(320),
      height: z.number().int().min(320)
    })
    .default(DEFAULT_VIEWPORT)
});
type Packet = z.infer<typeof PacketSchema>;

function renderPacket(packet: Packet): string {
  const assets =
    packet.assets.length > 0
      ? packet.assets.map((a) => `- ${a.name}`).join("\n")
      : "None.";
  return [
    "# Task packet",
    "",
    `Entry URL: ${packet.entryUrl}`,
    `Persona: ${packet.persona}`,
    `Goal: ${packet.goal}`,
    `Permitted origins: ${packet.allowedOrigins.join(", ")}`,
    `Permitted actions: ${packet.permittedActions}`,
    `Limits: at most ${packet.maxActions} browser actions and ${packet.maxMinutes} minutes.`,
    "",
    "Files you own and may upload when a page asks for a file:",
    assets,
    "",
    ...(packet.credentials.length > 0
      ? [
          "Keys you own and may paste when the app asks for one:",
          ...packet.credentials.map((c) => `- ${c.label}: ${c.value}`),
          ""
        ]
      : []),
    "The browser is already open at the entry URL. Call `screenshot` to see it.",
    "When you stop, write your final account as described in the protocol."
  ].join("\n");
}

const toolGuide = (viewport: Packet["viewport"]): string => `
## Browser tools

You see the browser only through viewport screenshots of ${viewport.width} × ${viewport.height}
CSS pixels. Coordinates are CSS pixels from the top-left corner of the screenshot.
Every action tool performs one action and returns a receipt with the new
screenshot, its ID, the address bar, and the tab title. \`screenshot\` does not
count as an action. You have no other tools.

The browser runs on ${process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux"}.
Editing shortcuts such as select all use ${process.platform === "darwin" ? "Meta (Command)" : "Control"}.
`;

function parseCli(): {
  packet: string;
  out: string;
  model: string;
  headed: boolean;
  protocol: string;
} {
  const { values } = parseArgs({
    options: {
      packet: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: "sonnet" },
      headed: { type: "boolean", default: false },
      protocol: { type: "string" }
    }
  });
  if (!values.packet || !values.out) {
    throw new Error(
      "Usage: runParticipant.ts --packet <packet.json> --out <dir> [--model sonnet] [--headed] [--protocol <participant.md>]"
    );
  }
  return {
    packet: values.packet,
    out: values.out,
    model: values.model ?? "sonnet",
    headed: values.headed ?? false,
    protocol: values.protocol ? resolve(values.protocol) : DEFAULT_PROTOCOL_PATH
  };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

class BrowserSession implements ParticipantSurface {
  private page!: Page;
  private context!: BrowserContext;
  private browser: Browser | undefined;
  private shotCount = 0;
  private pendingEvents: string[] = [];
  private fileChooser: FileChooser | null = null;
  readonly startedAt = Date.now();
  actions = 0;
  browserMs = 0;
  softLimitReached = false;

  constructor(
    private readonly packet: Packet,
    private readonly outDir: string,
    private readonly headed: boolean
  ) {}

  get surfaceMs(): number {
    return this.browserMs;
  }

  async start(): Promise<void> {
    const headed = this.headed;
    const browser = await chromium.launch({
      headless: !headed,
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {})
    });
    this.browser = browser;
    this.context = await browser.newContext({
      viewport: this.packet.viewport,
      deviceScaleFactor: 1,
      locale: "en-US"
    });
    await installOriginGuard(this.context, this.packet.allowedOrigins, async (url) => {
      this.pendingEvents.push(
        `A page outside the permitted sites did not open (${originOf(url) ?? url}).`
      );
      await this.privateLog("blocked-navigation", { url });
    });
    this.attach(await this.context.newPage());
    this.context.on("page", (page) => {
      this.pendingEvents.push("A new browser tab opened and is now active.");
      this.attach(page);
    });
    await this.page.goto(this.packet.entryUrl, { waitUntil: "load" });
    await this.settle();
  }

  private attach(page: Page): void {
    this.page = page;
    page.on("dialog", (dialog) => {
      this.pendingEvents.push(
        `A browser dialog appeared and was dismissed: “${dialog.message()}”`
      );
      void dialog.dismiss().catch(() => undefined);
    });
    page.on("filechooser", (chooser) => {
      this.fileChooser = chooser;
      this.pendingEvents.push(
        this.packet.assets.length > 0
          ? "A file picker opened. Use `choose_file` to pick one of your files."
          : "A file picker opened. You have no files to pick, so it closed."
      );
    });
    page.on("download", (download) => {
      this.pendingEvents.push(
        `The browser downloaded a file: “${download.suggestedFilename()}”.`
      );
      void this.privateLog("download", { url: download.url() });
    });
    page.on("close", () => {
      const pages = this.context.pages();
      const last = pages[pages.length - 1];
      if (last && last !== page) {
        this.pendingEvents.push("The tab closed. The previous tab is active.");
        this.page = last;
      }
    });
    page.on("console", (msg) => {
      void this.privateLog("console", { type: msg.type(), text: msg.text() });
    });
    page.on("pageerror", (err) => {
      void this.privateLog("pageerror", { message: err.message });
    });
    page.on("requestfailed", (req) => {
      void this.privateLog("requestfailed", {
        url: req.url(),
        failure: req.failure()?.errorText
      });
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        void this.privateLog("http-error", { url: res.url(), status: res.status() });
      }
    });
  }

  private async privateLog(kind: string, data: object): Promise<void> {
    await appendFile(
      join(this.outDir, "private", "browser.jsonl"),
      `${JSON.stringify({ t: Date.now() - this.startedAt, kind, ...data })}\n`
    );
  }

  private async settle(): Promise<void> {
    await this.page.waitForTimeout(SETTLE_MS);
    await this.page
      .waitForLoadState("networkidle", { timeout: 2_000 })
      .catch(() => undefined);
  }

  /** Capture the viewport only, never the full page. */
  async capture(): Promise<{ id: string; data: string }> {
    this.shotCount += 1;
    const id = `S${String(this.shotCount).padStart(3, "0")}`;
    const buffer = await this.page.screenshot({ fullPage: false });
    await writeFile(join(this.outDir, "screenshots", `${id}.png`), buffer);
    return { id, data: buffer.toString("base64") };
  }

  async receipt(summary: string): Promise<{ receipt: Receipt; data: string }> {
    const shot = await this.capture();
    const title = await this.page.title().catch(() => "");
    const events = this.pendingEvents.splice(0);
    const lines = [
      summary,
      `Screenshot: ${shot.id}`,
      `Address bar: ${this.page.url()}`,
      `Tab title: ${title || "(none)"}`,
      `Open tabs: ${this.context.pages().length}`,
      ...events
    ];
    const remaining = this.packet.maxActions - this.actions;
    lines.push(`Actions used: ${this.actions} of ${this.packet.maxActions}.`);
    if (remaining <= 0) {
      lines.push("Action limit reached. Stop and write your final account.");
    }
    if (this.softLimitReached) {
      lines.push("Time limit reached. Stop and write your final account.");
    }
    return {
      receipt: { step: this.actions, screenshot: shot.id, text: lines.join("\n") },
      data: shot.data
    };
  }

  /** Return a refusal text when no further action is permitted. */
  refusal(): string | null {
    if (this.softLimitReached) {
      return "Time limit reached. No action was performed. Write your final account now.";
    }
    if (this.actions >= this.packet.maxActions) {
      return "Action limit reached. No action was performed. Write your final account now.";
    }
    return null;
  }

  async act(
    describe: string,
    run: (page: Page) => Promise<void>
  ): Promise<{ receipt: Receipt; data: string }> {
    this.actions += 1;
    const started = Date.now();
    let summary = `Action ${this.actions}: ${describe}.`;
    try {
      await run(this.page);
      await this.settle();
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      summary = `Action ${this.actions}: ${describe} could not be performed by the browser tool (${message}).`;
      await this.privateLog("tool-error", { describe, message });
    }
    this.browserMs += Date.now() - started;
    return this.receipt(summary);
  }

  /**
   * Close the active tab, as a person does with the tab's close button. A
   * blocked link that opened a tab otherwise strands the participant there:
   * Control+W does not reach the browser chrome under automation.
   */
  async closeTab(): Promise<void> {
    if (this.context.pages().length < 2) {
      throw new Error("This is the only open tab, so it stayed open.");
    }
    await this.page.close();
  }

  async chooseFile(name: string): Promise<string> {
    const asset = this.packet.assets.find((a) => a.name === name);
    if (!this.fileChooser) {
      throw new Error("No file picker is open.");
    }
    if (!asset) {
      throw new Error(`You have no file named “${name}”.`);
    }
    await this.fileChooser.setFiles(asset.path);
    this.fileChooser = null;
    return asset.name;
  }

  async close(): Promise<void> {
    // A failed launch leaves no browser; keep its error in runner-error.txt.
    await this.browser?.close().catch(() => undefined);
  }
}

function buildTools(session: BrowserSession, packet: Packet, log: (r: Receipt) => Promise<void>) {
  const coord = {
    x: z.number().int().min(0).max(packet.viewport.width - 1),
    y: z.number().int().min(0).max(packet.viewport.height - 1)
  };
  const action = async (
    describe: string,
    run: (page: Page) => Promise<void>
  ) => {
    const refusal = session.refusal();
    if (refusal) {
      return textResult(refusal);
    }
    const { receipt, data } = await session.act(describe, run);
    await log(receipt);
    return toolResult(receipt, data);
  };

  return [
    tool("screenshot", "Show the current browser viewport. Does not count as an action.", {}, async () => {
      const { receipt, data } = await session.receipt("Current view.");
      await log(receipt);
      return toolResult(receipt, data);
    }),
    tool(
      "click",
      "Click at a viewport coordinate. Use clicks=2 for a double click and button=right for a context menu.",
      {
        ...coord,
        button: z.enum(["left", "right"]).default("left"),
        clicks: z.number().int().min(1).max(2).default(1)
      },
      async ({ x, y, button, clicks }) =>
        action(`${clicks === 2 ? "double-" : ""}${button} click at (${x}, ${y})`, (page) =>
          page.mouse.click(x, y, { button, clickCount: clicks })
        )
    ),
    tool("hover", "Move the pointer to a viewport coordinate.", coord, async ({ x, y }) =>
      action(`pointer moved to (${x}, ${y})`, (page) => page.mouse.move(x, y, { steps: 5 }))
    ),
    tool(
      "drag",
      "Press the left button at one coordinate, move to another, and release.",
      {
        fromX: coord.x,
        fromY: coord.y,
        toX: coord.x,
        toY: coord.y
      },
      async ({ fromX, fromY, toX, toY }) =>
        action(`drag from (${fromX}, ${fromY}) to (${toX}, ${toY})`, async (page) => {
          await page.mouse.move(fromX, fromY);
          await page.mouse.down();
          await page.mouse.move(toX, toY, { steps: 12 });
          await page.mouse.up();
        })
    ),
    tool(
      "scroll",
      "Scroll with the mouse wheel while the pointer is at a coordinate. Positive deltaY scrolls down.",
      {
        ...coord,
        deltaX: z.number().int().min(-3000).max(3000).default(0),
        deltaY: z.number().int().min(-3000).max(3000)
      },
      async ({ x, y, deltaX, deltaY }) =>
        action(`scroll at (${x}, ${y}) by (${deltaX}, ${deltaY})`, async (page) => {
          await page.mouse.move(x, y);
          await page.mouse.wheel(deltaX, deltaY);
        })
    ),
    tool(
      "type",
      "Type text into whatever currently has keyboard focus. Focus a field first by clicking it.",
      { text: z.string().min(1).max(2000) },
      async ({ text }) =>
        action(`typed ${JSON.stringify(text)}`, (page) => page.keyboard.type(text, { delay: 15 }))
    ),
    tool(
      "press",
      "Press a key or key combination, for example Enter, Escape, Tab, Backspace, Meta+A.",
      { key: z.string().min(1).max(40) },
      async ({ key }) => action(`pressed ${key}`, (page) => page.keyboard.press(key))
    ),
    tool(
      "wait",
      `Wait for the page to change, up to ${MAX_WAIT_SECONDS} seconds.`,
      { seconds: z.number().min(1).max(MAX_WAIT_SECONDS) },
      async ({ seconds }) =>
        action(`waited ${seconds} s`, (page) => page.waitForTimeout(seconds * 1000))
    ),
    tool("back", "Press the browser Back button.", {}, async () =>
      action("browser Back", async (page) => {
        await page.goBack({ waitUntil: "load" }).catch(() => undefined);
      })
    ),
    tool("forward", "Press the browser Forward button.", {}, async () =>
      action("browser Forward", async (page) => {
        await page.goForward({ waitUntil: "load" }).catch(() => undefined);
      })
    ),
    tool("reload", "Press the browser Reload button.", {}, async () =>
      action("browser Reload", async (page) => {
        await page.reload({ waitUntil: "load" }).catch(() => undefined);
      })
    ),
    tool(
      "close_tab",
      "Close the active browser tab and return to the tab before it. The receipt says how many tabs are open.",
      {},
      async () =>
        action("closed the tab", async () => {
          await session.closeTab();
        })
    ),
    ...(packet.assets.length > 0
      ? [
          tool(
            "choose_file",
            "Pick one of your files in an open file picker.",
            { name: z.string() },
            async ({ name }) =>
              action(`chose the file ${JSON.stringify(name)}`, async () => {
                await session.chooseFile(name);
              })
          )
        ]
      : [])
  ];
}

async function main(): Promise<void> {
  const cli = parseCli();
  const packet = PacketSchema.parse(JSON.parse(await readFile(cli.packet, "utf8")));
  const outDir = resolve(cli.out);
  await prepareOutDir(outDir);

  const protocol = await readFile(cli.protocol, "utf8");
  const session = new BrowserSession(packet, outDir, cli.headed);
  const tools = buildTools(session, packet, receiptLogger(outDir, () => session.startedAt));
  await runParticipantSession({
    outDir,
    repoRoot: REPO_ROOT,
    protocolPath: cli.protocol,
    protocol,
    systemPrompt: `${protocol.trim()}\n${toolGuide(packet.viewport)}`,
    prompt: renderPacket(packet),
    model: cli.model,
    serverName: SERVER_NAME,
    tools,
    surface: session,
    maxActions: packet.maxActions,
    maxMinutes: packet.maxMinutes,
    contract: {
      sessionId: packet.sessionId,
      kind: packet.kind,
      packet,
      browser: { engine: "chromium", viewport: packet.viewport, deviceScaleFactor: 1, locale: "en-US", freshContext: true }
    },
    summary: () => ({ browserMs: session.browserMs })
  });
}

await main();
