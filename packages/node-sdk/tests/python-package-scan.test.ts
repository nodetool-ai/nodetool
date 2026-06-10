import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

import {
  findWrittenMetadataPath,
  scanPythonPackage
} from "../src/python-package-scan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "nodetool-core",
  "tests",
  "package_tools",
  "fixtures",
  "sample_pkg"
);

const CONDA_PY = join(
  process.env["HOME"] ?? "",
  "conda",
  "envs",
  "nodetool",
  "bin",
  "python"
);

const pythonAvailable =
  (process.env["NODETOOL_PYTHON"] &&
    existsSync(process.env["NODETOOL_PYTHON"])) ||
  existsSync(CONDA_PY);

const describeMaybe = pythonAvailable ? describe : describe.skip;

describeMaybe("scanPythonPackage", () => {
  it("scans the sample_pkg fixture", async () => {
    const python = process.env["NODETOOL_PYTHON"] ?? CONDA_PY;
    const progress: string[] = [];

    const { metadata, stderr } = await scanPythonPackage({
      packageDir: FIXTURE,
      python,
      onProgress: (line) => progress.push(line)
    });

    expect(metadata.name).toBe("nodetool-sample");
    expect(metadata.version).toBe("0.0.1");
    expect(metadata.nodes?.length ?? 0).toBe(1);
    expect(stderr).toContain("SCAN begin");
    expect(progress.some((l) => l.startsWith("SCAN begin"))).toBe(true);
    expect(progress.some((l) => l.startsWith("SCAN end"))).toBe(true);
  }, 60000);

  it("surfaces a nonzero exit as PythonScanError", async () => {
    const python = process.env["NODETOOL_PYTHON"] ?? CONDA_PY;
    await expect(
      scanPythonPackage({
        packageDir: "/definitely/not/a/package",
        python
      })
    ).rejects.toThrow();
  }, 30000);
});

describe("findWrittenMetadataPath", () => {
  it("returns the reported POSIX path verbatim", () => {
    const stderr =
      "SCAN start\nSCAN write path=/home/u/pkg/src/nodetool/package_metadata/my-pack.json\nSCAN done\n";
    expect(findWrittenMetadataPath(stderr)).toBe(
      "/home/u/pkg/src/nodetool/package_metadata/my-pack.json"
    );
  });

  it("accepts Windows backslash paths", () => {
    const stderr =
      "SCAN write path=C:\\Users\\u\\pkg\\src\\nodetool\\package_metadata\\my-pack.json\r\n";
    expect(findWrittenMetadataPath(stderr)).toBe(
      "C:\\Users\\u\\pkg\\src\\nodetool\\package_metadata\\my-pack.json"
    );
  });

  it("accepts flat (non-src) package layouts", () => {
    const stderr = "SCAN write path=/p/nodetool/package_metadata/base.json\n";
    expect(findWrittenMetadataPath(stderr)).toBe(
      "/p/nodetool/package_metadata/base.json"
    );
  });

  it("returns null when no write line is present", () => {
    expect(findWrittenMetadataPath("SCAN start\nSCAN done\n")).toBeNull();
  });
});
