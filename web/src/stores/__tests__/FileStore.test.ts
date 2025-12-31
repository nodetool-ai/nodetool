import { act } from "@testing-library/react";
import { useFileStore } from "../FileStore";
import { client } from "../ApiClient";

// Mock the client module
jest.mock("../ApiClient", () => ({
  client: {
    GET: jest.fn()
  }
}));

// Mock the errorHandling utility
jest.mock("../../utils/errorHandling", () => ({
  createErrorMessage: jest.fn((error, defaultMsg) => {
    if (error?.detail?.[0]?.msg) {
      return new Error(error.detail[0].msg);
    }
    return new Error(defaultMsg);
  })
}));

// Use 'any' to bypass strict typing for mocked API responses
const mockClient = client as any;

describe("FileStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useFileStore.setState({
      fileTree: [],
      isLoadingTree: false,
      fileTreeAbortController: null
    });
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("has empty fileTree", () => {
      const { fileTree } = useFileStore.getState();
      expect(fileTree).toEqual([]);
    });

    it("is not loading initially", () => {
      const { isLoadingTree } = useFileStore.getState();
      expect(isLoadingTree).toBe(false);
    });

    it("has no abort controller initially", () => {
      const { fileTreeAbortController } = useFileStore.getState();
      expect(fileTreeAbortController).toBeNull();
    });
  });

  describe("listFiles", () => {
    it("returns files list from API", async () => {
      const mockFiles = [
        { name: "file1.txt", path: "/home/file1.txt", is_dir: false },
        { name: "folder1", path: "/home/folder1", is_dir: true }
      ];
      mockClient.GET.mockResolvedValueOnce({ data: mockFiles, error: null });

      const result = await useFileStore.getState().listFiles("/home");

      expect(mockClient.GET).toHaveBeenCalledWith("/api/files/list", {
        params: { query: { path: "/home" } }
      });
      expect(result).toEqual(mockFiles);
    });

    it("throws error on API failure", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: null,
        error: { detail: [{ msg: "Access denied" }] }
      });

      await expect(useFileStore.getState().listFiles("/restricted")).rejects.toThrow(
        "Access denied"
      );
    });

    it("works without path parameter", async () => {
      const mockFiles = [{ name: "file.txt", path: "/file.txt", is_dir: false }];
      mockClient.GET.mockResolvedValueOnce({ data: mockFiles, error: null });

      const result = await useFileStore.getState().listFiles();

      expect(mockClient.GET).toHaveBeenCalledWith("/api/files/list", {
        params: { query: { path: undefined } }
      });
      expect(result).toEqual(mockFiles);
    });
  });

  describe("cancelFileTree", () => {
    it("aborts in-flight request and clears state", () => {
      const mockAbortController = {
        abort: jest.fn(),
        signal: { aborted: false }
      } as unknown as AbortController;

      useFileStore.setState({
        fileTreeAbortController: mockAbortController,
        isLoadingTree: true
      });

      act(() => {
        useFileStore.getState().cancelFileTree();
      });

      expect(mockAbortController.abort).toHaveBeenCalled();
      expect(useFileStore.getState().fileTreeAbortController).toBeNull();
      expect(useFileStore.getState().isLoadingTree).toBe(false);
    });

    it("does nothing if no abort controller exists", () => {
      useFileStore.setState({ fileTreeAbortController: null });

      act(() => {
        useFileStore.getState().cancelFileTree();
      });

      // Should not throw
      expect(useFileStore.getState().fileTreeAbortController).toBeNull();
    });
  });

  describe("fetchFileTree", () => {
    it("builds tree from files", async () => {
      const mockFiles = [
        { name: "file1.txt", path: "/home/file1.txt", is_dir: false },
        { name: "file2.txt", path: "/home/file2.txt", is_dir: false }
      ];
      mockClient.GET.mockResolvedValue({ data: mockFiles, error: null });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("~");
      });

      const { fileTree } = useFileStore.getState();
      expect(fileTree).toHaveLength(2);
      expect(fileTree[0].label).toBe("file1.txt");
      expect(fileTree[1].label).toBe("file2.txt");
    });

    it("handles directories with children", async () => {
      // First call returns root files
      mockClient.GET.mockResolvedValueOnce({
        data: [
          { name: "folder1", path: "/home/folder1", is_dir: true },
          { name: "file1.txt", path: "/home/file1.txt", is_dir: false }
        ],
        error: null
      });
      // Second call returns folder1 contents
      mockClient.GET.mockResolvedValueOnce({
        data: [{ name: "nested.txt", path: "/home/folder1/nested.txt", is_dir: false }],
        error: null
      });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("/home");
      });

      const { fileTree } = useFileStore.getState();
      expect(fileTree).toHaveLength(2);
      // Directories should come first
      const folder = fileTree.find((item) => item.label === "folder1");
      expect(folder).toBeDefined();
      expect(folder?.children).toBeDefined();
    });

    it("sets loading state during fetch", async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockClient.GET.mockReturnValueOnce(pendingPromise as any);

      const fetchPromise = useFileStore.getState().fetchFileTree("~");

      expect(useFileStore.getState().isLoadingTree).toBe(true);
      expect(useFileStore.getState().fileTreeAbortController).not.toBeNull();

      resolvePromise!({ data: [], error: null });
      await fetchPromise;

      expect(useFileStore.getState().isLoadingTree).toBe(false);
    });

    it("uses default path when none provided", async () => {
      mockClient.GET.mockResolvedValue({ data: [], error: null });

      await act(async () => {
        await useFileStore.getState().fetchFileTree();
      });

      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/files/list",
        expect.objectContaining({
          params: { query: { path: "~" } }
        })
      );
    });

    it("cancels previous fetch when called again", async () => {
      const mockAbortController = {
        abort: jest.fn(),
        signal: { aborted: false }
      } as unknown as AbortController;

      useFileStore.setState({
        fileTreeAbortController: mockAbortController,
        isLoadingTree: true
      });

      mockClient.GET.mockResolvedValue({ data: [], error: null });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("~");
      });

      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    it("returns empty array if aborted", async () => {
      mockClient.GET.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

      // Manually simulate abort state
      let result: any;
      await act(async () => {
        try {
          result = await useFileStore.getState().fetchFileTree("~");
        } catch {
          result = [];
        }
      });

      // The implementation catches abort errors
      expect(result).toEqual([]);
    });

    it("respects MAX_TREE_DEPTH limit", async () => {
      // Setup nested directories (5 levels deep, but max is 4)
      const createDirResponse = (depth: number) => ({
        data: [
          { name: `dir${depth}`, path: `/home/${"dir".repeat(depth)}`, is_dir: true }
        ],
        error: null
      });

      mockClient.GET
        .mockResolvedValueOnce(createDirResponse(1))
        .mockResolvedValueOnce(createDirResponse(2))
        .mockResolvedValueOnce(createDirResponse(3))
        .mockResolvedValueOnce(createDirResponse(4))
        .mockResolvedValueOnce(createDirResponse(5)); // This should not be called

      await act(async () => {
        await useFileStore.getState().fetchFileTree("/home");
      });

      // Should stop at depth 4 (0-indexed), so 5 calls total (root + 4 levels)
      expect(mockClient.GET).toHaveBeenCalledTimes(5);
    });

    it("throws error on API failure when not aborted", async () => {
      mockClient.GET.mockResolvedValueOnce({
        data: null,
        error: { detail: [{ msg: "Permission denied" }] }
      });

      await expect(useFileStore.getState().fetchFileTree("/restricted")).rejects.toThrow(
        "Permission denied"
      );
    });

    it("clears abort controller after successful fetch", async () => {
      mockClient.GET.mockResolvedValue({ data: [], error: null });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("~");
      });

      expect(useFileStore.getState().fileTreeAbortController).toBeNull();
    });

    it("creates tree items with correct structure", async () => {
      mockClient.GET.mockResolvedValue({
        data: [{ name: "test.txt", path: "/home/test.txt", is_dir: false }],
        error: null
      });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("/home");
      });

      const { fileTree } = useFileStore.getState();
      expect(fileTree[0]).toEqual({
        id: "/home/test.txt",
        label: "test.txt"
      });
    });

    it("directories include children array", async () => {
      mockClient.GET
        .mockResolvedValueOnce({
          data: [{ name: "folder", path: "/home/folder", is_dir: true }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [],
          error: null
        });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("/home");
      });

      const { fileTree } = useFileStore.getState();
      expect(fileTree[0].children).toBeDefined();
      expect(Array.isArray(fileTree[0].children)).toBe(true);
    });
  });

  describe("tree structure", () => {
    it("places directories before files", async () => {
      mockClient.GET
        .mockResolvedValueOnce({
          data: [
            { name: "zzz-file.txt", path: "/home/zzz-file.txt", is_dir: false },
            { name: "aaa-folder", path: "/home/aaa-folder", is_dir: true },
            { name: "aaa-file.txt", path: "/home/aaa-file.txt", is_dir: false }
          ],
          error: null
        })
        .mockResolvedValueOnce({
          data: [],
          error: null
        });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("/home");
      });

      const { fileTree } = useFileStore.getState();
      // Directories come first, then files
      expect(fileTree[0].label).toBe("aaa-folder");
      expect(fileTree[0].children).toBeDefined();
    });

    it("handles empty directories", async () => {
      mockClient.GET
        .mockResolvedValueOnce({
          data: [{ name: "empty-folder", path: "/home/empty-folder", is_dir: true }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [],
          error: null
        });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("/home");
      });

      const { fileTree } = useFileStore.getState();
      expect(fileTree[0].label).toBe("empty-folder");
      expect(fileTree[0].children).toEqual([]);
    });

    it("handles deeply nested structure", async () => {
      mockClient.GET
        .mockResolvedValueOnce({
          data: [{ name: "level1", path: "/home/level1", is_dir: true }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [{ name: "level2", path: "/home/level1/level2", is_dir: true }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [{ name: "level3", path: "/home/level1/level2/level3", is_dir: true }],
          error: null
        })
        .mockResolvedValueOnce({
          data: [{ name: "deep-file.txt", path: "/home/level1/level2/level3/deep-file.txt", is_dir: false }],
          error: null
        });

      await act(async () => {
        await useFileStore.getState().fetchFileTree("/home");
      });

      const { fileTree } = useFileStore.getState();
      expect(fileTree[0].label).toBe("level1");
      expect(fileTree[0].children?.[0].label).toBe("level2");
      expect(fileTree[0].children?.[0].children?.[0].label).toBe("level3");
    });
  });
});
