import { renderHook } from "@testing-library/react";
import { useFolderTree } from "../useFolderTree";
import { useQuery } from "@tanstack/react-query";
import { asMock } from "../../test-utils/doubles";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

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
  useAssetStore: jest.fn(
    (selector: (state: { loadFolderTree: typeof mockLoadFolderTree }) => unknown) =>
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
    asMock(useQuery).mockReturnValue({ data: mockFolderTree });
    useWorkspaceTabsStore.setState({
      activeProjectId: null,
      personalProjectId: null
    });
  });

  it("lists the Personal project's folders when no project is open", () => {
    // The Assets panel creates folders in Personal when no project is open,
    // so the folder picker must read the same project.
    useWorkspaceTabsStore.setState({
      activeProjectId: null,
      personalProjectId: "personal:1"
    });
    renderHook(() => useFolderTree());
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["folderTree", "name", "personal:1"]
      })
    );
  });

  it("returns folder tree with default sort order", () => {
    const { result } = renderHook(() => useFolderTree());
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["folderTree", "name", "default"]
      })
    );
    expect(result.current.data).toEqual(mockFolderTree);
  });

  it("returns folder tree with custom sort order", () => {
    renderHook(() => useFolderTree("updated_at"));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["folderTree", "updated_at", "default"]
      })
    );
  });

  it("calls loadFolderTree with correct sort order", async () => {
    let capturedQueryFn: (() => Promise<unknown>) | undefined;
    mockLoadFolderTree.mockResolvedValue(mockFolderTree);
    asMock(useQuery).mockImplementation((config) => {
      capturedQueryFn = config.queryFn;
      return { data: mockFolderTree };
    });

    renderHook(() => useFolderTree("name"));
    
    await capturedQueryFn?.();
    expect(mockLoadFolderTree).toHaveBeenCalledWith("name", "default");
  });
});
