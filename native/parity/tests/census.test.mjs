import assert from "node:assert/strict";
import { test } from "node:test";
import { appMenuBindings, censusComponents, censusOutOfScope, censusPropertyTypes, censusShortcuts, gestureBindings, normalizeCombo, runCensus, summarize } from "../census.mjs";

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

test("components under an out-of-scope feature leave the parity count", () => {
    const outOfScope = { "chain-view": { reason: "no", web: ["web/src/components/chain_editor"] } };
    const web = [{ id: "web/src/components/chain_editor/ChainEditor.tsx" }, { id: "web/src/components/chain_editorial/X.tsx" }, { id: "web/src/components/node/Sketch.tsx" }];
    const registry = { "web/src/components/node/Sketch.tsx": { outOfScope: "sketch-editor" } };
    const { items, problems } = censusComponents(web, registry, undefined, outOfScope);
    assert.deepEqual(items.map((i) => i.status), ["outOfScope", "unreviewed", "outOfScope"]);
    assert.equal(problems.length, 1);
    const summary = summarize([{ status: "match" }, { status: "missing" }, { status: "outOfScope" }]);
    assert.equal(summary.parity, 50);
    assert.equal(summary.coverage, 100);
});

test("an out-of-scope feature must name existing web sources and a reason", () => {
    const problems = censusOutOfScope({ a: { reason: "x", web: ["web/src/components/does-not-exist"] }, b: { web: [] } });
    assert.equal(problems.length, 3);
});

test("the census reads every inventory from this checkout without registry problems", async () => {
    const report = await runCensus();
    assert.deepEqual(report.problems, []);
    for (const inventory of Object.values(report.inventories)) {
        assert.ok(inventory.total > 0);
    }
});

test("application menu entries bind each key sequence to their call", () => {
    const source = `entry(file, tr("Close Tab"), [this] { closeTab(activeTab()); }, {QKeySequence(QStringLiteral("Ctrl+W"))});
    entry(window, tr("Next Tab"), [this] { selectAdjacentTab(1); },
          {QKeySequence(QStringLiteral("Ctrl+PgDown")), QKeySequence(QStringLiteral("Ctrl+Shift+]"))});
    command(view, tr("Inspector"), QStringLiteral("Toggle inspector"));`;
    assert.deepEqual(appMenuBindings(source).map((b) => [b.command, b.combo]), [
        ["closeTab(activeTab())", "ctrl+w"],
        ["selectAdjacentTab(1)", "ctrl+pgdown"],
        ["selectAdjacentTab(1)", "ctrl+shift+]"]
    ]);
});

test("a TapHandler with a button and a modifier is a gesture binding", () => {
    const source = `TapHandler {
        acceptedButtons: Qt.RightButton
        acceptedModifiers: Qt.ControlModifier
        onTapped: if (root.descriptor.changed === true) root.removeValue()
    }
    TapHandler {
        acceptedButtons: Qt.RightButton
        onTapped: root.openMenu()
    }`;
    const bindings = gestureBindings(source, "qml/PropertyField.qml");
    assert.deepEqual(bindings.map((b) => [b.command, b.combo]), [["removeValue()", "ctrl+mouseright"]]);
    assert.equal(normalizeCombo(["Control", "MouseRight"]), bindings[0].combo);
});
