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
        // electron-builder derives this from the package name (nodetool-electron)
        // → "nodetool-electron-updater". The written value must ignore it and
        // pin the canonical "nodetool-updater" used by the runtime updater.
        appInfo: {
          updaterCacheDirName: "nodetool-electron-updater",
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
    expect(config).not.toContain("nodetool-electron-updater");
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

const afterPackArch = require("../../scripts/after-pack.cjs") as {
  retargetPlatformPackages: (
    nodeModulesPath: string,
    platform: string,
    arch: string,
    fetchPackage: (name: string, version: string, destDir: string) => void
  ) => { from: string; to: string }[];
  pruneWebAudioPrebuilds: (backendDir: string, platform: string, arch: string) => void;
  machOArch: (filePath: string) => string | null;
  findForeignArchModules: (nodeModulesPath: string, arch: string) => string[];
};

async function writePackage(
  nodeModules: string,
  name: string,
  json: Record<string, unknown>
): Promise<void> {
  const dir = path.join(nodeModules, ...name.split("/"));
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name, ...json })
  );
}

describe("retargetPlatformPackages", () => {
  let nodeModules: string;
  beforeEach(async () => {
    nodeModules = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nt-retarget-"));
  });
  afterEach(async () => {
    await fs.promises.rm(nodeModules, { recursive: true, force: true });
  });

  // An x64 app packed from a bundle staged on an arm64 runner (issue #5994).
  it("replaces arm64 prebuilds with the x64 counterpart in an x64 mac app", async () => {
    await writePackage(nodeModules, "@napi-rs/canvas", {
      version: "0.1.100",
      optionalDependencies: {
        "@napi-rs/canvas-darwin-arm64": "0.1.100",
        "@napi-rs/canvas-darwin-x64": "0.1.100",
      },
    });
    await writePackage(nodeModules, "@napi-rs/canvas-darwin-arm64", {
      version: "0.1.100",
      os: ["darwin"],
      cpu: ["arm64"],
    });
    const fetched: string[] = [];
    const fetchPackage = (name: string, version: string, destDir: string): void => {
      fetched.push(`${name}@${version}`);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(
        path.join(destDir, "package.json"),
        JSON.stringify({ name, version, os: ["darwin"], cpu: ["x64"] })
      );
    };

    const swapped = afterPackArch.retargetPlatformPackages(
      nodeModules,
      "darwin",
      "x64",
      fetchPackage
    );

    expect(fetched).toEqual(["@napi-rs/canvas-darwin-x64@0.1.100"]);
    expect(swapped).toEqual([
      { from: "@napi-rs/canvas-darwin-arm64", to: "@napi-rs/canvas-darwin-x64" },
    ]);
    expect(fs.readdirSync(path.join(nodeModules, "@napi-rs")).sort()).toEqual([
      "canvas",
      "canvas-darwin-x64",
    ]);
  });

  it("leaves packages that match the target arch alone", async () => {
    await writePackage(nodeModules, "@img/sharp-darwin-arm64", {
      version: "0.35.3",
      os: ["darwin"],
      cpu: ["arm64"],
    });
    const fetchPackage = jest.fn();

    const swapped = afterPackArch.retargetPlatformPackages(
      nodeModules,
      "darwin",
      "arm64",
      fetchPackage
    );

    expect(swapped).toEqual([]);
    expect(fetchPackage).not.toHaveBeenCalled();
  });

  it("fails when a foreign-arch package has no declared counterpart", async () => {
    await writePackage(nodeModules, "orphan-darwin-arm64", {
      version: "1.0.0",
      os: ["darwin"],
      cpu: ["arm64"],
    });

    expect(() =>
      afterPackArch.retargetPlatformPackages(nodeModules, "darwin", "x64", jest.fn())
    ).toThrow(/orphan-darwin-arm64 is built for arm64, not x64/);
  });
});

describe("pruneWebAudioPrebuilds", () => {
  let backendDir: string;
  beforeEach(async () => {
    backendDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nt-web-audio-"));
  });
  afterEach(async () => {
    await fs.promises.rm(backendDir, { recursive: true, force: true });
  });

  it("keeps only the target arch's darwin prebuild", async () => {
    const pkgDir = path.join(backendDir, "node_modules", "node-web-audio-api");
    await fs.promises.mkdir(pkgDir, { recursive: true });
    for (const f of [
      "node-web-audio-api.darwin-arm64.node",
      "node-web-audio-api.darwin-x64.node",
      "index.cjs",
    ]) {
      await fs.promises.writeFile(path.join(pkgDir, f), "x");
    }

    afterPackArch.pruneWebAudioPrebuilds(backendDir, "darwin", "x64");

    expect(fs.readdirSync(pkgDir).sort()).toEqual([
      "index.cjs",
      "node-web-audio-api.darwin-x64.node",
    ]);
  });
});

describe("findForeignArchModules", () => {
  let nodeModules: string;
  beforeEach(async () => {
    nodeModules = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nt-macho-"));
  });
  afterEach(async () => {
    await fs.promises.rm(nodeModules, { recursive: true, force: true });
  });

  async function writeMachO(name: string, cpuType: number): Promise<string> {
    const releaseDir = path.join(nodeModules, name, "build", "Release");
    await fs.promises.mkdir(releaseDir, { recursive: true });
    await fs.promises.writeFile(path.join(nodeModules, name, "binding.gyp"), "{}");
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0xfeedfacf, 0);
    header.writeUInt32LE(cpuType, 4);
    const file = path.join(releaseDir, `${name}.node`);
    await fs.promises.writeFile(file, header);
    return file;
  }

  it("reports node-gyp builds compiled for another Mach-O arch", async () => {
    const keytar = await writeMachO("keytar", 0x0100000c);
    await writeMachO("cpu-features", 0x01000007);

    expect(afterPackArch.machOArch(keytar)).toBe("arm64");
    expect(afterPackArch.findForeignArchModules(nodeModules, "x64")).toEqual(["keytar"]);
    expect(afterPackArch.findForeignArchModules(nodeModules, "arm64")).toEqual([
      "cpu-features",
    ]);
  });
});
