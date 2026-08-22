/**
 * `resolveInlineMediaSource` — the boundary for the streaming and preview
 * paths, which hand a renderer either bytes or a locator string and cannot
 * call a hook.
 *
 * The one behavior worth pinning is the refusal: an `asset://` locator comes
 * back `undefined` rather than passing through. Rendering it is the defect
 * this boundary exists to stop, and a missing image is traceable in a way a
 * broken one is not.
 */
import { resolveInlineMediaSource } from "./resolveMediaUri";

jest.mock("../stores/BASE_URL", () => ({
  BASE_URL: "https://api.test",
  prefixBaseUrl: (url: string) => `https://api.test${url}`
}));

describe("resolveInlineMediaSource", () => {
  it("refuses an asset locator, which needs the asset lookup", () => {
    expect(resolveInlineMediaSource("asset://abc123")).toBeUndefined();
    expect(resolveInlineMediaSource("asset://abc123.png")).toBeUndefined();
  });

  it("passes bytes through untouched", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(resolveInlineMediaSource(bytes)).toBe(bytes);
  });

  it("resolves the schemes that need no round trip", () => {
    expect(resolveInlineMediaSource("data:image/png;base64,AAA")).toBe(
      "data:image/png;base64,AAA"
    );
    expect(resolveInlineMediaSource("blob:https://app.test/x")).toBe(
      "blob:https://app.test/x"
    );
    expect(resolveInlineMediaSource("https://cdn.test/a.png?sig=1")).toBe(
      "https://cdn.test/a.png?sig=1"
    );
    expect(resolveInlineMediaSource("/api/storage/u1/a.png")).toBe(
      "https://api.test/api/storage/u1/a.png"
    );
  });

  it("reports nothing for a missing source", () => {
    expect(resolveInlineMediaSource(undefined)).toBeUndefined();
    expect(resolveInlineMediaSource(null)).toBeUndefined();
    expect(resolveInlineMediaSource("")).toBe("");
  });
});
