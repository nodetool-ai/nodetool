import * as path from "path";

const c = require("../../scripts/node-runtime.constants.cjs") as {
  NODE_RUNTIME_VERSION: string;
  nodeBinaryName: (platform: string) => string;
  nodeArchive: (
    platform: string,
    arch: string
  ) => { dir: string; archive: string; binaryInArchive: string };
  npmDirInArchive: (platform: string, dir: string) => string;
  NPM_RUNTIME_DIR: string;
  NPM_CLI_RUNTIME_PATH: string;
  dawnKeepFiles: (platform: string, arch: string) => string[];
  ALL_DAWN_FILES: string[];
};

describe("node-runtime.constants", () => {
  it("pins the Node version to 22.22.1", () => {
    expect(c.NODE_RUNTIME_VERSION).toBe("22.22.1");
  });

  it("names the node binary per platform", () => {
    expect(c.nodeBinaryName("win32")).toBe("node.exe");
    expect(c.nodeBinaryName("darwin")).toBe("node");
    expect(c.nodeBinaryName("linux")).toBe("node");
  });

  it("builds nodejs.org archive info per target", () => {
    const mac = c.nodeArchive("darwin", "arm64");
    expect(mac.dir).toBe("node-v22.22.1-darwin-arm64");
    expect(mac.archive).toBe("node-v22.22.1-darwin-arm64.tar.gz");
    expect(mac.binaryInArchive).toBe("node-v22.22.1-darwin-arm64/bin/node");

    const win = c.nodeArchive("win32", "x64");
    expect(win.dir).toBe("node-v22.22.1-win-x64");
    expect(win.archive).toBe("node-v22.22.1-win-x64.zip");
    expect(win.binaryInArchive).toBe("node-v22.22.1-win-x64/node.exe");
  });

  it("locates the npm package inside each archive layout", () => {
    expect(c.npmDirInArchive("darwin", "node-v22.22.1-darwin-arm64")).toBe(
      "node-v22.22.1-darwin-arm64/lib/node_modules/npm"
    );
    expect(c.npmDirInArchive("linux", "node-v22.22.1-linux-x64")).toBe(
      "node-v22.22.1-linux-x64/lib/node_modules/npm"
    );
    expect(c.npmDirInArchive("win32", "node-v22.22.1-win-x64")).toBe(
      "node-v22.22.1-win-x64/node_modules/npm"
    );
  });

  it("pins where the bundled npm CLI lives under backend/runtime", () => {
    expect(c.NPM_RUNTIME_DIR).toBe("npm");
    expect(c.NPM_CLI_RUNTIME_PATH).toBe(path.join("npm", "bin", "npm-cli.js"));
  });

  it("keeps only the target platform's dawn.node binaries", () => {
    expect(c.dawnKeepFiles("darwin", "arm64")).toEqual([
      "darwin-universal.dawn.node",
    ]);
    expect(c.dawnKeepFiles("darwin", "x64")).toEqual([
      "darwin-universal.dawn.node",
    ]);
    expect(c.dawnKeepFiles("win32", "x64")).toEqual([
      "win32-x64.dawn.node",
      "d3dcompiler_47.dll",
    ]);
    expect(c.dawnKeepFiles("linux", "x64")).toEqual(["linux-x64.dawn.node"]);
  });

  it("lists every shipped dawn binary so off-target ones can be pruned", () => {
    expect(c.ALL_DAWN_FILES).toEqual(
      expect.arrayContaining([
        "darwin-universal.dawn.node",
        "linux-x64.dawn.node",
        "linux-arm64.dawn.node",
        "win32-x64.dawn.node",
        "d3dcompiler_47.dll",
      ])
    );
  });
});
