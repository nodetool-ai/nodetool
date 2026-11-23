import { projectDirectoryId } from "@nodetool-ai/protocol";
import {
  NotAnAssetError,
  assetOfFile,
  canCopyInto,
  canMoveInto,
  copyEntry,
  countFilesUnder,
  createDocumentInFolder,
  createFolder,
  deleteEntry,
  isDocumentFile,
  moveEntry,
  nextAvailableCopyName,
  renameEntry
} from "../workspaceTreeActions";
import { useAssetStore } from "../../../stores/AssetStore";

const list = jest.fn();
const update = jest.fn();
const remove = jest.fn();
const recursive = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    assets: {
      list: { query: (input: unknown) => list(input) },
      recursive: { query: (input: unknown) => recursive(input) },
      update: { mutate: (input: unknown) => update(input) },
      delete: { mutate: (input: unknown) => remove(input) }
    }
  }
}));

const dir = (path: string): string => projectDirectoryId("p1", path);

describe("workspaceTreeActions", () => {
  beforeEach(() => {
    [list, update, remove, recursive].forEach((fn) => fn.mockReset());
    list.mockResolvedValue({
      assets: [
        { id: "a1", name: "clip.mov", workspace_path: "footage/clip.mov" },
        { id: "a2", name: "clip.mov", workspace_path: "footage/clip (2).mov" }
      ]
    });
  });

  it("creates a folder under the directory id of its parent", async () => {
    const create = jest.fn().mockResolvedValue({});
    const original = useAssetStore.getState().createFolder;
    useAssetStore.setState({ createFolder: create });
    await createFolder("p1", ".", "Shots");
    await createFolder("p1", "footage", "Raw");
    useAssetStore.setState({ createFolder: original });
    expect(create).toHaveBeenNthCalledWith(1, dir(""), "Shots", "p1");
    expect(create).toHaveBeenNthCalledWith(2, dir("footage"), "Raw", "p1");
  });

  it("renames a directory through its directory id", async () => {
    await renameEntry("p1", "footage", true, "Footage");
    expect(update).toHaveBeenCalledWith({ id: dir("footage"), name: "Footage" });
    expect(list).not.toHaveBeenCalled();
  });

  it("renames a file through the asset whose file it is, not by name", async () => {
    await renameEntry("p1", "footage/clip (2).mov", false, "b.mov");
    expect(list).toHaveBeenCalledWith({ project_id: "p1", parent_id: dir("footage") });
    expect(update).toHaveBeenCalledWith({ id: "a2", name: "b.mov" });
  });

  it("refuses a file no asset owns", async () => {
    await expect(deleteEntry("p1", "footage/other.txt", false)).rejects.toBeInstanceOf(
      NotAnAssetError
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes a directory through its directory id", async () => {
    await deleteEntry("p1", "footage", true);
    expect(remove).toHaveBeenCalledWith({ id: dir("footage") });
  });

  it("moves a file and a directory by parent_id, the root as the root directory id", async () => {
    await moveEntry("p1", "footage/clip.mov", false, ".");
    await moveEntry("p1", "footage", true, "archive");
    expect(update).toHaveBeenNthCalledWith(1, { id: "a1", parent_id: dir("") });
    expect(update).toHaveBeenNthCalledWith(2, { id: dir("footage"), parent_id: dir("archive") });
  });

  it("counts the files under a directory, not its subfolders", async () => {
    recursive.mockResolvedValue({
      assets: [
        { id: "d", content_type: "folder" },
        { id: "x", content_type: "video/mp4" },
        { id: "y", content_type: "image/png" }
      ]
    });
    await expect(countFilesUnder("p1", "footage")).resolves.toBe(2);
  });

  it("refuses a directory move into itself, a descendant, or where it already is", () => {
    expect(canMoveInto("footage", true, "footage")).toBe(false);
    expect(canMoveInto("footage", true, "footage/raw")).toBe(false);
    expect(canMoveInto("footage/raw", true, "footage")).toBe(false);
    expect(canMoveInto("footage-2", true, "footage")).toBe(true);
    expect(canMoveInto("footage/raw", true, ".")).toBe(true);
    expect(canMoveInto("notes.md", false, ".")).toBe(false);
  });
});

describe("isDocumentFile", () => {
  it("knows a sketch file by its .sketch.ora suffix", () => {
    expect(isDocumentFile("Sketches/Fox.sketch.ora")).toBe(true);
    expect(isDocumentFile("Sketches/Fox.ora")).toBe(false);
    expect(isDocumentFile("Sketches/Fox.sketch.json")).toBe(false);
  });
});

describe("createDocumentInFolder", () => {
  const originalCreateAsset = useAssetStore.getState().createAsset;
  const createAsset = jest.fn();

  beforeEach(() => {
    list.mockReset();
    recursive.mockReset();
    createAsset.mockReset();
    useAssetStore.setState({ createAsset });
  });

  afterEach(() => {
    useAssetStore.setState({ createAsset: originalCreateAsset });
  });

  it("creates Untitled.md in a selected subfolder when empty", async () => {
    list.mockResolvedValue({ assets: [] });
    const created = {
      id: "doc-1",
      name: "Untitled.md",
      content_type: "text/markdown"
    };
    createAsset.mockResolvedValue(created);

    const result = await createDocumentInFolder("p1", "docs/notes");

    expect(result).toBe(created);
    expect(list).toHaveBeenCalledWith({
      project_id: "p1",
      parent_id: dir("docs/notes")
    });
    expect(createAsset).toHaveBeenCalledTimes(1);
    const [file, workflowId, parentId, progress, source, projectId, directory] =
      createAsset.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("Untitled.md");
    expect(file.type).toBe("text/markdown");
    expect(workflowId).toBeUndefined();
    expect(parentId).toBe(dir("docs/notes"));
    expect(progress).toBeUndefined();
    expect(source).toBe("file");
    expect(projectId).toBe("p1");
    expect(directory).toBe("docs/notes");
  });

  it("computes Untitled 2.md / Untitled 3.md to avoid collisions in the folder", async () => {
    list.mockResolvedValue({
      assets: [
        { id: "a1", name: "Untitled.md", workspace_path: "Untitled.md" },
        { id: "a2", name: "Untitled 2.md", workspace_path: "Untitled-2.md" }
      ]
    });
    createAsset.mockResolvedValue({
      id: "doc-3",
      name: "Untitled 3.md",
      content_type: "text/markdown"
    });

    await createDocumentInFolder("p1", ".");

    const [file, , parentId, , , projectId, directory] =
      createAsset.mock.calls[0];
    expect(file.name).toBe("Untitled 3.md");
    expect(parentId).toBe(dir(""));
    expect(projectId).toBe("p1");
    expect(directory).toBe(".");
  });

  it("falls back to assets.recursive when assets.list is truncated so collisions beyond page 1 are deduplicated", async () => {
    list.mockResolvedValue({
      assets: [
        { id: "a1", name: "Untitled.md", workspace_path: "docs/Untitled.md" }
      ],
      next: "page-2"
    });
    recursive.mockResolvedValue({
      assets: [
        { id: "a1", name: "Untitled.md", workspace_path: "docs/Untitled.md" },
        { id: "a2", name: "Untitled 2.md", workspace_path: "docs/Untitled 2.md" },
        // Nested child in a subfolder must not collide with direct children of `docs`.
        {
          id: "a-nested",
          name: "Untitled 3.md",
          workspace_path: "docs/sub/Untitled 3.md"
        }
      ]
    });
    createAsset.mockResolvedValue({
      id: "doc-3",
      name: "Untitled 3.md",
      content_type: "text/markdown"
    });

    await createDocumentInFolder("p1", "docs");

    expect(recursive).toHaveBeenCalledWith({
      id: dir("docs"),
      project_id: "p1"
    });
    const [file] = createAsset.mock.calls[0];
    expect(file.name).toBe("Untitled 3.md");
  });

  it("falls back to assets.recursive when assets.list hits the 10,000-file single-page cap with next: null", async () => {
    const cappedAssets = Array.from({ length: 10_000 }, (_, i) => ({
      id: `cap-${i}`,
      name: `file-${i}.md`,
      content_type: "text/markdown",
      workspace_path: `file-${i}.md`
    }));
    list.mockResolvedValue({ assets: cappedAssets, next: null });
    recursive.mockResolvedValue({
      assets: [
        {
          id: "overflow-1",
          name: "Untitled.md",
          content_type: "text/markdown",
          workspace_path: "Untitled.md"
        }
      ]
    });
    createAsset.mockResolvedValue({
      id: "doc-2",
      name: "Untitled 2.md",
      content_type: "text/markdown"
    });

    await createDocumentInFolder("p1", ".");

    expect(recursive).toHaveBeenCalledWith({ id: dir(""), project_id: "p1" });
    const [file] = createAsset.mock.calls[0];
    expect(file.name).toBe("Untitled 2.md");
  });
});

describe("copy helpers and copyEntry", () => {
  const originalCreateAsset = useAssetStore.getState().createAsset;
  const originalCreateFolder = useAssetStore.getState().createFolder;
  const originalGet = useAssetStore.getState().get;
  const originalFetch = global.fetch;

  const createAsset = jest.fn();
  const createFolderMock = jest.fn();
  const getAsset = jest.fn();
  const fetchMock = jest.fn();

  beforeEach(() => {
    [
      list,
      recursive,
      remove,
      createAsset,
      createFolderMock,
      getAsset,
      fetchMock
    ].forEach((fn) => fn.mockReset());
    useAssetStore.setState({
      createAsset,
      createFolder: createFolderMock,
      get: getAsset
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    useAssetStore.setState({
      createAsset: originalCreateAsset,
      createFolder: originalCreateFolder,
      get: originalGet
    });
    global.fetch = originalFetch;
  });

  it("allows duplicating into the same parent while forbidding pasting a folder into itself or a descendant", () => {
    expect(canCopyInto("notes.md", false, ".")).toBe(true);
    expect(canCopyInto("footage", true, ".")).toBe(true);
    expect(canCopyInto("footage", true, "archive")).toBe(true);
    expect(canCopyInto("footage/raw", true, "footage")).toBe(true);
    expect(canCopyInto("footage-2", true, "footage")).toBe(true);
    expect(canCopyInto("footage", true, "footage")).toBe(false);
    expect(canCopyInto("footage", true, "footage/raw")).toBe(false);
  });

  it("deduplicates colliding file and folder names with copy suffixes", () => {
    expect(nextAvailableCopyName("notes.md", new Set(["other.md"]), false)).toBe(
      "notes.md"
    );
    expect(nextAvailableCopyName("notes.md", new Set(["notes.md"]), false)).toBe(
      "notes copy.md"
    );
    expect(
      nextAvailableCopyName(
        "notes.md",
        new Set(["notes.md", "notes copy.md"]),
        false
      )
    ).toBe("notes copy 2.md");
    expect(
      nextAvailableCopyName("v1.0", new Set(["v1.0"]), true)
    ).toBe("v1.0 copy");
    expect(
      nextAvailableCopyName(
        "Fox.workflow.json",
        new Set(["fox.workflow.json"]),
        false
      )
    ).toBe("Fox copy.workflow.json");
  });

  it("copies a file into the same folder with copy deduplication", async () => {
    list.mockResolvedValue({
      assets: [
        {
          id: "a-notes",
          name: "notes.md",
          content_type: "text/markdown",
          workspace_path: "notes.md"
        }
      ]
    });
    getAsset.mockResolvedValue({
      id: "a-notes",
      name: "notes.md",
      content_type: "text/markdown",
      get_url: "https://example.test/notes.md"
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["# Hello"], { type: "text/markdown" }))
    });
    createAsset.mockResolvedValue({ id: "a-copy", name: "notes copy.md" });

    await copyEntry("p1", "notes.md", false, ".");

    expect(getAsset).toHaveBeenCalledWith("a-notes");
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/notes.md");
    expect(createAsset).toHaveBeenCalledTimes(1);
    const [file, , parentId, , source, projectId, directory] =
      createAsset.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("notes copy.md");
    expect(file.type).toBe("text/markdown");
    expect(parentId).toBe(dir(""));
    expect(source).toBe("file");
    expect(projectId).toBe("p1");
    expect(directory).toBe(".");
  });

  it("throws NotAnAssetError when copying a file with no owning asset", async () => {
    list.mockResolvedValue({ assets: [] });
    await expect(copyEntry("p1", "stray.txt", false, ".")).rejects.toBeInstanceOf(
      NotAnAssetError
    );
    expect(createAsset).not.toHaveBeenCalled();
  });

  it("refuses to paste a folder into itself or a descendant", async () => {
    await expect(copyEntry("p1", "docs", true, "docs")).rejects.toThrow(
      /cannot be pasted into itself/i
    );
    await expect(copyEntry("p1", "docs", true, "docs/sub")).rejects.toThrow(
      /cannot be pasted into itself/i
    );
    expect(createFolderMock).not.toHaveBeenCalled();
    expect(recursive).not.toHaveBeenCalled();
  });

  it("recursively copies a folder, recreating subfolders and contained files with deduplicated root name", async () => {
    list.mockResolvedValue({
      assets: [
        {
          id: dir("docs"),
          name: "docs",
          content_type: "folder"
        }
      ]
    });
    recursive.mockResolvedValue({
      assets: [
        {
          id: dir("docs/nested/deep"),
          name: "deep",
          content_type: "folder"
        },
        {
          id: dir("docs/nested"),
          name: "nested",
          content_type: "folder"
        },
        {
          id: "f-root",
          name: "readme.md",
          content_type: "text/markdown",
          workspace_path: "docs/readme.md"
        },
        {
          id: "f-deep",
          name: "spec.md",
          content_type: "text/markdown",
          workspace_path: "docs/nested/deep/spec.md"
        }
      ]
    });
    getAsset.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        name: id === "f-root" ? "readme.md" : "spec.md",
        content_type: "text/markdown",
        get_url: `https://example.test/${id}.md`
      })
    );
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["content"], { type: "text/markdown" }))
    });
    createFolderMock.mockResolvedValue({});
    createAsset.mockResolvedValue({});

    await copyEntry("p1", "docs", true, ".");

    // Root copy folder first, then nested folders shallowest-first.
    expect(createFolderMock).toHaveBeenNthCalledWith(1, dir(""), "docs copy", "p1");
    expect(createFolderMock).toHaveBeenNthCalledWith(
      2,
      dir("docs copy"),
      "nested",
      "p1"
    );
    expect(createFolderMock).toHaveBeenNthCalledWith(
      3,
      dir("docs copy/nested"),
      "deep",
      "p1"
    );

    expect(createAsset).toHaveBeenCalledTimes(2);
    const [file1, , parent1, , , project1, dir1] = createAsset.mock.calls[0];
    expect(file1.name).toBe("readme.md");
    expect(parent1).toBe(dir("docs copy"));
    expect(project1).toBe("p1");
    expect(dir1).toBe("docs copy");

    const [file2, , parent2, , , project2, dir2] = createAsset.mock.calls[1];
    expect(file2.name).toBe("spec.md");
    expect(parent2).toBe(dir("docs copy/nested/deep"));
    expect(project2).toBe("p1");
    expect(dir2).toBe("docs copy/nested/deep");
  });

  it("finds assets and deduplicates copy names beyond a truncated assets.list response", async () => {
    list.mockResolvedValue({
      assets: [
        {
          id: "a-notes",
          name: "notes.md",
          content_type: "text/markdown",
          workspace_path: "notes.md"
        }
      ],
      next: "page-2"
    });
    recursive.mockResolvedValue({
      assets: [
        {
          id: "a-notes",
          name: "notes.md",
          content_type: "text/markdown",
          workspace_path: "notes.md"
        },
        {
          id: "a-notes-copy",
          name: "notes copy.md",
          content_type: "text/markdown",
          workspace_path: "notes copy.md"
        },
        {
          id: "a-target-overflow",
          name: "overflow.md",
          content_type: "text/markdown",
          workspace_path: "overflow.md"
        },
        // Nested collision in a subfolder must not affect root deduplication.
        {
          id: "a-nested-copy2",
          name: "notes copy 2.md",
          content_type: "text/markdown",
          workspace_path: "archive/notes copy 2.md"
        }
      ]
    });
    getAsset.mockResolvedValue({
      id: "a-notes",
      name: "notes.md",
      content_type: "text/markdown",
      get_url: "https://example.test/notes.md"
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["# Hello"], { type: "text/markdown" }))
    });
    createAsset.mockResolvedValue({ id: "a-copy-2", name: "notes copy 2.md" });

    const foundOverflow = await assetOfFile("p1", "overflow.md");
    expect(foundOverflow?.id).toBe("a-target-overflow");

    await copyEntry("p1", "notes.md", false, ".");

    const [file] = createAsset.mock.calls[0];
    expect(file.name).toBe("notes copy 2.md");
  });

  it("rolls back the partial destination folder and reports cleanup when a mid-copy failure occurs", async () => {
    list.mockResolvedValue({
      assets: [{ id: dir("docs"), name: "docs", content_type: "folder" }]
    });
    recursive.mockResolvedValue({
      assets: [
        {
          id: "f-1",
          name: "readme.md",
          content_type: "text/markdown",
          workspace_path: "docs/readme.md"
        },
        {
          id: "f-2",
          name: "spec.md",
          content_type: "text/markdown",
          workspace_path: "docs/nested/spec.md"
        }
      ]
    });
    getAsset.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        name: id === "f-1" ? "readme.md" : "spec.md",
        content_type: "text/markdown",
        get_url: `https://example.test/${id}.md`
      })
    );
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob(["ok"], { type: "text/markdown" }))
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500
      });
    createFolderMock.mockResolvedValue({});
    createAsset.mockResolvedValue({});
    remove.mockResolvedValue({ deleted_asset_ids: [dir("docs copy")] });

    await expect(copyEntry("p1", "docs", true, ".")).rejects.toThrow(
      'Failed to copy folder "docs" (Failed to download spec.md (500)). Partial copy was cleaned up.'
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({ id: dir("docs copy") });
  });

  it("reports the partial destination folder and already-copied files when rollback also fails", async () => {
    list.mockResolvedValue({
      assets: [{ id: dir("docs"), name: "docs", content_type: "folder" }]
    });
    recursive.mockResolvedValue({
      assets: [
        {
          id: "f-1",
          name: "readme.md",
          content_type: "text/markdown",
          workspace_path: "docs/readme.md"
        },
        {
          id: "f-2",
          name: "spec.md",
          content_type: "text/markdown",
          workspace_path: "docs/nested/spec.md"
        }
      ]
    });
    getAsset.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        name: id === "f-1" ? "readme.md" : "spec.md",
        content_type: "text/markdown",
        get_url: `https://example.test/${id}.md`
      })
    );
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["ok"], { type: "text/markdown" }))
    });
    createFolderMock.mockResolvedValue({});
    createAsset
      .mockResolvedValueOnce({ id: "copied-1" })
      .mockRejectedValueOnce(new Error("disk full"));
    remove.mockRejectedValue(new Error("permission denied"));

    await expect(copyEntry("p1", "docs", true, ".")).rejects.toThrow(
      'Failed to copy folder "docs" (disk full). Partial folder "docs copy" remains with 1/2 files copied: readme.md.'
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({ id: dir("docs copy") });
  });
});
