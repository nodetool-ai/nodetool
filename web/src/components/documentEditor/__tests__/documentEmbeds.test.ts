import {
  captionFromName,
  embedForAsset,
  isEmbeddableFile,
  relativeDocumentPath
} from "../documentEmbeds";

jest.mock("../../workspaces/workspaceTreeActions", () => ({
  uploadFileToFolder: jest.fn()
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: { getState: () => ({ createAsset: jest.fn() }) }
}));

describe("relativeDocumentPath", () => {
  it("links a file beside or below the document by its relative path", () => {
    expect(relativeDocumentPath("notes/plan.md", "notes/assets/cover.png")).toBe(
      "assets/cover.png"
    );
    expect(relativeDocumentPath("plan.md", "cover.png")).toBe("cover.png");
  });

  it("climbs out of the document's folder with ..", () => {
    expect(relativeDocumentPath("a/b/plan.md", "a/media/clip.mp4")).toBe(
      "../media/clip.mp4"
    );
    expect(relativeDocumentPath("a/b/plan.md", "clip.mp4")).toBe("../../clip.mp4");
  });

  it("does not treat a same-named file as a shared folder", () => {
    expect(relativeDocumentPath("media/plan.md", "media")).toBe("../media");
  });

  it("escapes spaces and parentheses, which would end the link", () => {
    expect(relativeDocumentPath("plan.md", "assets/take (2).mp4")).toBe(
      "assets/take%20%282%29.mp4"
    );
  });

  it("links from the project root when the document is not a project file", () => {
    expect(relativeDocumentPath(null, "assets/cover.png")).toBe("/assets/cover.png");
  });
});

describe("embedForAsset", () => {
  const asset = {
    id: "0123456789abcdef0123456789abcdef",
    name: "Hero shot.png",
    project_id: "p1",
    workspace_path: "notes/assets/Hero shot.png"
  };

  it("links a file of the document's project by its relative path", () => {
    expect(embedForAsset(asset, { projectId: "p1", path: "notes/plan.md" })).toEqual({
      src: "assets/Hero%20shot.png",
      alt: "Hero shot"
    });
  });

  it("uses the asset locator for an asset of another project", () => {
    expect(embedForAsset(asset, { projectId: "p2", path: "plan.md" })).toEqual({
      src: "asset://0123456789abcdef0123456789abcdef",
      alt: "Hero shot"
    });
  });

  it("uses the asset locator for an asset outside every folder", () => {
    expect(
      embedForAsset({ ...asset, workspace_path: undefined }, { projectId: "p1", path: "plan.md" })
    ).toEqual({ src: "asset://0123456789abcdef0123456789abcdef", alt: "Hero shot" });
  });
});

describe("helpers", () => {
  it("strips the extension for a caption", () => {
    expect(captionFromName("dir/voice.over.mp3")).toBe("voice.over");
    expect(captionFromName(".env")).toBe(".env");
  });

  it("accepts media files only", () => {
    expect(isEmbeddableFile(new File([""], "a.png", { type: "image/png" }))).toBe(true);
    expect(isEmbeddableFile(new File([""], "a.webm", { type: "video/webm" }))).toBe(true);
    expect(isEmbeddableFile(new File([""], "a.wav", { type: "audio/wav" }))).toBe(true);
    expect(isEmbeddableFile(new File([""], "robot.glb", { type: "" }))).toBe(true);
    expect(isEmbeddableFile(new File([""], "a.pdf", { type: "application/pdf" }))).toBe(false);
  });
});
