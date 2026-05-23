import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("root Dockerfile", () => {
  it("copies base-nodes examples and assets into the runtime image", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

    // Guard: directory-existence check before copying examples
    expect(dockerfile).toMatch(
      /if\s+\[\s+-d\s+packages\/base-nodes\/nodetool\/examples[\s\S]*cp\s+.*packages\/base-nodes\/nodetool\/examples.*\/runtime\/packages\/base-nodes\/nodetool\/examples/
    );
    // Guard: directory-existence check before copying assets
    expect(dockerfile).toMatch(
      /if\s+\[\s+-d\s+packages\/base-nodes\/nodetool\/assets[\s\S]*cp\s+.*packages\/base-nodes\/nodetool\/assets.*\/runtime\/packages\/base-nodes\/nodetool\/assets/
    );
  });
});
