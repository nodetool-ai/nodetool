/**
 * `asset://<id>` is an identifier, not a storage key.
 *
 * `useSignedUrl` used to hand it to `storage.signUrl` with the scheme stripped,
 * which signs `<id>` while the object is `<user_id>/<id>.<ext>`. An extension
 * carried the key far enough for the server's flat-key fallback to find the
 * object; an extension-less locator — what chat persistence and `save_asset`
 * produce — resolved to nothing, so every video and audio output that went
 * through this hook rendered an empty element while images, which resolve
 * through the asset record, showed fine.
 */
import { renderHook } from "@testing-library/react";

const mockUseQuery = jest.fn();

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    storage: {
      signUrl: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args)
      }
    }
  }
}));

jest.mock("../../../../hooks/useResolvedMediaUri", () =>
  jest.requireActual("../../../../hooks/__mocks__/useResolvedMediaUri")
);

import { mockAssetUrl } from "../../../../hooks/__mocks__/useResolvedMediaUri";
import { useSignedUrl } from "../hooks";

describe("useSignedUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  it("resolves an extension-less asset:// through the asset record", () => {
    const { result } = renderHook(() =>
      useSignedUrl("asset://9c936089c3d0471a90aa5443f6f46665")
    );

    expect(result.current).toBe(
      mockAssetUrl("9c936089c3d0471a90aa5443f6f46665")
    );
  });

  it("does not sign an asset id as a storage key", () => {
    renderHook(() => useSignedUrl("asset://9c936089c3d0471a90aa5443f6f46665"));

    expect(mockUseQuery).toHaveBeenCalledWith(
      { key: "" },
      expect.objectContaining({ enabled: false })
    );
  });

  it("resolves an asset:// that carries an extension the same way", () => {
    const { result } = renderHook(() => useSignedUrl("asset://abc123.mp4"));

    expect(result.current).toBe(mockAssetUrl("abc123.mp4"));
  });

  it("still signs a /api/storage/ key", () => {
    mockUseQuery.mockReturnValue({
      data: { url: "https://signed.test/user-1/abc123.mp4" }
    });

    const { result } = renderHook(() =>
      useSignedUrl("/api/storage/user-1/abc123.mp4")
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      { key: "user-1/abc123.mp4" },
      expect.objectContaining({ enabled: true })
    );
    expect(result.current).toBe("https://signed.test/user-1/abc123.mp4");
  });

  it("passes an https URL through untouched", () => {
    const { result } = renderHook(() =>
      useSignedUrl("https://cdn.example.com/clip.mp4")
    );

    expect(result.current).toBe("https://cdn.example.com/clip.mp4");
  });
});
