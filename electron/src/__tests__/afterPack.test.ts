import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Use require for CJS module to avoid ESM interop issues across Node versions

const afterPack = require("../../scripts/after-pack.cjs") as {
  promoteBackendNodeModules: (context: Record<string, unknown>) => Promise<void>;
  findNativeModuleNames: (nodeModulesPath: string) => string[];
  ensureAppUpdateConfig: (context: Record<string, unknown>) => Promise<void>;
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

describe("ensureAppUpdateConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "nodetool-app-update-")
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("writes app-update.yml into Windows packaged resources", async () => {
    const appOutDir = path.join(tempDir, "win-unpacked");

    await afterPack.ensureAppUpdateConfig({
      electronPlatformName: "win32",
      appOutDir,
      packager: {
        config: {
          publish: [
            {
              provider: "github",
              owner: "nodetool-ai",
              repo: "nodetool",
            },
          ],
        },
        appInfo: {
          updaterCacheDirName: "nodetool-updater",
        },
      },
    });

    const config = fs.readFileSync(
      path.join(appOutDir, "resources", "app-update.yml"),
      "utf8"
    );
    expect(config).toContain("provider: github");
    expect(config).toContain("owner: nodetool-ai");
    expect(config).toContain("repo: nodetool");
    expect(config).toContain("updaterCacheDirName: nodetool-updater");
  });

  it("preserves nightly channel fields in app-update.yml", async () => {
    const appOutDir = path.join(tempDir, "win-unpacked");

    await afterPack.ensureAppUpdateConfig({
      electronPlatformName: "win32",
      appOutDir,
      packager: {
        config: {
          publish: [
            {
              provider: "github",
              owner: "nodetool-ai",
              repo: "nodetool",
              channel: "nightly",
              releaseType: "prerelease",
            },
          ],
        },
        appInfo: {
          updaterCacheDirName: "nodetool-updater",
        },
      },
    });

    const config = fs.readFileSync(
      path.join(appOutDir, "resources", "app-update.yml"),
      "utf8"
    );
    expect(config).toContain("channel: nightly");
    expect(config).toContain("releaseType: prerelease");
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

const afterPackExtra = require("../../scripts/after-pack.cjs") as {
  placeNodeRuntime: (
    context: Record<string, unknown>,
    cacheRoot: string
  ) => Promise<void>;
  pruneDawnBinaries: (backendDir: string, platform: string, arch: string) => void;
  resolveResourcesDir: (context: Record<string, unknown>) => string;
};

describe("placeNodeRuntime", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nt-place-node-"));
  });
  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("copies the matching-arch node binary + npm into backend/runtime", async () => {
    const cacheRoot = path.join(tempDir, "cache");
    const srcDir = path.join(cacheRoot, "darwin-arm64");
    await fs.promises.mkdir(path.join(srcDir, "npm", "bin"), { recursive: true });
    await fs.promises.writeFile(path.join(srcDir, "node"), "#!fake-node\n");
    await fs.promises.writeFile(
      path.join(srcDir, "npm", "bin", "npm-cli.js"),
      "// fake npm\n"
    );

    const appOutDir = path.join(tempDir, "dist");
    const context = {
      electronPlatformName: "darwin",
      arch: "arm64",
      appOutDir,
      packager: { appInfo: { productFilename: "Nodetool" } },
    };

    await afterPackExtra.placeNodeRuntime(context, cacheRoot);

    const runtimeDir = path.join(
      afterPackExtra.resolveResourcesDir(context),
      "backend",
      "runtime"
    );
    const placed = path.join(runtimeDir, "node");
    expect(fs.existsSync(placed)).toBe(true);
    expect((fs.statSync(placed).mode & 0o111) !== 0).toBe(true); // executable
    // npm CLI ships next to the bundled node so installs stay self-contained.
    expect(
      fs.existsSync(path.join(runtimeDir, "npm", "bin", "npm-cli.js"))
    ).toBe(true);
  });
});

describe("pruneDawnBinaries", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nt-prune-dawn-"));
  });
  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("keeps darwin-universal and deletes off-platform binaries on mac", async () => {
    const dist = path.join(tempDir, "node_modules", "webgpu", "dist");
    await fs.promises.mkdir(dist, { recursive: true });
    for (const f of [
      "darwin-universal.dawn.node",
      "linux-x64.dawn.node",
      "linux-arm64.dawn.node",
      "win32-x64.dawn.node",
      "d3dcompiler_47.dll",
    ]) {
      await fs.promises.writeFile(path.join(dist, f), "x");
    }

    afterPackExtra.pruneDawnBinaries(tempDir, "darwin", "arm64");

    const remaining = fs.readdirSync(dist).sort();
    expect(remaining).toEqual(["darwin-universal.dawn.node"]);
  });
});
