import { renderHook, waitFor, act } from "@testing-library/react";
import { useCollectionDragAndDrop } from "../useCollectionDragAndDrop";

jest.mock("../stores/ApiClient", () => ({
  client: {
    POST: jest.fn()
  }
}));

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useCallback: jest.fn((fn, deps) => fn)
}));

describe("useCollectionDragAndDrop", () => {
  let mockQueryClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryClient = {
      invalidateQueries: jest.fn()
    };
    
    require("react").useCallback.mockImplementation((fn) => fn);
  });

  it("initializes with null dragOverCollection", () => {
    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    expect(result.current.dragOverCollection).toBeNull();
  });

  it("initializes with null indexProgress", () => {
    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    expect(result.current.indexProgress).toBeNull();
  });

  it("initializes with empty indexErrors", () => {
    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    expect(result.current.indexErrors).toEqual([]);
  });

  it("returns all required functions", () => {
    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    expect(typeof result.current.handleDrop).toBe("function");
    expect(typeof result.current.handleDragOver).toBe("function");
    expect(typeof result.current.handleDragLeave).toBe("function");
    expect(typeof result.current.setIndexErrors).toBe("function");
  });

  it("handleDragOver sets dragOverCollection", () => {
    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const mockEvent = {
      preventDefault: jest.fn()
    };

    act(() => {
      result.current.handleDragOver(mockEvent as any, "my-collection");
    });

    expect(result.current.dragOverCollection).toBe("my-collection");
  });

  it("handleDragLeave clears dragOverCollection", () => {
    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const mockEvent = {
      preventDefault: jest.fn()
    };

    act(() => {
      result.current.handleDragOver(mockEvent as any, "my-collection");
    });

    expect(result.current.dragOverCollection).toBe("my-collection");

    act(() => {
      result.current.handleDragLeave(mockEvent as any);
    });

    expect(result.current.dragOverCollection).toBeNull();
  });

  it("setIndexErrors updates errors", () => {
    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const errors = [{ file: "test.txt", error: "Failed" }];

    act(() => {
      result.current.setIndexErrors(errors);
    });

    expect(result.current.indexErrors).toEqual(errors);
  });

  it("handleDrop clears dragOverCollection", async () => {
    const mockClient = require("../stores/ApiClient").client;
    mockClient.POST.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: []
      }
    };

    await act(async () => {
      await result.current.handleDrop("my-collection")(mockEvent as any);
    });

    expect(result.current.dragOverCollection).toBeNull();
  });

  it("handleDrop processes files successfully", async () => {
    const mockClient = require("../stores/ApiClient").client;
    mockClient.POST.mockResolvedValue({ 
      data: { path: "test.txt" }, 
      error: null 
    });

    const mockFile = new File(["content"], "test.txt", { type: "text/plain" });

    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: [mockFile]
      }
    };

    await act(async () => {
      await result.current.handleDrop("my-collection")(mockEvent as any);
    });

    expect(result.current.indexProgress).toBeNull();
    expect(result.current.indexErrors).toEqual([]);
  });

  it("handleDrop records errors for failed uploads", async () => {
    const mockClient = require("../stores/ApiClient").client;
    mockClient.POST.mockResolvedValue({ 
      data: null, 
      error: { detail: [{ msg: "File too large", loc: [], type: "size_error" }] } 
    });

    const mockFile = new File(["content"], "large.txt", { type: "text/plain" });

    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: [mockFile]
      }
    };

    await act(async () => {
      await result.current.handleDrop("my-collection")(mockEvent as any);
    });

    expect(result.current.indexErrors).toHaveLength(1);
    expect(result.current.indexErrors[0].file).toBe("large.txt");
    expect(result.current.indexErrors[0].error).toBe("File too large");
  });

  it("handleDrop handles multiple files with mixed results", async () => {
    const mockClient = require("../stores/ApiClient").client;
    mockClient.POST
      .mockResolvedValueOnce({ data: { path: "file1.txt" }, error: null })
      .mockResolvedValueOnce({ 
        data: null, 
        error: { detail: [{ msg: "Error", loc: [], type: "error" }] } 
      })
      .mockResolvedValueOnce({ data: { path: "file3.txt" }, error: null });

    const createMockFile = (name: string) => 
      new File(["content"], name, { type: "text/plain" });

    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: [
          createMockFile("file1.txt"),
          createMockFile("file2.txt"),
          createMockFile("file3.txt")
        ]
      }
    };

    await act(async () => {
      await result.current.handleDrop("my-collection")(mockEvent as any);
    });

    expect(result.current.indexErrors).toHaveLength(1);
    expect(result.current.indexErrors[0].file).toBe("file2.txt");
  });

  it("handleDrop clears previous errors before processing", async () => {
    const mockClient = require("../stores/ApiClient").client;
    mockClient.POST.mockResolvedValue({ data: { path: "test.txt" }, error: null });

    const { result } = renderHook(() => useCollectionDragAndDrop(), {
      wrapper: ({ children }) => {
        const React = require("react");
        const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
        const queryClient = new QueryClient();
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      }
    });

    const mockFile = new File(["content"], "test.txt", { type: "text/plain" });

    const mockEvent = {
      preventDefault: jest.fn(),
      dataTransfer: {
        files: [mockFile]
      }
    };

    act(() => {
      result.current.setIndexErrors([{ file: "old.txt", error: "Old error" }]);
    });

    expect(result.current.indexErrors).toHaveLength(1);

    await act(async () => {
      await result.current.handleDrop("my-collection")(mockEvent as any);
    });

    expect(result.current.indexErrors).toEqual([]);
  });
});
