import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
