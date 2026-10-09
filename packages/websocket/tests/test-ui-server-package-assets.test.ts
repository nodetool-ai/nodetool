import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolvePackageAsset } from "../src/test-ui-server.js";

describe("resolvePackageAsset", () => {
  const root = mkdtempSync(join(tmpdir(), "package-assets-"));
  mkdirSync(join(root, "nodetool-base", "styles"), { recursive: true });
  writeFileSync(join(root, "nodetool-base", "styles", "noir.jpg"), "jpg");
  writeFileSync(join(root, "secret.txt"), "no");

  it("finds a nested asset under a configured root", () => {
    expect(
      resolvePackageAsset("/api/assets/packages/nodetool-base/styles/noir.jpg", [root])
    ).toBe(join(root, "nodetool-base", "styles", "noir.jpg"));
  });

  it("rejects traversal, encoded traversal, and missing files", () => {
    for (const pathname of [
      "/api/assets/packages/nodetool-base/../secret.txt",
      "/api/assets/packages/nodetool-base/%2e%2e/secret.txt",
      "/api/assets/packages/nodetool-base/styles/missing.jpg",
      "/api/assets/packages/secret.txt"
    ]) {
      expect(resolvePackageAsset(pathname, [root])).toBeNull();
    }
  });
});
