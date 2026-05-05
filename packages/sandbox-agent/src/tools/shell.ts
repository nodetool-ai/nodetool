/* eslint-disable no-control-regex */

/**
 * Shell tools — named tmux sessions.
 *
 * Each session is a tmux detached session with a single window and pane.
 * Commands are appended with a sentinel to detect completion and capture
 * the exit code from the pane output.
 *
 * Session state is kept in-process. If the tool server restarts, tmux
 * sessions survive on the host side (tmux server lives in the container)
 * but the sentinel-tracking state is lost; callers should create fresh
 * session ids after a server restart.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  type ShellExecInput,
  type ShellExecOutput,
  type ShellViewInput,
  type ShellViewOutput,
  type ShellWaitInput,
  type ShellWaitOutput,
  type ShellWriteToProcessInput,
  type ShellWriteToProcessOutput,
  type ShellKillProcessInput,
  type ShellKillProcessOutput
} from "@nodetool-ai/sandbox/schemas";

interface SessionState {
  tmuxName: string;
  workDir: string;
  marker: string | null;
  lastExitCode: number | null;
}

const sessions = new Map<string, SessionState>();

const DONE_PREFIX = "__NODETOOL_DONE_";

function tmuxNameFor(id: string): string {
  // tmux session names can't contain ':' or '.'. Sanitize.
  return `nt-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export async function shellExec(input: ShellExecInput): Promise<ShellExecOutput> {
  const existing = sessions.get(input.id);
  const workDir = input.exec_dir ?? existing?.workDir ?? "/home/ubuntu";

  if (!existing) {
    const tmuxName = tmuxNameFor(input.id);
    // -d detach, -s session name, -c workdir
    await runTmux(["new-session", "-d", "-s", tmuxName, "-c", workDir]);
    sessions.set(input.id, {
      tmuxName,
      workDir,
      marker: null,
      lastExitCode: null
    });
    spawnVisibleTerminal(input.id, tmuxName);
  } else if (input.exec_dir && input.exec_dir !== existing.workDir) {
    // Change directory in the existing session before running the new command.
    await sendKeys(existing.tmuxName, `cd ${shellQuote(input.exec_dir)}`);
    existing.workDir = input.exec_dir;
  }

  const state = sessions.get(input.id)!;
  const marker = randomBytes(6).toString("hex");
  state.marker = marker;
  state.lastExitCode = null;

  const wrapped = `${input.command}; __NT_EC=$?; echo ${DONE_PREFIX}${marker}__:$__NT_EC`;
  await sendKeys(state.tmuxName, wrapped);

  return { id: input.id, started: true };
}

export async function shellView(input: ShellViewInput): Promise<ShellViewOutput> {
  const state = sessions.get(input.id);
  if (!state) {
    throw new Error(`shell session not found: ${input.id}`);
  }
  let rawOutput: string;
  try {
    rawOutput = await capturePane(state.tmuxName);
  } catch (err) {
    if (isSessionGoneError(err)) {
      sessions.delete(input.id);
      return {
        id: input.id,
        output: "<session ended>",
        running: false,
        exit_code: state.lastExitCode ?? -1
      };
    }
    throw err;
  }
  const { running, exitCode } = parseCompletion(rawOutput, state.marker);
  if (!running && exitCode !== null) state.lastExitCode = exitCode;
  return {
    id: input.id,
    output: cleanShellOutput(rawOutput, state.marker),
    running,
    exit_code: running ? null : state.lastExitCode
  };
}

export async function shellWait(input: ShellWaitInput): Promise<ShellWaitOutput> {
  const state = sessions.get(input.id);
  if (!state) {
    throw new Error(`shell session not found: ${input.id}`);
  }
  const deadline = Date.now() + (input.seconds ?? 60) * 1000;
  let output = "";
  while (Date.now() < deadline) {
    try {
      output = await capturePane(state.tmuxName);
    } catch (err) {
      if (isSessionGoneError(err)) {
        sessions.delete(input.id);
        return {
          id: input.id,
          output: output ? cleanShellOutput(output, state.marker) : "<session ended>",
          running: false,
          exit_code: state.lastExitCode ?? -1,
          timed_out: false
        };
      }
      throw err;
    }
    const { running, exitCode } = parseCompletion(output, state.marker);
    if (!running) {
      state.lastExitCode = exitCode;
      return {
        id: input.id,
        output: cleanShellOutput(output, state.marker),
        running: false,
        exit_code: exitCode,
        timed_out: false
      };
    }
    await sleep(500);
  }
  return {
    id: input.id,
    output: cleanShellOutput(output, state.marker),
    running: true,
    exit_code: null,
    timed_out: true
  };
}

function isSessionGoneError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("can't find pane") ||
    message.includes("can't find session") ||
    message.includes("no server running") ||
    message.includes("session not found")
  );
}

export async function shellWriteToProcess(
  input: ShellWriteToProcessInput
): Promise<ShellWriteToProcessOutput> {
  const state = sessions.get(input.id);
  if (!state) {
    throw new Error(`shell session not found: ${input.id}`);
  }
  if (input.press_enter) {
    await sendKeys(state.tmuxName, input.input);
  } else {
    // send-keys without Enter: pass -l (literal) and omit the Enter key.
    await runTmux([
      "send-keys",
      "-t",
      state.tmuxName,
      "-l",
      input.input
    ]);
  }
  return {
    id: input.id,
    bytes_written: Buffer.byteLength(input.input, "utf-8")
  };
}

export async function shellKillProcess(
  input: ShellKillProcessInput
): Promise<ShellKillProcessOutput> {
  const state = sessions.get(input.id);
  if (!state) {
    return { id: input.id, killed: false };
  }
  try {
    await runTmux(["kill-session", "-t", state.tmuxName]);
  } catch {
    // ignore — session may already be gone
  }
  sessions.delete(input.id);
  return { id: input.id, killed: true };
}

/** Test-only: clear in-process session registry. */
export function _resetSessionsForTests(): void {
  sessions.clear();
}

// ---- internals -------------------------------------------------------------

async function sendKeys(tmuxName: string, line: string): Promise<void> {
  // send-keys with Enter: two invocations, first literal text then Enter.
  await runTmux(["send-keys", "-t", tmuxName, "-l", line]);
  await runTmux(["send-keys", "-t", tmuxName, "Enter"]);
}

async function capturePane(tmuxName: string): Promise<string> {
  // -p print to stdout, -J join wrapped lines, -S -3000 capture scrollback.
  const buf = await runCapture("tmux", [
    "capture-pane",
    "-t",
    tmuxName,
    "-p",
    "-J",
    "-S",
    "-3000"
  ]);
  return buf.toString("utf-8");
}

function parseCompletion(
  output: string,
  marker: string | null
): { running: boolean; exitCode: number | null } {
  if (!marker) return { running: false, exitCode: null };
  const re = new RegExp(`${DONE_PREFIX}${marker}__:(-?\\d+)`);
  const m = re.exec(output);
  if (!m) return { running: true, exitCode: null };
  return { running: false, exitCode: parseInt(m[1], 10) };
}

function cleanShellOutput(output: string, marker: string | null): string {
  const normalized = stripAnsi(output).replace(/\r/g, "");
  const lines = normalized.split("\n");
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return false;
    }
    if (isInternalShellWrapperLine(line, marker)) {
      return false;
    }
    if (isPromptOnlyLine(trimmed)) {
      return false;
    }
    return true;
  });
  return cleaned.join("\n").trim();
}

function isInternalShellWrapperLine(line: string, marker: string | null): boolean {
  if (line.includes("__NT_EC") || line.includes(DONE_PREFIX)) {
    return true;
  }
  return marker !== null && line.includes(`${DONE_PREFIX}${marker}__:`);
}

const ANSI_REGEX = new RegExp(
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
  "g"
);

function stripAnsi(value: string): string {
  return value.replace(ANSI_REGEX, "");
}

function isPromptOnlyLine(line: string): boolean {
  return (
    /^[^\s@]+@[^\s:]+:[^$#]*[$#]\s*$/.test(line) ||
    /^[^$#>]*[~/][^$#>]*\s[>$#]\s*$/.test(line)
  );
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function runTmux(args: string[]): Promise<void> {
  await runCapture("tmux", args);
}

function runCapture(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve(Buffer.concat(out));
      else
        reject(
          new Error(
            Buffer.concat(err).toString("utf-8").trim() || `${cmd} exit ${code}`
          )
        );
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * If an X display is attached (the sandbox image's Xvfb stack), open an
 * xterm attached to the freshly created tmux session so anyone watching
 * via noVNC sees the agent's keystrokes and output live. The xterm is
 * detached from the tool server — when shellKill tears down the tmux
 * session, the xterm exits on its own.
 *
 * Set NODETOOL_SHELL_VNC=0 to disable (e.g. when running headless).
 */
function spawnVisibleTerminal(id: string, tmuxName: string): void {
  if (!process.env.DISPLAY) return;
  if (process.env.NODETOOL_SHELL_VNC === "0") return;
  try {
    const child = spawn(
      "xterm",
      [
        "-fullscreen",
        "-T",
        `sandbox: ${id}`,
        "-fa",
        "Monospace",
        "-fs",
        "11",
        "-bg",
        "black",
        "-fg",
        "white",
        "-e",
        "tmux",
        "attach-session",
        "-t",
        tmuxName
      ],
      { detached: true, stdio: "ignore", env: process.env }
    );
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // xterm not installed or failed to spawn — fall back silently; the
    // shell tools still work, just without VNC visibility.
  }
}
