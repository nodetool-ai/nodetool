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
 *     [--model sonnet] [--headed]
 *
 * See .agents/skills/agentic-qa/references/runtime.md for the packet format.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  createSdkMcpServer,
  query,
  tool,
  type SDKMessage
} from "@anthropic-ai/claude-agent-sdk";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type FileChooser,
  type Page
} from "@playwright/test";
import { z } from "zod";
import { isolatedSessionOptions } from "./isolatedSession";
import { installOriginGuard } from "./originGuard";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(CURRENT_DIR, "../../..");
const PROTOCOL_PATH = join(
  REPO_ROOT,
  ".agents/skills/agentic-qa/references/participant.md"
);

const VIEWPORT = { width: 1440, height: 900 } as const;
const SERVER_NAME = "browser";
const SETTLE_MS = 700;
const MAX_WAIT_SECONDS = 10;
/** Time after the soft limit for the participant to write its report. */
const REPORT_GRACE_MS = 3 * 60_000;

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
    .default([])
});
type Packet = z.infer<typeof PacketSchema>;

type Outcome =
  | "FINISHED"
  | "ACTION_LIMIT"
  | "TIME_LIMIT"
  | "BLOCKED_ENVIRONMENT"
  | "RUNNER_ERROR";

interface Receipt {
  step: number;
  screenshot: string;
  text: string;
}

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

const TOOL_GUIDE = `
## Browser tools

You see the browser only through viewport screenshots of ${VIEWPORT.width} × ${VIEWPORT.height}
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
} {
  const { values } = parseArgs({
    options: {
      packet: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: "sonnet" },
      headed: { type: "boolean", default: false }
    }
  });
  if (!values.packet || !values.out) {
    throw new Error(
      "Usage: runParticipant.ts --packet <packet.json> --out <dir> [--model sonnet] [--headed]"
    );
  }
  return {
    packet: values.packet,
    out: values.out,
    model: values.model ?? "sonnet",
    headed: values.headed ?? false
  };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Redact inline image data so transcripts stay small and text-only. */
function stripImages(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripImages);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "image") {
      return { type: "image", data: "<omitted>" };
    }
    return Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, stripImages(v)])
    );
  }
  return value;
}

class BrowserSession {
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
    private readonly outDir: string
  ) {}

  async start(headed: boolean): Promise<void> {
    const browser = await chromium.launch({
      headless: !headed,
      ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {})
    });
    this.browser = browser;
    this.context = await browser.newContext({
      viewport: VIEWPORT,
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

function toolResult(receipt: Receipt, data: string) {
  return {
    content: [
      { type: "text" as const, text: receipt.text },
      { type: "image" as const, data, mimeType: "image/png" }
    ]
  };
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function buildTools(session: BrowserSession, packet: Packet, log: (r: Receipt) => Promise<void>) {
  const coord = {
    x: z.number().int().min(0).max(VIEWPORT.width - 1),
    y: z.number().int().min(0).max(VIEWPORT.height - 1)
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
  await mkdir(join(outDir, "screenshots"), { recursive: true });
  await mkdir(join(outDir, "private"), { recursive: true });

  const protocol = await readFile(PROTOCOL_PATH, "utf8");
  const systemPrompt = `${protocol.trim()}\n${TOOL_GUIDE}`;
  const prompt = renderPacket(packet);

  const session = new BrowserSession(packet, outDir);
  const stepsPath = join(outDir, "steps.jsonl");
  const transcriptPath = join(outDir, "transcript.jsonl");
  /** The participant's own step notes, verbatim and in order. */
  const logPath = join(outDir, "participant-log.md");
  const logReceipt = async (r: Receipt) =>
    appendFile(stepsPath, `${JSON.stringify({ ...r, t: Date.now() - session.startedAt })}\n`);

  const tools = buildTools(session, packet, logReceipt);
  const toolNames = tools.map((t) => `mcp__${SERVER_NAME}__${t.name}`);
  const abortController = new AbortController();
  const { options, accountContext } = await isolatedSessionOptions({
    systemPrompt,
    model: cli.model,
    maxTurns: packet.maxActions * 2 + 20,
    allowedTools: toolNames,
    mcpServers: {
      [SERVER_NAME]: createSdkMcpServer({ name: SERVER_NAME, version: "1.0.0", tools })
    },
    abortController
  });

  const contract = {
    sessionId: packet.sessionId,
    kind: packet.kind,
    packet,
    renderedPrompt: prompt,
    protocol: {
      path: basename(PROTOCOL_PATH),
      sha256: createHash("sha256").update(protocol).digest("hex")
    },
    systemPromptSha256: createHash("sha256").update(systemPrompt).digest("hex"),
    browser: { engine: "chromium", viewport: VIEWPORT, deviceScaleFactor: 1, locale: "en-US", freshContext: true },
    model: cli.model,
    toolAllowlist: toolNames,
    accountContext,
    sdkOptions: {
      ...options,
      systemPrompt: "<participant protocol + tool guide>",
      mcpServers: Object.keys(options.mcpServers ?? {}),
      env: "<process env minus nested-session vars>",
      settings: options.settings,
      abortController: undefined
    },
    startedAt: new Date().toISOString()
  };
  await writeFile(join(outDir, "contract.json"), JSON.stringify(contract, null, 2));

  let outcome: Outcome = "FINISHED";
  let finalText = "";
  let costUsd: number | null = null;
  let initAudit: object | null = null;

  const softTimer = setTimeout(() => {
    session.softLimitReached = true;
  }, packet.maxMinutes * 60_000);
  const hardTimer = setTimeout(() => {
    outcome = "TIME_LIMIT";
    abortController.abort();
  }, packet.maxMinutes * 60_000 + REPORT_GRACE_MS);

  try {
    await session.start(cli.headed);
    for await (const msg of query({ prompt, options }) as AsyncIterable<SDKMessage>) {
      await appendFile(transcriptPath, `${JSON.stringify(stripImages(msg))}\n`);
      if (msg.type === "system" && msg.subtype === "init") {
        const extraTools = msg.tools.filter((t) => !toolNames.includes(t));
        const extraServers = msg.mcp_servers.filter((s) => s.name !== SERVER_NAME);
        initAudit = {
          tools: msg.tools,
          mcpServers: msg.mcp_servers,
          skills: msg.skills,
          plugins: msg.plugins,
          agents: msg.agents ?? [],
          model: msg.model,
          cwd: msg.cwd,
          claudeCodeVersion: msg.claude_code_version,
          extraTools,
          extraServers
        };
        // The init lists skills, plugins and agents the CLI discovered, not
        // ones the model can reach: `skills: []` hides the listing and the
        // Skill and Agent tools are absent. The tool set is the boundary.
        const browserServer = msg.mcp_servers.find((s) => s.name === SERVER_NAME);
        const missingTools = toolNames.filter((t) => !msg.tools.includes(t));
        if (
          extraTools.length > 0 ||
          missingTools.length > 0 ||
          extraServers.length > 0 ||
          browserServer?.status !== "connected"
        ) {
          outcome = "BLOCKED_ENVIRONMENT";
          abortController.abort();
          break;
        }
      }
      if (msg.type === "assistant") {
        const notes = msg.message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        if (notes.trim()) {
          await appendFile(logPath, `${notes.trim()}\n\n`);
        }
      }
      if (msg.type === "result") {
        costUsd = msg.total_cost_usd;
        if (msg.subtype === "success") {
          finalText = msg.result;
        } else if (outcome === "FINISHED") {
          outcome = "RUNNER_ERROR";
        }
      }
    }
  } catch (err) {
    if (outcome === "FINISHED") {
      outcome = "RUNNER_ERROR";
    }
    await writeFile(
      join(outDir, "private", "runner-error.txt"),
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    );
  } finally {
    clearTimeout(softTimer);
    clearTimeout(hardTimer);
    await session.close();
  }

  if (outcome === "FINISHED" && session.actions >= packet.maxActions) {
    outcome = "ACTION_LIMIT";
  }
  if (outcome === "FINISHED" && session.softLimitReached) {
    outcome = "TIME_LIMIT";
  }
  const elapsedMs = Date.now() - session.startedAt;
  const summary = {
    sessionId: packet.sessionId,
    outcome,
    validity: outcome === "BLOCKED_ENVIRONMENT" ? "unverified" : "boundary-audited",
    accountContext,
    actions: session.actions,
    elapsedMs,
    browserMs: session.browserMs,
    overheadMs: elapsedMs - session.browserMs,
    agentCostUsd: costUsd,
    initAudit
  };
  await writeFile(join(outDir, "participant-report.md"), finalText || "(no final account)\n");
  await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (outcome === "BLOCKED_ENVIRONMENT" || outcome === "RUNNER_ERROR") {
    process.exitCode = 1;
  }
}

await main();
