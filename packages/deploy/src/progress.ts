/**
 * Progress management for NodeTool deployments.
 *
 * Provides a console-based progress display for deployment operations
 * including file downloads, Docker pulls, and health checks.
 */

// ============================================================================
// Types
// ============================================================================

export interface TaskInfo {
  description: string;
  total: number | null;
  completed: number;
}

export interface ProgressUpdate {
  status?: string;
  message?: string;
  current_file?: string;
  file_progress?: number;
  total_files?: number;
  downloaded_size?: number;
  total_size?: number;
  operation_id?: string;
  downloaded_files?: number;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
  platform?: string;
  python_version?: string;
  hostname?: string;
  memory?: {
    available_gb?: number;
    total_gb?: number;
    used_percent?: number;
  };
  disk?: {
    free_gb?: number;
    total_gb?: number;
    used_percent?: number;
  };
  gpus?:
    | Array<{
        name?: string;
        memory_used_mb?: number;
        memory_total_mb?: number;
      }>
    | string;
}

/** Simple interface for console output — allows swapping in a custom logger. */
export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

const defaultLogger: Logger = {
  log: (msg) => console.log(msg),
  error: (msg) => console.error(msg)
};

// ============================================================================
// Simple Progress Bar Renderer
// ============================================================================

function renderBar(completed: number, total: number, width = 30): string {
  const ratio = Math.min(completed / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const pct = (ratio * 100).toFixed(0);
  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${pct}%`;
}

// ============================================================================
// ProgressManager
// ============================================================================

/**
 * Manages progress display for deployment operations.
 *
 * Unlike the Python version which uses Rich progress bars, this uses simple
 * console output that works in any Node.js environment.
 */
export class ProgressManager {
  private readonly logger: Logger;
  private tasks: Map<string, TaskInfo> = new Map();
  private started = false;

  constructor(logger?: Logger) {
    this.logger = logger ?? defaultLogger;
  }

  /** Start the progress display. */
  start(): void {
    this.started = true;
  }

  /** Stop the progress display and clear all tasks. */
  stop(): void {
    this.tasks.clear();
    this.started = false;
  }

  /**
   * Add a new progress task.
   *
   * @returns A numeric task index (for compatibility).
   */
  addTask(
    operationId: string,
    description: string,
    total: number | null = null
  ): number {
    if (!this.started) this.start();

    if (!this.tasks.has(operationId)) {
      this.tasks.set(operationId, {
        description,
        total,
        completed: 0
      });
    }
    return this.tasks.size - 1;
  }

  /**
   * Update a progress task.
   */
  updateTask(
    operationId: string,
    completed?: number,
    description?: string
  ): void {
    const info = this.tasks.get(operationId);
    if (!info) return;

    if (completed !== undefined) {
      info.completed = completed;
    }
    if (description !== undefined) {
      info.description = description;
    }

    // Print current progress
    if (info.total !== null && info.total > 0) {
      this.logger.log(
        `  ${info.description} ${renderBar(info.completed, info.total)}`
      );
    } else {
      this.logger.log(`  ${info.description}`);
    }
  }

  /**
   * Mark a task as completed and remove it.
   */
  completeTask(operationId: string): void {
    const info = this.tasks.get(operationId);
    if (!info) return;

    if (info.total !== null && info.total > 0) {
      this.logger.log(
        `  ${info.description} ${renderBar(info.total, info.total)}`
      );
    }

    this.tasks.delete(operationId);

    if (this.tasks.size === 0) {
      this.stop();
    }
  }

  /**
   * Remove a task without completing it.
   */
  removeTask(operationId: string): void {
    this.tasks.delete(operationId);

    if (this.tasks.size === 0) {
      this.stop();
    }
  }

  /**
   * Display a progress update from a deployment operation.
   */
  displayProgressUpdate(progressUpdate: ProgressUpdate): void {
    const status = progressUpdate.status ?? "unknown";
    const message = progressUpdate.message ?? "";

    if (status === "starting") {
      this.logger.log(`[starting] ${message}`);
      return;
    }

    if (status === "progress") {
      this.handleProgressStatus(progressUpdate, message);
      return;
    }

    if (status === "completed") {
      this.logger.log(`[completed] ${message}`);

      // Complete any active download/file progress tasks
      for (const opId of Array.from(this.tasks.keys())) {
        if (opId.includes("download") || opId.startsWith("files_")) {
          this.completeTask(opId);
        }
      }

      if (progressUpdate.downloaded_files !== undefined) {
        this.logger.log(
          `  Downloaded ${progressUpdate.downloaded_files} files`
        );
      }
      return;
    }

    if (status.startsWith("pulling")) {
      this.handlePullingStatus(progressUpdate, status);
      return;
    }

    if (status === "error") {
      const error = progressUpdate.error ?? "Unknown error";
      this.logger.error(`[error] ${error}`);
      this.stop();
      throw new Error("Deployment failed");
    }

    if (status === "healthy") {
      this.handleHealthyStatus(progressUpdate);
      return;
    }

    // Unknown status — just log
    if (message) {
      this.logger.log(`[${status}] ${message}`);
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private handleProgressStatus(update: ProgressUpdate, message: string): void {
    if (update.current_file !== undefined) {
      const currentFile = update.current_file;

      if (
        update.file_progress !== undefined &&
        update.total_files !== undefined
      ) {
        const fileNum = update.file_progress;
        const totalFiles = update.total_files;
        const operationId = `files_${currentFile}`;
        const desc = `Downloading files (${fileNum}/${totalFiles}): ${currentFile}`;

        if (!this.tasks.has(operationId)) {
          this.addTask(operationId, desc, totalFiles);
        }
        this.updateTask(operationId, fileNum, desc);
      } else {
        this.logger.log(`  File: ${currentFile}`);
      }
    }

    if (
      update.downloaded_size !== undefined &&
      update.total_size !== undefined
    ) {
      const downloaded = update.downloaded_size;
      const total = update.total_size;

      if (total > 0) {
        const operationId = update.operation_id ?? "download";
        const currentFile = update.current_file ?? "";
        const downloadedMb = (downloaded / (1024 * 1024)).toFixed(1);
        const totalMb = (total / (1024 * 1024)).toFixed(1);

        let desc = "Downloading";
        if (currentFile) desc += ` ${currentFile}`;
        desc += ` (${downloadedMb}/${totalMb} MB)`;

        if (!this.tasks.has(operationId)) {
          this.addTask(operationId, desc, total);
        }
        this.updateTask(operationId, downloaded, desc);
      }
    }

    // General progress message
    if (
      update.current_file === undefined &&
      update.downloaded_size === undefined &&
      message
    ) {
      this.logger.log(`  ${message}`);
    }
  }

  private handlePullingStatus(update: ProgressUpdate, status: string): void {
    const digest = update.digest ?? "";
    const total = update.total;
    const completed = update.completed;

    const layerId = status.includes(" ")
      ? status.replace("pulling ", "")
      : "unknown";
    const operationId = `pull_${layerId}`;

    let description = `Pulling layer ${layerId}`;
    if (digest.includes("sha256:")) {
      const shortDigest = digest.split(":").pop()?.slice(0, 12) ?? "";
      description += ` (sha256:${shortDigest})`;
    }

    if (total && completed !== undefined) {
      const totalMb = (total / (1024 * 1024)).toFixed(1);
      const completedMb = (completed / (1024 * 1024)).toFixed(1);
      description += ` (${completedMb}/${totalMb} MB)`;

      if (!this.tasks.has(operationId)) {
        this.addTask(operationId, description, total);
      }
      this.updateTask(operationId, completed, description);
    } else if (total) {
      const totalMb = (total / (1024 * 1024)).toFixed(1);
      description += ` (${totalMb} MB)`;
      this.logger.log(`  ${description}`);
    } else {
      this.logger.log(`  ${description}`);
    }
  }

  private handleHealthyStatus(update: ProgressUpdate): void {
    this.logger.log("[healthy] System is healthy");
    this.logger.log(`  Platform: ${update.platform ?? "Unknown"}`);
    this.logger.log(`  Python: ${update.python_version ?? "Unknown"}`);
    this.logger.log(`  Hostname: ${update.hostname ?? "Unknown"}`);

    const memory = update.memory;
    if (memory && typeof memory === "object") {
      this.logger.log(
        `  Memory: ${memory.available_gb?.toFixed(1) ?? "?"}GB available / ${memory.total_gb?.toFixed(1) ?? "?"}GB total (${memory.used_percent ?? "?"}% used)`
      );
    }

    const disk = update.disk;
    if (disk && typeof disk === "object") {
      this.logger.log(
        `  Disk: ${disk.free_gb?.toFixed(1) ?? "?"}GB free / ${disk.total_gb?.toFixed(1) ?? "?"}GB total (${disk.used_percent ?? "?"}% used)`
      );
    }

    const gpus = update.gpus;
    if (Array.isArray(gpus) && gpus.length > 0) {
      this.logger.log("  GPUs:");
      for (let i = 0; i < gpus.length; i++) {
        const gpu = gpus[i];
        const name = gpu.name ?? "Unknown";
        const usedMb = gpu.memory_used_mb ?? 0;
        const totalMb = gpu.memory_total_mb ?? 0;
        const usedPct =
          totalMb > 0 ? ((usedMb / totalMb) * 100).toFixed(1) : "0.0";
        this.logger.log(
          `    GPU ${i}: ${name} - ${usedMb}MB/${totalMb}MB (${usedPct}% used)`
        );
      }
    } else if (gpus === "unavailable") {
      this.logger.log("  GPUs: Not available");
    }
  }
}
