import { serializeDragData } from "../../../lib/dragdrop/serialization";
import { embedsFromDrag } from "../DocumentEmbedDropPlugin";

const mockGet = jest.fn();
const mockAssetOfFile = jest.fn();
const mockDocumentByFile = jest.fn();

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: { getState: () => ({ get: mockGet, createAsset: jest.fn() }) }
}));
jest.mock("../../workspaces/workspaceTreeActions", () => ({
  assetOfFile: (projectId: string, path: string) => mockAssetOfFile(projectId, path),
  isDocumentFile: (path: string) => path.endsWith(".timeline.json") || path.endsWith(".script.json"),
  uploadFileToFolder: jest.fn()
}));
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    projects: {
      documentByFile: { query: (input: unknown) => mockDocumentByFile(input) }
    }
  }
}));

/** A DataTransfer stand-in: jsdom has none. */
class FakeDataTransfer {
  private data = new Map<string, string>();
  get types(): string[] {
    return [...this.data.keys()];
  }
  setData(type: string, value: string): void {
    this.data.set(type, value);
  }
  getData(type: string): string {
    return this.data.get(type) ?? "";
  }
}

const transfer = () => new FakeDataTransfer() as unknown as DataTransfer;
const location = { projectId: "p1", path: "notes/plan.md" };
const ASSET = {
  id: "0123456789abcdef0123456789abcdef",
  name: "cover.png",
  project_id: "p1",
  workspace_path: "notes/assets/cover.png",
  content_type: "image/png"
};

beforeEach(() => jest.clearAllMocks());

describe("embedsFromDrag", () => {
  it("embeds an asset dragged from the asset panel", async () => {
    const data = transfer();
    serializeDragData({ type: "asset", payload: ASSET as never }, data);
    await expect(embedsFromDrag(data, location)).resolves.toEqual([
      { src: "assets/cover.png", alt: "cover" }
    ]);
  });

  it("embeds every asset of a multiple selection", async () => {
    mockGet.mockImplementation(async (id: string) => ({
      ...ASSET,
      id,
      project_id: "other",
      name: `${id}.mp4`
    }));
    const data = transfer();
    serializeDragData({ type: "assets-multiple", payload: ["a1", "a2"] }, data);
    await expect(embedsFromDrag(data, location)).resolves.toEqual([
      { src: "asset://a1", alt: "a1" },
      { src: "asset://a2", alt: "a2" }
    ]);
  });

  it("embeds a storyboard shot", async () => {
    const data = transfer();
    serializeDragData(
      {
        type: "storyboard-shot",
        payload: { boardId: "b1", shotId: "s2", name: "SH 02", placement: "clip" as never }
      },
      data
    );
    await expect(embedsFromDrag(data, location)).resolves.toEqual([
      { src: "storyboard://b1#shot=s2", alt: "SH 02" }
    ]);
  });

  it("links a file of the same project by its relative path", async () => {
    const data = transfer();
    serializeDragData(
      { type: "project-file", payload: { projectId: "p1", path: "media/take (1).mov" } },
      data
    );
    await expect(embedsFromDrag(data, location)).resolves.toEqual([
      { src: "../media/take%20%281%29.mov", alt: "take (1)" }
    ]);
    expect(mockAssetOfFile).not.toHaveBeenCalled();
  });

  it("uses the asset of a file from another project", async () => {
    mockAssetOfFile.mockResolvedValue({ ...ASSET, project_id: "p2" });
    const data = transfer();
    serializeDragData(
      { type: "project-file", payload: { projectId: "p2", path: "notes/assets/cover.png" } },
      data
    );
    await expect(embedsFromDrag(data, location)).resolves.toEqual([
      { src: `asset://${ASSET.id}`, alt: "cover" }
    ]);
  });

  it("embeds a timeline dragged from the timeline list", async () => {
    const data = transfer();
    serializeDragData({ type: "timeline", payload: { id: "tl1", name: "Teaser cut" } }, data);
    await expect(embedsFromDrag(data, location)).resolves.toEqual([
      { src: "timeline://tl1", alt: "Teaser cut" }
    ]);
  });

  it("embeds the timeline or script a Files panel document file holds", async () => {
    mockDocumentByFile
      .mockResolvedValueOnce({ type: "timeline", ref: "tl1", name: "Teaser cut" })
      .mockResolvedValueOnce({ type: "script", ref: "sc1", name: "Voiceover" });
    const timelineDrag = transfer();
    serializeDragData(
      { type: "project-file", payload: { projectId: "p1", path: "cuts/teaser.timeline.json" } },
      timelineDrag
    );
    await expect(embedsFromDrag(timelineDrag, location)).resolves.toEqual([
      { src: "timeline://tl1", alt: "Teaser cut" }
    ]);
    const scriptDrag = transfer();
    serializeDragData(
      { type: "project-file", payload: { projectId: "p1", path: "vo.script.json" } },
      scriptDrag
    );
    await expect(embedsFromDrag(scriptDrag, location)).resolves.toEqual([
      { src: "script://sc1", alt: "Voiceover" }
    ]);
    expect(mockDocumentByFile).toHaveBeenCalledWith({ id: "p1", path: "vo.script.json" });
  });

  it("ignores drags that carry nothing to embed", async () => {
    await expect(embedsFromDrag(transfer(), location)).resolves.toBeNull();
  });
});
