import { resolveAssetUrls } from "../assetSubstitution";
import type { CastAsset, CastEvent } from "../castTypes";
import { CAST_ASSET_SCHEME } from "../castTypes";

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
