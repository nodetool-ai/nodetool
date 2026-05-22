import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("root Dockerfile", () => {
  it("copies base-node examples and assets into the runtime image", () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../.."
    );
    const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toContain("packages/base-nodes/nodetool/examples");
    expect(dockerfile).toContain(
      "/runtime/packages/base-nodes/nodetool/examples"
    );
    expect(dockerfile).toContain("packages/base-nodes/nodetool/assets");
    expect(dockerfile).toContain("/runtime/packages/base-nodes/nodetool/assets");
  });
});
