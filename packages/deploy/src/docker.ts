/**
 * Docker utilities for NodeTool deployment.
 *
 * Multi-tenant rule: registry auth comes from the user's secrets, written into
 * a call-scoped `DOCKER_CONFIG` dir under the context scratch dir — never the
 * host `~/.docker/config.json`. Build/push/login all run through a scoped
 * runner so the child env carries only the user's credentials.
 *
 * The single-user CLI path may call build/push without a context: in that case
 * they fall back to a minimal `execFile` against the host's ambient docker
 * config (explicitly gated by the absence of a `DockerAuth`).
 */

import { execSync, execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  DeploymentContext,
  ScopedRunner
} from "./deployment-context.js";
import { makeScopedRunner, writeScratchFile } from "./deployment-context.js";

/**
 * Promisified `child_process.execFile` — runs a command with an argument array
 * and no shell, returning `{ stdout, stderr }`.
 */
export const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Docker auth (scratch-scoped registry credentials)
// ---------------------------------------------------------------------------

/**
 * Per-call docker auth handle. Carries a scoped runner and the call-scoped
 * `DOCKER_CONFIG` directory so build/push/login never touch the host
 * `~/.docker/config.json`.
 */
export interface DockerAuth {
  /** Scoped runner bound to the user's DeploymentContext. */
  run: ScopedRunner;
  /** Absolute path to the call-scoped docker config dir (e.g. <scratch>/.docker). */
  dockerConfigDir: string;
}

/**
 * Build a {@link DockerAuth} from a context and, if registry credentials are
 * present, run `docker login` into the scratch config dir. The login password
 * is fed via stdin (`--password-stdin`) so it never appears in argv.
 *
 * @param ctx        Per-operation deployment context.
 * @param registry   Registry host (default docker.io → Docker Hub).
 * @param username   Registry username (from the DOCKER_USERNAME secret or the
 *                   deployment config). Required for login.
 * @param password   Registry password/token (from the DOCKER_PASSWORD secret).
 *                   When absent, no login is performed (e.g. anonymous pulls or
 *                   credential-helper-based registries like GCP Artifact
 *                   Registry handled elsewhere).
 */
export async function makeDockerAuth(
  ctx: DeploymentContext,
  opts: { registry?: string; username?: string; password?: string }
): Promise<DockerAuth> {
  const dockerConfigDir = path.join(ctx.scratchDir, ".docker");
  // Ensure the scratch docker config dir exists (0700) before any docker call.
  await writeScratchFile(ctx, ".docker/.keep", "");

  const run = makeScopedRunner(ctx);

  if (opts.username && opts.password) {
    const registry = opts.registry ?? "docker.io";
    const loginTarget = registry === "docker.io" ? "docker.io" : registry;
    await run(
      "docker",
      ["--config", dockerConfigDir, "login", "-u", opts.username, "--password-stdin", loginTarget],
      { env: { DOCKER_CONFIG: dockerConfigDir }, input: opts.password }
    );
  }

  return { run, dockerConfigDir };
}

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe shell inclusion (single-quote wrapping).
 */
export function shellEscape(value: string): string {
  // Equivalent to Python shlex.quote: wrap in single quotes, escape embedded
  // single quotes with '\'' technique.
  if (value === "") return "''";
  if (/[^\w@%+=:,./-]/i.test(value)) {
    return "'" + value.replace(/'/g, "'\"'\"'") + "'";
  }
  return value;
}

// ---------------------------------------------------------------------------
// Run command
// ---------------------------------------------------------------------------

/**
 * Run a command safely without shell expansion.
 *
 * @param command Shell command string to run.
 * @param captureOutput If true, capture and return output. If false, stream output.
 * @returns Captured output if captureOutput=true, empty string otherwise.
 */
export function runCommand(
  command: string,
  captureOutput: boolean = false
): string {
  try {
    const result = execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: "/bin/sh"
    });
    const output = (result ?? "").trim();
    if (captureOutput) {
      if (output) console.log(output);
      return output;
    }
    // Stream mode: print lines
    if (output) {
      for (const line of output.split("\n")) {
        console.log(line);
      }
    }
    return "";
  } catch (err: unknown) {
    const code = (err as { status?: number }).status ?? 1;
    throw new Error(`Command failed with return code ${code}: ${command}`);
  }
}

// ---------------------------------------------------------------------------
// Run command (args array – no shell)
// ---------------------------------------------------------------------------

/**
 * Run a command safely using execFileSync with an argument array (no shell).
 *
 * @param program The executable to run (e.g. "docker").
 * @param args    Array of arguments passed directly to the program.
 * @param options.captureOutput If true, capture and return stdout.
 * @returns Captured output if captureOutput=true, empty string otherwise.
 */
export function runCommandArgs(
  program: string,
  args: string[],
  options?: { captureOutput?: boolean }
): string {
  const captureOutput = options?.captureOutput ?? false;

  try {
    const result = execFileSync(program, args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    const output = (result ?? "").trim();
    if (captureOutput) {
      if (output) console.log(output);
      return output;
    }
    // Stream mode: print lines
    if (output) {
      for (const line of output.split("\n")) {
        console.log(line);
      }
    }
    return "";
  } catch (err: unknown) {
    const code = (err as { status?: number }).status ?? 1;
    throw new Error(
      `Command failed with return code ${code}: ${program} ${args.join(" ")}`
    );
  }
}

// ---------------------------------------------------------------------------
// Image naming & tagging
// ---------------------------------------------------------------------------

/**
 * Format the image name with proper registry and username prefix.
 *
 * @example
 * formatImageName("my-workflow", "myuser") // "myuser/my-workflow"
 * formatImageName("my-workflow", "myuser", "ghcr.io") // "ghcr.io/myuser/my-workflow"
 */
export function formatImageName(
  baseName: string,
  dockerUsername: string,
  registry: string = "docker.io"
): string {
  if (registry === "docker.io") {
    return `${dockerUsername}/${baseName}`;
  }
  return `${registry}/${dockerUsername}/${baseName}`;
}

/**
 * Generate a unique image tag based on current timestamp and random hash.
 *
 * @returns A unique tag in format 'YYYYMMDD-HHMMSS-abcdef'
 */
export function generateImageTag(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");

  const randomData = `${Date.now()}${process.pid}${crypto.randomBytes(8).toString("hex")}`;
  const shortHash = crypto
    .createHash("md5")
    .update(randomData)
    .digest("hex")
    .slice(0, 6);

  return `${timestamp}-${shortHash}`;
}

// ---------------------------------------------------------------------------
// Build Docker image
// ---------------------------------------------------------------------------

export interface BuildDockerImageOptions {
  imageName: string;
  tag: string;
  platform?: string;
  useCache?: boolean;
  autoPush?: boolean;
  /**
   * Per-call docker auth. When provided, build runs through the scoped runner
   * with `DOCKER_CONFIG` redirected to the scratch dir (multi-user path). When
   * omitted, build falls back to a host-env `execFile` (single-user CLI path).
   */
  auth?: DockerAuth;
}

/**
 * Build a Docker image for deployment.
 *
 * Uses the build context's project root (3 levels up from this module) and the
 * repo `Dockerfile`. The build runs with `cwd` set to the project root via the
 * exec `cwd` option — no `process.chdir`, which would race across concurrent
 * per-user operations.
 *
 * @returns true if the image was pushed to registry, false if only built locally.
 */
export async function buildDockerImage(
  options: BuildDockerImageOptions
): Promise<boolean> {
  const {
    imageName,
    tag,
    platform = "linux/amd64",
    useCache = true,
    autoPush = true,
    auth
  } = options;

  console.log("Building Docker image");
  console.log(`Platform: ${platform}`);

  // Get paths to build inputs
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  // The Dockerfile is at the project root, which is 3 levels up
  const projectRoot = path.resolve(scriptDir, "../../..");
  const deployDockerfilePath = path.join(projectRoot, "Dockerfile");

  // Create a temporary build directory
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool_build_"));
  console.log(`Using build directory: ${buildDir}`);

  // Choose how to run docker: scoped runner with scratch DOCKER_CONFIG
  // (multi-user) or a plain host-env execFile (single-user CLI fallback).
  const dockerConfigEnv: Record<string, string> | undefined = auth
    ? { DOCKER_CONFIG: auth.dockerConfigDir }
    : undefined;
  const runDocker = async (args: string[]): Promise<void> => {
    if (auth) {
      await auth.run("docker", args, {
        cwd: projectRoot,
        env: dockerConfigEnv
      });
    } else {
      await execFileAsync("docker", args, {
        cwd: projectRoot,
        maxBuffer: 64 * 1024 * 1024
      });
    }
  };

  try {
    fs.copyFileSync(deployDockerfilePath, path.join(buildDir, "Dockerfile"));

    // Build using project root as context
    const dockerfileForBuild = path.join(buildDir, "Dockerfile");
    const buildContext = projectRoot;

    let imagePushed = false;

    if (useCache) {
      console.log("Building with Docker Hub cache optimization...");

      // Ensure docker buildx builder exists
      try {
        await runDocker([
          "buildx",
          "create",
          "--use",
          "--name",
          "nodetool-builder",
          "--driver",
          "docker-container"
        ]);
      } catch {
        console.log(
          "Warning: docker buildx create failed; continuing with existing/default builder."
        );
      }

      const cacheFrom = `type=registry,ref=${imageName}:buildcache`;
      const cacheTo = `type=registry,ref=${imageName}:buildcache,mode=max`;
      const pushFlag = autoPush ? "--push" : "--load";

      const buildxArgs = [
        "buildx",
        "build",
        "-f",
        dockerfileForBuild,
        "--platform",
        platform,
        "-t",
        `${imageName}:${tag}`,
        `--cache-from=${cacheFrom}`,
        `--cache-to=${cacheTo}`,
        pushFlag,
        buildContext
      ];

      console.log(`Cache image: ${imageName}:buildcache`);

      try {
        await runDocker(buildxArgs);
        imagePushed = autoPush;
      } catch {
        console.log(
          "Cache/buildx build failed, falling back to standard docker build..."
        );
        await runDocker([
          "build",
          "-f",
          dockerfileForBuild,
          "--platform",
          platform,
          "-t",
          `${imageName}:${tag}`,
          buildContext
        ]);
        imagePushed = false;
      }
    } else {
      console.log("Building without cache optimization...");
      await runDocker([
        "build",
        "-f",
        dockerfileForBuild,
        "--platform",
        platform,
        "-t",
        `${imageName}:${tag}`,
        buildContext
      ]);
      imagePushed = false;
    }

    console.log("Docker image built successfully");
    return imagePushed;
  } finally {
    // Clean up temporary build directory
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Push to registry
// ---------------------------------------------------------------------------

/**
 * Push a Docker image to a registry.
 *
 * Registry auth comes from the scratch `DOCKER_CONFIG` (set up by
 * {@link makeDockerAuth} via `docker login --password-stdin`). No host
 * `~/.docker/config.json` is consulted. When `auth` is omitted (single-user CLI
 * path), falls back to the host's ambient docker config.
 */
export async function pushToRegistry(
  imageName: string,
  tag: string,
  registry: string = "docker.io",
  auth?: DockerAuth
): Promise<void> {
  console.log(
    `Pushing Docker image ${imageName}:${tag} to registry ${registry}...`
  );

  try {
    if (auth) {
      await auth.run("docker", ["push", `${imageName}:${tag}`], {
        env: { DOCKER_CONFIG: auth.dockerConfigDir }
      });
    } else {
      await execFileAsync("docker", ["push", `${imageName}:${tag}`], {
        maxBuffer: 64 * 1024 * 1024
      });
    }
    console.log(`Docker image ${imageName}:${tag} pushed successfully`);
  } catch {
    throw new Error(
      `Failed to push image ${imageName}:${tag}. Common issues: ` +
        `1. Check your Docker registry credentials (DOCKER_USERNAME / DOCKER_PASSWORD secrets). ` +
        `2. Verify the image name includes your username: username/image-name. ` +
        `3. Ensure you have push permissions to the repository.`
    );
  }
}

// ---------------------------------------------------------------------------
// Run Docker image
// ---------------------------------------------------------------------------

export interface RunDockerImageOptions {
  imageName: string;
  tag: string;
  hostPort: number;
  containerPort?: number;
  containerName?: string;
  env?: Record<string, string>;
  volumes?: Array<[string, string]>;
  detach?: boolean;
  gpus?: string | boolean;
  remove?: boolean;
  extraArgs?: string[];
}

/**
 * Run a Docker image and map it to a given host port.
 */
export function runDockerImage(options: RunDockerImageOptions): void {
  const {
    imageName,
    tag,
    hostPort,
    containerPort = 80,
    containerName,
    env,
    volumes,
    detach = true,
    gpus,
    remove = true,
    extraArgs
  } = options;

  const args: string[] = ["run"];

  if (remove) args.push("--rm");
  if (detach) args.push("-d");
  if (containerName) args.push("--name", containerName);

  // Port mapping
  args.push("-p", `${hostPort}:${containerPort}`);

  // Environment variables — passed as-is, no shell escaping needed
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      args.push("-e", `${key}=${String(value)}`);
    }
  }

  // Volumes
  if (volumes) {
    for (const [hostPath, containerPath] of volumes) {
      args.push("-v", `${hostPath}:${containerPath}`);
    }
  }

  // GPUs
  if (gpus) {
    const gpuArg = gpus === true ? "all" : String(gpus);
    args.push("--gpus", gpuArg);
  }

  if (extraArgs) {
    args.push(...extraArgs);
  }

  // Image reference
  args.push(`${imageName}:${tag}`);

  runCommandArgs("docker", args);
}
