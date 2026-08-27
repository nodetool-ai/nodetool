/**
 * @jest-environment node
 */
import { isTextKind, workspaceFileKind } from "../workspaceFileKind";

describe("workspaceFileKind", () => {
  it("routes media, PDF and 3D files to their viewers", () => {
    expect(workspaceFileKind("a.png")).toBe("image");
    expect(workspaceFileKind("out/a.JPEG")).toBe("image");
    expect(workspaceFileKind("a.svg")).toBe("image");
    expect(workspaceFileKind("a.mp3")).toBe("audio");
    expect(workspaceFileKind("a.mp4")).toBe("video");
    expect(workspaceFileKind("a.pdf")).toBe("pdf");
    expect(workspaceFileKind("a.glb")).toBe("model3d");
  });

  it("classifies text files by how they render", () => {
    expect(workspaceFileKind("README.md")).toBe("markdown");
    expect(workspaceFileKind("data.csv")).toBe("csv");
    expect(workspaceFileKind("data.tsv")).toBe("csv");
    expect(workspaceFileKind("main.ts")).toBe("code");
    expect(workspaceFileKind("config.json")).toBe("code");
    expect(workspaceFileKind("notes.txt")).toBe("text");
    expect(workspaceFileKind("run.log")).toBe("text");
    expect(workspaceFileKind(".gitignore")).toBe("text");
  });

  it("falls back to binary for unknown and extension-less files", () => {
    expect(workspaceFileKind("model.bin")).toBe("binary");
    expect(workspaceFileKind("archive.zip")).toBe("binary");
    expect(workspaceFileKind("LICENSE")).toBe("binary");
  });

  it("marks exactly the text-rendered kinds as text", () => {
    expect(isTextKind("markdown")).toBe(true);
    expect(isTextKind("csv")).toBe(true);
    expect(isTextKind("code")).toBe(true);
    expect(isTextKind("text")).toBe(true);
    expect(isTextKind("image")).toBe(false);
    expect(isTextKind("binary")).toBe(false);
  });
});
