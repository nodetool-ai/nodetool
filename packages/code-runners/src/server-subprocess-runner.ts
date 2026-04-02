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
  chmodSync,
  createWriteStream,
  renameSync,
  readdirSync,
  unlinkSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { resolve as pathResolve, join as pathJoin, sep } from "node:path";
import { getNodetoolDataDir } from "@nodetool/config";
import { get as httpGet, type IncomingMessage } from "node:http";
import { get as httpsGet } from "node:https";

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
 * Download a file from an HTTP/HTTPS URL to `destPath` using an atomic
 * write (write to `.part` file, then rename).
 */
function safeDownloadTo(destPath: string, url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const partPath = destPath + ".part";
    const dir = pathResolve(destPath, "..");
    mkdirSync(dir, { recursive: true });

    const getter = url.startsWith("https") ? httpsGet : httpGet;

    const handleResponse = (res: IncomingMessage): void => {
      // Follow redirects (3xx)
      const statusCode = res.statusCode;
      if (statusCode && statusCode >= 300 && statusCode < 400) {
        const location = res.headers["location"];
        if (location) {
          const redirectUrl = Array.isArray(location) ? location[0] : location;
          if (redirectUrl) {
            safeDownloadTo(destPath, redirectUrl).then(resolve, reject);
            return;
          }
        }
      }

      const ws = createWriteStream(partPath);
      res.pipe(ws);
      ws.on("finish", () => {
        ws.close();
        try {
          renameSync(partPath, destPath);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      ws.on("error", (e) => reject(e));
    };

    getter(url, handleResponse as (res: IncomingMessage) => void).on(
      "error",
      (e) => reject(e)
    );
  });
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
 * Performs Zip Slip prevention by checking that extracted entries stay
 * within `destDir`.
 */
function safeExtractZip(zipPath: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });

  // Use system unzip for simplicity
  execFileSync("unzip", ["-o", zipPath, "-d", destDir], {
    stdio: "ignore",
    timeout: 120_000
  });

  // Post-extraction Zip Slip check: verify no symlinks or paths escaped destDir
  const resolvedDest = pathResolve(destDir) + sep;
  const walkAndCheck = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = pathJoin(dir, entry);
      const resolved = pathResolve(full);
      if (
        !resolved.startsWith(resolvedDest) &&
        resolved !== pathResolve(destDir)
      ) {
        // Escaped destDir — remove it
        try {
          unlinkSync(full);
        } catch {
          // ignore
        }
        continue;
      }
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          walkAndCheck(full);
        }
      } catch {
        // ignore stat errors
      }
    }
  };
  walkAndCheck(destDir);
}

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
  const dst = pathJoin(binDir, name);

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
    const extractDir = pathJoin(binDir, `${name}_zip`);
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
  execFileSync("curl", ["-fsSL", "-o", partPath, url], {
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
    // If the process already died, abort
    if (proc.exitCode !== null) return false;

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

      // 4) Launch process
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>)
      };
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
        readable.on("data", (chunk: Buffer) => {
          buf += chunk.toString("utf-8");
          while (buf.includes("\n")) {
            const nlIdx = buf.indexOf("\n");
            const line = buf.substring(0, nlIdx);
            buf = buf.substring(nlIdx + 1);
            pushLog({
              type: "line",
              slot,
              value: line.endsWith("\n") ? line : line + "\n"
            });
          }
        });
        readable.on("end", () => {
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
        throw new Error(
          `Server did not become ready on ${this.hostIp}:${port}`
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
