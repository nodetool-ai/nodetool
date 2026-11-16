/**
 * Folders of the asset browser inside a project: directory folder ids and the
 * directory each asset sits in (project folders PRD T3, T8).
 */
import { describe, expect, it } from "vitest";
import {
  ProjectDirectoryResolver,
  directoryFolderId,
  folderNameAsDirectory,
  isWithinDirectory,
  listsByDirectory,
  parseProjectDirectoryId,
  projectDirectoryId,
  withAncestorDirectories,
  type LegacyFolder
} from "../src/project-directories.js";

const PROJECT = "personal:u1";

function resolver(folders: LegacyFolder[] = []): ProjectDirectoryResolver {
  return new ProjectDirectoryResolver(
    PROJECT,
    new Map(folders.map((folder) => [folder.id, folder]))
  );
}

describe("directory folder ids", () => {
  it("round-trip a project id and a path that hold colons, slashes and spaces", () => {
    const id = projectDirectoryId(PROJECT, "footage/day 1:a");
    expect(id.startsWith("dir:")).toBe(true);
    expect(parseProjectDirectoryId(id)).toEqual({
      projectId: PROJECT,
      path: "footage/day 1:a"
    });
  });

  it("are not confused with asset ids or malformed ids", () => {
    expect(parseProjectDirectoryId("0123456789abcdef0123456789abcdef")).toBeNull();
    expect(parseProjectDirectoryId("dir:")).toBeNull();
    expect(parseProjectDirectoryId("dir::Shots")).toBeNull();
    expect(parseProjectDirectoryId("dir:p:%E0%A4%A")).toBeNull();
    expect(parseProjectDirectoryId(null)).toBeNull();
  });

  it("name the home folder for the project root", () => {
    expect(directoryFolderId("u1", PROJECT, "")).toBe("u1");
    expect(directoryFolderId("u1", PROJECT, "Shots")).toBe(
      projectDirectoryId(PROJECT, "Shots")
    );
  });

  it("apply to every project but the loose bucket and the view across projects", () => {
    expect(listsByDirectory(PROJECT)).toBe(true);
    expect(listsByDirectory("default")).toBe(false);
    expect(listsByDirectory(undefined)).toBe(false);
  });
});

describe("the directory an asset sits in", () => {
  it("is the directory of its file", () => {
    expect(
      resolver().directoryOf({
        id: "a",
        parent_id: "u1",
        workspace_path: "footage/day1/shot.png"
      })
    ).toBe("footage/day1");
    expect(
      resolver().directoryOf({ id: "a", parent_id: null, workspace_path: "fox.png" })
    ).toBe("");
  });

  it("follows the parent_id chain of an asset with no file in the folder yet", () => {
    const folders: LegacyFolder[] = [
      { id: "f1", name: "Old", parent_id: "u1" },
      { id: "f2", name: "a/b", parent_id: "f1" }
    ];
    expect(
      resolver(folders).directoryOf({ id: "a", parent_id: "f2", workspace_path: null })
    ).toBe("Old/a-b");
  });

  it("reads a directory id parent, and ignores one of another project", () => {
    const own = projectDirectoryId(PROJECT, "Shots/Wide");
    const foreign = projectDirectoryId("other", "Shots");
    expect(resolver().directoryOf({ id: "a", parent_id: own })).toBe("Shots/Wide");
    expect(resolver().directoryOf({ id: "a", parent_id: foreign })).toBe("");
    // A legacy folder filed under a directory id keeps its name below it.
    const folders: LegacyFolder[] = [{ id: "f1", name: "Sub", parent_id: own }];
    expect(resolver(folders).directoryOf({ id: "a", parent_id: "f1" })).toBe(
      "Shots/Wide/Sub"
    );
  });

  it("ends a parent cycle at the root instead of looping", () => {
    const folders: LegacyFolder[] = [
      { id: "f1", name: "A", parent_id: "f2" },
      { id: "f2", name: "B", parent_id: "f1" }
    ];
    expect(resolver(folders).directoryOf({ id: "a", parent_id: "f1" })).toMatch(
      /^(A|B)(\/(A|B))*$/
    );
  });

  it("puts an unknown parent at the root", () => {
    expect(resolver().directoryOf({ id: "a", parent_id: "gone" })).toBe("");
  });
});

describe("directory helpers", () => {
  it("lists each directory with its ancestors once, sorted", () => {
    expect(withAncestorDirectories(["a/b/c", "a/b", "d", ""])).toEqual([
      "a",
      "a/b",
      "a/b/c",
      "d"
    ]);
  });

  it("tells a directory's own contents from a sibling with a longer name", () => {
    expect(isWithinDirectory("Shots/a", "Shots")).toBe(true);
    expect(isWithinDirectory("Shots", "Shots")).toBe(true);
    expect(isWithinDirectory("Shots2", "Shots")).toBe(false);
    expect(isWithinDirectory("anything", "")).toBe(true);
  });

  it("turns any folder name into one path segment", () => {
    expect(folderNameAsDirectory(" a/b\\c ")).toBe("a-b-c");
    expect(folderNameAsDirectory("..")).toBe("_");
    expect(folderNameAsDirectory("")).toBe("_");
  });
});
