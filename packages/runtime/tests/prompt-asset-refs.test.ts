import { describe, it, expect } from "vitest";
import {
  classifyAssetToken,
  findAssetRefs,
  findImageAssetRefs,
  stripAssetRefs,
  mapPromptAssetsToInputs,
  type InjectedAssetRef
} from "../src/prompt-asset-refs.js";

/** Minimal context that resolves any asset:// URI to fixed bytes. */
const fakeContext = (bytes: Uint8Array) =>
  ({
    resolveAssetBytes: async () => ({ bytes })
  }) as never;

describe("classifyAssetToken", () => {
  it("classifies image, audio and video extensions", () => {
    expect(classifyAssetToken("asset://a.png")).toEqual({
      kind: "image",
      mime: "image/png"
    });
    expect(classifyAssetToken("asset://b.mp3")).toEqual({
      kind: "audio",
      mime: "audio/mpeg"
    });
    expect(classifyAssetToken("asset://c.mp4")).toEqual({
      kind: "video",
      mime: "video/mp4"
    });
    expect(classifyAssetToken("asset://d.mov")).toEqual({
      kind: "video",
      mime: "video/quicktime"
    });
  });

  it("returns null for unknown / missing extensions and non-asset tokens", () => {
    expect(classifyAssetToken("asset://doc.txt")).toBeNull();
    expect(classifyAssetToken("asset://noext")).toBeNull();
    expect(classifyAssetToken("https://x/a.png")).toBeNull();
  });
});

describe("findAssetRefs", () => {
  it("returns an empty list when there is no reference", () => {
    expect(findAssetRefs("just some text")).toEqual([]);
  });

  it("locates an inline image reference with its offsets", () => {
    expect(findAssetRefs("Describe asset://abc.png please")).toEqual([
      {
        uri: "asset://abc.png",
        kind: "image",
        mime: "image/png",
        index: 9,
        length: "asset://abc.png".length
      }
    ]);
  });

  it("does not swallow a trailing sentence period into the reference", () => {
    const [ref] = findAssetRefs("Here: asset://abc.png.");
    expect(ref.uri).toBe("asset://abc.png");
    expect(ref.length).toBe("asset://abc.png".length);
  });

  it("skips unsupported media types", () => {
    expect(findAssetRefs("open asset://doc.txt now")).toEqual([]);
  });

  it("finds multiple references in order", () => {
    const refs = findAssetRefs("compare asset://a.jpg and asset://b.webp");
    expect(refs.map((r) => r.uri)).toEqual([
      "asset://a.jpg",
      "asset://b.webp"
    ]);
  });
});

describe("findImageAssetRefs", () => {
  it("keeps only image references", () => {
    const refs = findImageAssetRefs("img asset://a.png clip asset://b.mp3");
    expect(refs.map((r) => r.uri)).toEqual(["asset://a.png"]);
  });
});

describe("stripAssetRefs", () => {
  it("removes references and collapses the gap", () => {
    const prompt = "Describe asset://abc.png please";
    const refs = findImageAssetRefs(prompt);
    expect(stripAssetRefs(prompt, refs)).toBe("Describe please");
  });

  it("returns an empty string when the prompt is only a reference", () => {
    const prompt = "asset://abc.png";
    expect(stripAssetRefs(prompt, findImageAssetRefs(prompt))).toBe("");
  });

  it("leaves the prompt untouched when there are no refs", () => {
    expect(stripAssetRefs("plain text", [])).toBe("plain text");
  });

  it("preserves newlines while trimming trailing spaces", () => {
    const prompt = "line one asset://a.png\nline two";
    const refs = findImageAssetRefs(prompt);
    expect(stripAssetRefs(prompt, refs)).toBe("line one\nline two");
  });
});

describe("mapPromptAssetsToInputs", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const b64 = Buffer.from(bytes).toString("base64");

  it("returns no overrides when the node has no asset inputs", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "use asset://a.png" }],
      [],
      fakeContext(bytes)
    );
    expect(overrides).toEqual({});
  });

  it("fills an empty image input and relabels the mention", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "make it pop asset://a.png please" }],
      [{ name: "image", label: "image_url", kind: "image", hasSource: false }],
      fakeContext(bytes)
    );
    expect(overrides.prompt).toBe("make it pop image_url please");
    expect(overrides.image).toEqual({
      type: "image",
      uri: "asset://a.png",
      mimeType: "image/png",
      data: b64
    } satisfies InjectedAssetRef);
  });

  it("keeps a wired input but still strips the mention", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "enhance asset://a.png now" }],
      [{ name: "image", kind: "image", hasSource: true }],
      fakeContext(bytes)
    );
    expect(overrides.image).toBeUndefined();
    expect(overrides.prompt).toBe("enhance now");
  });

  it("absorbs multiple mentions into a list input and indexes the labels", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "blend asset://a.png and asset://b.jpg" }],
      [
        {
          name: "images",
          label: "reference_image_urls",
          kind: "image",
          list: true,
          hasSource: false
        }
      ],
      fakeContext(bytes)
    );
    const list = overrides.images as InjectedAssetRef[];
    expect(list.map((r) => r.uri)).toEqual(["asset://a.png", "asset://b.jpg"]);
    expect(overrides.prompt).toBe(
      "blend reference_image_urls[0] and reference_image_urls[1]"
    );
  });

  it("routes mentions to inputs by kind and labels each", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "speak asset://v.mp3 over asset://a.png" }],
      [
        { name: "image", kind: "image", hasSource: false },
        { name: "audio", kind: "audio", hasSource: false }
      ],
      fakeContext(bytes)
    );
    expect((overrides.image as InjectedAssetRef).uri).toBe("asset://a.png");
    expect((overrides.audio as InjectedAssetRef).uri).toBe("asset://v.mp3");
    expect(overrides.prompt).toBe("speak audio over image");
  });

  it("does not touch text when no mention matches an accepted kind", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "clip asset://v.mp3 here" }],
      [{ name: "image", kind: "image", hasSource: false }],
      fakeContext(bytes)
    );
    expect(overrides).toEqual({});
  });

  it("routes image, audio and video mentions onto an omni node's slots", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [
        {
          name: "prompt",
          value: "drive asset://clip.mp4 with asset://track.wav and asset://ref.png"
        }
      ],
      [
        { name: "image", label: "image_url", kind: "image", hasSource: false },
        { name: "audio", label: "audio_url", kind: "audio", hasSource: false },
        { name: "video", label: "video_url", kind: "video", hasSource: false }
      ],
      fakeContext(bytes)
    );
    expect(overrides.video).toEqual({
      type: "video",
      uri: "asset://clip.mp4",
      mimeType: "video/mp4",
      data: b64
    } satisfies InjectedAssetRef);
    expect((overrides.audio as InjectedAssetRef).uri).toBe("asset://track.wav");
    expect((overrides.image as InjectedAssetRef).uri).toBe("asset://ref.png");
    expect(overrides.prompt).toBe("drive video_url with audio_url and image_url");
  });

  it("fills a wired video input from a mention only when empty", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "restyle asset://a.mp4 and asset://b.webm" }],
      [{ name: "video", label: "video_url", kind: "video", hasSource: true }],
      fakeContext(bytes)
    );
    // Slot is wired, so neither mention is placed; both are dropped from text.
    expect(overrides.video).toBeUndefined();
    expect(overrides.prompt).toBe("restyle and");
  });
});

describe("mapPromptAssetsToInputs — folder mentions", () => {
  const bytes = new Uint8Array([1, 2, 3]);

  /** Context whose folder `folder1` resolves to `entries`; everything else is not a folder. */
  const folderContext = (
    entries: Array<{ id: string; content_type: string; name: string }> | null
  ) =>
    ({
      resolveAssetBytes: async () => ({ bytes }),
      listFolderAssets: async (folderId: string) =>
        folderId === "folder1" ? entries : null
    }) as never;

  it("expands a folder mention across image inputs, mapping as many as possible", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "use these: asset://folder1 thanks" }],
      [
        { name: "image", label: "image_url", kind: "image", hasSource: false },
        {
          name: "images",
          label: "reference_image_urls",
          kind: "image",
          list: true,
          hasSource: false
        }
      ],
      folderContext([
        { id: "a", content_type: "image/png", name: "a.png" },
        { id: "b", content_type: "image/jpeg", name: "b.jpg" },
        { id: "c", content_type: "image/webp", name: "c.webp" }
      ])
    );
    expect((overrides.image as InjectedAssetRef).uri).toBe("asset://a.png");
    const list = overrides.images as InjectedAssetRef[];
    expect(list.map((r) => r.uri)).toEqual([
      "asset://b.jpeg",
      "asset://c.webp"
    ]);
    expect(overrides.prompt).toBe(
      "use these: image_url reference_image_urls[0] reference_image_urls[1] thanks"
    );
  });

  it("only expands members of accepted kinds", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "from asset://folder1 please" }],
      [{ name: "image", kind: "image", hasSource: false }],
      folderContext([
        { id: "a", content_type: "image/png", name: "a.png" },
        { id: "s", content_type: "audio/mpeg", name: "s.mp3" },
        { id: "v", content_type: "video/mp4", name: "v.mp4" }
      ])
    );
    expect((overrides.image as InjectedAssetRef).uri).toBe("asset://a.png");
    expect(overrides.prompt).toBe("from image please");
  });

  it("leaves a bare token that is not a folder as literal text", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "see asset://not-a-folder ok" }],
      [{ name: "image", kind: "image", hasSource: false }],
      folderContext(null)
    );
    expect(overrides).toEqual({});
  });

  it("strips an empty folder mention from the text", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "use asset://folder1 now" }],
      [{ name: "image", kind: "image", hasSource: false }],
      folderContext([])
    );
    expect(overrides.image).toBeUndefined();
    expect(overrides.prompt).toBe("use now");
  });
});
