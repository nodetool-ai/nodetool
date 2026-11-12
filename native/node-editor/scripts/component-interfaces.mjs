#!/usr/bin/env node
// Inventory of what each node editor QML file reads from the editor window and
// the other root context properties. It writes the generated sections of
// docs/component-interfaces.md, or with --check fails when they are stale.
//
//   node native/node-editor/scripts/component-interfaces.mjs [--check] [--json]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Root context properties set in EditorWindow::EditorWindow, with the header
// of the object behind each one.
export const CONTEXT_PROPERTIES = {
  editor: "src/ui/EditorWindow.h",
  workflowBrowser: "src/server/WorkflowBrowser.h",
  libraryBrowser: "src/library/LibraryBrowser.h",
  runOutput: "src/run/RunOutputModel.h",
  workflowSession: "src/server/WorkflowSession.h",
  mediaResolver: "src/media/MediaResolver.h",
  modelPickerController: "src/properties/ModelPickerController.h",
  assetPickerController: "src/properties/AssetPickerController.h",
  resourcePickerController: "src/properties/ResourcePickerController.h",
  documentPickerController: "src/properties/DocumentPickerController.h",
};

// Properties that hold the EditorWindow under another name. Each entry names
// where the window is assigned, and the scan fails when the file stops
// declaring the property, so the list cannot silently go stale.
// QWidget properties QML reads on the window itself.
const INHERITED = { editor: new Set(["width", "height"]) };

export const EDITOR_ALIASES = {
};

// Replaces comments with spaces and string contents with "_", keeping offsets,
// so a URL such as "qrc://" or a word inside text is never read as a member.
export function stripSource(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && n === "*") {
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) { out += text[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      out += c; i++;
      while (i < text.length && text[i] !== c) {
        if (text[i] === "\\") { out += "__"; i += 2; continue; }
        out += text[i] === "\n" ? "\n" : "_"; i++;
      }
      out += c; i++;
    } else {
      out += c; i++;
    }
  }
  return out;
}

// Members QML can reach on a QObject: Q_PROPERTY names, Q_INVOKABLE and slot
// methods, and signals.
export function parseHeader(text) {
  const src = stripSource(text);
  const properties = new Set();
  for (const m of src.matchAll(/Q_PROPERTY\(\s*[\w:<>*\s]+?[\s*](\w+)\s+(?:READ|MEMBER)\b/g)) { properties.add(m[1]); }
  const methods = new Set();
  for (const m of src.matchAll(/(?:Q_INVOKABLE|Q_SLOT)\s+[^;{(]*?\b(\w+)\s*\(/g)) { methods.add(m[1]); }
  const signals = new Set();
  const lines = src.split("\n");
  let section = "";
  for (const line of lines) {
    const access = line.match(/^\s*(public|private|protected|signals|Q_SIGNALS)\s*(slots|Q_SLOTS)?\s*:/);
    if (access) { section = access[2] ? `${access[1]} slots` : access[1]; continue; }
    const fn = line.match(/^\s*(?:virtual\s+)?[\w:<>,*&\s]+?\b(\w+)\s*\([^)]*\)?/);
    if (!fn) { continue; }
    if (section === "signals" || section === "Q_SIGNALS") { signals.add(fn[1]); }
    if (section === "public slots") { methods.add(fn[1]); }
  }
  return { properties, methods, signals };
}

function blockAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") { depth++; }
    if (src[i] === "}" && --depth === 0) { return src.slice(open, i + 1); }
  }
  return src.slice(open);
}

// What one QML or JS file reads from each context property and alias.
export function scanFile(text, { names, alias }) {
  const src = stripSource(text);
  const result = { shadowed: [], uses: {} };
  const targets = [...names];
  for (const name of names) {
    if (new RegExp(`\\bid\\s*:\\s*${name}\\b`).test(src)) { result.shadowed.push(name); }
  }
  if (alias) {
    if (!new RegExp(`property\\s+[\\w.<>]+\\s+${alias}\\b`).test(src)) {
      throw new Error(`alias "${alias}" is no longer declared as a property`);
    }
    targets.push(alias);
  }
  for (const name of targets) {
    if (result.shadowed.includes(name)) { continue; }
    const isAlias = name === alias;
    const members = new Map();
    const add = (member, kind) => { if (!members.has(member)) { members.set(member, kind); } };
    const access = isAlias
      ? new RegExp(`(?<![\\w.])(?:root\\.)?${name}\\.(\\w+)`, "g")
      : new RegExp(`(?<![\\w.])${name}\\.(\\w+)`, "g");
    for (const m of src.matchAll(access)) { add(m[1], "member"); }
    // A JavaScript local copy, as `const target = host`, reads the same object.
    const copy = new RegExp(`(?<![\\w.])(\\w+)\\s*=\\s*${isAlias ? "(?:root\\.)?" : ""}${name}\\s*(?=[,;\\n)])`, "g");
    for (const c of src.matchAll(copy)) {
      for (const m of src.matchAll(new RegExp(`(?<![\\w.])${c[1]}\\.(\\w+)`, "g"))) { add(m[1], "member"); }
    }
    for (const m of src.matchAll(/\bConnections\s*\{/g)) {
      const block = blockAt(src, m.index + m[0].length - 1);
      if (!new RegExp(`\\btarget\\s*:\\s*(?:root\\.)?${name}\\b`).test(block)) { continue; }
      for (const h of block.matchAll(/\bfunction\s+on([A-Z]\w*)\s*\(|\bon([A-Z]\w*)\s*:/g)) {
        const handler = h[1] ?? h[2];
        add(handler[0].toLowerCase() + handler.slice(1), "signal");
      }
    }
    // A bare reference hands the whole object on, as `propertyHost: editor`,
    // `controller: typeof x === "undefined" ? null : x` or `open(editor)`.
    // Guards such as `if (editor)` or `editor ? editor.x : y` are not counted.
    const bare = [];
    const ref = new RegExp(`(?<![\\w.])${isAlias ? "(?:root\\.)?" : ""}${name}(?![\\w.]|\\s*[?&|!=])(?<![{,]\\s*${name}(?=\\s*:))`);
    for (const line of src.split("\n")) {
      if (!ref.test(line)) { continue; }
      const binding = line.match(/^\s*(?:(?:readonly\s+|required\s+)*property\s+[\w.<>]+\s+)?(\w+)\s*:\s*(.*)$/);
      if (binding && binding[1] !== "target" && binding[1] !== "id" && ref.test(binding[2]) && !/\bif\s*\(/.test(binding[2])) {
        bare.push(`${binding[1]}:`);
        continue;
      }
      for (const m of line.matchAll(new RegExp(`(\\w*)\\s*\\(\\s*(?:[^()]*,\\s*)?${ref.source}\\s*[,)]`, "g"))) {
        if (!["if", "while", "typeof", ""].includes(m[1])) { bare.push(`${m[1]}()`); }
      }
    }
    if (members.size || bare.length) {
      result.uses[isAlias ? "editor" : name] = mergeUse(result.uses[isAlias ? "editor" : name], members, bare, isAlias ? name : null);
    }
  }
  return result;
}

function mergeUse(previous, members, bare, alias) {
  const use = previous ?? { members: new Map(), bare: [], via: [] };
  for (const [k, v] of members) { if (!use.members.has(k)) { use.members.set(k, v); } }
  use.bare.push(...bare);
  if (alias) { use.via.push(alias); }
  return use;
}

export function inventory(root = ROOT) {
  const headers = {};
  for (const [name, path] of Object.entries(CONTEXT_PROPERTIES)) {
    headers[name] = parseHeader(readFileSync(join(root, path), "utf8"));
  }
  if (headers.editor.properties.size === 0 || headers.editor.methods.size === 0) {
    throw new Error("EditorWindow.h parse found no properties or methods");
  }
  const qmlDir = join(root, "qml");
  const files = readdirSync(qmlDir).filter((f) => /\.(qml|js)$/.test(f)).sort();
  if (files.length === 0) { throw new Error(`no QML files in ${qmlDir}`); }
  for (const f of Object.keys(EDITOR_ALIASES)) {
    if (!files.includes(f)) { throw new Error(`alias file ${f} no longer exists`); }
  }
  const names = Object.keys(CONTEXT_PROPERTIES);
  const rows = files.map((file) => {
    const scan = scanFile(readFileSync(join(qmlDir, file), "utf8"), { names, alias: EDITOR_ALIASES[file]?.name });
    return { file, ...scan };
  });
  const unknown = [];
  for (const row of rows) {
    for (const [name, use] of Object.entries(row.uses)) {
      const h = headers[name];
      for (const [member, kind] of use.members) {
        const known = kind === "signal" ? h.signals.has(member) || /Changed$/.test(member) : h.properties.has(member) || h.methods.has(member) || h.signals.has(member) || !!INHERITED[name]?.has(member);
        if (!known) { unknown.push(`${row.file}: ${name}.${member}`); }
      }
    }
  }
  return { files, rows, headers, unknown };
}

function kindOf(h, member, kind) {
  if (kind === "signal") { return "signal"; }
  if (h.properties.has(member)) { return "property"; }
  if (h.methods.has(member)) { return "method"; }
  if (h.signals.has(member)) { return "signal"; }
  if (INHERITED.editor.has(member)) { return "QWidget property"; }
  return "unknown";
}

export function render(inv, groups) {
  const { rows, headers, files } = inv;
  const out = [];
  const users = rows.filter((r) => Object.keys(r.uses).length);
  const editorUsers = rows.filter((r) => r.uses.editor);
  const surface = headers.editor.properties.size + headers.editor.methods.size;
  out.push(`Scanned ${files.length} files in \`qml/\`. ${users.length} read a root context property, ${editorUsers.length} of them read the editor window. \`EditorWindow.h\` exposes ${headers.editor.properties.size} properties and ${headers.editor.methods.size} invokable methods or slots (${surface} members) and ${headers.editor.signals.size} signals.`);
  out.push("");
  out.push("| File | Editor members | Other context properties |");
  out.push("|---|---:|---|");
  const sorted = [...users].sort((a, b) => (b.uses.editor?.members.size ?? 0) - (a.uses.editor?.members.size ?? 0) || a.file.localeCompare(b.file));
  for (const r of sorted) {
    const e = r.uses.editor;
    const others = Object.entries(r.uses).filter(([n]) => n !== "editor").map(([n, u]) => `\`${n}\` (${u.members.size}${u.bare.length ? ", passed on" : ""})`);
    const editorCell = e ? `${e.members.size}${e.via.length ? ` via \`${e.via[0]}\`` : ""}${e.bare.length ? ", passed on" : ""}` : "";
    out.push(`| ${r.file} | ${editorCell} | ${others.join(", ")} |`);
  }
  const shadowed = rows.filter((r) => r.shadowed.length);
  if (shadowed.length) {
    out.push("");
    out.push(`Files where a local \`id\` hides a context property, so their reads are local: ${shadowed.map((r) => `${r.file} (\`${r.shadowed.join("`, `")}\`)`).join(", ")}.`);
  }
  out.push("");
  out.push("### Members by file");
  out.push("");
  out.push("`passed on` means the file hands the whole object to a child, such as `propertyHost: editor`.");
  out.push("");
  for (const r of sorted) {
    out.push(`- **${r.file}**`);
    for (const [name, use] of Object.entries(r.uses)) {
      const members = [...use.members.entries()].map(([m, k]) => (k === "signal" ? `on ${m}` : m)).sort();
      const bare = use.bare.length ? ` passed on as ${[...new Set(use.bare)].join(", ")}` : "";
      out.push(`  - \`${name}\`${use.via.length ? ` (as \`${use.via[0]}\`)` : ""}: ${members.join(", ") || "none"}${bare}`);
    }
  }
  out.push("");
  out.push("### Editor members by proposed interface");
  out.push("");
  const used = new Map();
  for (const r of rows) {
    const e = r.uses.editor;
    if (!e) { continue; }
    for (const [m, k] of e.members) {
      if (!used.has(m)) { used.set(m, { kind: kindOf(headers.editor, m, k), files: new Set() }); }
      used.get(m).files.add(r.file);
    }
  }
  const assigned = new Map();
  for (const [group, members] of Object.entries(groups)) {
    for (const m of members) {
      if (assigned.has(m)) { throw new Error(`${m} is assigned to ${assigned.get(m)} and ${group}`); }
      assigned.set(m, group);
    }
  }
  const unassigned = [...used.keys()].filter((m) => !assigned.has(m)).sort();
  if (unassigned.length) { throw new Error(`editor members with no proposed interface: ${unassigned.join(", ")}`); }
  const stale = [...assigned.keys()].filter((m) => !used.has(m)).sort();
  if (stale.length) { throw new Error(`proposed interface members no QML file reads: ${stale.join(", ")}`); }
  for (const [group, members] of Object.entries(groups)) {
    const readers = new Set(members.flatMap((m) => [...used.get(m).files]));
    out.push(`- **${group}** (${members.length} members, read by ${readers.size} files: ${[...readers].sort().join(", ")})`);
    for (const m of [...members].sort()) {
      const u = used.get(m);
      out.push(`  - \`${m}\` ${u.kind}: ${[...u.files].sort().join(", ")}`);
    }
  }
  const unread = [...headers.editor.properties, ...headers.editor.methods].filter((m) => !used.has(m)).sort();
  out.push("");
  out.push(`Members no QML file reads (C++ callers only, or dead): ${unread.map((m) => `\`${m}\``).join(", ") || "none"}.`);
  return out.join("\n");
}

const BEGIN = "<!-- BEGIN GENERATED: scripts/component-interfaces.mjs -->";
const END = "<!-- END GENERATED -->";

export function readGroups(doc) {
  const m = doc.match(/<!-- INTERFACES -->\s*```json\n([\s\S]*?)\n```/);
  if (!m) { throw new Error("docs/component-interfaces.md has no INTERFACES json block"); }
  return JSON.parse(m[1]);
}

function main(argv) {
  const docPath = join(ROOT, "docs/component-interfaces.md");
  const inv = inventory();
  if (argv.includes("--json")) {
    const plain = inv.rows.map((r) => ({ file: r.file, shadowed: r.shadowed, uses: Object.fromEntries(Object.entries(r.uses).map(([n, u]) => [n, { members: Object.fromEntries(u.members), bare: u.bare, via: u.via }])) }));
    process.stdout.write(`${JSON.stringify({ rows: plain, unknown: inv.unknown }, null, 2)}\n`);
    return 0;
  }
  if (inv.unknown.length) {
    process.stderr.write(`members not found in their headers:\n  ${inv.unknown.join("\n  ")}\n`);
    return 1;
  }
  const doc = readFileSync(docPath, "utf8");
  const start = doc.indexOf(BEGIN);
  const end = doc.indexOf(END);
  if (start < 0 || end < start) { throw new Error(`${relative(process.cwd(), docPath)} has no generated section markers`); }
  const next = `${doc.slice(0, start + BEGIN.length)}\n${render(inv, readGroups(doc))}\n${doc.slice(end)}`;
  if (argv.includes("--check")) {
    if (next !== doc) {
      process.stderr.write("docs/component-interfaces.md is stale. Run node native/node-editor/scripts/component-interfaces.mjs\n");
      return 1;
    }
    return 0;
  }
  writeFileSync(docPath, next);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
