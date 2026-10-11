import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import {
  asResolvedMediaUrl,
  resolveStaticMediaUri,
  resolveMediaUri,
  resolveInlineMediaSource
} from "../resolveMediaUri";
import { useAssetStore } from "../../stores/AssetStore";

describe("asResolvedMediaUrl", () => {
  it("returns null for empty or missing input", () => {
    expect(asResolvedMediaUrl("")).toBeNull();
    expect(asResolvedMediaUrl(null)).toBeNull();
    expect(asResolvedMediaUrl(undefined)).toBeNull();
  });

  it("passes a non-empty URL through", () => {
    expect(asResolvedMediaUrl("https://x.test/a.png")).toBe(
      "https://x.test/a.png"
    );
  });
});

describe("resolveStaticMediaUri", () => {
  it("returns an empty string for nothing to render", () => {
    expect(resolveStaticMediaUri(null)).toBe("");
    expect(resolveStaticMediaUri(undefined)).toBe("");
    expect(resolveStaticMediaUri("")).toBe("");
  });

  it("returns null for asset:// locators, which need a lookup", () => {
    expect(resolveStaticMediaUri("asset://abc.png")).toBeNull();
  });

  it("passes data, blob and http URLs through", () => {
    expect(resolveStaticMediaUri("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
    expect(resolveStaticMediaUri("blob:http://x/1")).toBe("blob:http://x/1");
    expect(resolveStaticMediaUri("https://x.test/a.png")).toBe(
      "https://x.test/a.png"
    );
  });

  it("maps file:// URIs to the local file endpoint", () => {
    const url = resolveStaticMediaUri("file:///tmp/a.png");
    expect(url).toContain("/api/files/local?path=");
    expect(url).toContain(encodeURIComponent("/tmp/a.png"));
  });

  it("keeps /api/ paths", () => {
    expect(resolveStaticMediaUri("/api/storage/x.png")).toContain(
      "/api/storage/x.png"
    );
  });
});

describe("resolveMediaUri", () => {
  let errorSpy: ReturnType<typeof jest.spyOn>;
  const originalGet = useAssetStore.getState().get;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    useAssetStore.setState({ get: originalGet });
  });

  it("resolves static URIs without an asset lookup", async () => {
    const get = jest.fn<typeof originalGet>();
    useAssetStore.setState({ get });
    expect(await resolveMediaUri("https://x.test/a.png")).toBe(
      "https://x.test/a.png"
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("looks up asset:// locators and returns get_url", async () => {
    const get = jest
      .fn<typeof originalGet>()
      .mockResolvedValue({ get_url: "https://cdn.test/signed" } as never);
    useAssetStore.setState({ get });
    expect(await resolveMediaUri("asset://abc123.png")).toBe(
      "https://cdn.test/signed"
    );
    expect(get).toHaveBeenCalledWith("abc123");
  });

  it("returns an empty string when the asset has no URL", async () => {
    useAssetStore.setState({
      get: jest.fn<typeof originalGet>().mockResolvedValue({} as never)
    });
    expect(await resolveMediaUri("asset://abc123")).toBe("");
  });

  it("returns an empty string and logs when the lookup rejects", async () => {
    useAssetStore.setState({
      get: jest.fn<typeof originalGet>().mockRejectedValue(new Error("nope"))
    });
    expect(await resolveMediaUri("asset://abc123")).toBe("");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns an empty string for an asset:// locator with no id", async () => {
    expect(await resolveMediaUri("asset://")).toBe("");
  });
});

describe("resolveInlineMediaSource", () => {
  it("passes bytes through untouched", () => {
    const bytes = new Uint8Array([1, 2]);
    expect(resolveInlineMediaSource(bytes)).toBe(bytes);
  });

  it("returns undefined for missing sources", () => {
    expect(resolveInlineMediaSource(null)).toBeUndefined();
    expect(resolveInlineMediaSource(undefined)).toBeUndefined();
  });

  it("returns undefined for asset:// locators", () => {
    expect(resolveInlineMediaSource("asset://abc")).toBeUndefined();
  });

  it("resolves static strings", () => {
    expect(resolveInlineMediaSource("blob:http://x/1")).toBe("blob:http://x/1");
  });
});
