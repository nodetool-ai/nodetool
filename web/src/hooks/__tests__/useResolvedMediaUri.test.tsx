import { renderHook } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";

import {
  useResolvedMedia,
  useResolvedMediaUri
} from "../useResolvedMediaUri";

const mockGetAsset = jest.fn();
jest.mock("../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn(
    (selector: (state: { get: typeof mockGetAsset }) => unknown) =>
      selector({ get: mockGetAsset })
  )
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn(),
  useQueries: jest.fn()
}));

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

/** The asset record the lookup resolves to, when it resolves. */
const withAsset = (getUrl: string | undefined, contentType?: string) => {
  mockUseQuery.mockReturnValue({
    data: getUrl
      ? { get_url: getUrl, content_type: contentType }
      : undefined
  } as any);
};

describe("useResolvedMediaUri", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withAsset(undefined);
  });

  it("resolves an asset:// locator to the asset's signed get_url", () => {
    withAsset("https://cdn.example.com/signed/user-1/abc123.png?sig=x");
    const { result } = renderHook(() =>
      useResolvedMediaUri("asset://abc123.png")
    );
    expect(result.current).toBe(
      "https://cdn.example.com/signed/user-1/abc123.png?sig=x"
    );
  });

  it("looks the asset up by its id, not the locator's path", () => {
    renderHook(() => useResolvedMediaUri("asset://abc123.png"));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["asset", "abc123"], enabled: true })
    );
  });

  it("prefers a declared asset_id over the ref's own uri", () => {
    renderHook(() =>
      useResolvedMediaUri({ uri: "asset://stale.png", asset_id: "abc123" })
    );
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["asset", "abc123"] })
    );
  });

  // The whole point of the hook: never hand a caller a URL that 404s. An
  // unresolved lookup renders nothing rather than `/api/storage/<id>`.
  it("returns undefined while the asset lookup is in flight", () => {
    const { result } = renderHook(() =>
      useResolvedMediaUri("asset://abc123.png")
    );
    expect(result.current).toBeUndefined();
  });

  it.each([
    ["https://cdn.example.com/photo.png", "https://cdn.example.com/photo.png"],
    ["data:image/png;base64,abc", "data:image/png;base64,abc"],
    ["blob:http://localhost/uuid", "blob:http://localhost/uuid"],
    [
      "package://nodetool-base/cat.png",
      "http://localhost:7777/api/assets/packages/nodetool-base/cat.png"
    ],
    ["/api/storage/user-1/a.png", "http://localhost:7777/api/storage/user-1/a.png"]
  ])("passes %s through without a lookup", (input, expected) => {
    const { result } = renderHook(() => useResolvedMediaUri(input));
    expect(result.current).toBe(expected);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it.each([undefined, null, ""])("returns undefined for %p", (input) => {
    const { result } = renderHook(() => useResolvedMediaUri(input));
    expect(result.current).toBeUndefined();
  });
});

describe("useResolvedMedia", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withAsset(undefined);
  });

  it("returns the asset content type with the signed URL", () => {
    withAsset(
      "https://cdn.example.com/signed/user-1/abc123.mp4?sig=x",
      "video/mp4"
    );
    const { result } = renderHook(() =>
      useResolvedMedia("asset://abc123")
    );
    expect(result.current).toEqual({
      url: "https://cdn.example.com/signed/user-1/abc123.mp4?sig=x",
      contentType: "video/mp4"
    });
  });
});
