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
  fs.mkdirSync(path.join(dir, "examples", "storyboards"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "examples", "storyboards", "hello.storyboard.json"),
    JSON.stringify(STORYBOARD_BUNDLE)
  );
  fs.mkdirSync(path.join(dir, "assets", "nodetool-base", "storyboards", "hello"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, "assets", "nodetool-base", "storyboards", "hello", "shot.jpg"),
    "x"
  );
  fs.writeFileSync(
    path.join(dir, "assets", "nodetool-base", "storyboards", "hello", "shot.mp4"),
    "x"
  );
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
  writeStagedPackage(dir, "mediabunny", { version: "1.54.0" });
  writeStagedPackage(dir, "@mediabunny/server", { version: "1.54.0" });
  writeStagedPackage(dir, "node-av", { version: "6.1.1" });
  writeStagedPackage(dir, "@seydx/node-av-linux-x64", { version: "6.1.1" });
  fs.writeFileSync(
    path.join(dir, "_modules", "@seydx", "node-av-linux-x64", "node-av.node"),
    "x"
  );
  writeShippedSandboxPacks(dir);
  writeShippedSystemSkills(dir);
  writeShippedFonts(dir);
  fs.mkdirSync(path.join(dir, "js-sandbox-worker"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "js-sandbox-worker", "worker-entry.js"),
    "export {};"
  );
}

/** One shipped board, naming the two media files staged alongside it. */
const STORYBOARD_BUNDLE = {
  name: "Hello",
  document: {
    shots: [
      {
        id: "shot-1",
        keyframe: { uri: "package://nodetool-base/storyboards/hello/shot.jpg" },
        clip: { uri: "package://nodetool-base/storyboards/hello/shot.mp4" },
      },
    ],
  },
};

const SANDBOX_PACKS_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "sandbox-packs"
);

const FONTS_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "timeline",
  "fonts"
);

const SYSTEM_SKILLS_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "system-skills"
);

/**
 * Stage every pack the repo ships, each declaring one module.
 *
 * The script cross-checks the staged set against `packages/sandbox-packs/`
 * whenever it runs inside a checkout, so a fixture staging none of them is an
 * incomplete bundle rather than a minimal one. The stub carries one module and
 * its file rather than each pack's real contents: completeness is read from the
 * STAGED manifest, and a pack missing a declared file has its own test.
 */
function writeShippedSandboxPacks(dir: string): void {
  for (const entry of fs.readdirSync(SANDBOX_PACKS_DIR)) {
    const manifest = path.join(SANDBOX_PACKS_DIR, entry, "package.json");
    if (!fs.existsSync(manifest)) continue;
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
      name?: string;
      nodetool?: { sandboxModules?: unknown };
    };
    if (!pkg.name || !Array.isArray(pkg.nodetool?.sandboxModules)) continue;
    const packDir = path.join(dir, "_sandbox", ...pkg.name.split("/"));
    fs.mkdirSync(path.join(packDir, "sandbox"), { recursive: true });
    fs.writeFileSync(
      path.join(packDir, "package.json"),
      JSON.stringify({
        name: pkg.name,
        nodetool: {
          sandboxModules: [{ name: ".", kind: "js", file: "sandbox/index.js" }],
        },
      })
    );
    fs.writeFileSync(path.join(packDir, "sandbox", "index.js"), "export default 1;");
  }
}

/**
 * Stage every system skill the repo ships.
 *
 * Same reason as the packs above: the script cross-checks the staged set
 * against `packages/system-skills/` whenever it runs inside a checkout, so a
 * fixture staging none of them is an incomplete bundle, not a minimal one.
 */
function writeShippedSystemSkills(dir: string): void {
  for (const entry of fs.readdirSync(SYSTEM_SKILLS_DIR)) {
    if (!fs.existsSync(path.join(SYSTEM_SKILLS_DIR, entry, "SKILL.md"))) continue;
    const skillDir = path.join(dir, "_skills", entry);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: x\n---\n");
  }
}

/**
 * Stage every bundled font file the repo ships.
 *
 * Same reason as the packs and skills above: the script cross-checks the
 * staged set against `packages/timeline/fonts/` inside a checkout, so a
 * fixture staging none of them is an incomplete bundle. The bytes are a stub —
 * what the check reads is presence, and no face is parsed here.
 */
function writeShippedFonts(dir: string): void {
  const fontDir = path.join(dir, "fonts");
  fs.mkdirSync(fontDir, { recursive: true });
  for (const entry of fs.readdirSync(FONTS_DIR)) {
    if (!/\.(ttf|otf|txt)$/i.test(entry)) continue;
    fs.writeFileSync(path.join(fontDir, entry), "x");
  }
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
    env: {
      ...process.env,
      NODETOOL_BUNDLE_PLATFORM: "linux",
      NODETOOL_BUNDLE_ARCH: "x64",
    },
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

  it("fails when a shipped storyboard's media were not staged", () => {
    fs.rmSync(
      path.join(tempDir, "assets", "nodetool-base", "storyboards", "hello", "shot.mp4")
    );
    const { status, output } = runVerify(tempDir);
    expect(output).toContain("example storyboard media not staged");
    expect(output).toContain("storyboards/hello/shot.mp4");
    expect(status).toBe(1);
  });

  it("fails when no example storyboard is staged at all", () => {
    fs.rmSync(path.join(tempDir, "examples", "storyboards"), {
      recursive: true,
      force: true,
    });
    const { status, output } = runVerify(tempDir);
    expect(output).toContain("examples/storyboards/ is missing");
    expect(status).toBe(1);
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

  it("fails when the Mediabunny server codec prebuild is missing", () => {
    fs.rmSync(path.join(tempDir, "_modules", "@seydx"), { recursive: true });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("node-av-linux-x64/node-av.node");
  });

  it("fails when the staged libvips does not match what the prebuild pins", () => {
    writeStagedPackage(tempDir, "@img/sharp-libvips-linux-x64", {
      version: "1.2.4",
    });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("mismatched libvips");
  });

  it("names a shipped pack the bundle failed to stage", () => {
    // A bundle missing one offers a library the product documents and a Code
    // node cannot import, so this is an error rather than a quiet omission.
    fs.rmSync(path.join(tempDir, "_sandbox", "@nodetool-ai", "sandbox-csv"), {
      recursive: true,
    });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("@nodetool-ai/sandbox-csv");
    expect(output).toContain("not staged under _sandbox/");
  });

  it("accepts a complete staged sandbox pack, scoped name and all", () => {
    writeSandboxPack(tempDir, { helper: true });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(0);
    expect(output).toContain(
      "sandbox pack @acme/geo staged: 1 module(s), 2 declared file(s)"
    );
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

  it("fails when a shipped system skill is not staged", () => {
    // The failing branch is what the docker leg would have hit: it referenced
    // an accumulator that does not exist, so a missing skill crashed the
    // verifier instead of being reported. Only inverting the check found it.
    const skills = fs
      .readdirSync(path.join(tempDir, "_skills"))
      .sort();
    expect(skills.length).toBeGreaterThan(0);
    fs.rmSync(path.join(tempDir, "_skills", skills[0]), {
      recursive: true,
      force: true,
    });
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("System skill(s) not staged under _skills/");
    expect(output).toContain(skills[0]);
  });

  it("reports the shipped system skills it found", () => {
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(0);
    // Asserting a count, so the check cannot pass by having matched nothing.
    const staged = fs.readdirSync(path.join(tempDir, "_skills")).length;
    expect(output).toContain(`system skills staged: ${staged}`);
  });

  // C6, and the check T17 was required to observe failing: the packaged
  // backend registers these faces before it draws a title, so an unstaged one
  // silently renders every clip in that family in a host font.
  it("fails when a bundled font file is not staged", () => {
    const fonts = fs.readdirSync(path.join(tempDir, "fonts")).sort();
    expect(fonts).toContain("BebasNeue-Regular.ttf");
    fs.rmSync(path.join(tempDir, "fonts", "BebasNeue-Regular.ttf"));
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("Bundled font file(s) not staged under fonts/");
    expect(output).toContain("BebasNeue-Regular.ttf");
  });

  // A face without its licence is a licensing failure, not a cosmetic one
  // (C7), so the OFL files are checked with the faces rather than beside them.
  it("fails when a font licence is not staged", () => {
    fs.rmSync(path.join(tempDir, "fonts", "OFL-Inter.txt"));
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("OFL-Inter.txt");
  });

  it("reports the bundled font files it found", () => {
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(0);
    // A count, so the check cannot pass by having matched nothing.
    const staged = fs.readdirSync(path.join(tempDir, "fonts")).length;
    expect(staged).toBeGreaterThan(0);
    expect(output).toContain(`${staged} bundled font file(s) staged`);
  });

  it("fails when server.mjs itself is missing", () => {
    fs.rmSync(path.join(tempDir, "server.mjs"));
    const { status, output } = runVerify(tempDir);
    expect(status).toBe(1);
    expect(output).toContain("server.mjs");
  });
});
