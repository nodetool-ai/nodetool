import os from "os";
import path from "path";
import { promises as fs, constants as fsConstants, createReadStream } from "fs";
import gunzip from "gunzip-maybe";
import tar from "tar-fs";
import StreamZip from "node-stream-zip";

import { logMessage } from "./logger";
import { emitBootMessage, emitUpdateProgress } from "./events";
import { downloadFile } from "./download";
import { checkPermissions, fileExists } from "./utils";
import { getCondaEnvPath } from "./config";

function getCondaBinDir(): string {
  const base = getCondaEnvPath();
  return process.platform === "win32"
    ? path.join(base, "Scripts")
    : path.join(base, "bin");
}

function getCondaOllamaPath(): string {
  const binDir = getCondaBinDir();
  return process.platform === "win32"
    ? path.join(binDir, "ollama.exe")
    : path.join(binDir, "ollama");
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findSystemOllama(): Promise<string | null> {
  const candidates: string[] = [];

  if (process.platform === "darwin") {
    candidates.push("/usr/local/bin/ollama", "/opt/homebrew/bin/ollama");
  } else if (process.platform === "linux") {
    candidates.push("/usr/bin/ollama", "/usr/local/bin/ollama");
  } else if (process.platform === "win32") {
    const programFiles = process.env["ProgramFiles"] || "C\\\\Program Files";
    candidates.push(path.join(programFiles, "Ollama", "ollama.exe"));

    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) {
      candidates.push(
        path.join(localAppData, "Programs", "Ollama", "ollama.exe")
      );
    }
  }

  const pathEnv = process.env["PATH"];
  if (pathEnv) {
    const delimiter = path.delimiter;
    for (const dir of pathEnv.split(delimiter)) {
      if (!dir) continue;
      candidates.push(
        path.join(dir, process.platform === "win32" ? "ollama.exe" : "ollama")
      );
    }
  }

  for (const p of candidates) {
    if (await fileExists(p)) {
      if (process.platform === "win32" || (await isExecutable(p))) {
        return p;
      }
    }
  }
  return null;
}

function getLatestOllamaAssetUrl(): { url: string; kind: "zip" | "tgz" } {
  const arch = os.arch();
  if (process.platform === "darwin") {
    return {
      // Official latest release download alias
      url: "https://github.com/ollama/ollama/releases/latest/download/ollama-darwin.tgz",
      kind: "tgz",
    };
  }
  if (process.platform === "linux") {
    if (arch === "arm64" || arch === "aarch64") {
      return {
        url: "https://github.com/ollama/ollama/releases/latest/download/ollama-linux-arm64.tgz",
        kind: "tgz",
      };
    }
    return {
      url: "https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tgz",
      kind: "tgz",
    };
  }
  // Windows
  if (arch === "arm64") {
    return {
      url: "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-arm64.zip",
      kind: "zip",
    };
  }
  return {
    url: "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip",
    kind: "zip",
  };
}

async function extractTgz(sourcePath: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let lastUpdate = startTime;
    let processedBytes = 0;

    const stream = createReadStream(sourcePath, { highWaterMark: 64 * 1024 })
      .on("data", (chunk: Buffer) => {
        processedBytes += chunk.length;
        const now = Date.now();
        if (now - lastUpdate >= 1000) {
          emitUpdateProgress("ollama", 0, "Extracting", "...");
          lastUpdate = now;
        }
      })
      .pipe(gunzip())
      .pipe(tar.extract(destPath));
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function extractZip(sourcePath: string, destPath: string): Promise<void> {
  const zip = new StreamZip.async({ file: sourcePath });
  try {
    await zip.extract(null, destPath);
  } finally {
    await zip.close();
  }
}

async function findOllamaBinary(rootDir: string): Promise<string | null> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findOllamaBinary(fullPath);
      if (nested) return nested;
    } else {
      const base = path.basename(fullPath).toLowerCase();
      if (base === "ollama" || base === "ollama.exe") {
        return fullPath;
      }
    }
  }
  return null;
}

export async function ensureOllamaInstalled(): Promise<string> {
  // 1. Prefer a working ollama inside the conda env
  const condaOllama = getCondaOllamaPath();
  if (await fileExists(condaOllama)) {
    logMessage(`Using Ollama from conda env: ${condaOllama}`);
    return condaOllama;
  }

  // 2. Fall back to system locations
  const systemPath = await findSystemOllama();
  if (systemPath) {
    logMessage(`Using system Ollama at: ${systemPath}`);
    return systemPath;
  }

  // 3. Download and install into conda env
  const { url, kind } = getLatestOllamaAssetUrl();
  const tmpDir = path.join(os.tmpdir(), `ollama-download-${Date.now()}`);
  const archiveName = path.basename(url);
  const archivePath = path.join(tmpDir, archiveName);
  const extractDir = path.join(tmpDir, "extracted");

  emitBootMessage("Downloading Ollama runtime...");
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(extractDir, { recursive: true });

  const { accessible, error } = await checkPermissions(tmpDir, fsConstants.W_OK);
  if (!accessible) {
    throw new Error(`No permission to write temp dir: ${error}`);
  }

  logMessage(`Downloading Ollama asset from ${url} to ${archivePath}`);
  await downloadFile(url, archivePath);

  emitBootMessage("Installing Ollama into environment...");
  if (kind === "tgz") {
    await extractTgz(archivePath, extractDir);
  } else {
    await extractZip(archivePath, extractDir);
  }

  const foundBinary = await findOllamaBinary(extractDir);
  if (!foundBinary) {
    throw new Error("Failed to locate 'ollama' binary in the downloaded archive");
  }

  const condaBin = getCondaBinDir();
  await fs.mkdir(condaBin, { recursive: true });
  const targetPath = getCondaOllamaPath();
  await fs.copyFile(foundBinary, targetPath);
  if (process.platform !== "win32") {
    await fs.chmod(targetPath, 0o755);
  }

  // Cleanup best-effort
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }

  logMessage(`Installed Ollama to ${targetPath}`);
  return targetPath;
}

export async function isOllamaResponsive(
  port: number,
  timeoutMs = 2000
): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tags`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}


