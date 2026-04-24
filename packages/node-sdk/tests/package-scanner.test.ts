import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { scanPackage } from "../src/package-scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureSrc = path.join(__dirname, "fixtures", "sample-package");

const tmpDirs: string[] = [];

function copyRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function freshFixture(): string {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-scanner-"));
  tmpDirs.push(dst);
  copyRecursive(fixtureSrc, dst);
  return dst;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanPackage", () => {
  it("writes metadata JSON with nodes, examples, and assets", async () => {
    const pkgDir = freshFixture();
    const result = await scanPackage({ packageDir: pkgDir });

    expect(result.nodeCount).toBe(2);
    expect(result.exampleCount).toBe(2);
    expect(result.assetCount).toBe(1);
    expect(fs.existsSync(result.metadataPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(result.metadataPath, "utf8"));
    expect(parsed.name).toBe("nodetool-sample");
    expect(parsed.version).toBe("0.1.0");
    expect(parsed.authors).toEqual(["Test Author <test@example.com>"]);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0].node_type).toMatch(/^sample\./);
    expect(parsed.examples).toHaveLength(2);
    expect(parsed.examples[0].package_name).toBe("nodetool-sample");
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0].name).toBe("icon.txt");
  });

  it("throws when dist/index.js is missing", async () => {
    const pkgDir = freshFixture();
    fs.rmSync(path.join(pkgDir, "dist"), { recursive: true, force: true });
    await expect(scanPackage({ packageDir: pkgDir })).rejects.toThrow(
      /npm run build/
    );
  });

  it("throws when package.json is missing", async () => {
    const pkgDir = freshFixture();
    fs.unlinkSync(path.join(pkgDir, "package.json"));
    await expect(scanPackage({ packageDir: pkgDir })).rejects.toThrow(
      /package.json/
    );
  });

  it("writes to custom outputDir", async () => {
    const pkgDir = freshFixture();
    const customOut = path.join(pkgDir, "custom-out");
    const result = await scanPackage({
      packageDir: pkgDir,
      outputDir: customOut
    });
    expect(result.metadataPath.startsWith(customOut)).toBe(true);
    expect(fs.existsSync(result.metadataPath)).toBe(true);
  });
});
