import {
  folderEntryPath,
  isReservedProjectEntry,
  isSketchAssetFolder,
  revealLabelKey
} from "../projectFolderPaths";

describe("isSketchAssetFolder", () => {
  const sketch = { name: "Fox.sketch.json", is_dir: false };
  const folder = { name: "Fox.sketch", is_dir: true };

  it("hides the image folder of a sketch file beside it", () => {
    expect(isSketchAssetFolder(folder, [sketch, folder])).toBe(true);
  });

  it("keeps a .sketch folder with no sketch file, and every file", () => {
    expect(isSketchAssetFolder(folder, [folder])).toBe(false);
    expect(isSketchAssetFolder(sketch, [sketch, folder])).toBe(false);
  });
});

describe("isReservedProjectEntry", () => {
  it("reserves .nodetool at the folder root only", () => {
    expect(isReservedProjectEntry({ path: ".nodetool" })).toBe(true);
    expect(isReservedProjectEntry({ path: "footage/.nodetool" })).toBe(false);
    expect(isReservedProjectEntry({ path: ".nodetool-notes.md" })).toBe(false);
  });
});

describe("folderEntryPath", () => {
  it("joins with the separator of the folder path", () => {
    expect(folderEntryPath("/home/me/Film", "Generated/fox.png")).toBe(
      "/home/me/Film/Generated/fox.png"
    );
    expect(folderEntryPath("C:\\Users\\me\\Film", "Generated/fox.png")).toBe(
      "C:\\Users\\me\\Film\\Generated\\fox.png"
    );
  });

  it("names the folder itself for the root entry", () => {
    expect(folderEntryPath("/home/me/Film/", "")).toBe("/home/me/Film");
    expect(folderEntryPath("/home/me/Film", ".")).toBe("/home/me/Film");
  });
});

describe("revealLabelKey", () => {
  it("names the file manager of each platform", () => {
    expect(revealLabelKey("finder")).toBe("projectFolder.tree.revealInFinder");
    expect(revealLabelKey("explorer")).toBe(
      "projectFolder.tree.revealInExplorer"
    );
    expect(revealLabelKey("files")).toBe(
      "projectFolder.tree.revealInFileManager"
    );
  });
});
