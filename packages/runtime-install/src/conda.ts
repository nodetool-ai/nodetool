/**
 * The conda environment every conda and Python runtime installs into. A
 * minimal environment is created on demand, and runtimes add their packages
 * to it with `installCondaPackages`.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

import { fileExists } from "./fs.js";
import { reportStatus, type RuntimeInstallHost } from "./host.js";
import { ensureMicromambaAvailable, runMicromambaCommand } from "./micromamba.js";

const CONDA_CHANNELS = ["conda-forge"];

/** Packages of a fresh environment. Runtimes install the rest on demand. */
const BOOTSTRAP_CONDA_PACKAGES = ["ca-certificates"];

function channelArgs(): string[] {
  return ["--override-channels", "--strict-channel-priority", ...CONDA_CHANNELS.flatMap((channel) => ["--channel", channel])];
}

/** Whether `envPath` holds a conda environment. */
export function condaEnvironmentExists(envPath: string): Promise<boolean> {
  return fileExists(path.join(envPath, "conda-meta"));
}

async function createEnvironment(
  host: RuntimeInstallHost,
  micromamba: string,
  destinationPrefix: string,
  packages: readonly string[]
): Promise<void> {
  reportStatus(host, "Creating conda environment with micromamba...");
  if (await fileExists(destinationPrefix)) {
    host.log("info", `Removing existing environment at ${destinationPrefix}`);
    await fs.rm(destinationPrefix, { recursive: true, force: true });
  }
  await fs.mkdir(path.dirname(destinationPrefix), { recursive: true });
  await runMicromambaCommand(
    host,
    micromamba,
    ["create", "--yes", "--prefix", destinationPrefix, ...packages, ...channelArgs()],
    "Creating Python environment"
  );
}

/**
 * Return the conda environment, creating a minimal one when it is missing.
 * `installLocation` overrides the host's location; otherwise the host may
 * choose where a new environment goes.
 */
export async function ensureCondaEnvironment(
  host: RuntimeInstallHost,
  installLocation?: string
): Promise<string> {
  let envPath = installLocation || host.condaEnvPath();
  if (await condaEnvironmentExists(envPath)) {
    return envPath;
  }
  if (!installLocation && host.chooseNewCondaEnvPath) {
    envPath = await host.chooseNewCondaEnvPath();
  }

  host.log("info", `Conda environment not found, creating at: ${envPath}`);
  reportStatus(host, "Setting up conda environment...");
  host.setCondaEnvPath(envPath);

  const micromamba = await ensureMicromambaAvailable(host);
  await createEnvironment(host, micromamba, envPath, BOOTSTRAP_CONDA_PACKAGES);

  host.log("info", "Conda environment created successfully");
  reportStatus(host, "Conda environment is ready");
  return envPath;
}

/** Install conda package specs (such as `rust>=1.77`) into an existing environment. */
export async function installCondaPackages(
  host: RuntimeInstallHost,
  envPrefix: string,
  packageSpecs: readonly string[],
  progressLabel?: string
): Promise<void> {
  if (packageSpecs.length === 0) {
    return;
  }
  const micromamba = await ensureMicromambaAvailable(host);
  host.log("info", `Installing conda packages (${packageSpecs.join(", ")}) into ${envPrefix}`);
  await runMicromambaCommand(
    host,
    micromamba,
    ["install", "--yes", "--prefix", envPrefix, ...packageSpecs, ...channelArgs()],
    progressLabel ?? `Installing ${packageSpecs.join(", ")}`
  );
}

/** Remove conda packages. Version constraints in the specs are ignored. */
export async function removeCondaPackages(
  host: RuntimeInstallHost,
  envPrefix: string,
  packageSpecs: readonly string[],
  progressLabel?: string
): Promise<void> {
  if (packageSpecs.length === 0) {
    return;
  }
  const micromamba = await ensureMicromambaAvailable(host);
  const names = packageSpecs.map((spec) => spec.split(/[><=!]/)[0]);
  host.log("info", `Removing conda packages (${names.join(", ")}) from ${envPrefix}`);
  await runMicromambaCommand(
    host,
    micromamba,
    ["remove", "--yes", "--prefix", envPrefix, ...names],
    progressLabel ?? `Removing ${names.join(", ")}`
  );
}
