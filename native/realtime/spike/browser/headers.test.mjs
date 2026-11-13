import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectHeaders } from "./headers.mjs";

test("RT-Q8 header inventory measures changes and fails on empty evidence", () => {
  const directory = mkdtempSync(join(tmpdir(), "realtime-headers-"));
  try {
    const native = join(directory, "native.h"), browser = join(directory, "browser.h"), source = join(directory, "source.cpp");
    writeFileSync(native, "void wgpuCreateInstance();\nvoid wgpuDevicePoll();\n");
    writeFileSync(browser, "void wgpuCreateInstance();\nvoid wgpuInstanceProcessEvents();\n");
    writeFileSync(source, 'wgpuCreateInstance(); wgpuDevicePoll(); // wgpuIgnored();\nconst char* message = "wgpuNotCalled()";');
    const report = inspectHeaders(native, browser, source);
    assert.deepEqual(report.lines, { added: 1, removed: 1, differing: 2 });
    assert.deepEqual(report.callsAbsentFromBrowserHeader, ["wgpuDevicePoll"]);
    assert.deepEqual(report.source.calls, ["wgpuCreateInstance", "wgpuDevicePoll"]);
    assert.equal(report.compatibilityEstablished, false);
    assert.equal(inspectHeaders(native, native, source).lines.differing, 0);
    writeFileSync(browser, "void wgpuCreateInstance();\r\nvoid wgpuDevicePoll();\r\n");
    assert.equal(inspectHeaders(native, browser, source).lines.differing, 0);
    writeFileSync(browser, "");
    assert.throws(() => inspectHeaders(native, browser, source), /Both inputs/);
    writeFileSync(browser, "void wgpuCreateInstance();\n");
    writeFileSync(source, "// no calls\n");
    assert.throws(() => inspectHeaders(native, browser, source), /no WebGPU calls/);
    assert.throws(() => inspectHeaders(join(directory, "missing"), browser, source), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
