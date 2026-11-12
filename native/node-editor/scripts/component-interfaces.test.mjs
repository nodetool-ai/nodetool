import { test } from "node:test";
import assert from "node:assert/strict";
import { inventory, parseHeader, readGroups, render, scanFile, stripSource } from "./component-interfaces.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const names = ["editor", "runOutput"];
const members = (scan, name = "editor") => [...(scan.uses[name]?.members.keys() ?? [])].sort();

test("comments and strings are not reads", () => {
  const scan = scanFile('Item {\n  // editor.fromComment\n  property string a: "editor.fromString"\n  property int b: editor.real\n}', { names });
  assert.deepEqual(members(scan), ["real"]);
  assert.equal(stripSource('"a//b" // c').length, '"a//b" // c'.length);
});

test("a local id hides the context property", () => {
  const scan = scanFile("Item { TextEdit { id: editor } property int n: editor.length }", { names });
  assert.deepEqual(scan.shadowed, ["editor"]);
  assert.equal(scan.uses.editor, undefined);
});

test("Connections handlers count as signal reads", () => {
  const scan = scanFile("Item { Connections { target: editor; function onTabsChanged() {} } }", { names });
  assert.deepEqual([...scan.uses.editor.members], [["tabsChanged", "signal"]]);
});

test("an alias and its local copies read the editor", () => {
  const scan = scanFile("Item { required property var host\n function f() { const target = host\n target.commitProperty(1)\n root.host.readOnly } }", { names, alias: "host" });
  assert.deepEqual(members(scan), ["commitProperty", "readOnly"]);
  assert.deepEqual(scan.uses.editor.via, ["host"]);
});

test("an alias that is no longer declared fails the scan", () => {
  assert.throws(() => scanFile("Item { property int n: host.x }", { names, alias: "host" }), /no longer declared/);
});

test("handing the whole object on is reported, guards are not", () => {
  const scan = scanFile("Item {\n  property var propertyHost: editor\n  property int n: editor ? editor.count : 0\n  function f() { if (editor) open(editor) }\n}", { names });
  assert.deepEqual(scan.uses.editor.bare, ["propertyHost:", "open()"]);
});

test("header parse finds properties, invokables, slots and signals", () => {
  const h = parseHeader("class X : public QObject {\n Q_PROPERTY(QVariantList rows READ rows NOTIFY rowsChanged)\npublic:\n Q_INVOKABLE void add(int);\npublic slots:\n void refresh();\nsignals:\n void rowsChanged();\nprivate:\n void hidden();\n};");
  assert.deepEqual([...h.properties], ["rows"]);
  assert.deepEqual([...h.methods].sort(), ["add", "refresh"]);
  assert.deepEqual([...h.signals], ["rowsChanged"]);
});

test("the checked-in page covers every QML file and every read member", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const inv = inventory(root);
  assert.ok(inv.files.length > 50, `scanned only ${inv.files.length} files`);
  assert.deepEqual(inv.unknown, []);
  const groups = readGroups(readFileSync(join(root, "docs/component-interfaces.md"), "utf8"));
  assert.doesNotThrow(() => render(inv, groups));
  const [group, [member]] = Object.entries(groups)[0];
  const missing = structuredClone(groups);
  missing[group] = missing[group].filter((m) => m !== member);
  assert.throws(() => render(inv, missing), new RegExp(`no proposed interface: ${member}$`));
  assert.throws(() => render(inv, { ...groups, Extra: ["notReadAnywhere"] }), /no QML file reads: notReadAnywhere/);
});
