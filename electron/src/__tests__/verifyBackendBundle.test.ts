import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// The script is ESM (.mjs), which ts-jest's CJS transform can't import, so we
// exercise it the way the build does: as a child process against a bundle dir.
const SCRIPT = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "scripts",
  "verify-backend-bundle.mjs"
);

const SERVER_SOURCE = [
  'const kie = req("kie-manifest.json");',
  'const aki = load({ pkg: "@nodetool-ai/runtime", path: "providers/aki-manifest.json" });',
  "const fal = loadManifest(pkg, 'fal-manifest.json');",
].join("\n");

function writeValidBundle(dir: string): void {
  fs.writeFileSync(path.join(dir, "server.mjs"), SERVER_SOURCE);
  for (const manifest of ["kie-manifest.json", "aki-manifest.json", "fal-manifest.json"]) {
    fs.writeFileSync(path.join(dir, manifest), "[]");
  }
  fs.mkdirSync(path.join(dir, "examples", "nodetool-base"), { recursive: true });
  fs.writeFileSync(path.join(dir, "examples", "nodetool-base", "hello.json"), "{}");
  fs.mkdirSync(path.join(dir, "examples", "apps"), { recursive: true });
  fs.writeFileSync(path.join(dir, "examples", "apps", "hello.app.json"), "{}");
  fs.mkdirSync(path.join(dir, "assets", "nodetool-base"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "nodetool-base", "hello.jpg"), "x");
  fs.mkdirSync(path.join(dir, "_modules", "webgpu", "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "_modules", "webgpu", "dist", "linux-x86-64.dawn.node"),
    "x"
  );
  writeStagedPackage(dir, "sharp", { version: "0.35.3" });
  writeStagedPackage(dir, "@img/sharp-linux-x64", {
    version: "0.35.3",
    optionalDependencies: { "@img/sharp-libvips-linux-x64": "1.3.2" },
  });
  writeStagedPackage(dir, "@img/sharp-libvips-linux-x64", { version: "1.3.2" });
}

function writeStagedPackage(
  dir: string,
  name: string,
  pkgJson: Record<string, unknown>
): void {
  const pkgDir = path.join(dir, "_modules", ...name.split("/"));
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name, ...pkgJson })
  );
}

/** Stage a scoped sandbox pack, optionally leaving its internal helper out. */
function writeSandboxPack(dir: string, { helper }: { helper: boolean }): void {
  const packDir = path.join(dir, "_sandbox", "@acme", "geo", "sandbox");
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "_sandbox", "@acme", "geo", "package.json"),
    JSON.stringify({
      name: "@acme/geo",
      nodetool: {
        sandboxModules: [{ name: ".", kind: "js", file: "sandbox/geo.js" }],
        internal: ["sandbox/helper.js"],
      },
    })
  );
  fs.writeFileSync(path.join(packDir, "geo.js"), "export const distance = () => 0;");
  if (helper) {
    fs.writeFileSync(path.join(packDir, "helper.js"), "export const helper = 1;");
  }
}

function runVerify(dir: string) {
  const result = spawnSync(process.execPath, [SCRIPT, dir], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
  };
}

describe("verify-backend-bundle", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-verify-bundle-"));
    writeValidBundle(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("passes when every referenced manifest and staged dir is present", () => {
    const { status, output } = runVerify(tempDir);
    expect(output).toContain("3 referenced manifest(s) staged");
    expect(status).toBe(0);
  });

  it("fails and names the manifest when a referenced one is not staged", () => {
    fs.rmSync(path.join(tempDir, "aki-manifest.json"));
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("aki-manifest.json");
    expect(output).toContain("not staged");
  });

  it("fails when server.mjs references no manifests at all", () => {
    fs.writeFileSync(path.join(tempDir, "server.mjs"), "console.log('hi');");
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("references no *-manifest.json");
  });

  it("fails when example workflows are missing", () => {
    fs.rmSync(path.join(tempDir, "examples"), { recursive: true });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("examples/nodetool-base");
  });

  it("fails when example apps are missing", () => {
    fs.rmSync(path.join(tempDir, "examples", "apps"), { recursive: true });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("examples/apps");
  });

  it("fails when package assets are missing", () => {
    fs.rmSync(path.join(tempDir, "assets"), { recursive: true });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("assets/nodetool-base");
  });

  it("fails when the webgpu dawn binary is not staged", () => {
    fs.rmSync(
      path.join(tempDir, "_modules", "webgpu", "dist", "linux-x86-64.dawn.node")
    );
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("dawn.node");
  });

  it("fails when the staged @img prebuild is from another sharp major", () => {
    writeStagedPackage(tempDir, "@img/sharp-linux-x64", {
      version: "0.34.5",
      optionalDependencies: { "@img/sharp-libvips-linux-x64": "1.2.4" },
    });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("@img/sharp-linux-x64 is 0.34.5");
  });

  it("fails when no @img prebuild is staged at all", () => {
    fs.rmSync(path.join(tempDir, "_modules", "@img"), { recursive: true });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("@img/sharp-<platform> prebuild");
  });

  it("fails when the staged libvips does not match what the prebuild pins", () => {
    writeStagedPackage(tempDir, "@img/sharp-libvips-linux-x64", {
      version: "1.2.4",
    });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("mismatched libvips");
  });

  it("passes when no builtin pack stages sandbox modules", () => {
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(0);
    expect(output).not.toContain("sandbox pack");
  });

  it("accepts a complete staged sandbox pack, scoped name and all", () => {
    writeSandboxPack(tempDir, { helper: true });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(0);
    expect(output).toContain("sandbox pack @acme/geo staged with 2 file(s)");
  });

  it("fails when a staged sandbox pack is missing a declared file", () => {
    writeSandboxPack(tempDir, { helper: false });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("_sandbox/@acme/geo declares file(s) that are not staged");
    expect(output).toContain("sandbox/helper.js");
  });

  it("fails when a staged sandbox pack carries no manifest", () => {
    fs.mkdirSync(path.join(tempDir, "_sandbox", "geo"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "_sandbox", "geo", "geo.js"), "export {};");
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("nodetool.sandboxModules");
  });

  it("fails when server.mjs itself is missing", () => {
    fs.rmSync(path.join(tempDir, "server.mjs"));
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("server.mjs");
  });
});
