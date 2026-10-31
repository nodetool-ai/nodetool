import { describe, expect, it } from "vitest";
import { emptyModelListMessage } from "../src/commands/generate.js";

describe("nodetool generate --list-models with no models", () => {
  it("names a missing manifest and the pack install command", () => {
    const message = emptyModelListMessage("fal_ai", [{
      packageName: "@nodetool-ai/fal-nodes",
      exportPath: "fal-manifest.json",
      error: "Cannot find package '@nodetool-ai/fal-nodes'"
    }]);
    expect(message).toContain("Cannot find package '@nodetool-ai/fal-nodes'");
    expect(message).toContain("nodetool packs add fal --yes");
    expect(message).not.toContain("No image models listed");
  });

  it("keeps the plain sentence when every manifest loaded", () => {
    expect(emptyModelListMessage("openai", [])).toBe("No image models listed for openai.");
  });
});
