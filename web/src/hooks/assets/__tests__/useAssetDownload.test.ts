import { renderHook } from "@testing-library/react";
import { useAssetDownload } from "../useAssetDownload";

function clickSpy() {
  const clicks: HTMLAnchorElement[] = [];
  jest.spyOn(document.body, "appendChild").mockImplementation((el: any) => {
    if (el.tagName === "A") {clicks.push(el as HTMLAnchorElement);}
    return el;
  });
  jest.spyOn(document.body, "removeChild").mockImplementation((el: any) => {
    return el;
  });
  return () => clicks;
}

describe("useAssetDownload", () => {
  test("uses asset name and link click flow", () => {
    const asset = {
      name: "file.txt",
      get_url: "https://example.com/file.txt"
    } as any;
    const getClicks = clickSpy();
    const { result } = renderHook(() =>
      useAssetDownload({ currentAsset: asset })
    );
    result.current.handleDownload();
    const anchors = getClicks();
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors[anchors.length - 1].download).toBe("file.txt");
  });

  test("prefers the current asset's URL over a stale url prop (gallery nav)", () => {
    // The viewer passes the opening asset's URL as `url` and updates
    // `currentAsset` as the gallery navigates; download must follow the asset.
    const asset = {
      name: "current.png",
      get_url: "https://example.com/current.png"
    } as any;
    const staleOpeningUrl = "https://example.com/opened-with.png";
    const getClicks = clickSpy();
    const { result } = renderHook(() =>
      useAssetDownload({ currentAsset: asset, url: staleOpeningUrl })
    );
    result.current.handleDownload();
    const anchors = getClicks();
    expect(anchors[anchors.length - 1].href).toBe(
      "https://example.com/current.png"
    );
  });

  test("infers extension from data URI", () => {
    const dataUrl = "data:text/plain;base64,AAAA";
    const getClicks = clickSpy();
    const { result } = renderHook(() => useAssetDownload({ url: dataUrl }));
    result.current.handleDownload();
    const anchors = getClicks();
    expect(anchors[anchors.length - 1].download).toBe("download.plain");
  });
});
