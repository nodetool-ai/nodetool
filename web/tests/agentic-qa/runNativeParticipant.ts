/**
 * Blind participant for a native NodeTool desktop app (the Qt chat, node
 * editor, or timeline), for the `ux-research` skill.
 *
 * The desktop counterpart of `runParticipant.ts`. It shares that runner's
 * session boundary (`participantLoop.ts`): one fresh Claude session whose only
 * inputs are the participant protocol, one task packet, and screenshots, and
 * whose only tools are pointer and keyboard actions. The surface is a
 * disposable X display with a window manager and the app under test
 * (`desktopSession.ts`), started in a fresh home directory so the app is in
 * its first-run state.
 *
 * Usage (from web/):
 *   npx tsx tests/agentic-qa/runNativeParticipant.ts --packet <packet.json> --out <run-dir/session>
 *     [--model sonnet] [--protocol <participant.md>]
 *
 * The default protocol is the `ux-research` desktop think-aloud protocol.
 * See .agents/skills/ux-research/references/native-apps.md for the packet.
 */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { DesktopSession, type AppLaunch } from "./desktopSession";
import { NATIVE_APP_IDS, resolveNativeApp } from "./nativeApps";
import {
  prepareOutDir,
  receiptLogger,
  runParticipantSession,
  textResult,
  toolResult,
  type ParticipantTool,
  type Receipt
} from "./participantLoop";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(CURRENT_DIR, "../../..");
const DEFAULT_PROTOCOL_PATH = join(
  REPO_ROOT,
  ".agents/skills/ux-research/references/participant-desktop.md"
);

const DEFAULT_SCREEN = { width: 1440, height: 900 } as const;
const SERVER_NAME = "desktop";
const MAX_WAIT_SECONDS = 10;

const AppSchema = z.union([
  z.object({
    /** A native app from `nativeApps.ts`, started against `server`. */
    preset: z.enum(NATIVE_APP_IDS),
    server: z.string().url(),
    /** A workflow or timeline id the app opens at start. */
    document: z.string().optional(),
    /** Another build of the preset, such as a sanitizer build. */
    binary: z.string().optional(),
    /** Added to the preset's environment, such as `LD_LIBRARY_PATH` for a Qt outside the system paths. */
    env: z.record(z.string(), z.string()).default({})
  }),
  z.object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({})
  })
]);

const PacketSchema = z.object({
  sessionId: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["discovery", "task", "continuation"]),
  app: AppSchema,
  persona: z.string().min(1),
  goal: z.string().min(1),
  maxActions: z.number().int().positive(),
  maxMinutes: z.number().positive(),
  permittedActions: z.string().min(1),
  /** Ordinary user-owned files, copied into the Documents folder. The participant sees only the names. */
  assets: z.array(z.object({ name: z.string(), path: z.string() })).default([]),
  /** Keys the persona owns and may paste when the app asks. Never a real credential. */
  credentials: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  /** Screen pixels. A laptop screen such as 1280 × 720 shows layout faults. */
  screen: z
    .object({
      width: z.number().int().min(640),
      height: z.number().int().min(480)
    })
    .default(DEFAULT_SCREEN),
  /** `maximized` fills the screen with the app's first window. */
  window: z.enum(["maximized", "as-opened"]).default("maximized")
});
type Packet = z.infer<typeof PacketSchema>;

function renderPacket(packet: Packet): string {
  const assets =
    packet.assets.length > 0 ? packet.assets.map((a) => `- ${a.name}`).join("\n") : "None.";
  return [
    "# Task packet",
    "",
    "The app is already open on this computer's screen.",
    `Persona: ${packet.persona}`,
    `Goal: ${packet.goal}`,
    `Permitted actions: ${packet.permittedActions}`,
    `Limits: at most ${packet.maxActions} actions and ${packet.maxMinutes} minutes.`,
    "",
    "Files you own, in the Documents folder of your home folder, which you may open when the app asks for a file:",
    assets,
    "",
    ...(packet.credentials.length > 0
      ? [
          "Keys you own and may paste when the app asks for one:",
          ...packet.credentials.map((c) => `- ${c.label}: ${c.value}`),
          ""
        ]
      : []),
    "Call `screenshot` to see the screen.",
    "When you stop, write your final account as described in the protocol."
  ].join("\n");
}

const toolGuide = (screen: Packet["screen"]): string => `
## Desktop tools

You see the computer only through screenshots of the whole screen, ${screen.width} × ${screen.height}
pixels. Coordinates are pixels from the top-left corner of the screenshot.
Every action tool performs one action and returns a receipt with the new
screenshot, its ID, the active window's title, and the open windows.
\`screenshot\` does not count as an action. You have no other tools.

The computer runs Linux with a plain desktop: windows have a title bar with
maximize and close buttons, there is no taskbar or start menu, Alt+Tab
switches windows, and Alt+F4 closes the active window. Editing shortcuts such
as select all use Control. If the app closes, \`open_app\` opens it again, as
from a dock.
`;

function parseCli(): { packet: string; out: string; model: string; protocol: string } {
  const { values } = parseArgs({
    options: {
      packet: { type: "string" },
      out: { type: "string" },
      model: { type: "string", default: "sonnet" },
      protocol: { type: "string" }
    }
  });
  if (!values.packet || !values.out) {
    throw new Error(
      "Usage: runNativeParticipant.ts --packet <packet.json> --out <dir> [--model sonnet] [--protocol <participant.md>]"
    );
  }
  return {
    packet: values.packet,
    out: values.out,
    model: values.model ?? "sonnet",
    protocol: values.protocol ? resolve(values.protocol) : DEFAULT_PROTOCOL_PATH
  };
}

async function resolveLaunch(app: Packet["app"]): Promise<AppLaunch> {
  if ("preset" in app) {
    const launch = await resolveNativeApp(REPO_ROOT, app.preset, app);
    return { ...launch, env: { ...launch.env, ...app.env } };
  }
  return { command: app.command, args: app.args, env: app.env };
}

function buildDesktopTools(
  session: DesktopSession,
  packet: Packet,
  log: (r: Receipt) => Promise<void>
): ParticipantTool[] {
  const coord = {
    x: z.number().int().min(0).max(packet.screen.width - 1),
    y: z.number().int().min(0).max(packet.screen.height - 1)
  };
  const action = async (describe: string, perform: () => Promise<void>) => {
    const refusal = session.refusal();
    if (refusal) {
      return textResult(refusal);
    }
    const { receipt, data } = await session.act(describe, perform);
    await log(receipt);
    return toolResult(receipt, data);
  };

  return [
    tool("screenshot", "Show the current screen. Does not count as an action.", {}, async () => {
      const { receipt, data } = await session.receipt("Current view.");
      await log(receipt);
      return toolResult(receipt, data);
    }),
    tool(
      "click",
      "Click at a screen coordinate. Use clicks=2 for a double click and button=right for a context menu.",
      {
        ...coord,
        button: z.enum(["left", "middle", "right"]).default("left"),
        clicks: z.number().int().min(1).max(3).default(1)
      },
      async ({ x, y, button, clicks }) =>
        action(
          `${clicks === 2 ? "double-" : clicks === 3 ? "triple-" : ""}${button} click at (${x}, ${y})`,
          () => session.click(x, y, button, clicks)
        )
    ),
    tool("hover", "Move the pointer to a screen coordinate.", coord, async ({ x, y }) =>
      action(`pointer moved to (${x}, ${y})`, () => session.hover(x, y))
    ),
    tool(
      "drag",
      "Press the left button at one coordinate, move to another, and release.",
      { fromX: coord.x, fromY: coord.y, toX: coord.x, toY: coord.y },
      async ({ fromX, fromY, toX, toY }) =>
        action(`drag from (${fromX}, ${fromY}) to (${toX}, ${toY})`, () =>
          session.drag(fromX, fromY, toX, toY)
        )
    ),
    tool(
      "scroll",
      "Turn the mouse wheel while the pointer is at a coordinate. Positive deltaY scrolls down; 100 is one wheel notch.",
      {
        ...coord,
        deltaX: z.number().int().min(-3000).max(3000).default(0),
        deltaY: z.number().int().min(-3000).max(3000)
      },
      async ({ x, y, deltaX, deltaY }) =>
        action(`scroll at (${x}, ${y}) by (${deltaX}, ${deltaY})`, () =>
          session.scroll(x, y, deltaX, deltaY)
        )
    ),
    tool(
      "type",
      "Type text into whatever currently has keyboard focus. Focus a field first by clicking it.",
      { text: z.string().min(1).max(2000) },
      async ({ text }) => action(`typed ${JSON.stringify(text)}`, () => session.type(text))
    ),
    tool(
      "press",
      "Press a key or key combination, for example Enter, Escape, Tab, Backspace, Control+A, Alt+Tab.",
      { key: z.string().min(1).max(40) },
      async ({ key }) => action(`pressed ${key}`, () => session.press(key))
    ),
    tool(
      "wait",
      `Wait for the screen to change, up to ${MAX_WAIT_SECONDS} seconds.`,
      { seconds: z.number().min(1).max(MAX_WAIT_SECONDS) },
      async ({ seconds }) =>
        action(`waited ${seconds} s`, () => new Promise((r) => setTimeout(r, seconds * 1000)))
    ),
    tool(
      "open_app",
      "Open the app again after it closed, as from a dock. Does nothing while it is open.",
      {},
      async () => action("opened the app", () => session.openApp())
    )
  ];
}

async function main(): Promise<void> {
  const cli = parseCli();
  const packet = PacketSchema.parse(JSON.parse(await readFile(cli.packet, "utf8")));
  const outDir = resolve(cli.out);
  await prepareOutDir(outDir);
  const launch = await resolveLaunch(packet.app);

  const protocol = await readFile(cli.protocol, "utf8");
  const session = new DesktopSession({
    screen: packet.screen,
    window: packet.window,
    launch,
    assets: packet.assets,
    outDir
  });
  session.maxActions = packet.maxActions;
  const tools = buildDesktopTools(session, packet, receiptLogger(outDir, () => session.startedAt));
  await runParticipantSession({
    outDir,
    repoRoot: REPO_ROOT,
    protocolPath: cli.protocol,
    protocol,
    systemPrompt: `${protocol.trim()}\n${toolGuide(packet.screen)}`,
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
      desktop: {
        display: "Xvfb",
        windowManager: "openbox",
        screen: packet.screen,
        window: packet.window,
        freshHome: true,
        app: { command: launch.command, args: launch.args, env: launch.env }
      }
    },
    summary: () => ({ desktopMs: session.surfaceMs })
  });
}

await main();
