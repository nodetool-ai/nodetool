import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileTauriGameProject, type TauriAppMetadata } from "../src/build-tauri.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-cargo-artifact-"));
  directories.push(directory);
  return directory;
}

describe("Cargo artifact reporting", () => {
  async function fixture(relativeBinary: string, mode = "ok"): Promise<{
    project: Parameters<typeof compileTauriGameProject>[0];
    options: NonNullable<Parameters<typeof compileTauriGameProject>[1]>;
    binaryPath: string;
  }> {
    const directory = await tempDir();
    const metadata: TauriAppMetadata = { productName: "Cargo artifact", identifier: "ai.nodetool.cargo-artifact",
      version: "1.0.0", crateName: "cargo-artifact", width: 1280, height: 800, sourceRevision: "fixture", dimension: "2d" };
    const binaryPath = join(directory, relativeBinary);
    await writeFile(join(directory, "Cargo.toml"), `[package]\nname = "${metadata.crateName}"\n`);
    await writeFile(join(directory, "package.json"), '{"type":"module"}');
    await writeFile(join(directory, "build"), `
      import { mkdir, writeFile } from "node:fs/promises";
      import { dirname, join } from "node:path";
      const binary = ${JSON.stringify(binaryPath)};
      const mode = ${JSON.stringify(mode)};
      await writeFile("arguments.json", JSON.stringify(process.argv.slice(2)));
      if (mode === "failure") { console.error("compiler diagnostic retained"); process.exit(17); }
      const artifact = { reason: "compiler-artifact", manifest_path: join(process.cwd(), "Cargo.toml"),
        target: { name: ${JSON.stringify(metadata.crateName)}, kind: ["bin"] }, executable: binary };
      console.log(JSON.stringify({ ...artifact, target: { ...artifact.target, kind: ["lib"] }, executable: binary + ".dependency" }));
      console.log(JSON.stringify({ ...artifact, manifest_path: join(process.cwd(), "dependency", "Cargo.toml"), executable: binary + ".foreign" }));
      if (mode !== "missing-report") {
        if (mode !== "missing-file") { await mkdir(dirname(binary), { recursive: true }); await writeFile(binary, "executable fixture"); }
        const line = JSON.stringify(artifact) + "\\n";
        process.stdout.write(line.slice(0, 23));
        setImmediate(() => process.stdout.write(line.slice(23)));
      }
    `);
    const env = { ...process.env };
    if (relativeBinary.startsWith("environment-output")) { env.CARGO_TARGET_DIR = "environment-output"; }
    if (relativeBinary.includes("x86_64-unknown-linux-gnu")) { env.CARGO_BUILD_TARGET = "x86_64-unknown-linux-gnu"; }
    return { project: { tauriDir: directory, metadata }, options: { cargo: process.execPath, env }, binaryPath };
  }

  it.each([
    ["default release", "target/release/cargo-artifact"],
    ["explicit host target", "target/x86_64-unknown-linux-gnu/release/cargo-artifact"],
    ["environment target directory", "environment-output/release/cargo-artifact"],
    ["Cargo config target directory", "configured-output/release/cargo-artifact"],
    ["Windows executable suffix", "target/release/cargo-artifact.exe"]
  ])("uses Cargo's reported executable for %s", async (_name, relativeBinary) => {
    const { project, options, binaryPath } = await fixture(relativeBinary);
    if (relativeBinary.startsWith("configured-output")) {
      await mkdir(join(project.tauriDir, ".cargo"));
      await writeFile(join(project.tauriDir, ".cargo", "config.toml"), '[build]\ntarget-dir = "configured-output"\n');
    }
    expect(await compileTauriGameProject(project, options)).toEqual({ binaryPath });
    expect(JSON.parse(await readFile(join(project.tauriDir, "arguments.json"), "utf8")))
      .toEqual(["--release", "--message-format=json-render-diagnostics"]);
    expect(await readFile(binaryPath, "utf8")).toBe("executable fixture");
  });

  it.each(["missing-report", "missing-file"])("rejects successful Cargo with %s", async (mode) => {
    const { project, options } = await fixture("actual/game", mode);
    await expect(compileTauriGameProject(project, options)).rejects.toThrow(/executable/i);
  });

  it("preserves a compiler failure's exit code and diagnostic", async () => {
    const { project, options } = await fixture("actual/game", "failure");
    await expect(compileTauriGameProject(project, options)).rejects.toThrow(/exit code 17[\s\S]*compiler diagnostic retained/);
  });
});
