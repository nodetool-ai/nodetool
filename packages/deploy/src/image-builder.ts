/**
 * Docker image builder for NodeTool.
 *
 * Generates Dockerfiles from an ImageBuildSpec and runs `docker build`.
 * Layer ordering is designed for optimal Docker cache utilization:
 * base → apt → python install → pip → copy server → copy web UI → entrypoint.
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import type { ImageBuildSpec } from "./image-spec.js";

const execFile = promisify(execFileCb);

// ============================================================================
// Dockerfile Generation
// ============================================================================

/**
 * Generate a complete Dockerfile from an image build spec.
 *
 * The generated Dockerfile follows a layered approach for cache efficiency:
 * 1. Base image (node:20-slim or nvidia/cuda if CUDA is set)
 * 2. System packages via apt-get (if any)
 * 3. Python installation (if python section present)
 * 4. pip packages (if any)
 * 5. Copy Node.js server bundle
 * 6. Copy web UI build (if mode is fullstack)
 * 7. Entrypoint
 */
export function generateDockerfile(spec: ImageBuildSpec): string {
  // --- Validate package names against shell injection ---
  const SAFE_APT_PKG = /^[a-z0-9.+-]+$/;
  const SAFE_PIP_PKG = /^[a-zA-Z0-9._[\]~=<>!,+-]+$/;
  for (const pkg of spec.apt_packages) {
    if (!SAFE_APT_PKG.test(pkg))
      throw new Error(`Invalid apt package name: ${pkg}`);
  }
  if (spec.python) {
    for (const pkg of spec.python.packages) {
      if (!SAFE_PIP_PKG.test(pkg))
        throw new Error(`Invalid pip package name: ${pkg}`);
    }
    if (!/^https?:\/\//.test(spec.python.index_url)) {
      throw new Error(
        `Invalid index URL (must start with http:// or https://): ${spec.python.index_url}`
      );
    }
    for (const url of spec.python.extra_index_urls) {
      if (!/^https?:\/\//.test(url)) {
        throw new Error(
          `Invalid extra index URL (must start with http:// or https://): ${url}`
        );
      }
    }
  }

  const lines: string[] = [];

  // --- Base image ---
  if (spec.cuda) {
    // CUDA tags require 3-part versions (e.g. 12.1.0, not 12.1)
    const cudaVersion =
      spec.cuda.split(".").length === 2 ? `${spec.cuda}.0` : spec.cuda;
    lines.push(`FROM nvidia/cuda:${cudaVersion}-runtime-ubuntu22.04`);
  } else {
    lines.push("FROM node:20-slim");
  }
  lines.push("");

  // --- Add deadsnakes PPA for non-default Python versions ---
  if (spec.python) {
    lines.push(
      "RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common \\"
    );
    lines.push("    && add-apt-repository ppa:deadsnakes/ppa \\");
    lines.push("    && apt-get update && rm -rf /var/lib/apt/lists/*");
    lines.push("");
  }

  // --- Collect apt packages ---
  const aptPackages = [...spec.apt_packages];
  if (spec.python) {
    aptPackages.push(
      `python${spec.python.version}`,
      `python${spec.python.version}-venv`
    );
  }
  if (spec.cuda) {
    // Need curl for nodesource setup
    if (!aptPackages.includes("curl")) {
      aptPackages.push("curl");
    }
  }

  // --- apt-get install ---
  if (aptPackages.length > 0) {
    lines.push(
      "RUN apt-get update && apt-get install -y --no-install-recommends \\"
    );
    lines.push(`    ${aptPackages.join(" ")} \\`);
    lines.push("    && rm -rf /var/lib/apt/lists/*");
    lines.push("");
  }

  // --- Install Node.js on CUDA base (which lacks Node) ---
  if (spec.cuda) {
    lines.push("# Install Node.js");
    lines.push(
      "RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\"
    );
    lines.push("    && apt-get install -y --no-install-recommends nodejs \\");
    lines.push("    && rm -rf /var/lib/apt/lists/*");
    lines.push("");
  }

  // --- Create Python venv (ensures pip targets the correct interpreter) ---
  if (spec.python) {
    lines.push(`RUN python${spec.python.version} -m venv /opt/venv`);
    lines.push('ENV PATH="/opt/venv/bin:$PATH"');
    lines.push("");
  }

  // --- pip install ---
  if (spec.python && spec.python.packages.length > 0) {
    const pipArgs = ["pip install --no-cache-dir"];
    pipArgs.push(`--index-url "${spec.python.index_url}"`);
    for (const url of spec.python.extra_index_urls) {
      pipArgs.push(`--extra-index-url "${url}"`);
    }
    pipArgs.push(spec.python.packages.join(" "));

    lines.push(`RUN ${pipArgs.join(" \\\n    ")}`);
    lines.push("");
  }

  // --- Copy server bundle ---
  lines.push("WORKDIR /app");
  lines.push("COPY server/ .");

  // --- Copy web UI (fullstack only) ---
  if (spec.mode === "fullstack") {
    lines.push("COPY web/build/ ./public/");
  }

  // --- Expose and entrypoint ---
  lines.push("EXPOSE 7777");
  lines.push('CMD ["node", "server.js"]');
  lines.push("");

  return lines.join("\n");
}

// ============================================================================
// Image Building
// ============================================================================

/**
 * Build a Docker image from an image build spec.
 *
 * Generates a Dockerfile in the context directory, runs `docker build`,
 * and cleans up the generated Dockerfile afterwards.
 *
 * @param spec - The image build specification.
 * @param tag - Docker image tag (e.g. "nodetool:latest").
 * @param opts.contextDir - Build context directory. Defaults to current directory.
 */
export async function buildImage(
  spec: ImageBuildSpec,
  tag: string,
  opts?: { contextDir?: string }
): Promise<void> {
  const contextDir = opts?.contextDir ?? process.cwd();
  const dockerfile = generateDockerfile(spec);
  const dockerfilePath = path.join(contextDir, "Dockerfile.nodetool");

  try {
    await fs.writeFile(dockerfilePath, dockerfile, "utf-8");

    await execFile("docker", ["build", "-f", dockerfilePath, "-t", tag, "."], {
      cwd: contextDir,
      maxBuffer: 50 * 1024 * 1024 // 50 MB
    });
  } finally {
    try {
      await fs.unlink(dockerfilePath);
    } catch {
      // ignore cleanup errors
    }
  }
}
