import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Use require for CJS module to avoid ESM interop issues across Node versions

const afterPack = require("../../scripts/after-pack.cjs") as {
  promoteBackendNodeModules: (context: Record<string, unknown>) => Promise<void>;
  findNativeModuleNames: (nodeModulesPath: string) => string[];
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

describe("findNativeModuleNames", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "nodetool-find-native-")
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("detects top-level and scoped packages that ship a binding.gyp", async () => {
    const makePkg = async (relPath: string, withBindingGyp: boolean) => {
      const pkgDir = path.join(tempDir, relPath);
      await fs.promises.mkdir(pkgDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(pkgDir, "package.json"),
        `{"name":"${relPath.replace(/\\/g, "/")}"}\n`
      );
      if (withBindingGyp) {
        await fs.promises.writeFile(path.join(pkgDir, "binding.gyp"), "{}\n");
      }
    };

    await makePkg("better-sqlite3", true);
    await makePkg("bufferutil", true);
    await makePkg("openai", false);
    await makePkg(path.join("@napi-rs", "canvas"), true);
    await makePkg(path.join("@aws-sdk", "client-s3"), false);

    const names = afterPack.findNativeModuleNames(tempDir);
    expect(names).toEqual(
      expect.arrayContaining(["better-sqlite3", "bufferutil", "@napi-rs/canvas"])
    );
    expect(names).not.toContain("openai");
    expect(names).not.toContain("@aws-sdk/client-s3");
  });

  it("returns an empty list when node_modules does not exist", () => {
    const names = afterPack.findNativeModuleNames(
      path.join(tempDir, "does-not-exist")
    );
    expect(names).toEqual([]);
  });
});
