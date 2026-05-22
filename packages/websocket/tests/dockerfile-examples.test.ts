import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("root Dockerfile", () => {
  it("copies base-nodes examples and assets into the runtime image", () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../.."
    );
    const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toMatch(
      /if \[ -d packages\/base-nodes\/nodetool\/examples \]; then[\s\S]*cp -a packages\/base-nodes\/nodetool\/examples \/runtime\/packages\/base-nodes\/nodetool\/examples;[\s\S]*fi/
    );
    expect(dockerfile).toMatch(
      /if \[ -d packages\/base-nodes\/nodetool\/assets \]; then[\s\S]*cp -a packages\/base-nodes\/nodetool\/assets \/runtime\/packages\/base-nodes\/nodetool\/assets;[\s\S]*fi/
    );
  });
});
