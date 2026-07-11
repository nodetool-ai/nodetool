/**
 * server-subprocess-runner.ts
 *
 * TypeScript port of Python ServerSubprocessRunner from server_subprocess_runner.py.
 * Runs a long-lived server as a local subprocess, streams stdout/stderr, and
 * emits a first ["endpoint", url] message once the server is TCP-reachable.
 * Supports downloading a remote binary once and caching it on disk.
 */

import {
  createConnection,
  type Socket as NetSocket,
  createServer
} from "node:net";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  statSync,
  lstatSync,
  realpathSync,
  chmodSync,
  renameSync,
  readdirSync,
  unlinkSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { resolve as pathResolve, join as pathJoin, sep } from "node:path";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import { buildSubprocessBaseEnv } from "./stream-runner-base.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerSubprocessRunnerOptions {
  /** Remote or local URL to the server binary (http/https/file path). */
  binaryUrl: string;
  /** Argument tokens for the binary. Supports `{port}` placeholder. */
  argsTemplate?: string[];
  /** Port to bind. If 0 or undefined, a free port is chosen automatically. */
  port?: number;
  /** URL scheme for the emitted endpoint (e.g., "ws", "http"). */
  scheme?: string;
  /** Host IP for the endpoint URL. */
  hostIp?: string;
  /** Seconds to wait for TCP readiness. */
  readyTimeoutSeconds?: number;
  /** Path suffix appended to the endpoint URL. */
  endpointPath?: string;
  /** Environment variable name to expose the port to the child process. */
  portEnvVar?: string | null;
  /** Max process lifetime in seconds (0 = unlimited). */
  timeoutSeconds?: number;
  /**
   * Path of the executable inside a ZIP archive referenced by `binaryUrl`.
   * Required when `binaryUrl` points to a ZIP file.
   */
  archiveExecutablePath?: string | null;
}

export interface ServerSubprocessStreamOptions {
  stdinStream?: AsyncIterable<string>;
  workspaceDir?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TCP-probe a host:port. Resolves true on connect, false on error/timeout.
 */
function tcpProbe(
  host: string,
  port: number,
  timeoutMs = 1000
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const sock: NetSocket = createConnection({
      host,
      port,
      timeout: timeoutMs
    });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

/**
 * Return the default cache directory for nodetool binaries.
 */
function defaultCacheDir(): string {
  return pathJoin(getNodetoolDataDir(), "bin");
}

/**
 * Make a file executable (chmod +x).
 */
function ensureExecutable(filePath: string): void {
  try {
    const st = statSync(filePath);
    chmodSync(filePath, st.mode | 0o111);
  } catch {
    // best effort
  }
}

/**
 * Extract a ZIP archive to `destDir` using the system `unzip` command.
 *
 * Zip Slip is prevented in two stages:
 *  1. Before writing anything, every archive entry is listed and rejected if
 *     its target would resolve outside `destDir` (absolute paths, `..`).
 *  2. After extraction, the tree is walked with `lstat` (so symlinks are not
 *     followed) and any symlink whose real target escapes `destDir` is removed.
 */
function safeExtractZip(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const resolvedDest = pathResolve(destDir);
  const destPrefix = resolvedDest + sep;

  const escapes = (target: string): boolean =>
    target !== resolvedDest && !target.startsWith(destPrefix);

  // Stage 1: validate entry names before extracting anything. If the listing
  // step fails we must fail CLOSED — extracting without validation would let a
  // malicious archive write outside destDir (Zip Slip).
  let listing = "";
  try {
    listing = execFileSync("unzip", ["-Z1", "--", zipPath], {
      encoding: "utf-8",
      timeout: 120_000
    });
  } catch (err) {
    throw new Error(
      `Refusing to extract archive: could not list entries for validation (${String(
        err
      )})`
    );
  }
  for (const raw of listing.split("\n")) {
    const entry = raw.trim();
    if (!entry) continue;
    if (escapes(pathResolve(resolvedDest, entry))) {
      throw new Error(
        `Refusing to extract archive: entry '${entry}' escapes destination`
      );
    }
  }

  // `-d exdir` may precede the archive (per unzip(1)); keep it before `--` so
  // it's still parsed as the extract-dir option, then `--` guards zipPath.
  execFileSync("unzip", ["-o", "-d", destDir, "--", zipPath], {
    stdio: "ignore",
    timeout: 120_000
  });

  // Stage 2: drop any symlink whose real target points outside destDir.
  const walkAndCheck = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = pathJoin(dir, entry);
      let st;
      try {
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        let real: string | null;
        try {
          real = realpathSync(full);
        } catch {
          real = null;
        }
        if (real === null || escapes(real)) {
          try {
            unlinkSync(full);
          } catch {
            // ignore
          }
        }
        continue;
      }
      if (st.isDirectory()) {
        walkAndCheck(full);
      }
    }
  };
  walkAndCheck(destDir);
}

/**
 * Derive a per-URL cache name so that two runners pointed at different
 * `binaryUrl`s never collide on the same cache file. The human-readable
 * `name` is kept as a prefix; a short hash of the URL guarantees uniqueness.
 */
function binaryCacheName(url: string, name: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return `${name}-${hash}`;
}

/** @internal Exported for unit testing only. */
export { binaryCacheName as _binaryCacheName };

/**
 * Return a cached path for the remote binary, downloading if needed.
 *
 * When `archiveInnerPath` is provided, `url` is expected to point to a ZIP
 * archive. The archive is extracted once and the specified executable inside
 * is returned. Otherwise the downloaded file itself is the executable.
 */
function cacheRemoteBinary(
  url: string,
  name: string,
  archiveInnerPath?: string | null
): string {
  const binDir = defaultCacheDir();
  // Cache key includes a hash of the URL — keying on `name` alone meant every
  // binary collided on the same path and the first one cached won forever.
  const cacheKey = binaryCacheName(url, name);
  const dst = pathJoin(binDir, cacheKey);

  const isRemote = url.startsWith("http://") || url.startsWith("https://");
  const isFileUrl = url.startsWith("file://");
  const localPath = isFileUrl ? url.slice(7) : isRemote ? null : url;

  // Non-archive case: if already cached, return immediately
  if (!archiveInnerPath && existsSync(dst)) {
    ensureExecutable(dst);
    return dst;
  }

  mkdirSync(binDir, { recursive: true });

  // Archive case
  if (archiveInnerPath) {
    let zipSrc: string;
    if (localPath) {
      zipSrc = localPath;
      if (!existsSync(zipSrc)) {
        throw new Error(`Local archive not found: ${url}`);
      }
    } else {
      // Download the archive
      zipSrc = dst + ".zip";
      // Synchronous download: we convert the async helper to sync via execFileSync
      // For simplicity, use a child process to download
      if (!existsSync(zipSrc)) {
        downloadSync(zipSrc, url);
      }
    }

    // Extract
    const extractDir = pathJoin(binDir, `${cacheKey}_zip`);
    const exeRel = archiveInnerPath.replace(/^[/\\]+/, "");
    let exePath = pathJoin(extractDir, ...exeRel.split("/"));

    if (!existsSync(exePath)) {
      safeExtractZip(zipSrc, extractDir);
    }

    if (!existsSync(exePath)) {
      // Fallback: search for the file recursively
      const found = findFileRecursive(extractDir, exeRel);
      if (found) {
        exePath = found;
      } else {
        throw new Error(
          `Executable path '${archiveInnerPath}' not found after extraction in ${extractDir}`
        );
      }
    }

    ensureExecutable(exePath);
    return exePath;
  }

  // Direct binary case
  if (url.toLowerCase().endsWith(".zip")) {
    throw new Error(
      "ZIP archive URL provided but no 'archiveExecutablePath' was specified"
    );
  }

  if (localPath) {
    if (!existsSync(localPath)) {
      throw new Error(`Local binary not found: ${url}`);
    }
    const data = readFileSync(localPath);
    const partPath = dst + ".part";
    writeFileSync(partPath, data);
    renameSync(partPath, dst);
  } else {
    downloadSync(dst, url);
  }

  ensureExecutable(dst);
  return dst;
}

/**
 * Synchronous file download using a child process with curl.
 */
function downloadSync(destPath: string, url: string): void {
  const dir = pathResolve(destPath, "..");
  mkdirSync(dir, { recursive: true });
  const partPath = destPath + ".part";
  // `--` guards a url that begins with `-` from being parsed as a curl flag.
  execFileSync("curl", ["-fsSL", "-o", partPath, "--", url], {
    stdio: "ignore",
    timeout: 300_000
  });
  renameSync(partPath, destPath);
}

/**
 * Recursively search for a file matching `relativePath` under `baseDir`.
 */
function findFileRecursive(
  baseDir: string,
  relativePath: string
): string | null {
  const target = relativePath.split("/").pop();
  if (!target) return null;

  const walk = (dir: string): string | null => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = pathJoin(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          const found = walk(full);
          if (found) return found;
        } else if (full.endsWith(relativePath) || entry === target) {
          return full;
        }
      } catch {
        // ignore
      }
    }
    return null;
  };

  return walk(baseDir);
}

/**
 * Find a free TCP port by binding to port 0 and reading the assigned port.
 */
function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Failed to determine free port")));
      }
    });
    srv.on("error", reject);
  });
}

/**
 * TCP-probe `host:port` until the server accepts or timeout. If `proc` exits
 * early, returns false immediately.
 */
async function waitForServerReady(
  host: string,
  port: number,
  proc: ChildProcess,
  timeoutSeconds: number
): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutSeconds) * 1000;

  while (Date.now() < deadline) {
    // If the process already died — by clean exit or by signal — abort.
    if (proc.exitCode !== null || proc.signalCode !== null) return false;

    const ok = await tcpProbe(host, port, 1000);
    if (ok) return true;

    await sleep(200);
  }
  return false;
}

/**
 * Terminate a child process, then force-kill after a grace period.
 */
function killProc(proc: ChildProcess, graceMs = 3000): void {
  try {
    proc.kill("SIGTERM");
  } catch {
    // ignore
  }
  // Wait a bit, then force kill
  const start = Date.now();
  const check = (): void => {
    if (proc.exitCode !== null) return;
    if (Date.now() - start > graceMs) {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      return;
    }
    setTimeout(check, 100);
  };
  setTimeout(check, 100);
}

// ---------------------------------------------------------------------------
// ServerSubprocessRunner
// ---------------------------------------------------------------------------

/**
 * Run a server process as a local subprocess and stream logs.
 *
 * The `userCode` argument passed to `stream()` is treated as extra CLI
 * arguments appended to the binary (shell-split).
 */
export class ServerSubprocessRunner {
  public readonly binaryUrl: string;
  public readonly argsTemplate: string[];
  public readonly scheme: string;
  public readonly hostIp: string;
  public readonly readyTimeoutSeconds: number;
  public readonly endpointPath: string;
  public readonly portEnvVar: string | null;
  public readonly timeoutSeconds: number;
  public readonly archiveExecutablePath: string | null;

  private _requestedPort: number;
  private _activeProc: ChildProcess | null = null;
  private _stopped = false;

  constructor(options: ServerSubprocessRunnerOptions) {
    this.binaryUrl = options.binaryUrl;
    this.argsTemplate = options.argsTemplate ? [...options.argsTemplate] : [];
    this._requestedPort = options.port ?? 0;
    this.scheme = options.scheme ?? "ws";
    this.hostIp = options.hostIp ?? "127.0.0.1";
    this.readyTimeoutSeconds = options.readyTimeoutSeconds ?? 15;

    let ep = options.endpointPath ?? "";
    if (ep && !ep.startsWith("/")) {
      ep = "/" + ep;
    }
    this.endpointPath = ep;

    this.portEnvVar =
      options.portEnvVar === undefined ? "PORT" : (options.portEnvVar ?? null);
    this.timeoutSeconds = options.timeoutSeconds ?? 0;
    this.archiveExecutablePath = options.archiveExecutablePath ?? null;
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Launch the server binary, wait for TCP readiness, yield `["endpoint", url]`,
   * then stream `["stdout"|"stderr", line]` tuples until the process exits.
   */
  async *stream(
    userCode: string,
    envLocals: Record<string, unknown>,
    options?: ServerSubprocessStreamOptions
  ): AsyncGenerator<[string, string], void> {
    const stdinStream = options?.stdinStream ?? null;
    let proc: ChildProcess | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      // 1) Resolve binary path (download/cache if necessary)
      const binaryPath = cacheRemoteBinary(
        this.binaryUrl,
        "server",
        this.archiveExecutablePath
      );

      // 2) Resolve port
      const port = this._requestedPort || (await findFreePort());

      // 3) Build argv
      const templated = this.argsTemplate.map((arg) =>
        arg.replace(/\{port\}/g, String(port))
      );
      const extra = userCode ? shellSplit(userCode) : [];
      const argv = [binaryPath, ...templated, ...extra];

      // 4) Launch process. Untrusted server binaries get only a minimal
      // allowlisted base env — never the parent's full environment (secrets,
      // cloud creds, API keys).
      const env: Record<string, string> = buildSubprocessBaseEnv();
      if (this.portEnvVar) {
        env[this.portEnvVar] = String(port);
      }
      const cwd = options?.workspaceDir ?? process.cwd();

      proc = spawn(argv[0], argv.slice(1), {
        cwd,
        env,
        stdio: [stdinStream !== null ? "pipe" : "ignore", "pipe", "pipe"]
      });

      this._activeProc = proc;

      // 5) Set up log reader queues
      type QueueItem =
        | { type: "line"; slot: "stdout" | "stderr"; value: string }
        | { type: "end" };

      const logQueue: QueueItem[] = [];
      let resolveLog: (() => void) | null = null;
      let endCount = 0;
      const totalStreams = 2;

      const pushLog = (item: QueueItem): void => {
        logQueue.push(item);
        if (resolveLog) {
          const r = resolveLog;
          resolveLog = null;
          r();
        }
      };

      const setupReader = (
        readable: NodeJS.ReadableStream | null,
        slot: "stdout" | "stderr"
      ): void => {
        if (!readable) {
          pushLog({ type: "end" });
          return;
        }
        let buf = "";
        // Incremental decoder so multi-byte UTF-8 characters split across
        // chunk boundaries aren't corrupted.
        const decoder = new StringDecoder("utf8");
        readable.on("data", (chunk: Buffer) => {
          buf += decoder.write(chunk);
          while (buf.includes("\n")) {
            const nlIdx = buf.indexOf("\n");
            const line = buf.substring(0, nlIdx);
            buf = buf.substring(nlIdx + 1);
            pushLog({ type: "line", slot, value: line + "\n" });
          }
        });
        readable.on("end", () => {
          buf += decoder.end();
          if (buf) {
            pushLog({
              type: "line",
              slot,
              value: buf.endsWith("\n") ? buf : buf + "\n"
            });
          }
          pushLog({ type: "end" });
        });
        readable.on("error", () => {
          pushLog({ type: "end" });
        });
      };

      setupReader(proc.stdout, "stdout");
      setupReader(proc.stderr, "stderr");

      // 6) Forward stdin if provided
      if (stdinStream !== null && proc.stdin) {
        const stdin = proc.stdin;
        void (async () => {
          try {
            for await (const data of stdinStream) {
              const chunk = data.endsWith("\n") ? data : data + "\n";
              stdin.write(chunk, "utf-8");
            }
            stdin.end();
          } catch {
            // ignore
          }
        })();
      }

      // 7) Wait for server readiness, then emit endpoint
      const ready = await waitForServerReady(
        this.hostIp,
        port,
        proc,
        this.readyTimeoutSeconds
      );
      if (!ready) {
        // Surface whatever the process printed so far — the reason it failed
        // to start is almost always sitting unflushed in the log queue.
        const captured = logQueue
          .filter(
            (i): i is { type: "line"; slot: "stdout" | "stderr"; value: string } =>
              i.type === "line"
          )
          .map((i) => i.value)
          .join("");
        throw new Error(
          `Server did not become ready on ${this.hostIp}:${port}` +
            (captured ? `\n--- server output ---\n${captured}` : "")
        );
      }

      const endpoint = `${this.scheme}://${this.hostIp}:${port}${this.endpointPath}`;
      yield ["endpoint", endpoint];

      // 8) Optional timeout watchdog
      if (this.timeoutSeconds > 0) {
        const p = proc;
        timeoutHandle = setTimeout(() => {
          killProc(p);
        }, this.timeoutSeconds * 1000);
      }

      // 9) Stream log lines until both stdout and stderr are done
      while (endCount < totalStreams) {
        if (logQueue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveLog = resolve;
          });
        }

        while (logQueue.length > 0) {
          const item = logQueue.shift()!;
          if (item.type === "end") {
            endCount++;
          } else {
            yield [item.slot, item.value];
          }
        }
      }

      // 10) Wait for process exit
      const exitCode = await new Promise<number>((resolve) => {
        if (proc!.exitCode !== null) {
          resolve(proc!.exitCode);
          return;
        }
        proc!.on("close", (code) => {
          resolve(code ?? 0);
        });
      });

      if (exitCode !== 0 && !this._stopped) {
        throw new Error(`Process exited with code ${exitCode}`);
      }
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      if (proc && proc.exitCode === null) {
        killProc(proc);
      }
      this._activeProc = null;
    }
  }

  /**
   * Cooperatively stop the running server process.
   * Safe to call multiple times.
   */
  stop(): void {
    this._stopped = true;
    const proc = this._activeProc;
    if (proc) {
      killProc(proc, 2000);
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal shell-split utility
// ---------------------------------------------------------------------------

/**
 * Split a string into shell-like tokens. Handles single/double quotes.
 * Does not handle escape sequences beyond backslash-quote inside double quotes.
 */
function shellSplit(s: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (inSingle) {
      if (c === "'") {
        inSingle = false;
      } else {
        current += c;
      }
    } else if (inDouble) {
      if (c === '"') {
        inDouble = false;
      } else if (c === "\\" && i + 1 < s.length && s[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        current += c;
      }
    } else if (c === "'") {
      inSingle = true;
    } else if (c === '"') {
      inDouble = true;
    } else if (c === " " || c === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += c;
    }

    i++;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/** @internal Exported for unit testing only. */
export { shellSplit as _shellSplit };
