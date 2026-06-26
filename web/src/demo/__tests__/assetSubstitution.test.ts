import {
  collectAndRewriteAssets,
  resolveAssetUrls,
} from "../assetSubstitution";
import type { CastAsset, CastEvent } from "../castTypes";
import { CAST_ASSET_SCHEME } from "../castTypes";

describe("collectAndRewriteAssets", () => {
  it("rewrites asset:// URIs to cast-asset:// and collects manifest entries", () => {
    const events: CastEvent[] = [
      { t: 0, message: { type: "output", uri: "asset://img-abc" } },
    ];
    const { events: rewritten, assets } = collectAndRewriteAssets(events);

    expect(rewritten[0].message.uri).toBe(`${CAST_ASSET_SCHEME}img-abc`);
    expect(assets).toHaveLength(1);
    expect(assets[0].key).toBe("img-abc");
    expect(assets[0].originalUri).toBe("asset://img-abc");
  });

  it("rewrites storage API URLs", () => {
    const events: CastEvent[] = [
      {
        t: 100,
        message: {
          type: "output",
          uri: "http://localhost:7777/api/storage/file-123.png",
        },
      },
    ];
    const { events: rewritten, assets } = collectAndRewriteAssets(events);

    expect(rewritten[0].message.uri).toBe(
      `${CAST_ASSET_SCHEME}file-123.png`
    );
    expect(assets[0].key).toBe("file-123.png");
  });

  it("deduplicates assets by key", () => {
    const events: CastEvent[] = [
      { t: 0, message: { type: "a", uri: "asset://same-id" } },
      { t: 100, message: { type: "b", uri: "asset://same-id" } },
    ];
    const { assets } = collectAndRewriteAssets(events);

    expect(assets).toHaveLength(1);
  });

  it("leaves non-asset strings unchanged", () => {
    const events: CastEvent[] = [
      {
        t: 0,
        message: { type: "progress", text: "Processing step 1" },
      },
    ];
    const { events: rewritten } = collectAndRewriteAssets(events);

    expect(rewritten[0].message.text).toBe("Processing step 1");
  });

  it("rewrites nested values deeply", () => {
    const events: CastEvent[] = [
      {
        t: 0,
        message: {
          type: "output",
          data: {
            images: ["asset://nested-1", "asset://nested-2"],
          },
        },
      },
    ];
    const { events: rewritten, assets } = collectAndRewriteAssets(events);

    const images = (rewritten[0].message.data as Record<string, unknown>)
      .images as string[];
    expect(images[0]).toBe(`${CAST_ASSET_SCHEME}nested-1`);
    expect(images[1]).toBe(`${CAST_ASSET_SCHEME}nested-2`);
    expect(assets).toHaveLength(2);
  });

  it("uses contentTypeHint to determine file extension", () => {
    const events: CastEvent[] = [
      { t: 0, message: { type: "output", uri: "asset://photo" } },
    ];
    const { assets } = collectAndRewriteAssets(events, () => "image/png");

    expect(assets[0].file).toBe("photo.png");
    expect(assets[0].contentType).toBe("image/png");
  });

  it("defaults to .bin extension without hint", () => {
    const events: CastEvent[] = [
      { t: 0, message: { type: "output", uri: "asset://data" } },
    ];
    const { assets } = collectAndRewriteAssets(events);

    expect(assets[0].file).toBe("data.bin");
    expect(assets[0].contentType).toBe("application/octet-stream");
  });

  it("handles empty events array", () => {
    const { events, assets } = collectAndRewriteAssets([]);
    expect(events).toEqual([]);
    expect(assets).toEqual([]);
  });
});

describe("resolveAssetUrls", () => {
  const assets: CastAsset[] = [
    {
      key: "img-abc",
      file: "img-abc.png",
      contentType: "image/png",
    },
  ];

  it("replaces cast-asset:// references with resolved URLs", () => {
    const events: CastEvent[] = [
      {
        t: 0,
        message: { type: "output", uri: `${CAST_ASSET_SCHEME}img-abc` },
      },
    ];

    const resolved = resolveAssetUrls(events, assets, (file) =>
      `/public/assets/${file}`
    );

    expect(resolved[0].message.uri).toBe("/public/assets/img-abc.png");
  });

  it("leaves unknown cast-asset keys untouched", () => {
    const events: CastEvent[] = [
      {
        t: 0,
        message: {
          type: "output",
          uri: `${CAST_ASSET_SCHEME}unknown-key`,
        },
      },
    ];

    const resolved = resolveAssetUrls(events, assets, (file) =>
      `/public/${file}`
    );

    expect(resolved[0].message.uri).toBe(`${CAST_ASSET_SCHEME}unknown-key`);
  });

  it("leaves non-cast-asset strings unchanged", () => {
    const events: CastEvent[] = [
      { t: 0, message: { type: "text", content: "hello world" } },
    ];

    const resolved = resolveAssetUrls(events, assets, (f) => f);

    expect(resolved[0].message.content).toBe("hello world");
  });

  it("resolves nested asset references deeply", () => {
    const events: CastEvent[] = [
      {
        t: 0,
        message: {
          type: "output",
          items: [{ uri: `${CAST_ASSET_SCHEME}img-abc` }],
        },
      },
    ];

    const resolved = resolveAssetUrls(events, assets, (file) =>
      `https://cdn.example.com/${file}`
    );

    const items = resolved[0].message.items as Array<{ uri: string }>;
    expect(items[0].uri).toBe("https://cdn.example.com/img-abc.png");
  });

  it("handles empty events", () => {
    expect(resolveAssetUrls([], assets, (f) => f)).toEqual([]);
  });
});
