import { projectDirectoryId } from "@nodetool-ai/protocol";
import {
  NotAnAssetError,
  canMoveInto,
  countFilesUnder,
  createFolder,
  deleteEntry,
  isDocumentFile,
  moveEntry,
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
