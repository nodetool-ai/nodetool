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
  fs.mkdirSync(path.join(dir, "assets", "nodetool-base"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "nodetool-base", "hello.jpg"), "x");
  fs.mkdirSync(path.join(dir, "_modules", "webgpu", "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "_modules", "webgpu", "dist", "linux-x86-64.dawn.node"),
    "x"
  );
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

  it("fails when server.mjs itself is missing", () => {
    fs.rmSync(path.join(tempDir, "server.mjs"));
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("server.mjs");
  });
});
