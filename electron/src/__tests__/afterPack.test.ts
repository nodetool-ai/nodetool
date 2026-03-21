import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import afterPack from "../../scripts/after-pack.cjs";

describe("promoteBackendNodeModules", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "nodetool-after-pack-")
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("renames backend/_modules to backend/node_modules in packaged resources", async () => {
    const appOutDir = path.join(tempDir, "dist");
    const resourcesDir = path.join(
      appOutDir,
      "Nodetool.app",
      "Contents",
      "Resources"
    );
    const stagedModulesDir = path.join(resourcesDir, "backend", "_modules");
    const stagedPackageJson = path.join(stagedModulesDir, "openai", "package.json");

    await fs.promises.mkdir(path.dirname(stagedPackageJson), { recursive: true });
    await fs.promises.writeFile(stagedPackageJson, '{"name":"openai"}\n', "utf8");

    await afterPack.promoteBackendNodeModules({
      electronPlatformName: "darwin",
      appOutDir,
      packager: {
        appInfo: {
          productFilename: "Nodetool",
        },
      },
    });

    await expect(
      fs.promises.access(path.join(resourcesDir, "backend", "_modules"))
    ).rejects.toThrow();
    await expect(
      fs.promises.readFile(
        path.join(resourcesDir, "backend", "node_modules", "openai", "package.json"),
        "utf8"
      )
    ).resolves.toContain('"name":"openai"');
  });
});
