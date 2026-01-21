import { act } from "@testing-library/react";
import { useFolderBatchStore, BatchFile } from "../FolderBatchStore";

describe("FolderBatchStore", () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useFolderBatchStore.getState().reset();
  });

  const createMockFiles = (count: number): BatchFile[] => {
    return Array.from({ length: count }, (_, i) => ({
      path: `/test/folder/file${i + 1}.jpg`,
      name: `file${i + 1}.jpg`,
      contentType: "image/jpeg",
      matchedType: "image",
      targetNodeId: `node-${i + 1}`,
      status: "pending" as const,
    }));
  };

  describe("initial state", () => {
    it("should have idle state initially", () => {
      const state = useFolderBatchStore.getState();
      expect(state.state).toBe("idle");
      expect(state.files).toHaveLength(0);
      expect(state.currentIndex).toBe(-1);
      expect(state.folderPath).toBeNull();
    });
  });

  describe("dialog visibility", () => {
    it("should open dialog", () => {
      act(() => {
        useFolderBatchStore.getState().openDialog();
      });
      expect(useFolderBatchStore.getState().isDialogOpen).toBe(true);
    });

    it("should close dialog", () => {
      act(() => {
        useFolderBatchStore.getState().openDialog();
        useFolderBatchStore.getState().closeDialog();
      });
      expect(useFolderBatchStore.getState().isDialogOpen).toBe(false);
    });
  });

  describe("initializeBatch", () => {
    it("should initialize batch with files", () => {
      const files = createMockFiles(3);
      const folderPath = "/test/folder";
      const workflowId = "workflow-123";

      act(() => {
        useFolderBatchStore.getState().initializeBatch(folderPath, files, workflowId);
      });

      const state = useFolderBatchStore.getState();
      expect(state.files).toHaveLength(3);
      expect(state.folderPath).toBe(folderPath);
      expect(state.workflowId).toBe(workflowId);
      expect(state.state).toBe("idle");
    });
  });

  describe("batch processing lifecycle", () => {
    it("should start batch processing", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
      });

      const state = useFolderBatchStore.getState();
      expect(state.state).toBe("running");
      expect(state.currentIndex).toBe(0);
      expect(state.startTime).not.toBeNull();
    });

    it("should not start with empty files", () => {
      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", [], "workflow-1");
        useFolderBatchStore.getState().start();
      });

      const state = useFolderBatchStore.getState();
      expect(state.state).toBe("idle");
    });

    it("should pause and resume", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
      });

      expect(useFolderBatchStore.getState().state).toBe("running");

      act(() => {
        useFolderBatchStore.getState().pause();
      });

      expect(useFolderBatchStore.getState().state).toBe("paused");
      expect(useFolderBatchStore.getState().pausedTime).not.toBeNull();

      act(() => {
        useFolderBatchStore.getState().resume();
      });

      expect(useFolderBatchStore.getState().state).toBe("running");
      expect(useFolderBatchStore.getState().pausedTime).toBeNull();
    });

    it("should stop processing", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().stop();
      });

      expect(useFolderBatchStore.getState().state).toBe("stopped");
    });
  });

  describe("file status updates", () => {
    it("should mark file as started", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().markFileStarted(0);
      });

      expect(useFolderBatchStore.getState().files[0].status).toBe("running");
    });

    it("should mark file as completed", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().markFileCompleted(0, 1000);
      });

      const file = useFolderBatchStore.getState().files[0];
      expect(file.status).toBe("completed");
      expect(file.processingTime).toBe(1000);
    });

    it("should mark file as failed", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().markFileFailed(0, "Test error");
      });

      const file = useFolderBatchStore.getState().files[0];
      expect(file.status).toBe("failed");
      expect(file.error).toBe("Test error");
    });

    it("should mark file as skipped", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().markFileSkipped(0);
      });

      expect(useFolderBatchStore.getState().files[0].status).toBe("skipped");
    });
  });

  describe("nextFile", () => {
    it("should move to next file", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
      });

      expect(useFolderBatchStore.getState().currentIndex).toBe(0);

      act(() => {
        useFolderBatchStore.getState().nextFile();
      });

      expect(useFolderBatchStore.getState().currentIndex).toBe(1);
    });

    it("should complete when reaching end of files", () => {
      const files = createMockFiles(2);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().nextFile();
        useFolderBatchStore.getState().nextFile();
      });

      expect(useFolderBatchStore.getState().state).toBe("completed");
    });
  });

  describe("computed getters", () => {
    it("should calculate completed count", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().markFileCompleted(0, 100);
        useFolderBatchStore.getState().markFileCompleted(1, 100);
      });

      expect(useFolderBatchStore.getState().getCompletedCount()).toBe(2);
    });

    it("should calculate failed count", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().markFileFailed(0, "Error");
      });

      expect(useFolderBatchStore.getState().getFailedCount()).toBe(1);
    });

    it("should calculate progress", () => {
      const files = createMockFiles(4);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().markFileCompleted(0, 100);
        useFolderBatchStore.getState().markFileFailed(1, "Error");
      });

      expect(useFolderBatchStore.getState().getProgress()).toBe(50);
    });

    it("should return 0 progress for empty files", () => {
      expect(useFolderBatchStore.getState().getProgress()).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset to initial state", () => {
      const files = createMockFiles(3);

      act(() => {
        useFolderBatchStore.getState().initializeBatch("/test", files, "workflow-1");
        useFolderBatchStore.getState().start();
        useFolderBatchStore.getState().reset();
      });

      const state = useFolderBatchStore.getState();
      expect(state.state).toBe("idle");
      expect(state.files).toHaveLength(0);
      expect(state.currentIndex).toBe(-1);
      expect(state.folderPath).toBeNull();
      expect(state.workflowId).toBeNull();
    });
  });
});
