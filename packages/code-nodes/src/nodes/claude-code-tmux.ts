/**
 * Claude Code agent node — drives the real `claude` CLI inside a detached
 * tmux session.
 *
 * How it works:
 * - Launches `claude --dangerously-skip-permissions --session-id <uuid>` in a
 *   detached tmux session (Claude Code runs fully autonomously, no permission
 *   prompts).
 * - Prompts are delivered by pasting into the tmux pane (`load-buffer` +
 *   `paste-buffer` + Enter) — exactly as if a human typed them.
 * - Output is streamed by tailing the session JSONL file Claude Code writes
 *   under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Claude Code
 *   is unaware it is being observed.
 * - Turn completion is detected by combining three signals: at least one new
 *   assistant text message since the prompt was sent, the tmux pane no longer
 *   showing the "esc to interrupt" busy indicator, and the session file being
 *   quiet for a stability window.
 *
 * Nodes are directly chainable: wire one node's `text` output into another
 * node's `input`. All agents in a workflow run share the current workspace
 * directory.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { OutputCorrelation } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, open, readdir, stat, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);
const log = createLogger("nodetool.agents.claude-code");

// ---------------------------------------------------------------------------
// Session JSONL parsing
// ---------------------------------------------------------------------------

export interface ClaudeSessionEntry {
  type?: string;
  message?: { role?: string; content?: unknown };
  [key: string]: unknown;
}

export interface AssistantEvent {
  kind: "text" | "tool_use";
  text: string;
}

/**
 * Encode a working directory the way Claude Code names its project folder
 * under ~/.claude/projects (every non-alphanumeric char becomes "-").
 */
export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/** Parse complete JSONL lines into session entries, skipping malformed ones. */
export function parseSessionLines(text: string): ClaudeSessionEntry[] {
  const entries: ClaudeSessionEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        entries.push(parsed as ClaudeSessionEntry);
      }
    } catch {
      // Partial or corrupt line — skip
    }
  }
  return entries;
}

/** Extract streamable events (text blocks, tool calls) from a session entry. */
export function extractAssistantEvents(
  entry: ClaudeSessionEntry
): AssistantEvent[] {
  if (entry.type !== "assistant") return [];
  const content = entry.message?.content;
  if (typeof content === "string") {
    return content.trim() ? [{ kind: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const events: AssistantEvent[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
      events.push({ kind: "text", text: b.text });
    } else if (b.type === "tool_use" && typeof b.name === "string") {
      events.push({ kind: "tool_use", text: `[tool] ${b.name}` });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Completion detection ("is the agent done?")
// ---------------------------------------------------------------------------

export interface TurnSignals {
  /** An assistant text message arrived since the prompt was sent. */
  sawAssistantText: boolean;
  /** The tmux pane shows Claude's busy indicator ("esc to interrupt"). */
  paneBusy: boolean;
  /** A startup/permission dialog is on screen awaiting input. */
  dialogPending: boolean;
  /** Milliseconds since the session file last produced a new entry. */
  msSinceLastEntry: number;
  /** Required stability window before declaring the turn complete. */
  quietMs: number;
}

/**
 * A turn is complete only when all signals agree: the agent answered, is no
 * longer working, nothing is blocking on a dialog, and the session file has
 * been quiet long enough to rule out a brief pause between tool calls.
 */
export function isTurnComplete(s: TurnSignals): boolean {
  return (
    s.sawAssistantText &&
    !s.paneBusy &&
    !s.dialogPending &&
    s.msSinceLastEntry >= s.quietMs
  );
}

export function isPaneBusy(pane: string): boolean {
  return pane.toLowerCase().includes("esc to interrupt");
}

export type PaneDialog =
  | "trust"
  | "bypass-permissions"
  | "theme"
  | "login"
  | null;

/** Recognize Claude Code startup dialogs that need a keypress to proceed. */
export function detectPaneDialog(pane: string): PaneDialog {
  // Folder-trust dialog (wording varies across Claude Code versions)
  if (
    pane.includes("Do you trust the files in this folder?") ||
    pane.includes("Yes, I trust this folder") ||
    pane.includes("trust this folder")
  ) {
    return "trust";
  }
  if (pane.includes("Yes, I accept")) return "bypass-permissions";
  if (pane.includes("Choose the text style")) return "theme";
  if (pane.includes("Select login method")) return "login";
  return null;
}

// ---------------------------------------------------------------------------
// Launch command construction
// ---------------------------------------------------------------------------

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface ClaudeLaunchOptions {
  command: string;
  sessionId: string;
  model?: string;
  appendSystemPrompt?: string;
  extraArgs?: string;
}

/**
 * Build the shell command that runs inside the tmux pane. Strips any
 * CLAUDECODE/CLAUDE_CODE_*-style env vars first so a nested Claude Code
 * session (e.g. when NodeTool itself runs under Claude Code) starts clean.
 */
export function buildClaudeLaunchCommand(opts: ClaudeLaunchOptions): string {
  const stripEnv =
    "for v in $(env | grep -oE " +
    "'^(CLAUDECODE|CLAUDE_(CODE|SESSION|ENABLE|AFTER|AUTO)_[A-Za-z0-9_]*)=' " +
    "| sed 's/=$//'); do unset \"$v\"; done; ";
  const parts = [
    opts.command,
    "--dangerously-skip-permissions",
    "--session-id",
    shQuote(opts.sessionId)
  ];
  if (opts.model) parts.push("--model", shQuote(opts.model));
  if (opts.appendSystemPrompt) {
    parts.push("--append-system-prompt", shQuote(opts.appendSystemPrompt));
  }
  if (opts.extraArgs) parts.push(opts.extraArgs);
  return stripEnv + "exec " + parts.join(" ");
}

/**
 * Combine the node's own instructions with text handed off from an upstream
 * agent node, so nodes chain by wiring `text` → `input`.
 */
export function combinePrompt(prompt: string, input: string): string {
  const p = prompt.trim();
  const i = input.trim();
  if (p && i) return `${p}\n\n${i}`;
  return p || i;
}

// ---------------------------------------------------------------------------
// tmux + filesystem helpers
// ---------------------------------------------------------------------------

async function tmux(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("tmux", args);
  return stdout;
}

async function tmuxHasSession(name: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", `=${name}`]);
    return true;
  } catch {
    return false;
  }
}

/** Paste arbitrary (multiline) text into a pane via a tmux buffer. */
async function tmuxPasteText(session: string, text: string): Promise<void> {
  const bufferName = `nodetool-${randomUUID().slice(0, 8)}`;
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("tmux", ["load-buffer", "-b", bufferName, "-"]);
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`tmux load-buffer exited with code ${code}`))
    );
    proc.stdin.end(text);
  });
  await tmux("paste-buffer", "-d", "-p", "-b", bufferName, "-t", session);
}

async function capturePane(session: string, fallback: string): Promise<string> {
  try {
    return await tmux("capture-pane", "-p", "-t", session);
  } catch {
    return fallback;
  }
}

/**
 * Locate the session JSONL for a session id. Tries the deterministic path
 * derived from the working directory first, then scans all project dirs
 * (robust against changes in Claude Code's directory-encoding scheme).
 */
export async function locateSessionFile(
  sessionId: string,
  cwd: string
): Promise<string | null> {
  const projectsDir = path.join(homedir(), ".claude", "projects");
  const direct = path.join(
    projectsDir,
    encodeClaudeProjectDir(cwd),
    `${sessionId}.jsonl`
  );
  try {
    await stat(direct);
    return direct;
  } catch {
    // Fall through to scan
  }
  try {
    for (const dir of await readdir(projectsDir)) {
      const candidate = path.join(projectsDir, dir, `${sessionId}.jsonl`);
      try {
        await stat(candidate);
        return candidate;
      } catch {
        // Keep scanning
      }
    }
  } catch {
    // Projects dir doesn't exist yet
  }
  return null;
}

async function readNewBytes(
  file: string,
  offset: number
): Promise<{ text: string; offset: number }> {
  const info = await stat(file);
  if (info.size <= offset) return { text: "", offset };
  const handle = await open(file, "r");
  try {
    const length = info.size - offset;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    return { text: buffer.toString("utf8"), offset: info.size };
  } finally {
    await handle.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paneTail(pane: string, lines = 15): string {
  return pane.trimEnd().split("\n").slice(-lines).join("\n");
}

/**
 * tmux sessions kept alive via keep_session, so a follow-up run (same
 * session_name) reuses the running Claude conversation instead of starting a
 * fresh one.
 */
const LIVE_SESSIONS = new Map<
  string,
  { sessionId: string; workspace: string }
>();

// ---------------------------------------------------------------------------
// Live terminal streaming (terminal_update messages → xterm.js node body)
// ---------------------------------------------------------------------------

/** Pane geometry — also sent with every terminal_update so the UI emulator
 * matches. Claude Code's Ink TUI needs a real-terminal-sized pane to render its
 * input box and first-run dialogs; too small (e.g. 80x20) and the readiness
 * markers never appear, so the launch handshake times out. The node body keeps
 * the *display* small independently by capping the xterm height. */
const TMUX_COLS = 80;
const TMUX_ROWS = 40;

/** A delta larger than this is replaced by a screen snapshot (reset) instead. */
const TERMINAL_SNAPSHOT_THRESHOLD = 64 * 1024;

export function terminalPipeFile(sessionName: string): string {
  return path.join(tmpdir(), `nodetool-tmux-${sessionName}.out`);
}

/**
 * Streams the raw tmux pane byte stream (ANSI escapes included) to the client
 * as `terminal_update` messages. Attaches `tmux pipe-pane` to the session and
 * tails the pipe file; an initial `capture-pane -e` snapshot (with `reset`)
 * reproduces the current screen so the client emulator starts in sync.
 */
class TerminalStreamer {
  private offset = 0;

  private constructor(
    private readonly context: ProcessingContext,
    private readonly nodeId: string,
    private readonly sessionName: string,
    private readonly pipeFile: string
  ) {}

  static async attach(
    context: ProcessingContext,
    nodeId: string,
    sessionName: string
  ): Promise<TerminalStreamer> {
    const pipeFile = terminalPipeFile(sessionName);
    // -o only opens a new pipe when none is active, so attaching to a
    // kept-alive session that is already piping is a no-op.
    await tmux(
      "pipe-pane",
      "-o",
      "-t",
      sessionName,
      `cat >> ${shQuote(pipeFile)}`
    );
    const streamer = new TerminalStreamer(context, nodeId, sessionName, pipeFile);
    streamer.offset = await stat(pipeFile)
      .then((s) => s.size)
      .catch(() => 0);
    await streamer.snapshot();
    return streamer;
  }

  private post(content: string, reset: boolean): void {
    this.context.postMessage({
      type: "terminal_update",
      node_id: this.nodeId,
      content,
      cols: TMUX_COLS,
      rows: TMUX_ROWS,
      ...(reset ? { reset: true } : {})
    });
  }

  /** Send the current screen (escapes preserved), replacing client state. */
  async snapshot(): Promise<void> {
    try {
      const screen = await tmux(
        "capture-pane",
        "-e",
        "-p",
        "-t",
        this.sessionName
      );
      // capture-pane emits bare \n line endings; the emulator needs \r\n.
      this.post(screen.replace(/\n/g, "\r\n"), true);
    } catch {
      // Pane already gone — nothing to snapshot
    }
  }

  /** Forward bytes the pane produced since the last flush. */
  async flush(): Promise<void> {
    try {
      const read = await readNewBytes(this.pipeFile, this.offset);
      if (read.offset === this.offset) return;
      this.offset = read.offset;
      if (read.text.length > TERMINAL_SNAPSHOT_THRESHOLD) {
        // Huge burst (e.g. a file dump) — a snapshot is smaller and faster
        // than replaying the whole stream.
        await this.snapshot();
      } else if (read.text) {
        this.post(read.text, false);
      }
    } catch {
      // Pipe file missing (not yet created) — try again next tick
    }
  }

  /** Best-effort removal of the pipe file once the session is killed. */
  async cleanup(): Promise<void> {
    await unlink(this.pipeFile).catch(() => {
      // Already gone
    });
  }
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

const POLL_MS = 750;
const DIALOG_RETRY_MS = 2000;
const READY_TIMEOUT_MS = 90_000;

export class ClaudeCodeAgentNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.ClaudeCodeAgent";
  static readonly title = "Claude Code Agent";
  static readonly description =
    "Runs Claude Code autonomously inside a tmux session and streams its output.\n" +
    "    Prompts are typed into the terminal; results are read from the session log,\n" +
    "    so the agent behaves exactly like an interactive session. Chain agents by\n" +
    "    wiring `text` into the next node's `input` and sharing `workspace`.\n" +
    "    claude, code, agent, tmux, coding, autonomous, reviewer, implementer";
  static readonly requiredRuntimes = ["tmux", "claude"];
  static readonly inputFields = ["prompt", "input"];
  static readonly basicFields = ["prompt", "model"];
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk",
    transcript: "str",
    session_id: "str"
  };
  // `text` is the final assistant answer; `chunk` streams assistant messages
  // and tool-call markers as the agent works.
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    text: { kind: "single", source: "__execution__" },
    transcript: { kind: "single", source: "__execution__" },
    session_id: { kind: "single", source: "__execution__" },
    chunk: { kind: "iteration", source: "__execution__", group: "stream" }
  };

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "Instructions for this agent (its role/task). Combined with `input` when both are set."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Input",
    description:
      "Hand-off text from an upstream agent (wire another node's `text` output here). Appended after the prompt."
  })
  declare input: any;

  @prop({
    type: "str",
    default: "",
    title: "Session Name",
    description:
      "tmux session name. Empty: auto-generated. With `keep_session`, reusing the same name continues the same Claude conversation across runs."
  })
  declare session_name: any;

  @prop({
    type: "bool",
    default: false,
    title: "Keep Session",
    description:
      "Leave the tmux session (and Claude conversation) running after the turn completes, so follow-up prompts share context."
  })
  declare keep_session: any;

  @prop({
    type: "str",
    default: "",
    title: "Model",
    description: "Optional model override passed as --model (e.g. opus, sonnet)."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "System Prompt",
    description:
      "Optional text passed as --append-system-prompt (e.g. 'You are a strict code reviewer')."
  })
  declare system_prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Extra Args",
    description: "Extra CLI arguments appended verbatim to the claude command."
  })
  declare extra_args: any;

  @prop({
    type: "str",
    default: "claude",
    title: "Command",
    description: "Claude Code binary to launch."
  })
  declare command: any;

  @prop({
    type: "int",
    default: 900,
    title: "Timeout Seconds",
    description: "Maximum time to wait for the agent to finish the turn.",
    min: 10,
    max: 14400
  })
  declare timeout_seconds: any;

  @prop({
    type: "float",
    default: 3,
    title: "Quiet Period Seconds",
    description:
      "How long the session log must stay quiet (with the terminal idle) before the turn counts as finished.",
    min: 1,
    max: 60
  })
  declare quiet_period_seconds: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let final: Record<string, unknown> = {};
    for await (const item of this.genProcess(context)) {
      if (item.text !== null && item.text !== undefined) final = item;
    }
    return final;
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const promptText = combinePrompt(
      String(this.prompt ?? ""),
      String(this.input ?? "")
    );
    if (!promptText) {
      throw new Error("Prompt is required (set `prompt` or connect `input`)");
    }
    const timeoutMs =
      Math.max(10, Number(this.timeout_seconds ?? 900) || 900) * 1000;
    const quietMs =
      Math.max(1, Number(this.quiet_period_seconds ?? 3) || 3) * 1000;
    const keepSession = Boolean(this.keep_session ?? false);
    const command = String(this.command ?? "claude").trim() || "claude";

    let sessionName = String(this.session_name ?? "").trim();
    const workspaceDir =
      (context as { workspaceDir?: string } | undefined)?.workspaceDir ??
      (await mkdtemp(path.join(tmpdir(), "nodetool-claude-")));
    await mkdir(workspaceDir, { recursive: true });
    let sessionId: string;
    let reused = false;

    const live = sessionName ? LIVE_SESSIONS.get(sessionName) : undefined;
    if (sessionName && live && (await tmuxHasSession(sessionName))) {
      sessionId = live.sessionId;
      reused = true;
      log.info("Reusing live Claude Code session", { sessionName, sessionId });
    } else {
      if (!sessionName) sessionName = `nt-claude-${randomUUID().slice(0, 8)}`;
      if (await tmuxHasSession(sessionName)) {
        throw new Error(
          `tmux session '${sessionName}' already exists but was not started by this node — ` +
            "kill it (tmux kill-session) or choose a different session_name"
        );
      }
      sessionId = randomUUID();
      const launch = buildClaudeLaunchCommand({
        command,
        sessionId,
        model: String(this.model ?? "").trim() || undefined,
        appendSystemPrompt: String(this.system_prompt ?? "").trim() || undefined,
        extraArgs: String(this.extra_args ?? "").trim() || undefined
      });
      log.info("Starting Claude Code in tmux", {
        sessionName,
        sessionId,
        workspaceDir
      });
      await tmux(
        "new-session",
        "-d",
        "-s",
        sessionName,
        "-c",
        workspaceDir,
        "-x",
        String(TMUX_COLS),
        "-y",
        String(TMUX_ROWS),
        launch
      );
      LIVE_SESSIONS.set(sessionName, { sessionId, workspace: workspaceDir });
    }

    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let killOnExit = !keepSession;
    let lastPane = "";

    // Mirror the live pane to the client's terminal emulator. UI-only: the
    // raw ANSI stream never touches the dataflow outputs.
    let term: TerminalStreamer | null = null;
    if (context && this.__node_id) {
      term = await TerminalStreamer.attach(
        context,
        this.__node_id,
        sessionName
      ).catch(() => null);
    }

    try {
      if (!reused) {
        lastPane = await this.waitForReady(sessionName, deadline, term);
      }

      // Snapshot the session file position BEFORE sending the prompt so only
      // this turn's entries are streamed.
      let sessionFile = await locateSessionFile(sessionId, workspaceDir);
      let offset = sessionFile ? (await stat(sessionFile)).size : 0;
      let pendingLine = "";

      await tmuxPasteText(sessionName, promptText);
      await sleep(400);
      await tmux("send-keys", "-t", sessionName, "Enter");

      let sawAssistantText = false;
      let lastAssistantText = "";
      let lastEntryAt = Date.now();
      let lastDialogActionAt = 0;
      const transcript: string[] = [];

      while (true) {
        if (Date.now() > deadline) {
          throw new Error(
            `Claude Code did not finish within ${Math.round(timeoutMs / 1000)}s. ` +
              `Last terminal output:\n${paneTail(lastPane)}`
          );
        }
        await sleep(POLL_MS);
        await term?.flush();

        if (!(await tmuxHasSession(sessionName))) {
          killOnExit = false;
          LIVE_SESSIONS.delete(sessionName);
          throw new Error(
            `Claude Code exited unexpectedly. Last terminal output:\n${paneTail(lastPane)}`
          );
        }

        if (!sessionFile) {
          sessionFile = await locateSessionFile(sessionId, workspaceDir);
          if (sessionFile) offset = 0;
        }
        if (sessionFile) {
          const read = await readNewBytes(sessionFile, offset).catch(() => ({
            text: "",
            offset
          }));
          offset = read.offset;
          if (read.text) {
            pendingLine += read.text;
            const lines = pendingLine.split("\n");
            pendingLine = lines.pop() ?? "";
            for (const entry of parseSessionLines(lines.join("\n"))) {
              lastEntryAt = Date.now();
              for (const event of extractAssistantEvents(entry)) {
                if (event.kind === "text") {
                  sawAssistantText = true;
                  lastAssistantText = event.text;
                }
                transcript.push(event.text);
                yield {
                  chunk: {
                    type: "chunk",
                    content: `${event.text}\n`,
                    content_type: "text",
                    done: false
                  },
                  text: null
                };
              }
            }
          }
        }

        lastPane = await capturePane(sessionName, lastPane);
        const dialog = detectPaneDialog(lastPane);
        if (dialog === "login") {
          throw new Error(
            "Claude Code requires authentication. Run `claude` manually once to log in, then retry."
          );
        }
        if (dialog && Date.now() - lastDialogActionAt > DIALOG_RETRY_MS) {
          lastDialogActionAt = Date.now();
          log.info(`Auto-acknowledging Claude Code '${dialog}' dialog`, {
            sessionName
          });
          if (dialog === "bypass-permissions") {
            await tmux("send-keys", "-t", sessionName, "Down");
          }
          await tmux("send-keys", "-t", sessionName, "Enter");
          continue;
        }

        const done = isTurnComplete({
          sawAssistantText,
          paneBusy: isPaneBusy(lastPane),
          dialogPending: dialog !== null,
          msSinceLastEntry: Date.now() - lastEntryAt,
          quietMs
        });
        if (done) break;
      }

      await term?.flush();
      log.info("Claude Code turn complete", {
        sessionName,
        elapsedMs: Date.now() - startedAt,
        textChars: lastAssistantText.length
      });

      yield {
        chunk: { type: "chunk", content: "", content_type: "text", done: true },
        text: lastAssistantText,
        transcript: transcript.join("\n"),
        session_id: sessionId
      };
    } finally {
      if (killOnExit) {
        LIVE_SESSIONS.delete(sessionName);
        await execFileAsync("tmux", ["kill-session", "-t", sessionName]).catch(
          () => {
            // Session already gone
          }
        );
        await term?.cleanup();
      }
    }
  }

  /**
   * Wait for Claude Code's input box to appear after launch, acknowledging
   * any first-run dialogs (folder trust, bypass-permissions warning, theme
   * picker) along the way.
   */
  private async waitForReady(
    sessionName: string,
    deadline: number,
    term: TerminalStreamer | null = null
  ): Promise<string> {
    const readyDeadline = Math.min(deadline, Date.now() + READY_TIMEOUT_MS);
    let pane = "";
    let lastDialogActionAt = 0;
    while (Date.now() < readyDeadline) {
      await sleep(POLL_MS);
      await term?.flush();
      if (!(await tmuxHasSession(sessionName))) {
        throw new Error(
          `Claude Code failed to start (is '${String(this.command ?? "claude")}' installed and on PATH?). ` +
            `Last terminal output:\n${paneTail(pane)}`
        );
      }
      pane = await capturePane(sessionName, pane);
      const dialog = detectPaneDialog(pane);
      if (dialog === "login") {
        throw new Error(
          "Claude Code requires authentication. Run `claude` manually once to log in, then retry."
        );
      }
      if (dialog && Date.now() - lastDialogActionAt > DIALOG_RETRY_MS) {
        lastDialogActionAt = Date.now();
        log.info(`Auto-acknowledging Claude Code '${dialog}' dialog`, {
          sessionName
        });
        if (dialog === "bypass-permissions") {
          await tmux("send-keys", "-t", sessionName, "Down");
        }
        await tmux("send-keys", "-t", sessionName, "Enter");
        continue;
      }
      // The input box (rounded border + shortcut hint) means Claude is ready.
      if (
        !dialog &&
        (pane.includes("? for shortcuts") || pane.includes("╭─"))
      ) {
        return pane;
      }
    }
    throw new Error(
      `Claude Code did not become ready in time. Last terminal output:\n${paneTail(pane)}`
    );
  }
}

export const CLAUDE_CODE_NODES: readonly NodeClass[] = [ClaudeCodeAgentNode];
