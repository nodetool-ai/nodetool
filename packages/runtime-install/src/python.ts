/**
 * The Python runtime's NodeTool packages: `nodetool-core` and the checks
 * that the environment can start the Python worker.
 */
import { spawn } from "node:child_process";

import { MIN_NODETOOL_CORE_VERSION } from "@nodetool-ai/protocol/bridge-protocol";

import { fileExists } from "./fs.js";
import { errorMessage, outputLines, reportOutput, type RuntimeInstallHost } from "./host.js";
import { condaUvPath } from "./paths.js";
import { getTorchBackend, torchBackendArgs } from "./torch.js";

export const PYPI_SIMPLE_INDEX_URL = "https://pypi.org/simple";
const REQUIRED_PYTHON_PACKAGES = ["nodetool-core"] as const;

/** The installed version of a Python distribution, or null when it is missing. */
export async function getInstalledPythonPackageVersion(
  host: RuntimeInstallHost,
  pythonExecutablePath: string,
  packageName: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const proc = spawn(
      pythonExecutablePath,
      [
        "-c",
        [
          "from importlib.metadata import PackageNotFoundError, version",
          `package_name = ${JSON.stringify(packageName)}`,
          "try:",
          "    print(version(package_name))",
          "except PackageNotFoundError:",
          "    raise SystemExit(2)",
        ].join("\n"),
      ],
      { stdio: ["ignore", "pipe", "ignore"], env: host.processEnv(), windowsHide: true }
    );
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString().trim() || null);
        return;
      }
      if (code !== 2) {
        host.log(
          "error",
          `Failed to determine installed Python package version for ${packageName} at ${pythonExecutablePath} (exit ${code})`
        );
      }
      resolve(null);
    });
    proc.on("error", (error) => {
      host.log("error", `Failed to run Python package version check for ${packageName}: ${errorMessage(error)}`);
      resolve(null);
    });
  });
}

/** Whether the interpreter can import the NodeTool Python worker. */
export async function canImportNodeToolWorker(
  host: RuntimeInstallHost,
  pythonExecutablePath: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(pythonExecutablePath, ["-c", "import nodetool.worker"], {
      stdio: "ignore",
      env: host.processEnv(),
      // Prevent a console window from flashing on Windows.
      windowsHide: true,
    });
    proc.on("exit", (code) => {
      resolve(code === 0);
    });
    proc.on("error", (error) => {
      host.log("error", `Failed to run Python worker import check: ${errorMessage(error)}`);
      resolve(false);
    });
  });
}

function normalizePythonPackageName(packageName: string): string {
  const trimmed = packageName.trim();
  if (!trimmed.includes("/")) {
    return trimmed;
  }
  const [, resolvedName = ""] = trimmed.split("/", 2);
  return resolvedName || trimmed;
}

const STATUS_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/Downloading\s+([a-zA-Z0-9_-]+)/i, "Downloading"],
  [/Installing\s+([a-zA-Z0-9_-]+)/i, "Installing"],
  [/Updating\s+([a-zA-Z0-9_-]+)/i, "Updating"],
];

async function runInstallCommand(host: RuntimeInstallHost, command: readonly string[]): Promise<void> {
  const executable = command[0];
  if (!(await fileExists(executable))) {
    const message =
      `Python environment not properly installed: executable not found at ${executable}. ` +
      `This may happen if the installation was interrupted (e.g., by a macOS permission dialog). ` +
      `Please use "Reinstall environment" to set up the Python environment correctly.`;
    host.log("error", message);
    throw new Error(message);
  }

  const child = spawn(executable, command.slice(1), {
    stdio: "pipe",
    env: host.processEnv(),
    // Prevent a console window from flashing on Windows during pip operations.
    windowsHide: true,
  });
  host.log("info", `Running command: ${command.join(" ")}`);

  const onData = (data: Buffer): void => {
    for (const line of outputLines(data)) {
      reportOutput(host, line);
      // uv reports progress as "Downloading <name>" and similar lines.
      for (const [pattern, verb] of STATUS_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          host.status?.(`${verb} ${match[1]}...`);
        }
      }
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  return new Promise<void>((resolve, reject) => {
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    child.on("error", (error) => {
      if (error.message.includes("ENOENT")) {
        reject(new Error(
          `Python environment not properly installed: could not run ${executable}. ` +
          `This may happen if the installation was interrupted. ` +
          `Please use "Reinstall environment" to fix this issue.`
        ));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Install `nodetool-core` (at the bridge protocol floor) and any additional
 * packages into the Python runtime.
 *
 * Additional nodetool-* packs install unpinned: their own pyproject declares
 * the nodetool-core range they need, so uv resolves a coherent set. No
 * pre-releases: allowing them resolved httpx 1.0 dev releases, which lack
 * AsyncClient. Torch packages, when any are pulled in, come from the saved
 * PyTorch index.
 */
export async function installRequiredPythonPackages(
  host: RuntimeInstallHost,
  additionalPackages: readonly string[] = []
): Promise<void> {
  host.status?.("Installing Nodetool Python packages...");
  const corePackageSpecs = REQUIRED_PYTHON_PACKAGES.map(normalizePythonPackageName)
    .filter(Boolean)
    .map((pkg) => (pkg === "nodetool-core" ? `${pkg}>=${MIN_NODETOOL_CORE_VERSION}` : pkg));
  const additionalSpecs = additionalPackages.map(normalizePythonPackageName).filter(Boolean);
  const packageSpecs = Array.from(new Set([...corePackageSpecs, ...additionalSpecs]));

  const command = [
    condaUvPath(host.condaEnvPath(), host.platform),
    "pip",
    "install",
    "--index-url",
    PYPI_SIMPLE_INDEX_URL,
    ...torchBackendArgs(getTorchBackend(host)),
    "--system",
    ...packageSpecs,
  ];
  host.log("info", `Installing required Python packages: ${packageSpecs.join(", ")}`);
  await runInstallCommand(host, command);
}
