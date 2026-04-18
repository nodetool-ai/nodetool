import { createAssetDragImage } from "../dragImage";
import { Asset } from "../../../stores/ApiTypes";

const createAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset-1",
  name: "photo.png",
  content_type: "image/png",
  size: 1024,
  created_at: "2024-01-01T00:00:00Z",
  parent_id: "",
  user_id: "user-1",
  get_url: "/assets/asset-1",
  thumb_url: "/assets/asset-1-thumb",
  workflow_id: null,
  metadata: {},
  ...overrides
});

describe("createAssetDragImage", () => {
  it("returns an HTMLElement", () => {
    const asset = createAsset();
    const result = createAssetDragImage(asset);
    expect(result).toBeInstanceOf(HTMLElement);
  });

  it("positions container off-screen", () => {
    const asset = createAsset();
    const el = createAssetDragImage(asset);
    expect(el.style.top).toBe("-9999px");
    expect(el.style.left).toBe("-9999px");
  });

  it("creates a single card for one asset", () => {
    const asset = createAsset();
    const el = createAssetDragImage(asset, 1);
    const directChildDivs = Array.from(el.children).filter(
      (c) => c.tagName === "DIV"
    );
    expect(directChildDivs.length).toBe(1);
  });

  it("does not show count badge for single asset", () => {
    const asset = createAsset();
    const el = createAssetDragImage(asset, 1);
    const allDivs = el.querySelectorAll("div");
    const badgeTexts = Array.from(allDivs).map((d) => d.textContent);
    expect(badgeTexts).not.toContain("1");
  });

  it("shows count badge for multiple assets", () => {
    const asset = createAsset();
    const el = createAssetDragImage(asset, 3);
    expect(el.textContent).toContain("3");
  });

  it("creates stacked cards for multiple assets", () => {
    const primary = createAsset({ id: "a1", name: "first.png" });
    const other1 = createAsset({ id: "a2", name: "second.png" });
    const other2 = createAsset({ id: "a3", name: "third.png" });
    const el = createAssetDragImage(primary, 3, [other1, other2]);
    const cards = el.children;
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });

  it("renders an img element for image assets", () => {
    const asset = createAsset({
      content_type: "image/png",
      get_url: "/img/photo.png"
    });
    const el = createAssetDragImage(asset);
    const img = el.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("/img/photo.png");
  });

  it("renders file extension for non-image assets", () => {
    const asset = createAsset({
      name: "document.pdf",
      content_type: "application/pdf",
      get_url: ""
    });
    const el = createAssetDragImage(asset);
    expect(el.textContent).toContain("pdf");
  });

  it("limits stack to 3 cards max", () => {
    const primary = createAsset({ id: "a1" });
    const others = Array.from({ length: 5 }, (_, i) =>
      createAsset({ id: `a${i + 2}`, name: `file${i}.png` })
    );
    const el = createAssetDragImage(primary, 6, others);
    const directChildren = Array.from(el.children).filter(
      (c) => c.tagName === "DIV"
    );
    const cards = directChildren.filter(
      (d) => d.getAttribute("style")?.includes("height: 64px")
    );
    expect(cards.length).toBeLessThanOrEqual(3);
  });
});
