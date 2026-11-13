/**
 * A disposable Linux desktop for a blind native-app participant.
 *
 * One session owns one Xvfb display, one Openbox window manager, one fresh
 * home directory, and the app process under test. The participant sees only
 * screenshots of the whole screen and acts only through pointer and keyboard
 * input sent with XTest (`xdotool`). Nothing reads the app's widget tree,
 * accessibility tree, or logs on the participant's behalf. The app's output
 * goes to `private/app.log`.
 *
 * The app cannot start other programs on the desktop through the usual
 * openers: `xdg-open`, `BROWSER`, and the desktop-specific openers resolve to a
 * stub that records the request. The participant is told that a web page or
 * file did not open, as the browser runner reports a blocked navigation, so a
 * session cannot leave the app for a web browser.
 *
 * Host tools: `Xvfb`, `openbox`, `xdotool`, `wmctrl`, and ImageMagick
 * (`import`, `convert`, `display`). `checkDesktopTools` names any that are missing.
 */

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { ParticipantSurface, Receipt } from "./participantLoop";

const run = promisify(execFile);

export const DESKTOP_TOOLS = ["Xvfb", "openbox", "xdotool", "wmctrl", "import", "convert", "display"] as const;

/** Pause after an action before the settle check starts. */
const SETTLE_MS = 400;
/** Interval between frames compared by the settle check. */
const SETTLE_POLL_MS = 300;
/** The settle check gives up after this long, for an animated screen. */
const SETTLE_MAX_MS = 2_500;
/** How long the app has to show its first window. */
const FIRST_WINDOW_TIMEOUT_MS = 60_000;

export interface AppLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface DesktopOptions {
  screen: { width: number; height: number };
  /** `maximized` fills the screen with the app's first window, as a person would. */
  window: "maximized" | "as-opened";
  launch: AppLaunch;
  /** Copied into the participant's Documents folder before the app starts. */
  assets: { name: string; path: string }[];
  outDir: string;
}

/**
 * Openbox without a root menu, a taskbar, or a minimize button: with no
 * taskbar a minimized window could not come back. Alt+F4 closes a window and
 * Alt+Tab switches between windows, as on most Linux desktops.
 */
const OPENBOX_RC = `<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <focus><focusNew>yes</focusNew><followMouse>no</followMouse></focus>
  <placement><policy>Smart</policy><center>yes</center></placement>
  <theme><name>Clearlooks</name><titleLayout>NLMC</titleLayout><keepBorder>yes</keepBorder></theme>
  <desktops><number>1</number></desktops>
  <keyboard>
    <keybind key="A-F4"><action name="Close"/></keybind>
    <keybind key="A-Tab"><action name="NextWindow"><finalactions><action name="Focus"/><action name="Raise"/></finalactions></action></keybind>
  </keyboard>
  <mouse>
    <dragThreshold>3</dragThreshold>
    <doubleClickTime>500</doubleClickTime>
    <context name="Titlebar">
      <mousebind button="Left" action="Press"><action name="Focus"/><action name="Raise"/></mousebind>
      <mousebind button="Left" action="Drag"><action name="Move"/></mousebind>
      <mousebind button="Left" action="DoubleClick"><action name="ToggleMaximize"/></mousebind>
    </context>
    <context name="Client">
      <mousebind button="Left" action="Press"><action name="Focus"/><action name="Raise"/></mousebind>
      <mousebind button="Middle" action="Press"><action name="Focus"/><action name="Raise"/></mousebind>
      <mousebind button="Right" action="Press"><action name="Focus"/><action name="Raise"/></mousebind>
    </context>
    <context name="Close"><mousebind button="Left" action="Click"><action name="Close"/></mousebind></context>
    <context name="Maximize"><mousebind button="Left" action="Click"><action name="ToggleMaximize"/></mousebind></context>
    <context name="Top"><mousebind button="Left" action="Drag"><action name="Resize"><edge>top</edge></action></mousebind></context>
    <context name="Bottom"><mousebind button="Left" action="Drag"><action name="Resize"><edge>bottom</edge></action></mousebind></context>
    <context name="Left"><mousebind button="Left" action="Drag"><action name="Resize"><edge>left</edge></action></mousebind></context>
    <context name="Right"><mousebind button="Left" action="Drag"><action name="Resize"><edge>right</edge></action></mousebind></context>
    <context name="BLCorner"><mousebind button="Left" action="Drag"><action name="Resize"/></mousebind></context>
    <context name="BRCorner"><mousebind button="Left" action="Drag"><action name="Resize"/></mousebind></context>
    <context name="TLCorner"><mousebind button="Left" action="Drag"><action name="Resize"/></mousebind></context>
    <context name="TRCorner"><mousebind button="Left" action="Drag"><action name="Resize"/></mousebind></context>
  </mouse>
</openbox_config>
`;

const MODIFIERS: Record<string, string> = {
  control: "ctrl",
  ctrl: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  meta: "super",
  cmd: "super",
  command: "super",
  super: "super"
};

const NAMED_KEYS: Record<string, string> = {
  enter: "Return",
  return: "Return",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  backspace: "BackSpace",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  space: "space",
  " ": "space",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "Page_Up",
  pagedown: "Page_Down",
  "+": "plus",
  "-": "minus",
  "=": "equal",
  "/": "slash",
  "\\": "backslash",
  ".": "period",
  ",": "comma",
  ";": "semicolon",
  "'": "apostrophe",
  "`": "grave",
  "[": "bracketleft",
  "]": "bracketright"
};

/**
 * Translate a key in the browser runner's spelling (`Enter`, `Control+A`,
 * `Meta+Shift+Z`) into an xdotool key sequence (`Return`, `ctrl+a`).
 */
export function toXdotoolKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new Error("No key was given.");
  }
  // A trailing "+" names the plus key itself, as in "Control++".
  const parts = trimmed.endsWith("++")
    ? [...trimmed.slice(0, -2).split("+"), "+"]
    : trimmed === "+"
      ? ["+"]
      : trimmed.split("+");
  const last = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => {
    const mapped = MODIFIERS[m.toLowerCase()];
    if (!mapped) {
      throw new Error(`“${m}” is not a modifier key.`);
    }
    return mapped;
  });
  const lower = last.toLowerCase();
  let name: string;
  if (NAMED_KEYS[lower]) {
    name = NAMED_KEYS[lower];
  } else if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) {
    name = lower.toUpperCase();
  } else if (last.length === 1) {
    // With a modifier, Control+A means the A key, not Shift+A.
    name = mods.length > 0 ? lower : last;
  } else if (MODIFIERS[lower]) {
    name = { ctrl: "Control_L", shift: "Shift_L", alt: "Alt_L", super: "Super_L" }[MODIFIERS[lower]]!;
  } else {
    throw new Error(`“${last}” is not a key this desktop knows.`);
  }
  return [...mods, name].join("+");
}

/** Wheel notches for a scroll delta in the browser runner's pixel units. */
export function wheelNotches(delta: number): number {
  if (delta === 0) {
    return 0;
  }
  return Math.max(1, Math.round(Math.abs(delta) / 100));
}

export async function checkDesktopTools(): Promise<string[]> {
  const missing: string[] = [];
  for (const name of DESKTOP_TOOLS) {
    try {
      await run("sh", ["-c", `command -v ${name}`]);
    } catch {
      missing.push(name);
    }
  }
  return missing;
}

/** Fields of one `private/desktop.jsonl` line besides its time and kind. */
type PrivateLogFields = Record<string, string | number | null | string[]>;

interface WindowInfo {
  id: string;
  title: string;
}

/** Openers a Qt or GLib app tries before it falls back to a browser on `PATH`. */
const OPENER_NAMES = ["xdg-open", "gio", "gvfs-open", "kde-open", "kde-open5", "kfmclient", "exo-open", "sensible-browser", "x-www-browser", "www-browser", "firefox", "chromium", "chromium-browser", "google-chrome"];

const OPENER_STUB = `#!/bin/sh
# Records what the app under study asked the desktop to open. Nothing opens.
for arg in "$@"; do last="$arg"; done
printf '%s\n' "$last" >> "$NATIVE_PARTICIPANT_OPEN_LOG"
exit 0
`;

/** What a person would notice when the app asks the desktop to open something. */
export function describeOpenRequest(target: string): string {
  let url: URL | null = null;
  try {
    url = new URL(target);
  } catch {
    url = null;
  }
  if (url && (url.protocol === "http:" || url.protocol === "https:")) {
    return `The app tried to open a web page (${url.origin}) in a web browser. Web pages are outside this study, so it did not open.`;
  }
  const name = basename(url?.protocol === "file:" ? decodeURIComponent(url.pathname) : target);
  return `The app tried to open “${name || target}” in another program. Other programs are outside this study, so it did not open.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DesktopSession implements ParticipantSurface {
  readonly startedAt = Date.now();
  actions = 0;
  surfaceMs = 0;
  softLimitReached = false;
  maxActions = Number.POSITIVE_INFINITY;

  private display = "";
  private home = "";
  private xvfb: ChildProcess | undefined;
  private wm: ChildProcess | undefined;
  private app: ChildProcess | undefined;
  private appRunning = false;
  private shotCount = 0;
  private pendingEvents: string[] = [];
  private knownWindows: WindowInfo[] = [];
  private openerDir = "";
  private openLog = "";
  private openLogRead = 0;

  constructor(private readonly opts: DesktopOptions) {}

  /** The participant's home folder, for the contract. */
  get homeDir(): string {
    return this.home;
  }

  get displayName(): string {
    return this.display;
  }

  private env(): NodeJS.ProcessEnv {
    return { ...process.env, DISPLAY: this.display };
  }

  private async x(args: string[]): Promise<string> {
    const { stdout } = await run("xdotool", args, { env: this.env() });
    return stdout;
  }

  async privateLog(kind: string, data: PrivateLogFields): Promise<void> {
    await appendFile(
      join(this.opts.outDir, "private", "desktop.jsonl"),
      `${JSON.stringify({ t: Date.now() - this.startedAt, kind, ...data })}\n`
    );
  }

  async start(): Promise<void> {
    const missing = await checkDesktopTools();
    if (missing.length > 0) {
      throw new Error(
        `Missing desktop tools: ${missing.join(", ")}. On Debian or Ubuntu: apt-get install xvfb openbox xdotool wmctrl imagemagick libxcb-cursor0`
      );
    }
    await this.startDisplay();
    await this.prepareHome();
    await this.paintDesktop();
    const rc = join(this.home, ".config", "openbox", "rc.xml");
    await mkdir(join(this.home, ".config", "openbox"), { recursive: true });
    await writeFile(rc, OPENBOX_RC);
    this.wm = spawn("openbox", ["--config-file", rc], {
      env: { ...this.env(), HOME: this.home },
      stdio: "ignore"
    });
    await this.waitFor(async () => {
      const { stdout } = await run("wmctrl", ["-m"], { env: this.env() });
      return stdout.includes("Openbox");
    }, 10_000, "The window manager did not start.");
    await this.launchApp();
    await this.settle();
    this.knownWindows = await this.windows();
  }

  private async startDisplay(): Promise<void> {
    const { width, height } = this.opts.screen;
    const xvfb = spawn(
      "Xvfb",
      ["-displayfd", "3", "-screen", "0", `${width}x${height}x24`, "-nolisten", "tcp", "-noreset"],
      { stdio: ["ignore", "ignore", "pipe", "pipe"] }
    );
    this.xvfb = xvfb;
    const fd = xvfb.stdio[3];
    if (!fd) {
      throw new Error("Xvfb has no display pipe.");
    }
    this.display = await new Promise<string>((resolve, reject) => {
      let buffered = "";
      const timer = setTimeout(() => reject(new Error("Xvfb did not report a display.")), 10_000);
      fd.on("data", (chunk: Buffer) => {
        buffered += chunk.toString();
        const match = buffered.match(/(\d+)\s/);
        if (match) {
          clearTimeout(timer);
          resolve(`:${match[1]}`);
        }
      });
      xvfb.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Xvfb exited with ${code}.`));
      });
    });
    await this.privateLog("display", { display: this.display, ...this.opts.screen });
  }

  /** A plain grey desktop, so a screen with no window reads as a desktop, not a blank capture. */
  private async paintDesktop(): Promise<void> {
    const { width, height } = this.opts.screen;
    const backdrop = join(this.home, ".cache", "desktop.png");
    await run("convert", ["-size", `${width}x${height}`, "xc:#4c566a", backdrop]);
    // `display -window root` sets the background and then exits with status 1.
    await run("display", ["-window", "root", backdrop], { env: this.env() }).catch(() => undefined);
  }

  /** A first-run home: empty settings and caches, the packet's files in Documents. */
  private async prepareHome(): Promise<void> {
    this.home = await mkdtemp(join(tmpdir(), "native-participant-home-"));
    for (const dir of ["Documents", "Desktop", "Downloads", ".config", ".cache", ".local/share"]) {
      await mkdir(join(this.home, dir), { recursive: true });
    }
    for (const asset of this.opts.assets) {
      await copyFile(asset.path, join(this.home, "Documents", basename(asset.name)));
    }
    this.openerDir = await mkdtemp(join(tmpdir(), "native-participant-openers-"));
    this.openLog = join(this.openerDir, "requests.log");
    await writeFile(this.openLog, "");
    for (const name of OPENER_NAMES) {
      await writeFile(join(this.openerDir, name), OPENER_STUB, { mode: 0o755 });
    }
  }

  /** Open requests since the last receipt, for the participant and the private log. */
  private async openRequests(): Promise<string[]> {
    const all = await readFile(this.openLog, "utf8").catch(() => "");
    const fresh = all.slice(this.openLogRead).split("\n").filter(Boolean);
    this.openLogRead = all.length;
    for (const target of fresh) {
      await this.privateLog("open-request", { target });
    }
    return fresh.map(describeOpenRequest);
  }

  private appEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DISPLAY: this.display,
      HOME: this.home,
      XDG_CONFIG_HOME: join(this.home, ".config"),
      XDG_CACHE_HOME: join(this.home, ".cache"),
      XDG_DATA_HOME: join(this.home, ".local/share"),
      LC_ALL: "C.UTF-8",
      QT_QPA_PLATFORM: "xcb",
      PATH: `${this.openerDir}:${process.env.PATH ?? ""}`,
      BROWSER: join(this.openerDir, "xdg-open"),
      NATIVE_PARTICIPANT_OPEN_LOG: this.openLog,
      ...this.opts.launch.env
    };
    // The host's own session must not reach the app: its runtime directory,
    // its desktop's openers, its server token, or a Wayland display that Qt
    // would prefer.
    for (const key of ["XDG_RUNTIME_DIR", "XDG_CURRENT_DESKTOP", "DESKTOP_SESSION", "WAYLAND_DISPLAY", "NODETOOL_TOKEN", "NODETOOL_API_TOKEN"]) {
      if (!(key in this.opts.launch.env)) {
        delete env[key];
      }
    }
    return env;
  }

  private async launchApp(): Promise<void> {
    const before = new Set((await this.windows()).map((w) => w.id));
    const logPath = join(this.opts.outDir, "private", "app.log");
    const { command, args } = this.opts.launch;
    const app = spawn(command, args, { env: this.appEnv(), stdio: ["ignore", "pipe", "pipe"] });
    this.app = app;
    this.appRunning = true;
    app.stdout?.on("data", (chunk: Buffer) => void appendFile(logPath, chunk));
    app.stderr?.on("data", (chunk: Buffer) => void appendFile(logPath, chunk));
    app.on("error", (err) => {
      this.appRunning = false;
      void this.privateLog("app-error", { message: err.message });
    });
    app.on("exit", (code, signal) => {
      if (this.app !== app) {
        return;
      }
      this.appRunning = false;
      this.pendingEvents.push("The app closed.");
      void this.privateLog("app-exit", { code, signal });
    });
    await this.privateLog("app-launch", { command, args });
    const first = await this.waitFor(async () => {
      if (!this.appRunning) {
        throw new Error("The app exited before it showed a window. See private/app.log.");
      }
      const fresh = (await this.windows()).filter((w) => !before.has(w.id));
      return fresh[0] ?? null;
    }, FIRST_WINDOW_TIMEOUT_MS, "The app showed no window.");
    if (this.opts.window === "maximized") {
      await run("wmctrl", ["-i", "-r", first.id, "-b", "add,maximized_vert,maximized_horz"], {
        env: this.env()
      });
    }
    await run("wmctrl", ["-i", "-a", first.id], { env: this.env() }).catch(() => undefined);
  }

  private async waitFor<T>(
    probe: () => Promise<T | null | false>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const value = await probe();
        if (value) {
          return value;
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("The app exited")) {
          throw err;
        }
      }
      if (Date.now() > deadline) {
        throw new Error(message);
      }
      await sleep(250);
    }
  }

  /** Managed top-level windows in stacking order, as a window switcher lists them. */
  private async windows(): Promise<WindowInfo[]> {
    try {
      const { stdout } = await run("wmctrl", ["-l"], { env: this.env() });
      return stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [id, , , ...title] = line.split(/\s+/);
          return { id, title: title.join(" ") };
        });
    } catch {
      return [];
    }
  }

  private async activeTitle(): Promise<string> {
    try {
      return (await this.x(["getactivewindow", "getwindowname"])).trim();
    } catch {
      return "";
    }
  }

  private async grab(): Promise<Buffer> {
    const { stdout } = await run("import", ["-silent", "-window", "root", "png:-"], {
      env: this.env(),
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024
    });
    return stdout as unknown as Buffer;
  }

  /** Wait until two frames in a row are identical, as a person waits for a screen to stop moving. */
  private async settle(): Promise<void> {
    await sleep(SETTLE_MS);
    const deadline = Date.now() + SETTLE_MAX_MS;
    let last = "";
    while (Date.now() < deadline) {
      const hash = createHash("sha1").update(await this.grab()).digest("hex");
      if (hash === last) {
        return;
      }
      last = hash;
      await sleep(SETTLE_POLL_MS);
    }
  }

  /** Capture the whole screen. */
  async capture(): Promise<{ id: string; data: string }> {
    this.shotCount += 1;
    const id = `S${String(this.shotCount).padStart(3, "0")}`;
    const buffer = await this.grab();
    await writeFile(join(this.opts.outDir, "screenshots", `${id}.png`), buffer);
    return { id, data: buffer.toString("base64") };
  }

  /** Visible window changes since the last receipt. */
  private async windowEvents(): Promise<{ events: string[]; windows: WindowInfo[] }> {
    const now = await this.windows();
    const before = new Map(this.knownWindows.map((w) => [w.id, w.title]));
    const after = new Set(now.map((w) => w.id));
    const events: string[] = [];
    for (const w of now) {
      if (!before.has(w.id)) {
        events.push(`A new window opened: “${w.title || "(untitled)"}”.`);
      }
    }
    for (const [id, title] of before) {
      if (!after.has(id)) {
        events.push(`A window closed: “${title || "(untitled)"}”.`);
      }
    }
    this.knownWindows = now;
    return { events, windows: now };
  }

  async receipt(summary: string): Promise<{ receipt: Receipt; data: string }> {
    const shot = await this.capture();
    const { events: windowEvents, windows } = await this.windowEvents();
    const active = await this.activeTitle();
    const events = [...windowEvents, ...(await this.openRequests()), ...this.pendingEvents.splice(0)];
    const lines = [
      summary,
      `Screenshot: ${shot.id}`,
      `Active window: ${active || "(none)"}`,
      `Open windows: ${windows.length}${windows.length > 0 ? ` (${windows.map((w) => `“${w.title || "untitled"}”`).join(", ")})` : ""}`,
      ...events
    ];
    if (!this.appRunning) {
      lines.push("The app is not running. `open_app` opens it again.");
    }
    lines.push(`Actions used: ${this.actions} of ${this.maxActions}.`);
    if (this.actions >= this.maxActions) {
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

  refusal(): string | null {
    if (this.softLimitReached) {
      return "Time limit reached. No action was performed. Write your final account now.";
    }
    if (this.actions >= this.maxActions) {
      return "Action limit reached. No action was performed. Write your final account now.";
    }
    return null;
  }

  async act(describe: string, perform: () => Promise<void>): Promise<{ receipt: Receipt; data: string }> {
    this.actions += 1;
    const started = Date.now();
    let summary = `Action ${this.actions}: ${describe}.`;
    try {
      await perform();
      await this.settle();
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      summary = `Action ${this.actions}: ${describe} could not be performed (${message}).`;
      await this.privateLog("tool-error", { describe, message });
    }
    this.surfaceMs += Date.now() - started;
    return this.receipt(summary);
  }

  async click(x: number, y: number, button: "left" | "middle" | "right", clicks: number): Promise<void> {
    const code = { left: "1", middle: "2", right: "3" }[button];
    await this.x(["mousemove", "--sync", String(x), String(y)]);
    await this.x(["click", "--repeat", String(clicks), "--delay", "80", code]);
  }

  async hover(x: number, y: number): Promise<void> {
    await this.x(["mousemove", "--sync", String(x), String(y)]);
  }

  async drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    await this.x(["mousemove", "--sync", String(fromX), String(fromY)]);
    await this.x(["mousedown", "1"]);
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      const px = Math.round(fromX + ((toX - fromX) * i) / steps);
      const py = Math.round(fromY + ((toY - fromY) * i) / steps);
      await this.x(["mousemove", String(px), String(py)]);
      await sleep(16);
    }
    await this.x(["mouseup", "1"]);
  }

  async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    await this.x(["mousemove", "--sync", String(x), String(y)]);
    const vertical = wheelNotches(deltaY);
    if (vertical > 0) {
      await this.x(["click", "--repeat", String(vertical), "--delay", "30", deltaY > 0 ? "5" : "4"]);
    }
    const horizontal = wheelNotches(deltaX);
    if (horizontal > 0) {
      await this.x(["click", "--repeat", String(horizontal), "--delay", "30", deltaX > 0 ? "7" : "6"]);
    }
  }

  async type(text: string): Promise<void> {
    await this.x(["type", "--delay", "15", "--", text]);
  }

  async press(key: string): Promise<void> {
    await this.x(["key", "--delay", "40", "--", toXdotoolKey(key)]);
  }

  /** Open the app again after it closed, as from a dock or start menu. */
  async openApp(): Promise<void> {
    if (this.appRunning) {
      throw new Error("The app is already open.");
    }
    await this.launchApp();
  }

  private stop(child: ChildProcess | undefined): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 3_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }

  async close(): Promise<void> {
    const app = this.app;
    this.app = undefined;
    await this.stop(app);
    await this.stop(this.wm);
    await this.stop(this.xvfb);
  }
}
