// node --test native/timeline/scripts/op-conformance.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { missingHelpers } from "./op-conformance.mjs";

// Parity run 2026-11-14: a suite whose oracle was not built failed with ENOENT
// on every case, and one reported only "suite error".
test("missingHelpers names each absent helper binary and the suite that needs it", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "op-conformance-test-"));
  try {
    const present = path.join(dir, "track-ops");
    writeFileSync(present, "");
    const absent = path.join(dir, "tst_sync");
    const missing = missingHelpers([
      { tests: ["a.test.ts"], env: { NT_TRACK_OPS: present } },
      { tests: ["merge.test.ts"], env: { NT_MERGE_BINARY: absent, NT_DIFF_CASES: "300" } },
      { tests: ["b.test.ts"] }
    ]);
    assert.deepEqual(missing, [{ variable: "NT_MERGE_BINARY", path: absent, tests: ["merge.test.ts"] }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
