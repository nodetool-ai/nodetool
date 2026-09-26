/**
 * A shipped example timeline names its stills as `package://` URIs. The
 * editor preview asked the AssetStore for them, got "Asset not found", and
 * showed "Preview media could not be loaded". They resolve to the server's
 * package-asset route instead; an ordinary asset id still takes the lookup.
 */
import { packageClipMediaUrl } from "../packageClipMedia";

jest.mock("../../../stores/BASE_URL", () => ({ BASE_URL: "http://server" }));

describe("packageClipMediaUrl", () => {
  it("maps a package:// still to the package-asset route", () => {
    expect(
      packageClipMediaUrl("package://nodetool-base/timelines/voltra/hero.jpg")
    ).toBe(
      "http://server/api/assets/packages/nodetool-base/timelines/voltra/hero.jpg"
    );
  });

  it("leaves asset ids and asset:// locators to the asset lookup", () => {
    expect(packageClipMediaUrl("0123456789abcdef0123456789abcdef")).toBeNull();
    expect(packageClipMediaUrl("asset://0123456789abcdef")).toBeNull();
    expect(packageClipMediaUrl(undefined)).toBeNull();
  });
});
