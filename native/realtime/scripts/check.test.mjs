import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { requireTestInventory } from "./check.mjs";

const budget = JSON.parse(readFileSync(new URL("../budgets/offline.json", import.meta.url), "utf8"));
test("offline check refuses an empty or partial CTest inventory", () => {
  assert.throws(() => requireTestInventory({ tests: [] }), /Missing required offline checks/);
  assert.throws(() => requireTestInventory({}), /Missing required offline checks/);
  for (const omitted of budget.requiredTests) {
    assert.throws(() => requireTestInventory({ tests: budget.requiredTests.filter((name) => name !== omitted).map((name) => ({ name })) }), /Missing required offline checks/);
  }
});
test("offline check accepts the complete required inventory", () => {
  assert.ok(budget.requiredTests.length > 0);
  requireTestInventory({ tests: budget.requiredTests.map((name) => ({ name })) });
});

test("every required check rejects disabled and skip policies", () => {
  for (const name of budget.requiredTests) {
    for (const property of [
      { name: "DISABLED", value: true },
      { name: "SKIP_RETURN_CODE", value: 0 },
      { name: "SKIP_REGULAR_EXPRESSION", value: ["unavailable"] }
    ]) {
      const inventory = { tests: budget.requiredTests.map((entry) => ({
        name: entry, properties: entry === name ? [property] : []
      })) };
      assert.throws(() => requireTestInventory(inventory), {
        message: `Required offline check ${name} cannot use ${property.name}`
      });
    }
  }
});

test("ordinary CTest properties and disabled optional checks are allowed", () => {
  requireTestInventory({ tests: [
    ...budget.requiredTests.map((name) => ({ name, properties: [
      { name: "DISABLED", value: false },
      { name: "TIMEOUT", value: 60 },
      { name: "SKIP_REGULAR_EXPRESSION", value: [] }
    ] })),
    { name: "optional-check", properties: [{ name: "DISABLED", value: true }] }
  ] });
});

test("real CTest success does not qualify a disabled or skipped required check", () => {
  const directory = mkdtempSync(join(tmpdir(), "nt-offline-inventory-"));
  try {
    const executable = process.execPath.replaceAll("\\", "/");
    for (const policy of ["DISABLED TRUE", "SKIP_RETURN_CODE 0", "SKIP_REGULAR_EXPRESSION skip"]) {
      writeFileSync(join(directory, "CTestTestfile.cmake"), budget.requiredTests.map((name, index) =>
        `add_test(${name} "${executable}" "-e" "console.log('skip')")\n` +
        (index === 0 ? `set_tests_properties(${name} PROPERTIES ${policy})\n` : "")
      ).join(""));
      const inventory = spawnSync("ctest", ["--test-dir", directory, "--show-only=json-v1"], {
        encoding: "utf8", timeout: 30000
      });
      assert.equal(inventory.status, 0, inventory.error?.message || inventory.stderr);
      const execution = spawnSync("ctest", ["--test-dir", directory, "--no-tests=error", "--output-on-failure"], {
        encoding: "utf8", timeout: 30000
      });
      assert.equal(execution.status, 0, execution.error?.message || execution.stdout || execution.stderr);
      assert.match(execution.stdout, /Disabled|Skipped/);
      assert.throws(() => requireTestInventory(JSON.parse(inventory.stdout)), /Required offline check .* cannot use/);
    }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("nt-offline-inventory-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
