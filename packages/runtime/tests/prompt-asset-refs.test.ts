import { describe, it, expect } from "vitest";
import {
  assetRefToPromptToken,
  classifyAssetToken,
  classifyTextToken,
  expandAssetReferences,
  expandEntityRefs,
  findAssetRefs,
  findImageAssetRefs,
  findTextAssetRefs,
  inlineTextAssetRefs,
  stripAssetRefs,
  mapPromptAssetsToInputs,
  type InjectedAssetRef
} from "../src/prompt-asset-refs.js";

/** Minimal context that resolves any asset:// URI to fixed bytes. */
const fakeContext = (bytes: Uint8Array) =>
  ({
    resolveAssetBytes: async () => ({ bytes })
  }) as never;

/** Context that resolves each asset:// URI to per-URI UTF-8 text. */
const textContext = (byUri: Record<string, string>) =>
  ({
    resolveAssetBytes: async (uri: string) => {
      const text = byUri[uri];
      return {
        bytes:
          text === undefined ? null : new TextEncoder().encode(text)
      };
    }
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

  it("returns null for prototype-key extensions (no inherited-key match)", () => {
    // Regression: `ext in MAP` matched Object.prototype keys, returning a
    // non-string mime (object/function) for these tokens.
    expect(classifyAssetToken("asset://a.__proto__")).toBeNull();
    expect(classifyAssetToken("asset://a.constructor")).toBeNull();
    expect(classifyAssetToken("asset://a.toString")).toBeNull();
    expect(classifyTextToken("asset://a.hasOwnProperty")).toBeNull();
  });
});

describe("classifyTextToken", () => {
  it("classifies text-document extensions", () => {
    expect(classifyTextToken("asset://a.txt")).toEqual({ mime: "text/plain" });
    expect(classifyTextToken("asset://b.md")).toEqual({ mime: "text/markdown" });
    expect(classifyTextToken("asset://c.json")).toEqual({
      mime: "application/json"
    });
  });

  it("returns null for media and unknown tokens", () => {
    expect(classifyTextToken("asset://a.png")).toBeNull();
    expect(classifyTextToken("asset://b.mp4")).toBeNull();
    expect(classifyTextToken("asset://noext")).toBeNull();
  });
});

describe("findTextAssetRefs", () => {
  it("locates text mentions and ignores media", () => {
    const refs = findTextAssetRefs("read asset://notes.md not asset://a.png");
    expect(refs.map((r) => r.uri)).toEqual(["asset://notes.md"]);
  });
});

describe("inlineTextAssetRefs", () => {
  it("replaces a text mention with the asset's decoded content", async () => {
    const out = await inlineTextAssetRefs(
      "summarize asset://notes.md please",
      textContext({ "asset://notes.md": "# Title\n- one\n- two" })
    );
    expect(out).toBe("summarize # Title\n- one\n- two please");
  });

  it("preserves the document's own whitespace verbatim", async () => {
    const doc = "col1,  col2\nx,    y";
    const out = await inlineTextAssetRefs(
      "data: asset://t.csv",
      textContext({ "asset://t.csv": doc })
    );
    expect(out).toBe(`data: ${doc}`);
  });

  it("leaves the literal token when the asset can't be resolved", async () => {
    const out = await inlineTextAssetRefs(
      "open asset://missing.txt now",
      textContext({})
    );
    expect(out).toBe("open asset://missing.txt now");
  });

  it("leaves media mentions untouched", async () => {
    const out = await inlineTextAssetRefs(
      "look asset://a.png here",
      textContext({})
    );
    expect(out).toBe("look asset://a.png here");
  });

  it("inlines a resolved-but-empty text asset as empty (not the literal token)", async () => {
    // Regression: a 0-byte asset resolves successfully and must expand to "",
    // never fall back to leaking the raw asset:// token into the prompt.
    const out = await inlineTextAssetRefs(
      "summarize this: asset://empty.txt",
      textContext({ "asset://empty.txt": "" })
    );
    expect(out).toBe("summarize this: ");
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

describe("expandAssetReferences", () => {
  it("returns a single text block when there is no reference", () => {
    expect(expandAssetReferences("just some text")).toEqual([
      { type: "text", text: "just some text" }
    ]);
  });

  it("splits an inline image reference into text + image block", () => {
    expect(expandAssetReferences("Describe asset://abc.png please")).toEqual([
      { type: "text", text: "Describe " },
      {
        type: "image_url",
        image: { uri: "asset://abc.png", mimeType: "image/png" }
      },
      { type: "text", text: " please" }
    ]);
  });

  it("encodes a lone audio mention as an audio block", () => {
    expect(expandAssetReferences("asset://clip.mp3")).toEqual([
      {
        type: "audio",
        audio: { uri: "asset://clip.mp3", mimeType: "audio/mpeg" }
      }
    ]);
  });

  it("leaves a video mention as literal text", () => {
    expect(expandAssetReferences("clip asset://reel.mp4 here")).toEqual([
      { type: "text", text: "clip " },
      { type: "text", text: "asset://reel.mp4" },
      { type: "text", text: " here" }
    ]);
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

  it("inlines a text-document mention even when the node has no media inputs", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "use this brief: asset://brief.md" }],
      [],
      textContext({ "asset://brief.md": "Make it cinematic." })
    );
    expect(overrides.prompt).toBe("use this brief: Make it cinematic.");
  });

  it("inlines text and routes media in the same prompt", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [
        {
          name: "prompt",
          value: "style asset://ref.png per asset://notes.txt thanks"
        }
      ],
      [{ name: "image", label: "image_url", kind: "image", hasSource: false }],
      textContext({ "asset://notes.txt": "soft pastel palette" })
    );
    // Image mention relabeled to its slot; text mention inlined to its content.
    expect(overrides.prompt).toBe(
      "style image_url per soft pastel palette thanks"
    );
    expect((overrides.image as InjectedAssetRef).uri).toBe("asset://ref.png");
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

/** Context whose getAssetInfo serves the given entity-tagged assets by id. */
const entityContext = (
  byId: Record<
    string,
    {
      content_type: string;
      name: string;
      metadata: Record<string, unknown> | null;
    }
  >,
  resolveBytes = false
) =>
  ({
    getAssetInfo: async (assetId: string) => {
      const info = byId[assetId];
      return info ? { id: assetId, ...info } : null;
    },
    resolveAssetBytes: async () =>
      resolveBytes ? { bytes: new Uint8Array([1, 2, 3]) } : { bytes: null }
  }) as never;

const marta = {
  content_type: "image/png",
  name: "marta.png",
  metadata: {
    nodetool_entity: {
      kind: "character",
      name: "Marta",
      descriptor: "red-haired detective in a beige trench coat"
    }
  }
};

describe("expandEntityRefs", () => {
  it("inlines the name and appends descriptor + reference image token", async () => {
    const out = await expandEntityRefs(
      "A shot of entity://e1 walking away.",
      entityContext({ e1: marta }),
      true
    );
    expect(out).toBe(
      "A shot of Marta walking away.\n\n" +
        "Consistency references:\n" +
        "- Marta: red-haired detective in a beige trench coat\n" +
        "asset://e1.png"
    );
  });

  it("omits the image token when the caller does not accept images", async () => {
    const out = await expandEntityRefs(
      "entity://e1 at dusk",
      entityContext({ e1: marta }),
      false
    );
    expect(out).toBe(
      "Marta at dusk\n\nConsistency references:\n" +
        "- Marta: red-haired detective in a beige trench coat"
    );
  });

  it("contributes a repeated entity's descriptor and image only once", async () => {
    const out = await expandEntityRefs(
      "entity://e1 waves at entity://e1",
      entityContext({ e1: marta }),
      true
    );
    expect(out).toBe(
      "Marta waves at Marta\n\nConsistency references:\n" +
        "- Marta: red-haired detective in a beige trench coat\n" +
        "asset://e1.png"
    );
  });

  it("drops tokens that resolve to no entity", async () => {
    const out = await expandEntityRefs(
      "see entity://missing here",
      entityContext({}),
      true
    );
    expect(out).toBe("see here");
  });

  it("returns text untouched when no entity token is present", async () => {
    const out = await expandEntityRefs("plain prompt", undefined, true);
    expect(out).toBe("plain prompt");
  });
});

describe("mapPromptAssetsToInputs entity mentions", () => {
  it("routes the entity's reference image into an empty image input", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "portrait of entity://e1" }],
      [{ name: "image", kind: "image", hasSource: false }],
      entityContext({ e1: marta }, true)
    );
    expect((overrides.image as InjectedAssetRef).uri).toBe("asset://e1.png");
    expect(overrides.prompt).toBe(
      "portrait of Marta\n\nConsistency references:\n" +
        "- Marta: red-haired detective in a beige trench coat\nimage"
    );
  });

  it("inlines only the descriptor for a node without media inputs", async () => {
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: "describe entity://e1" }],
      [],
      entityContext({ e1: marta })
    );
    expect(overrides.prompt).toBe(
      "describe Marta\n\nConsistency references:\n" +
        "- Marta: red-haired detective in a beige trench coat"
    );
  });
});

describe("assetRefToPromptToken", () => {
  it("returns null for non-ref values", () => {
    expect(assetRefToPromptToken("plain string")).toBeNull();
    expect(assetRefToPromptToken(42)).toBeNull();
    expect(assetRefToPromptToken(null)).toBeNull();
    expect(assetRefToPromptToken(undefined)).toBeNull();
    expect(assetRefToPromptToken({})).toBeNull();
    expect(assetRefToPromptToken({ foo: "bar" })).toBeNull();
  });

  it("keeps an asset:// uri that already carries an extension", () => {
    expect(
      assetRefToPromptToken({ type: "image", uri: "asset://abc.png" })
    ).toBe("asset://abc.png");
  });

  it("strips a query/hash off an asset:// uri", () => {
    expect(
      assetRefToPromptToken({ type: "image", uri: "asset://abc.png?v=2#x" })
    ).toBe("asset://abc.png");
  });

  it("appends an extension to a bare asset:// uri from the mime", () => {
    expect(
      assetRefToPromptToken({
        type: "image",
        uri: "asset://abc",
        mimeType: "image/jpeg"
      })
    ).toBe("asset://abc.jpeg");
  });

  it("builds a token from asset_id + type default when no uri", () => {
    expect(assetRefToPromptToken({ type: "image", asset_id: "xyz" })).toBe(
      "asset://xyz.png"
    );
    expect(assetRefToPromptToken({ type: "audio", asset_id: "aud" })).toBe(
      "asset://aud.mp3"
    );
    expect(assetRefToPromptToken({ type: "video", asset_id: "vid" })).toBe(
      "asset://vid.mp4"
    );
  });

  it("prefers the ref mime over the type default", () => {
    expect(
      assetRefToPromptToken({
        type: "image",
        asset_id: "xyz",
        mimeType: "image/webp"
      })
    ).toBe("asset://xyz.webp");
  });

  it("resolves a text-document mime to its extension", () => {
    expect(
      assetRefToPromptToken({
        type: "document",
        asset_id: "doc",
        content_type: "text/markdown"
      })
    ).toBe("asset://doc.md");
  });

  it("passes a non-asset uri through verbatim", () => {
    expect(
      assetRefToPromptToken({ type: "image", uri: "https://x/y.png" })
    ).toBe("https://x/y.png");
  });

  it("produces a token that expandAssetReferences then routes as an image", () => {
    const token = assetRefToPromptToken({ type: "image", asset_id: "xyz" });
    const parts = expandAssetReferences(`look at ${token}`);
    expect(parts).toEqual([
      { type: "text", text: "look at " },
      { type: "image_url", image: { uri: "asset://xyz.png", mimeType: "image/png" } }
    ]);
  });
});
