/**
 * Docker utilities for NodeTool deployment.
 *
 * This module contains all Docker-related functionality for building, pushing,
 * and managing Docker images for NodeTool deployments.
 */

import { execSync, execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Promisified `child_process.execFile` — runs a command with an argument array
 * and no shell, returning `{ stdout, stderr }`.
 */
export const execFileAsync = promisify(execFile);

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
// Docker authentication
// ---------------------------------------------------------------------------

/**
 * Check if user is authenticated with the Docker registry.
 */
export function checkDockerAuth(_registry: string = "docker.io"): boolean {
  try {
    execSync("docker system info --format '{{.RegistryConfig.IndexConfigs}}'", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return true;
  } catch {
    try {
      execSync("docker login --get-login", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Ensure user is authenticated with Docker registry.
 * Note: interactive login prompt is not supported in this TS port;
 * the function will throw if not authenticated.
 */
export function ensureDockerAuth(registry: string = "docker.io"): void {
  if (!checkDockerAuth(registry)) {
    throw new Error(
      `Not authenticated with Docker registry: ${registry}. Please run 'docker login' manually and try again.`
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
}

/**
 * Build a Docker image for deployment.
 *
 * @returns true if the image was pushed to registry, false if only built locally.
 */
export function buildDockerImage(options: BuildDockerImageOptions): boolean {
  const {
    imageName,
    tag,
    platform = "linux/amd64",
    useCache = true,
    autoPush = true
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

  try {
    fs.copyFileSync(deployDockerfilePath, path.join(buildDir, "Dockerfile"));

    // Build using project root as context
    const dockerfileForBuild = path.join(buildDir, "Dockerfile");
    const buildContext = projectRoot;

    const originalDir = process.cwd();
    process.chdir(projectRoot);
    let imagePushed = false;

    try {
      if (useCache) {
        console.log("Building with Docker Hub cache optimization...");

        // Ensure docker buildx builder exists
        try {
          runCommandArgs("docker", [
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
          runCommandArgs("docker", buildxArgs);
          imagePushed = autoPush;
        } catch {
          console.log(
            "Cache/buildx build failed, falling back to standard docker build..."
          );
          runCommandArgs("docker", [
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
        runCommandArgs("docker", [
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
    } finally {
      process.chdir(originalDir);
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
 * Push Docker image to a registry with proper authentication checks.
 */
export function pushToRegistry(
  imageName: string,
  tag: string,
  registry: string = "docker.io"
): void {
  console.log(
    `Pushing Docker image ${imageName}:${tag} to registry ${registry}...`
  );

  ensureDockerAuth(registry);

  try {
    runCommandArgs("docker", ["push", `${imageName}:${tag}`]);
    console.log(`Docker image ${imageName}:${tag} pushed successfully`);
  } catch {
    throw new Error(
      `Failed to push image ${imageName}:${tag}. Common issues: ` +
        `1. Check your Docker registry authentication: docker login. ` +
        `2. Verify the image name includes your username: username/image-name. ` +
        `3. Ensure you have push permissions to the repository.`
    );
  }
}

// ---------------------------------------------------------------------------
// Get Docker username from config
// ---------------------------------------------------------------------------

/**
 * Get Docker username from Docker's configuration file.
 */
export function getDockerUsernameFromConfig(
  registry: string = "docker.io"
): string | null {
  try {
    const dockerConfigPath = path.join(os.homedir(), ".docker", "config.json");

    if (!fs.existsSync(dockerConfigPath)) {
      return null;
    }

    const config = JSON.parse(fs.readFileSync(dockerConfigPath, "utf-8")) as {
      auths?: Record<string, { username?: string; auth?: string }>;
      credHelpers?: Record<string, string>;
    };

    const auths = config.auths ?? {};

    const possibleRegistryKeys = [
      registry,
      `https://${registry}/v1/`,
      registry === "docker.io"
        ? "https://index.docker.io/v1/"
        : `https://${registry}/v1/`,
      registry === "docker.io" ? "index.docker.io" : registry
    ];

    for (const regKey of possibleRegistryKeys) {
      const authData = auths[regKey];
      if (!authData) continue;

      if (authData.username) {
        return authData.username;
      }

      if (authData.auth) {
        try {
          const decoded = Buffer.from(authData.auth, "base64").toString(
            "utf-8"
          );
          const [username] = decoded.split(":", 2);
          return username;
        } catch {
          continue;
        }
      }
    }

    return null;
  } catch (err) {
    console.warn(`Warning: Could not read Docker config: ${err}`);
    return null;
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
