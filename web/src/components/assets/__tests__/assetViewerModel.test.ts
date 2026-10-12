import type { Asset } from "../../../stores/ApiTypes";
import {
  copyTooltip,
  editActionFor,
  filmstripWindow,
  viewerMedia
} from "../assetViewerModel";

const asset = (overrides: Partial<Asset> = {}): Asset =>
  ({
    id: "a1",
    name: "photo.png",
    content_type: "image/png",
    get_url: "/a1.png",
    user_id: "u1",
    parent_id: "",
    created_at: "",
    workflow_id: null,
    metadata: {},
    ...overrides
  }) as Asset;

describe("viewerMedia", () => {
  it("falls back to the caller's url and type when there is no asset", () => {
    expect(viewerMedia(undefined, "/x.mp4", "video/mp4")).toEqual({
      isImage: false,
      isAudio: false,
      isVideo: true,
      isModel3D: false,
      isSvg: false
    });
  });

  it("treats an svg url as an image even with a generic type", () => {
    const media = viewerMedia(
      asset({
        name: "drawing",
        content_type: "application/octet-stream",
        get_url: "/d.svg?v=2"
      }),
      undefined,
      undefined
    );
    expect(media.isImage).toBe(true);
    expect(media.isSvg).toBe(false);
  });

  it("marks an svg asset as both an image and an svg", () => {
    const media = viewerMedia(
      asset({ name: "logo.svg", content_type: "image/svg+xml" }),
      undefined,
      undefined
    );
    expect(media).toMatchObject({ isImage: true, isSvg: true });
  });

  it("detects a glb as an editable 3D model", () => {
    const media = viewerMedia(
      asset({
        name: "chair.glb",
        content_type: "model/gltf-binary",
        get_url: "/chair.glb"
      }),
      undefined,
      undefined
    );
    expect(media).toMatchObject({ isModel3D: true, isImage: false });
  });
});

describe("editActionFor", () => {
  const actionFor = (a: Asset) =>
    editActionFor(a, viewerMedia(a, undefined, undefined));

  it.each([
    [
      asset(),
      {
        kind: "tab",
        tabType: "image",
        title: "photo.png",
        tooltip: "Edit Image"
      }
    ],
    [
      asset({ name: "", content_type: "image/svg+xml" }),
      { kind: "tab", tabType: "svg", title: "SVG", tooltip: "Edit SVG" }
    ],
    [
      asset({ name: "", content_type: "image/png" }),
      { kind: "tab", tabType: "image", title: "Image", tooltip: "Edit Image" }
    ],
    [
      asset({
        name: "chair.glb",
        content_type: "model/gltf-binary",
        get_url: "/chair.glb"
      }),
      {
        kind: "tab",
        tabType: "model3d",
        title: "chair.glb",
        tooltip: "Edit in 3D Editor"
      }
    ],
    [
      asset({ name: "", content_type: "audio/wav", get_url: "/a.wav" }),
      { kind: "tab", tabType: "audio", title: "Audio", tooltip: "Edit Audio" }
    ],
    [
      asset({ content_type: "video/mp4", get_url: "/v.mp4" }),
      { kind: "video", tooltip: "Create Timeline from Video" }
    ],
    [
      asset({
        content_type: "video/mp4",
        get_url: "/v.mp4",
        timeline_id: "t1"
      }),
      { kind: "video", tooltip: "Edit Timeline" }
    ],
    [
      asset({ name: "sales.csv", content_type: "text/csv" }),
      { kind: "tab", tabType: "text", title: "sales.csv", tooltip: "Edit Table" }
    ],
    [
      asset({
        name: "budget.xlsx",
        content_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }),
      {
        kind: "tab",
        tabType: "text",
        title: "budget.xlsx",
        tooltip: "Edit Table"
      }
    ]
  ])("picks the editor for %#", (a, expected) => {
    expect(actionFor(a)).toEqual(expected);
  });

  it("offers nothing for a type no editor opens", () => {
    expect(
      actionFor(
        asset({
          name: "doc.pdf",
          content_type: "application/pdf",
          get_url: "/doc.pdf"
        })
      )
    ).toBeNull();
  });

  it("offers nothing without an asset", () => {
    expect(
      editActionFor(undefined, viewerMedia(undefined, "/x.png", "image/png"))
    ).toBeNull();
  });
});

describe("copyTooltip", () => {
  it.each([
    ["image/png", false, "Copy Image"],
    ["video/mp4", false, "Copy Video Info"],
    ["audio/wav", false, "Copy Audio Info"],
    ["text/plain", false, "Copy Content"],
    ["image/png", true, "Copied!"]
  ])("labels %s (copied: %s) as %s", (type, copied, label) => {
    expect(copyTooltip(type, copied)).toBe(label);
  });
});

describe("filmstripWindow", () => {
  const assets = [
    "image/png",
    "video/mp4",
    "image/png",
    "image/png",
    "audio/wav",
    "image/png"
  ].map((content_type, i) => asset({ id: `a${i}`, content_type }));
  const ids = (thumbs: { asset: Asset; index: number }[]) =>
    thumbs.map((t) => [t.asset.id, t.index]);

  it("keeps the true list index for every neighbour", () => {
    const strip = filmstripWindow(assets, 3, 2, false);
    expect(ids(strip.before)).toEqual([
      ["a1", 1],
      ["a2", 2]
    ]);
    expect(ids(strip.after)).toEqual([
      ["a4", 4],
      ["a5", 5]
    ]);
    expect(strip).toMatchObject({ hasPrev: true, hasNext: true });
  });

  it("clips the window at both ends", () => {
    expect(filmstripWindow(assets, 0, 5, false)).toMatchObject({
      before: [],
      hasPrev: false,
      hasNext: true
    });
    expect(filmstripWindow(assets, 5, 5, false)).toMatchObject({
      after: [],
      hasPrev: true,
      hasNext: false
    });
  });

  it("shows only images in compare mode but keeps their indices", () => {
    const strip = filmstripWindow(assets, 3, 2, true);
    expect(ids(strip.before)).toEqual([["a2", 2]]);
    expect(ids(strip.after)).toEqual([["a5", 5]]);
    expect(strip.hasPrev).toBe(true);
  });
});
