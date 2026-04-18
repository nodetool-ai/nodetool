import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Use require for CJS module to avoid ESM interop issues across Node versions
 
const afterPack = require("../../scripts/after-pack.cjs") as {
  promoteBackendNodeModules: (context: Record<string, unknown>) => Promise<void>;
};

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
    const packageJson = fs.readFileSync(
      path.join(resourcesDir, "backend", "node_modules", "openai", "package.json"),
      "utf8"
    );
    expect(packageJson).toContain('"name":"openai"');
  });
});
