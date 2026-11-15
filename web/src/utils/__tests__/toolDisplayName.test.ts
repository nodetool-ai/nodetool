import { toolDisplayName } from "../toolDisplayName";

describe("toolDisplayName", () => {
  it("turns a wire name into a sentence-case label", () => {
    expect(toolDisplayName("generate_image")).toBe("Generate image");
  });

  it("keeps the target of a narrowed rule key", () => {
    expect(toolDisplayName("run_apify_actor:apify/web-scraper")).toBe(
      "Run apify actor: apify/web-scraper"
    );
  });
});
