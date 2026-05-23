/**
 * @jest-environment node
 */
import { isKieNodeMetadata } from "../isKieNode";

describe("isKieNodeMetadata", () => {
  it("matches kie namespace prefixes", () => {
    expect(isKieNodeMetadata({ namespace: "kie.image" })).toBe(true);
    expect(isKieNodeMetadata({ namespace: "kie.dynamic_schema" })).toBe(true);
    expect(isKieNodeMetadata({ namespace: "kie" })).toBe(true);
  });

  it("matches node_type when namespace is missing", () => {
    expect(
      isKieNodeMetadata({ namespace: "", node_type: "kie.video.Kling" }),
    ).toBe(true);
  });

  it("rejects non-kie nodes", () => {
    expect(isKieNodeMetadata({ namespace: "fal.image" })).toBe(false);
    expect(isKieNodeMetadata({ namespace: "nodetool.core" })).toBe(false);
  });
});
