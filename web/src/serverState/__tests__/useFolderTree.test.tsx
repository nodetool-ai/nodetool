import { renderHook } from "@testing-library/react";
import { useFolderTree } from "../useFolderTree";
import { useQuery } from "@tanstack/react-query";

const mockLoadFolderTree = jest.fn();
const mockFolderTree = {
  "folder-1": {
    id: "folder-1",
    name: "My Folder",
    content_type: "folder",
    children: []
  }
};

jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn((selector: any) =>
    selector({ loadFolderTree: mockLoadFolderTree })
  )
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn()
}));

describe("useFolderTree", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({ data: mockFolderTree });
  });

  it("returns folder tree with default sort order", () => {
    const { result } = renderHook(() => useFolderTree());
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["folderTree", "name"]
      })
    );
    expect(result.current.data).toEqual(mockFolderTree);
  });

  it("returns folder tree with custom sort order", () => {
    renderHook(() => useFolderTree("updated_at"));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["folderTree", "updated_at"]
      })
    );
  });

  it("calls loadFolderTree with correct sort order", async () => {
    let capturedQueryFn: any;
    mockLoadFolderTree.mockResolvedValue(mockFolderTree);
    (useQuery as jest.Mock).mockImplementation((config) => {
      capturedQueryFn = config.queryFn;
      return { data: mockFolderTree };
    });

    renderHook(() => useFolderTree("name"));
    
    await capturedQueryFn();
    expect(mockLoadFolderTree).toHaveBeenCalledWith("name");
  });
});
