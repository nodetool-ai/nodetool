import { execFile } from "child_process";
import { promises as fs } from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Arguments only the backend launch carries: the packaged
 * `resources/backend/server.mjs` entry and the dev launcher
 * `electron/dev-server-runner.cjs`.
 */
const BACKEND_MARKERS = [/[\\/]backend[\\/]server\.mjs\b/, /\bdev-server-runner\.cjs\b/];

/**
 * The command line of a running process, or null when it cannot be read
 * (the process exited, belongs to another user, or the platform tool failed).
 */
export async function readProcessCommandLine(pid: number): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  try {
    if (process.platform === "linux") {
      const raw = await fs.readFile(`/proc/${pid}/cmdline`, "utf8");
      return raw.split("\0").join(" ").trim() || null;
    }
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { windowsHide: true, timeout: 5000 }
      );
      return stdout.trim() || null;
    }
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="], {
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Whether `pid` is a NodeTool backend this app launched.
 *
 * A PID file outlives its process. After a crash or reboot the operating
 * system can hand the same PID to an unrelated program, so a PID read from
 * the file is only trusted after its command line names the backend entry.
 * When the command line cannot be read, the answer is false: startup must
 * never kill a process it cannot identify.
 */
export async function isNodeToolBackendProcess(pid: number): Promise<boolean> {
  const commandLine = await readProcessCommandLine(pid);
  if (commandLine === null) {
    return false;
  }
  return BACKEND_MARKERS.some((marker) => marker.test(commandLine));
}
