/**
 * Debug bundle export module for NodeTool Electron application.
 * 
 * This module provides functionality to create debug bundles containing:
 * - Application logs (redacted for secrets)
 * - Environment information (OS, memory, GPU, etc.)
 * - Configuration information (providers, run mode)
 * - Workflow data (redacted for secrets)
 * 
 * The bundle is saved as a ZIP file to the user's Downloads or Desktop folder.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { app } from "electron";
import { logMessage, LOG_FILE } from "./logger";
import { getSystemDataPath } from "./config";
import { readSettings, readSettingsAsync } from "./settings";

// =============================================================================
// Types
// =============================================================================

export interface DebugBundleRequest {
  workflow_id?: string;
  graph?: Record<string, unknown>;
  errors?: string[];
  preferred_save?: "desktop" | "downloads";
}

export interface DebugBundleResponse {
  file_path: string;
  filename: string;
  message: string;
}

// =============================================================================
// Secret Redaction Patterns
// =============================================================================

/**
 * Secret redaction patterns - matching Python implementation
 * 
 * Note: Regex-based secret detection has inherent limitations:
 * - May miss secrets with unusual formats (false negatives)
 * - May incorrectly flag non-sensitive data (false positives)
 * - New API key formats may not be covered
 */

// Patterns that indicate a value might be a secret
const SECRET_KEY_PATTERNS = /(?:api[_-]?key|[_-]token$|^token[_-]|secret|password|credential|bearer|access[_-]?key|private[_-]?key)/i;

// Keys that should NEVER be redacted (even if they match other patterns)
const SAFE_KEY_PATTERNS = /^(?:id|_id|node_id|workflow_id|user_id|thread_id|message_id|job_id|parent_id|source_id|target_id|ref|uuid|name|type|updated_at|created_at)$/i;

// Patterns that look like actual secret values (API keys, tokens, etc.)
const SECRET_VALUE_PATTERNS = /^(?:sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{20,}|hf_[a-zA-Z0-9]{20,}|r8_[a-zA-Z0-9]{20,}|fal_[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/;

const REDACTED = "[REDACTED]";

/**
 * Recursively redact potential secrets from data structures.
 * 
 * Redacts values when:
 * - The key name suggests it's a secret (api_key, password, etc.)
 * - The value looks like a known secret pattern (OpenAI key, JWT, etc.)
 * 
 * Does NOT redact:
 * - Keys that are known safe (id, name, type, timestamps, etc.)
 */
export function redactSecrets(data: unknown, parentKey = ""): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "object" && !Array.isArray(data)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const strKey = String(key).toLowerCase();
      
      // Skip redaction for known safe keys
      if (SAFE_KEY_PATTERNS.test(strKey)) {
        result[key] = redactSecrets(value, strKey);
      }
      // Check if key name suggests a secret
      else if (SECRET_KEY_PATTERNS.test(strKey)) {
        if (value && typeof value === "string" && value.length > 0) {
          result[key] = REDACTED;
        } else {
          result[key] = value;
        }
      } else {
        result[key] = redactSecrets(value, strKey);
      }
    }
    return result;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSecrets(item, parentKey));
  }

  if (typeof data === "string") {
    // Check if string value looks like a secret (but only for specific patterns)
    if (data.length >= 20 && SECRET_VALUE_PATTERNS.test(data)) {
      return REDACTED;
    }
    return data;
  }

  return data;
}

/**
 * Redact potential secrets from log file content.
 */
export function redactLogSecrets(logContent: string): string {
  const patterns: [RegExp, string][] = [
    // Match key-value pairs like 'api_key: secret' or 'token = "secret"' and keep the key name but redact the value
    [/(api[_-]?key|token|secret|password|bearer|authorization)["'\s:=]+["']?[a-zA-Z0-9_-]{20,}["']?/gi, `$1: ${REDACTED}`],
    [/sk-[a-zA-Z0-9]{20,}/g, REDACTED], // OpenAI
    [/sk-ant-[a-zA-Z0-9-]{20,}/g, REDACTED], // Anthropic
    [/hf_[a-zA-Z0-9]{20,}/g, REDACTED], // HuggingFace
    [/r8_[a-zA-Z0-9]{20,}/g, REDACTED], // Replicate
    [/fal_[a-zA-Z0-9]{20,}/g, REDACTED], // FAL
    [/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, REDACTED], // JWT
  ];

  let result = logContent;
  for (const [pattern, replacement] of patterns) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// =============================================================================
// Directory and Path Utilities
// =============================================================================

/**
 * Get the default save directory based on user preference.
 */
function getDefaultSaveDir(preferred?: string): string {
  const home = os.homedir();
  let candidates: string[];

  if (preferred === "desktop") {
    candidates = [
      path.join(home, "Desktop"),
      path.join(home, "Downloads"),
      home,
    ];
  } else if (preferred === "downloads") {
    candidates = [
      path.join(home, "Downloads"),
      path.join(home, "Desktop"),
      home,
    ];
  } else {
    // Default to Downloads folder (more appropriate for debug bundles)
    candidates = [
      path.join(home, "Downloads"),
      path.join(home, "Desktop"),
      home,
    ];
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
        return c;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return home;
}

// =============================================================================
// Version and System Information
// =============================================================================

/**
 * Get the NodeTool version from package.json.
 */
function getNodeToolVersion(): string {
  try {
    // Try to get version from Electron app
    const version = app.getVersion();
    if (version && version !== "0.0.0") {
      return version;
    }
  } catch {
    // Fallback if app not available
  }

  // Fallback to dev timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `dev-${timestamp}`;
}

/**
 * Get GPU name if available (NVIDIA only via environment check).
 */
function getGpuName(): string | null {
  // In Electron, we don't have direct NVML access like Python does
  // We can try to get GPU info from environment or process info
  try {
    // Check for NVIDIA GPU via environment variable
    if (process.env.NVIDIA_GPU_MEMORY) {
      return "NVIDIA GPU (details via NVML not available in Electron)";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Collect environment information.
 */
function collectEnvInfo(): Record<string, unknown> {
  const totalMemoryGb = Math.round((os.totalmem() / (1024 ** 3)) * 100) / 100;
  const freeMemoryGb = Math.round((os.freemem() / (1024 ** 3)) * 100) / 100;
  const usedMemoryGb = Math.round((totalMemoryGb - freeMemoryGb) * 100) / 100;
  const memoryPercent = Math.round((usedMemoryGb / totalMemoryGb) * 100);

  // Note: Disk space info is not easily available in Node.js without platform-specific APIs
  // The Python version uses shutil.disk_usage which has no direct equivalent
  // We omit disk info here as it's not critical for debugging

  return {
    os: process.platform,
    os_version: os.release(),
    platform: `${process.platform}-${process.arch}`,
    node_version: process.versions.node,
    electron_version: process.versions.electron,
    cpu_count: os.cpus().length,
    memory_total_gb: totalMemoryGb,
    memory_used_gb: usedMemoryGb,
    memory_percent: memoryPercent,
    gpu_model: getGpuName(),
    disk_total_gb: null,
    disk_free_gb: null,
    nodetool_version: getNodeToolVersion(),
  };
}

/**
 * Check if a setting key has a value (non-empty).
 */
function hasSetting(settings: Record<string, unknown>, key: string): boolean {
  const value = settings[key];
  return Boolean(value && String(value).trim().length > 0);
}

/**
 * Collect configuration information.
 */
async function collectConfigInfo(): Promise<Record<string, unknown>> {
  const settings = await readSettingsAsync();

  // Infer run mode (best-effort) - electron is always local
  const runMode = "local";

  return {
    run_mode: runMode,
    is_production: app.isPackaged,
    storage: "file", // Electron always uses file storage
    providers: {
      openai: hasSetting(settings, "OPENAI_API_KEY"),
      anthropic: hasSetting(settings, "ANTHROPIC_API_KEY"),
      gemini: hasSetting(settings, "GEMINI_API_KEY"),
      huggingface: hasSetting(settings, "HF_TOKEN"),
      replicate: hasSetting(settings, "REPLICATE_API_TOKEN"),
      fal: hasSetting(settings, "FAL_API_KEY"),
      elevenlabs: hasSetting(settings, "ELEVENLABS_API_KEY"),
    },
  };
}

/**
 * Write README file to the bundle.
 */
function writeReadme(targetRoot: string): void {
  const text = `NodeTool Debug Bundle

Attach this ZIP when reporting a bug.

Contents:
- logs/nodetool.log (redacted)
- workflow/last-template.json (redacted)
- env/system.json
- env/config.json
`;
  fs.writeFileSync(path.join(targetRoot, "README.txt"), text, "utf-8");
}

// =============================================================================
// ZIP Creation (without external dependencies)
// =============================================================================

/**
 * Create a simple uncompressed ZIP file from a directory.
 * This implementation uses Node.js built-in modules only.
 */
function createZip(srcDir: string, zipDest: string): void {
  const files: { relativePath: string; fullPath: string }[] = [];

  // Recursively collect all files
  function collectFiles(dir: string, baseDir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        collectFiles(fullPath, baseDir);
      } else if (entry.isFile()) {
        files.push({ relativePath, fullPath });
      }
    }
  }

  collectFiles(srcDir, srcDir);

  // Create ZIP file using Node.js zlib and manual ZIP structure
  // For simplicity, we'll use a stored (uncompressed) format
  const zip = createZipArchive(files);
  fs.writeFileSync(zipDest, zip);
}

/**
 * Create a ZIP archive buffer from a list of files.
 * Uses STORE method (no compression) for simplicity.
 */
function createZipArchive(files: { relativePath: string; fullPath: string }[]): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const content = fs.readFileSync(file.fullPath);
    const filename = file.relativePath.replace(/\\/g, "/"); // Use forward slashes
    const filenameBuffer = Buffer.from(filename, "utf-8");

    // Local file header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(0, 8); // Compression method (0 = stored)
    localHeader.writeUInt16LE(0, 10); // File last modification time
    localHeader.writeUInt16LE(0, 12); // File last modification date
    localHeader.writeUInt32LE(crc32(content), 14); // CRC-32
    localHeader.writeUInt32LE(content.length, 18); // Compressed size
    localHeader.writeUInt32LE(content.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(filenameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    const localEntry = Buffer.concat([localHeader, filenameBuffer, content]);
    parts.push(localEntry);

    // Central directory entry
    const centralEntry = Buffer.alloc(46);
    centralEntry.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralEntry.writeUInt16LE(20, 4); // Version made by
    centralEntry.writeUInt16LE(20, 6); // Version needed to extract
    centralEntry.writeUInt16LE(0, 8); // General purpose bit flag
    centralEntry.writeUInt16LE(0, 10); // Compression method
    centralEntry.writeUInt16LE(0, 12); // File last modification time
    centralEntry.writeUInt16LE(0, 14); // File last modification date
    centralEntry.writeUInt32LE(crc32(content), 16); // CRC-32
    centralEntry.writeUInt32LE(content.length, 20); // Compressed size
    centralEntry.writeUInt32LE(content.length, 24); // Uncompressed size
    centralEntry.writeUInt16LE(filenameBuffer.length, 28); // File name length
    centralEntry.writeUInt16LE(0, 30); // Extra field length
    centralEntry.writeUInt16LE(0, 32); // File comment length
    centralEntry.writeUInt16LE(0, 34); // Disk number start
    centralEntry.writeUInt16LE(0, 36); // Internal file attributes
    centralEntry.writeUInt32LE(0, 38); // External file attributes
    centralEntry.writeUInt32LE(offset, 42); // Relative offset of local header

    centralDir.push(Buffer.concat([centralEntry, filenameBuffer]));
    offset += localEntry.length;
  }

  // Concatenate local entries
  const localEntries = Buffer.concat(parts);
  const centralDirBuffer = Buffer.concat(centralDir);
  const centralDirOffset = localEntries.length;

  // End of central directory record
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  endRecord.writeUInt16LE(0, 4); // Number of this disk
  endRecord.writeUInt16LE(0, 6); // Disk where central directory starts
  endRecord.writeUInt16LE(files.length, 8); // Number of central directory records on this disk
  endRecord.writeUInt16LE(files.length, 10); // Total number of central directory records
  endRecord.writeUInt32LE(centralDirBuffer.length, 12); // Size of central directory
  endRecord.writeUInt32LE(centralDirOffset, 16); // Offset of start of central directory
  endRecord.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([localEntries, centralDirBuffer, endRecord]);
}

/**
 * Calculate CRC-32 checksum.
 */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// CRC-32 lookup table (lazily initialized)
let crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crc32Table !== null) {
    return crc32Table;
  }

  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc32Table[i] = c >>> 0;
  }
  return crc32Table;
}

// =============================================================================
// Main Export Function
// =============================================================================

/**
 * Export a debug bundle containing logs, environment info, and workflow data.
 */
export async function exportDebugBundle(
  payload: DebugBundleRequest
): Promise<DebugBundleResponse> {
  logMessage("Starting debug bundle export...");

  // Create timestamp for unique naming
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // Create temporary staging directory
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), `nodetool-debug-${ts}-`));
  const logsDir = path.join(stagingDir, "logs");
  const workflowDir = path.join(stagingDir, "workflow");
  const envDir = path.join(stagingDir, "env");

  // Ensure staging directories exist
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });

  try {
    // Collect logs from system data path
    const logFilePath = LOG_FILE;
    
    if (fs.existsSync(logFilePath)) {
      try {
        const logContent = fs.readFileSync(logFilePath, "utf-8");
        if (logContent.trim()) {
          // Redact secrets from log content before saving
          const redactedLog = redactLogSecrets(logContent);
          fs.writeFileSync(path.join(logsDir, "nodetool.log"), redactedLog, "utf-8");
        } else {
          fs.writeFileSync(
            path.join(logsDir, "nodetool.log"),
            "Log file exists but is empty.",
            "utf-8"
          );
        }
      } catch (e) {
        fs.writeFileSync(
          path.join(logsDir, "nodetool.log"),
          `Could not read log file: ${e}`,
          "utf-8"
        );
      }
    } else {
      fs.writeFileSync(
        path.join(logsDir, "nodetool.log"),
        `Log file not found at ${logFilePath}`,
        "utf-8"
      );
    }

    // Workflow info -> workflow/last-template.json
    const workflowPayload: Record<string, unknown> = {};
    if (payload.graph !== undefined) {
      workflowPayload.graph = payload.graph;
    }
    if (payload.workflow_id) {
      workflowPayload.workflow_id = payload.workflow_id;
      // Note: In Electron, we can't easily fetch the workflow from the API
      // The graph should be passed from the frontend
    }
    if (payload.errors && payload.errors.length > 0) {
      workflowPayload.errors = payload.errors;
    }
    if (Object.keys(workflowPayload).length === 0) {
      workflowPayload.note = "No workflow context provided";
    }
    
    // Redact any secrets from workflow data before saving
    const redactedWorkflow = redactSecrets(workflowPayload);
    fs.writeFileSync(
      path.join(workflowDir, "last-template.json"),
      JSON.stringify(redactedWorkflow, null, 2),
      "utf-8"
    );

    // Env info -> env/system.json and env/config.json
    const systemInfo = collectEnvInfo();
    const configInfo = await collectConfigInfo();
    fs.writeFileSync(
      path.join(envDir, "system.json"),
      JSON.stringify(systemInfo, null, 2),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(envDir, "config.json"),
      JSON.stringify(configInfo, null, 2),
      "utf-8"
    );

    // Write README
    writeReadme(stagingDir);

    // Create ZIP at Desktop/Downloads
    const saveDir = getDefaultSaveDir(payload.preferred_save);
    const filename = `nodetool-debug-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.zip`;
    const zipPath = path.join(saveDir, filename);

    logMessage(`Creating debug bundle at: ${zipPath}`);
    createZip(stagingDir, zipPath);

    // Cleanup staging directory
    fs.rmSync(stagingDir, { recursive: true, force: true });

    logMessage(`Debug bundle exported successfully: ${zipPath}`);

    return {
      file_path: zipPath,
      filename,
      message: `Debug bundle saved to ${zipPath}`,
    };
  } catch (error) {
    // Cleanup staging directory on error
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
