import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  ProgressManager,
  type Logger,
  type ProgressUpdate,
  type TaskInfo
} from "../src/progress.js";

// ============================================================================
// Test Logger
// ============================================================================

function createTestLogger(): Logger & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (msg: string) => logs.push(msg),
    error: (msg: string) => errors.push(msg)
  };
}

// ============================================================================
// ProgressManager — basic lifecycle
// ============================================================================

describe("ProgressManager", () => {
  let logger: ReturnType<typeof createTestLogger>;
  let pm: ProgressManager;

  beforeEach(() => {
    logger = createTestLogger();
    pm = new ProgressManager(logger);
  });

  describe("start/stop", () => {
    it("stop clears all tasks", () => {
      pm.start();
      pm.addTask("op1", "Task 1", 100);
      pm.stop();
      // After stop, updating a task should be a no-op
      pm.updateTask("op1", 50);
      expect(logger.logs).toHaveLength(0);
    });

    it("stop sets started to false", () => {
      pm.start();
      pm.stop();
      // Adding a task after stop should auto-start
      const idx = pm.addTask("op1", "Task 1");
      expect(idx).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // addTask
  // --------------------------------------------------------------------------

  describe("addTask", () => {
    it("returns task index 0 for first task", () => {
      const idx = pm.addTask("op1", "First task", 100);
      expect(idx).toBe(0);
    });

    it("returns incrementing indices", () => {
      pm.addTask("op1", "First", 100);
      const idx = pm.addTask("op2", "Second", 200);
      expect(idx).toBe(1);
    });

    it("auto-starts if not started", () => {
      pm.addTask("op1", "Task");
      // Should not throw
      pm.updateTask("op1", 10);
    });

    it("does not duplicate existing task", () => {
      pm.addTask("op1", "First", 100);
      const idx = pm.addTask("op1", "Duplicate", 200);
      // Returns index of existing task (size-1 = 0)
      expect(idx).toBe(0);
    });

    it("accepts null total", () => {
      const idx = pm.addTask("op1", "Indeterminate", null);
      expect(idx).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // updateTask
  // --------------------------------------------------------------------------

  describe("updateTask", () => {
    it("logs progress bar when total is set", () => {
      pm.addTask("op1", "Downloading", 100);
      pm.updateTask("op1", 50);
      expect(logger.logs.length).toBe(1);
      expect(logger.logs[0]).toContain("50%");
      expect(logger.logs[0]).toContain("#");
      expect(logger.logs[0]).toContain("-");
    });

    it("logs just description when total is null", () => {
      pm.addTask("op1", "Working...", null);
      pm.updateTask("op1", 10);
      expect(logger.logs.length).toBe(1);
      expect(logger.logs[0]).toContain("Working...");
      expect(logger.logs[0]).not.toContain("%");
    });

    it("updates description", () => {
      pm.addTask("op1", "Old desc", null);
      pm.updateTask("op1", undefined, "New desc");
      expect(logger.logs[0]).toContain("New desc");
    });

    it("does nothing for unknown task", () => {
      pm.updateTask("nonexistent", 50);
      expect(logger.logs).toHaveLength(0);
    });

    it("logs 0% at start", () => {
      pm.addTask("op1", "Task", 100);
      pm.updateTask("op1", 0);
      expect(logger.logs[0]).toContain("0%");
    });

    it("logs 100% at completion", () => {
      pm.addTask("op1", "Task", 100);
      pm.updateTask("op1", 100);
      expect(logger.logs[0]).toContain("100%");
    });

    it("clamps to 100% when completed > total", () => {
      pm.addTask("op1", "Task", 100);
      pm.updateTask("op1", 200);
      expect(logger.logs[0]).toContain("100%");
    });

    it("does not log bar when total is 0", () => {
      pm.addTask("op1", "Task", 0);
      pm.updateTask("op1", 0);
      // total is 0, so it goes to the else branch (no bar)
      expect(logger.logs[0]).not.toContain("%");
    });
  });

  // --------------------------------------------------------------------------
  // completeTask
  // --------------------------------------------------------------------------

  describe("completeTask", () => {
    it("logs 100% bar on completion", () => {
      pm.addTask("op1", "Task", 100);
      pm.completeTask("op1");
      expect(logger.logs[0]).toContain("100%");
    });

    it("removes the task", () => {
      pm.addTask("op1", "Task", 100);
      pm.completeTask("op1");
      logger.logs.length = 0;
      pm.updateTask("op1", 50);
      expect(logger.logs).toHaveLength(0);
    });

    it("stops when last task is completed", () => {
      pm.addTask("op1", "Task", 100);
      pm.completeTask("op1");
      // After stop, adding a new task auto-starts
      const idx = pm.addTask("op2", "New");
      expect(idx).toBe(0); // size resets
    });

    it("does nothing for unknown task", () => {
      pm.completeTask("nonexistent");
      expect(logger.logs).toHaveLength(0);
    });

    it("does not log bar when total is null", () => {
      pm.addTask("op1", "Task", null);
      pm.completeTask("op1");
      expect(logger.logs).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // removeTask
  // --------------------------------------------------------------------------

  describe("removeTask", () => {
    it("removes task without logging completion", () => {
      pm.addTask("op1", "Task", 100);
      pm.removeTask("op1");
      expect(logger.logs).toHaveLength(0);
    });

    it("stops when last task is removed", () => {
      pm.addTask("op1", "Task1", 100);
      pm.addTask("op2", "Task2", 100);
      pm.removeTask("op1");
      // Not stopped yet — one task remains
      pm.updateTask("op2", 50);
      expect(logger.logs).toHaveLength(1);

      pm.removeTask("op2");
      logger.logs.length = 0;
      pm.updateTask("op2", 75);
      expect(logger.logs).toHaveLength(0);
    });

    it("handles removing non-existent task", () => {
      pm.removeTask("nonexistent");
      expect(logger.logs).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — starting
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — starting", () => {
    it("logs starting status", () => {
      pm.displayProgressUpdate({ status: "starting", message: "Initializing" });
      expect(logger.logs[0]).toBe("[starting] Initializing");
    });

    it("logs starting with empty message", () => {
      pm.displayProgressUpdate({ status: "starting" });
      expect(logger.logs[0]).toBe("[starting] ");
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — progress with files
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — progress with files", () => {
    it("creates file download task", () => {
      pm.displayProgressUpdate({
        status: "progress",
        current_file: "model.bin",
        file_progress: 1,
        total_files: 5
      });
      // Should have logged progress
      expect(logger.logs.length).toBeGreaterThan(0);
      expect(logger.logs.some((l) => l.includes("model.bin"))).toBe(true);
    });

    it("logs file without progress numbers", () => {
      pm.displayProgressUpdate({
        status: "progress",
        current_file: "data.json"
      });
      expect(logger.logs[0]).toContain("File: data.json");
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — progress with download size
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — progress with download size", () => {
    it("creates download task with MB display", () => {
      pm.displayProgressUpdate({
        status: "progress",
        downloaded_size: 5 * 1024 * 1024,
        total_size: 100 * 1024 * 1024,
        operation_id: "download_model"
      });
      expect(logger.logs.some((l) => l.includes("5.0"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("100.0"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("MB"))).toBe(true);
    });

    it("uses default operation_id 'download'", () => {
      pm.displayProgressUpdate({
        status: "progress",
        downloaded_size: 1024,
        total_size: 2048
      });
      expect(logger.logs.length).toBeGreaterThan(0);
    });

    it("includes current_file in description", () => {
      pm.displayProgressUpdate({
        status: "progress",
        downloaded_size: 1024 * 1024,
        total_size: 10 * 1024 * 1024,
        current_file: "weights.bin"
      });
      expect(logger.logs.some((l) => l.includes("weights.bin"))).toBe(true);
    });

    it("skips download task when total_size is 0", () => {
      pm.displayProgressUpdate({
        status: "progress",
        downloaded_size: 0,
        total_size: 0
      });
      // No download task created — but might log general message
      // Since there's no message and current_file is undefined, nothing logged
      expect(logger.logs).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — general progress message
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — general progress", () => {
    it("logs message when no file or size info", () => {
      pm.displayProgressUpdate({
        status: "progress",
        message: "Processing step 3 of 10"
      });
      expect(logger.logs[0]).toBe("  Processing step 3 of 10");
    });

    it("does not log empty message", () => {
      pm.displayProgressUpdate({ status: "progress" });
      expect(logger.logs).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — completed
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — completed", () => {
    it("logs completed message", () => {
      pm.displayProgressUpdate({
        status: "completed",
        message: "Download finished"
      });
      expect(logger.logs[0]).toBe("[completed] Download finished");
    });

    it("logs downloaded_files count", () => {
      pm.displayProgressUpdate({
        status: "completed",
        message: "Done",
        downloaded_files: 42
      });
      expect(logger.logs[1]).toBe("  Downloaded 42 files");
    });

    it("completes active download tasks", () => {
      pm.addTask("download_main", "Downloading main", 100);
      pm.addTask("files_model", "Files progress", 10);
      pm.addTask("other_task", "Other", 50);

      logger.logs.length = 0;
      pm.displayProgressUpdate({
        status: "completed",
        message: "All done"
      });
      // download and files_ tasks should be completed
      // other_task should remain
      pm.updateTask("download_main", 50);
      expect(
        logger.logs.filter((l) => l.includes("download_main"))
      ).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — pulling
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — pulling", () => {
    it("logs pulling layer with progress", () => {
      pm.displayProgressUpdate({
        status: "pulling layer1",
        total: 10 * 1024 * 1024,
        completed: 5 * 1024 * 1024
      });
      expect(logger.logs.some((l) => l.includes("layer1"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("MB"))).toBe(true);
    });

    it("logs pulling with digest", () => {
      pm.displayProgressUpdate({
        status: "pulling layer2",
        digest: "sha256:abcdef123456789",
        total: 20 * 1024 * 1024,
        completed: 10 * 1024 * 1024
      });
      expect(logger.logs.some((l) => l.includes("sha256:abcdef123456"))).toBe(
        true
      );
    });

    it("logs total without completed", () => {
      pm.displayProgressUpdate({
        status: "pulling layer3",
        total: 50 * 1024 * 1024
      });
      expect(logger.logs.some((l) => l.includes("50.0"))).toBe(true);
    });

    it("logs without total", () => {
      pm.displayProgressUpdate({
        status: "pulling layer4"
      });
      expect(logger.logs.some((l) => l.includes("layer4"))).toBe(true);
    });

    it("uses 'unknown' layer when status has no space", () => {
      pm.displayProgressUpdate({
        status: "pulling"
      });
      expect(logger.logs.some((l) => l.includes("unknown"))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — error
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — error", () => {
    it("logs error message and throws", () => {
      expect(() => {
        pm.displayProgressUpdate({
          status: "error",
          error: "Connection failed"
        });
      }).toThrow("Deployment failed");
      expect(logger.errors[0]).toBe("[error] Connection failed");
    });

    it("uses default error message when none provided", () => {
      expect(() => {
        pm.displayProgressUpdate({ status: "error" });
      }).toThrow("Deployment failed");
      expect(logger.errors[0]).toBe("[error] Unknown error");
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — healthy
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — healthy", () => {
    it("logs system health info", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        platform: "linux",
        python_version: "3.11.5",
        hostname: "prod-server"
      });
      expect(logger.logs).toContain("[healthy] System is healthy");
      expect(logger.logs.some((l) => l.includes("linux"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("3.11.5"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("prod-server"))).toBe(true);
    });

    it("logs memory info", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        memory: {
          available_gb: 16.5,
          total_gb: 32.0,
          used_percent: 48
        }
      });
      expect(logger.logs.some((l) => l.includes("16.5"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("32.0"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("48"))).toBe(true);
    });

    it("logs disk info", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        disk: {
          free_gb: 100.2,
          total_gb: 500.0,
          used_percent: 80
        }
      });
      expect(logger.logs.some((l) => l.includes("100.2"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("500.0"))).toBe(true);
    });

    it("logs GPU info", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        gpus: [
          { name: "NVIDIA A100", memory_used_mb: 1024, memory_total_mb: 40960 },
          { name: "NVIDIA A100", memory_used_mb: 2048, memory_total_mb: 40960 }
        ]
      });
      expect(logger.logs.some((l) => l.includes("NVIDIA A100"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("GPU 0"))).toBe(true);
      expect(logger.logs.some((l) => l.includes("GPU 1"))).toBe(true);
    });

    it("logs GPU unavailable", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        gpus: "unavailable"
      });
      expect(logger.logs.some((l) => l.includes("Not available"))).toBe(true);
    });

    it("handles missing optional health fields", () => {
      pm.displayProgressUpdate({ status: "healthy" });
      expect(logger.logs.some((l) => l.includes("Unknown"))).toBe(true);
    });

    it("handles GPU with zero total memory", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        gpus: [{ name: "GPU", memory_used_mb: 0, memory_total_mb: 0 }]
      });
      expect(logger.logs.some((l) => l.includes("0.0%"))).toBe(true);
    });

    it("handles partial memory info", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        memory: {}
      });
      expect(logger.logs.some((l) => l.includes("?"))).toBe(true);
    });

    it("handles partial disk info", () => {
      pm.displayProgressUpdate({
        status: "healthy",
        disk: {}
      });
      expect(logger.logs.some((l) => l.includes("?"))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // displayProgressUpdate — unknown status
  // --------------------------------------------------------------------------

  describe("displayProgressUpdate — unknown status", () => {
    it("logs unknown status with message", () => {
      pm.displayProgressUpdate({
        status: "custom_status",
        message: "Something happened"
      });
      expect(logger.logs[0]).toBe("[custom_status] Something happened");
    });

    it("does not log without message", () => {
      pm.displayProgressUpdate({ status: "custom_status" });
      expect(logger.logs).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Default logger
  // --------------------------------------------------------------------------

  describe("default logger", () => {
    it("uses console.log and console.error when no logger provided", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const defaultPm = new ProgressManager();
      defaultPm.displayProgressUpdate({
        status: "starting",
        message: "Hello"
      });
      expect(logSpy).toHaveBeenCalledWith("[starting] Hello");

      expect(() => {
        defaultPm.displayProgressUpdate({
          status: "error",
          error: "Oops"
        });
      }).toThrow("Deployment failed");
      expect(errorSpy).toHaveBeenCalledWith("[error] Oops");

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // renderBar (tested indirectly)
  // --------------------------------------------------------------------------

  describe("renderBar (via updateTask)", () => {
    it("renders empty bar at 0%", () => {
      pm.addTask("op1", "T", 100);
      pm.updateTask("op1", 0);
      const line = logger.logs[0];
      expect(line).toContain("[");
      expect(line).toContain("]");
      expect(line).toContain("0%");
      // All dashes
      expect(line).toMatch(/\[-{30}\]/);
    });

    it("renders full bar at 100%", () => {
      pm.addTask("op1", "T", 100);
      pm.updateTask("op1", 100);
      const line = logger.logs[0];
      expect(line).toContain("100%");
      expect(line).toMatch(/\[#{30}\]/);
    });

    it("renders half-filled bar at 50%", () => {
      pm.addTask("op1", "T", 100);
      pm.updateTask("op1", 50);
      const line = logger.logs[0];
      expect(line).toContain("50%");
      expect(line).toContain("#");
      expect(line).toContain("-");
    });

    it("renders bar at 33%", () => {
      pm.addTask("op1", "T", 300);
      pm.updateTask("op1", 100);
      const line = logger.logs[0];
      expect(line).toContain("33%");
    });

    it("clamps ratio to 100% max", () => {
      pm.addTask("op1", "T", 50);
      pm.updateTask("op1", 100);
      const line = logger.logs[0];
      expect(line).toContain("100%");
      expect(line).toMatch(/\[#{30}\]/);
    });
  });

  // --------------------------------------------------------------------------
  // Complex scenarios
  // --------------------------------------------------------------------------

  describe("complex scenarios", () => {
    it("handles multiple concurrent tasks", () => {
      pm.addTask("op1", "Task A", 100);
      pm.addTask("op2", "Task B", 200);
      pm.updateTask("op1", 50);
      pm.updateTask("op2", 100);
      expect(logger.logs).toHaveLength(2);
      expect(logger.logs[0]).toContain("Task A");
      expect(logger.logs[1]).toContain("Task B");
    });

    it("handles task lifecycle: add, update, complete", () => {
      pm.addTask("op1", "Processing", 100);
      pm.updateTask("op1", 25);
      pm.updateTask("op1", 50);
      pm.updateTask("op1", 75);
      pm.completeTask("op1");
      expect(logger.logs).toHaveLength(4); // 3 updates + 1 completion
    });

    it("handles rapid status updates", () => {
      for (let i = 0; i < 100; i++) {
        pm.displayProgressUpdate({
          status: "progress",
          message: `Step ${i}`
        });
      }
      expect(logger.logs).toHaveLength(100);
    });
  });
});
