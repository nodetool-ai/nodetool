import assert from "node:assert/strict";
import { test } from "node:test";
import { censusPropertyTypes, censusShortcuts, normalizeCombo, runCensus, summarize } from "../census.mjs";

test("normalizeCombo spells web and native combinations the same way", () => {
    assert.equal(normalizeCombo(["Control", "Shift", "Z"]), "ctrl+shift+z");
    assert.equal(normalizeCombo("Ctrl+Shift+Z"), "ctrl+shift+z");
    assert.equal(normalizeCombo(["ArrowLeft"]), "left");
});

test("a shortcut bound to a different key combination differs", () => {
    const web = [{ id: "undo", title: "Undo", combos: ["ctrl+z"] }];
    const { items, problems } = censusShortcuts(web, [{ command: "Undo", combo: "ctrl+y" }], { undo: { native: "Undo" } });
    assert.equal(items[0].status, "differs");
    assert.deepEqual(problems, []);
});

test("a registry entry naming an unbound native command is a problem", () => {
    const web = [{ id: "undo", title: "Undo", combos: ["ctrl+z"] }];
    const { items, problems } = censusShortcuts(web, [], { undo: { native: "Undo" }, gone: { missing: "x" } });
    assert.equal(items[0].status, "missing");
    assert.equal(problems.length, 2);
});

test("a property type the scan cannot see counts as a match when the registry names its path", () => {
    const native = { types: new Set(["str"]), mediaOverrides: false, hfModels: false };
    const { items } = censusPropertyTypes([{ id: "str" }, { id: "enum" }, { id: "text" }], native, { enum: { native: "choice" } });
    assert.deepEqual(items.map((i) => i.status), ["match", "match", "missing"]);
});

test("parity counts reviewed items and coverage counts what is reviewed", () => {
    const summary = summarize([{ status: "match" }, { status: "partial" }, { status: "missing" }, { status: "unreviewed" }, { status: "accepted" }]);
    assert.equal(summary.parity, 50);
    assert.equal(summary.coverage, 75);
});

test("the census reads every inventory from this checkout without registry problems", async () => {
    const report = await runCensus();
    assert.deepEqual(report.problems, []);
    for (const inventory of Object.values(report.inventories)) {
        assert.ok(inventory.total > 0);
    }
});
