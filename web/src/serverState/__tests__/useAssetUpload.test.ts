import { act } from "@testing-library/react";

const mockCreateAsset = jest.fn();

jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: {
    getState: () => ({
      createAsset: mockCreateAsset
    })
  }
}));

import { useAssetUpload } from "../useAssetUpload";

describe("useAssetUpload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const state = useAssetUpload.getState();
    useAssetUpload.setState({
      files: [],
      isUploading: false,
      overallProgress: 0,
      completed: 0
    });
  });

  describe("initial state", () => {
    it("starts with empty files", () => {
      expect(useAssetUpload.getState().files).toEqual([]);
    });

    it("starts not uploading", () => {
      expect(useAssetUpload.getState().isUploading).toBe(false);
    });

    it("starts with zero progress", () => {
      expect(useAssetUpload.getState().overallProgress).toBe(0);
    });

    it("starts with zero completed", () => {
      expect(useAssetUpload.getState().completed).toBe(0);
    });

    it("has maxConcurrentUploads set to 3", () => {
      expect(useAssetUpload.getState().maxConcurrentUploads).toBe(3);
    });
  });

  describe("uploadAsset", () => {
    it("adds a file to the queue with generated id", () => {
      const mockFile = new File(["test"], "test.txt", {
        type: "text/plain"
      });

      mockCreateAsset.mockReturnValue(
        new Promise(() => {})
      );

      act(() => {
        useAssetUpload.getState().uploadAsset({ file: mockFile });
      });

      const state = useAssetUpload.getState();
      expect(state.files).toHaveLength(1);
      expect(state.files[0].file).toBe(mockFile);
      expect(state.files[0].id).toBeDefined();
    });

    it("uses provided id when given", () => {
      const mockFile = new File(["test"], "test.txt", {
        type: "text/plain"
      });

      mockCreateAsset.mockReturnValue(
        new Promise(() => {})
      );

      act(() => {
        useAssetUpload.getState().uploadAsset({
          file: mockFile,
          id: "custom-id"
        });
      });

      expect(useAssetUpload.getState().files[0].id).toBe("custom-id");
    });

    it("triggers upload immediately", () => {
      const mockFile = new File(["test"], "test.txt", {
        type: "text/plain"
      });

      mockCreateAsset.mockReturnValue(
        new Promise(() => {})
      );

      act(() => {
        useAssetUpload.getState().uploadAsset({ file: mockFile });
      });

      expect(mockCreateAsset).toHaveBeenCalled();
    });
  });

  describe("updateStatus", () => {
    it("updates file progress and status", () => {
      const mockFile = new File(["test"], "test.txt", {
        type: "text/plain"
      });

      mockCreateAsset.mockReturnValue(
        new Promise(() => {})
      );

      act(() => {
        useAssetUpload.getState().uploadAsset({ file: mockFile });
      });

      act(() => {
        useAssetUpload.getState().updateStatus(0, 50, "uploading");
      });

      const file = useAssetUpload.getState().files[0];
      expect(file.progress).toBe(50);
      expect(file.status).toBe("uploading");
    });

    it("calculates overall progress from all files", () => {
      useAssetUpload.setState({
        files: [
          { id: "1", file: new File([""], "a.txt"), progress: 100, status: "completed" },
          { id: "2", file: new File([""], "b.txt"), progress: 0, status: "uploading" }
        ] as any
      });

      act(() => {
        useAssetUpload.getState().updateStatus(1, 50, "uploading");
      });

      expect(useAssetUpload.getState().overallProgress).toBe(75);
    });

    it("counts completed files", () => {
      useAssetUpload.setState({
        files: [
          { id: "1", file: new File([""], "a.txt"), progress: 100, status: "completed" },
          { id: "2", file: new File([""], "b.txt"), progress: 0, status: "uploading" }
        ] as any
      });

      act(() => {
        useAssetUpload.getState().updateStatus(1, 100, "completed");
      });

      expect(useAssetUpload.getState().completed).toBe(2);
    });

    it("sets isUploading to false when all files are done", () => {
      useAssetUpload.setState({
        files: [
          { id: "1", file: new File([""], "a.txt"), progress: 100, status: "completed" }
        ] as any,
        isUploading: true
      });

      act(() => {
        useAssetUpload.getState().updateStatus(0, 100, "completed");
      });

      expect(useAssetUpload.getState().isUploading).toBe(false);
    });

    it("handles error status", () => {
      useAssetUpload.setState({
        files: [
          { id: "1", file: new File([""], "a.txt"), progress: 0, status: "uploading" }
        ] as any
      });

      act(() => {
        useAssetUpload
          .getState()
          .updateStatus(0, 100, "error", "Upload failed");
      });

      const file = useAssetUpload.getState().files[0];
      expect(file.status).toBe("error");
      expect(file.error).toBe("Upload failed");
    });

    it("ignores out-of-bounds index", () => {
      useAssetUpload.setState({
        files: [
          { id: "1", file: new File([""], "a.txt"), progress: 0, status: "uploading" }
        ] as any
      });

      act(() => {
        useAssetUpload.getState().updateStatus(5, 100, "completed");
      });

      expect(useAssetUpload.getState().files[0].progress).toBe(0);
    });
  });

  describe("handleUpload", () => {
    it("clears files when all are processed", () => {
      useAssetUpload.setState({
        files: [
          { id: "1", file: new File([""], "a.txt"), progress: 100, status: "completed" }
        ] as any
      });

      act(() => {
        useAssetUpload.getState().handleUpload();
      });

      expect(useAssetUpload.getState().files).toEqual([]);
      expect(useAssetUpload.getState().isUploading).toBe(false);
    });

    it("passes workflow_id and parent_id to createAsset", () => {
      const mockFile = new File(["test"], "test.txt", {
        type: "text/plain"
      });

      mockCreateAsset.mockReturnValue(
        new Promise(() => {})
      );

      act(() => {
        useAssetUpload.getState().uploadAsset({
          file: mockFile,
          workflow_id: "wf-1",
          parent_id: "parent-1"
        });
      });

      expect(mockCreateAsset).toHaveBeenCalledWith(
        mockFile,
        "wf-1",
        "parent-1",
        expect.any(Function),
        undefined
      );
    });
  });
});
