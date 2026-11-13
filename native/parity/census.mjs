#!/usr/bin/env node
// Gap census: lists what the web node editor offers and whether the native
// editor has it, from the two source trees and the registry next to this
// file. It builds nothing native and needs no Qt.
//
//   node native/parity/census.mjs [--json <file>] [--check] [--suggest] [--limit <n>]
//
// --check fails when a registry entry names something that no longer exists,
// or when an inventory reads nothing. --suggest prints registry entries for
// unreviewed shortcuts whose key combination the native editor binds.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "../..");
const REGISTRY = join(here, "registry.json");

// Web directories whose components make up the node editor and its panels.
export const WEB_COMPONENT_DIRS = [
    "web/src/components/node_editor",
    "web/src/components/node",
    "web/src/components/node_menu",
    "web/src/components/properties",
    "web/src/components/panels",
    "web/src/components/node_types",
    "web/src/components/context_menus",
    "web/src/components/version",
    "web/src/components/workflows"
];

// Credit per status. Accepted, out-of-scope and unreviewed items are left out
// of the parity percentage. Unreviewed items lower the coverage percentage instead.
export const CREDIT = { match: 1, partial: 0.5, differs: 0.5, missing: 0 };

// ---------------------------------------------------------------- keys

const KEY_NAMES = {
    control: "ctrl", ctrl: "ctrl", meta: "meta", cmd: "meta", command: "meta",
    alt: "alt", option: "alt", shift: "shift",
    arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down",
    enter: "return", return: "return", escape: "esc", esc: "esc",
    " ": "space", space: "space", delete: "delete", del: "delete",
    pageup: "pgup", pgup: "pgup", pagedown: "pgdown", pgdown: "pgdown"
};
const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"];

// One canonical spelling for a key combination from either side:
// ["Control", "Shift", "Z"] and "Ctrl+Shift+Z" both become "ctrl+shift+z".
export function normalizeCombo(combo) {
    const parts = Array.isArray(combo) ? combo : splitSequence(combo);
    const keys = parts.map((part) => {
        const lower = String(part).toLowerCase();
        return KEY_NAMES[lower] ?? (lower.trim() === "" ? "space" : lower);
    });
    const modifiers = MODIFIER_ORDER.filter((m) => keys.includes(m));
    const rest = keys.filter((k) => !MODIFIER_ORDER.includes(k));
    return [...modifiers, ...rest].join("+");
}

function splitSequence(sequence) {
    // "Ctrl++" names the plus key.
    const parts = [];
    let current = "";
    for (const ch of sequence) {
        if (ch === "+" && current !== "") {
            parts.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    if (current !== "") {
        parts.push(current);
    }
    return parts;
}

// ---------------------------------------------------------------- extractors

// The web shortcut list, read by bundling web/src/config/shortcuts.ts, so
// generated entries such as switchToTab1-9 are included.
export async function webShortcuts(root = ROOT) {
    const work = mkdtempSync(join(tmpdir(), "parity-census-"));
    try {
        const entry = `import { NODE_EDITOR_SHORTCUTS } from ${JSON.stringify(join(root, "web/src/config/shortcuts.ts"))};\n` +
            "process.stdout.write(JSON.stringify(NODE_EDITOR_SHORTCUTS.map(({ title, slug, keyCombo, altKeyCombos, category, electronOnly }) => ({ title, slug, keyCombo, altKeyCombos, category, electronOnly }))));\n";
        writeFileSync(join(work, "entry.ts"), entry);
        const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
        await build({
            entryPoints: [join(work, "entry.ts")],
            bundle: true,
            platform: "node",
            format: "esm",
            outfile: join(work, "bundle.mjs"),
            logLevel: "error",
            absWorkingDir: join(root, "web")
        });
        const list = JSON.parse(execFileSync(process.execPath, [join(work, "bundle.mjs")], { encoding: "utf8" }));
        return list.map((s) => ({
            id: s.slug,
            title: s.title,
            category: s.category,
            electronOnly: !!s.electronOnly,
            combos: [s.keyCombo, ...(s.altKeyCombos ?? [])].filter((c) => c.length > 0).map(normalizeCombo)
        }));
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

// The application menu entries that bind keys to a call, such as
// entry(file, tr("Close Tab"), [this] { closeTab(activeTab()); }, {QKeySequence(QStringLiteral("Ctrl+W"))}).
// Entries made with command() run a command of the EditorMenus.cpp table and are counted there.
export function appMenuBindings(source) {
    const bindings = [];
    const pattern = /entry\(\w+,\s*tr\("[^"]*"\),\s*\[this\]\s*\{\s*([A-Za-z]+\([^;]*\));\s*\},\s*\{([^}]*)\}\)/g;
    for (const [, call, list] of source.matchAll(pattern)) {
        for (const [, keys] of list.matchAll(/QKeySequence\(QStringLiteral\("([^"]+)"\)\)/g)) {
            bindings.push({ command: call, combo: normalizeCombo(keys), source: "src/ui/EditorAppMenu.cpp" });
        }
    }
    return bindings;
}

// Pointer gestures a QML file binds: a TapHandler with a right button, a
// modifier and one call in onTapped, such as the Ctrl or Cmd right click that
// resets a property. The call names the command: "removeValue()".
export function gestureBindings(source, file) {
    const bindings = [];
    const buttons = { RightButton: "mouseright", LeftButton: "mouseleft" };
    const modifiers = { ControlModifier: "ctrl", MetaModifier: "meta", ShiftModifier: "shift", AltModifier: "alt" };
    for (const [, body] of source.matchAll(/TapHandler \{([^{}]*)\}/g)) {
        const button = body.match(/acceptedButtons:\s*Qt\.(\w+)/)?.[1];
        const modifier = body.match(/acceptedModifiers:\s*Qt\.(\w+)/)?.[1];
        const call = body.match(/onTapped:[^\n]*?(?:\w+\.)?([A-Za-z]+\(\))\s*$/m)?.[1];
        if (buttons[button] && modifiers[modifier] && call) {
            bindings.push({ command: call, combo: normalizeCombo([modifiers[modifier], buttons[button]]), source: file });
        }
    }
    return bindings;
}

// QML files whose gestures count as shortcuts.
const GESTURE_FILES = ["qml/PropertyField.qml"];

// The native bindings: the command table in EditorMenus.cpp, the application
// menu, the tab shortcuts that EditorWindow::installTabShortcuts binds and the
// pointer gestures of GESTURE_FILES.
export function nativeShortcuts(root = ROOT) {
    const menus = readFileSync(join(root, "native/node-editor/src/ui/EditorMenus.cpp"), "utf8");
    const table = menus.match(/const Shortcut shortcuts\[\] = \{([\s\S]*?)\n\};/);
    if (!table) {
        throw new Error("EditorMenus.cpp: the shortcut table was not found");
    }
    const bindings = [];
    for (const [, command, keys] of table[1].matchAll(/\{"([^"]+)",\s*"([^"]+)"\}/g)) {
        bindings.push({ command, combo: normalizeCombo(keys), source: "src/ui/EditorMenus.cpp" });
    }
    const tabs = readFileSync(join(root, "native/node-editor/src/ui/EditorTabs.cpp"), "utf8");
    const install = tabs.match(/void EditorWindow::installTabShortcuts\(\) \{([\s\S]*?)\n\}/);
    if (!install) {
        throw new Error("EditorTabs.cpp: installTabShortcuts was not found");
    }
    const body = install[1];
    for (const [, list, call] of body.matchAll(/for \(const auto &keys : \{([^}]*)\}\) \{\s*bind\([^,]+, \[this\] \{ ([A-Za-z]+\([^)]*\))/g)) {
        for (const [, keys] of list.matchAll(/"([^"]+)"/g)) {
            bindings.push({ command: call, combo: normalizeCombo(keys), source: "src/ui/EditorTabs.cpp" });
        }
    }
    const numbered = body.match(/for \(int n = 1; n <= 9; \+\+n\) \{\s*bind\(QString\("([^"]*)%1"\)/);
    if (numbered) {
        for (let n = 1; n <= 9; n++) {
            bindings.push({ command: `activateTab(${n - 1})`, combo: normalizeCombo(`${numbered[1]}${n}`), source: "src/ui/EditorTabs.cpp" });
        }
    }
    for (const [, keys, call] of body.matchAll(/\n\s*bind\("([^"]+)", \[this\] \{ ([A-Za-z]+\([^)]*\))/g)) {
        bindings.push({ command: call, combo: normalizeCombo(keys), source: "src/ui/EditorTabs.cpp" });
    }
    bindings.push(...appMenuBindings(readFileSync(join(root, "native/node-editor/src/ui/EditorAppMenu.cpp"), "utf8")));
    for (const file of GESTURE_FILES) {
        bindings.push(...gestureBindings(readFileSync(join(root, "native/node-editor", file), "utf8"), file));
    }
    return bindings;
}

// The property types the web resolver dispatches on (PropertyInput.resolver.tsx).
export function webPropertyTypes(root = ROOT) {
    const source = readFileSync(join(root, "web/src/components/node/PropertyInput.resolver.tsx"), "utf8");
    const start = source.indexOf("switch (type)");
    if (start < 0) {
        throw new Error("PropertyInput.resolver.tsx: the type switch was not found");
    }
    const types = new Set();
    for (const [, type] of source.slice(start).matchAll(/case "([^"]+)":/g)) {
        types.add(type);
    }
    for (const [, type] of source.slice(0, start).matchAll(/case "(media_[a-z_]+)":/g)) {
        types.add(type);
    }
    return [...types].map((id) => ({ id }));
}

// The property types the native editor gives an editor: every literal that
// propertyKind compares against, the model types, and the media_* overrides.
export function nativePropertyTypes(root = ROOT) {
    const source = readFileSync(join(root, "native/node-editor/src/properties/PropertyFields.h"), "utf8");
    const body = functionBody(source, "inline QString propertyKind(const QJsonObject& p) {");
    const model = functionBody(source, "inline bool isModelType(const QString& type) {");
    // Only literals the type is compared with count. Kind names that
    // propertyKind returns are not types.
    const types = new Set();
    for (const [, literal] of body.matchAll(/\btype == "([a-z0-9_.]+)"/g)) {
        types.add(literal);
    }
    for (const text of [body, model]) {
        for (const [, list] of text.matchAll(/QSet<QString>\s*(?:types)?\{([^}]*)\}/g)) {
            for (const [, literal] of list.matchAll(/"([a-z0-9_.]+)"/g)) {
                types.add(literal);
            }
        }
    }
    return { types, mediaOverrides: body.includes('startsWith("media_")'), hfModels: model.includes('startsWith("hf.")') };
}

function functionBody(source, signature) {
    const start = source.indexOf(signature);
    if (start < 0) {
        throw new Error(`PropertyFields.h: ${signature} was not found`);
    }
    let depth = 0;
    for (let i = start + signature.length - 1; i < source.length; i++) {
        if (source[i] === "{") {
            depth++;
        } else if (source[i] === "}") {
            depth--;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }
    throw new Error(`PropertyFields.h: ${signature} has no closing brace`);
}

// Every component file under the web editor directories, tests and stories excluded.
export function webComponents(root = ROOT) {
    const files = [];
    const walk = (dir) => {
        for (const name of readdirSync(join(root, dir))) {
            const path = `${dir}/${name}`;
            if (statSync(join(root, path)).isDirectory()) {
                if (name !== "__tests__") {
                    walk(path);
                }
            } else if (name.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(name)) {
                files.push({ id: path });
            }
        }
    };
    for (const dir of WEB_COMPONENT_DIRS) {
        walk(dir);
    }
    return files.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- census

function classify(entry, present) {
    if (!entry) {
        return "unreviewed";
    }
    if (entry.outOfScope) {
        return "outOfScope";
    }
    if (entry.accepted) {
        return "accepted";
    }
    if (entry.missing) {
        return "missing";
    }
    return present;
}

export function censusShortcuts(web, native, registry) {
    const commands = new Map();
    for (const binding of native) {
        const list = commands.get(binding.command) ?? [];
        list.push(binding.combo);
        commands.set(binding.command, list);
    }
    const problems = [];
    const items = web.map((shortcut) => {
        const entry = registry[shortcut.id];
        let status = classify(entry, "match");
        let detail;
        if (status === "match") {
            const keys = commands.get(entry.native);
            if (!keys) {
                problems.push(`shortcuts.${shortcut.id}: native command "${entry.native}" is not bound`);
                status = "missing";
            } else if (!shortcut.combos.some((combo) => keys.includes(combo))) {
                status = "differs";
                detail = `web ${shortcut.combos.join(" / ") || "(none)"}, native ${keys.join(" / ")}`;
            }
        }
        return { id: shortcut.id, title: shortcut.title, status, detail, note: entry?.missing ?? entry?.accepted };
    });
    for (const id of Object.keys(registry)) {
        if (!web.some((s) => s.id === id)) {
            problems.push(`shortcuts.${id}: no web shortcut has this slug`);
        }
    }
    return { items, problems };
}

export function censusPropertyTypes(web, native, registry) {
    const items = web.map(({ id }) => {
        const supported = native.types.has(id) || (native.mediaOverrides && id.startsWith("media_")) ||
            (native.hfModels && id.startsWith("hf."));
        const entry = registry[id];
        let status = supported ? "match" : "missing";
        if (entry?.outOfScope) {
            status = "outOfScope";
        } else if (entry?.accepted) {
            status = "accepted";
        } else if (entry?.partial) {
            status = "partial";
        } else if (entry?.native) {
            // Handled by a path the source scan cannot see, named in the note.
            status = "match";
        }
        return { id, status, note: entry?.outOfScope ? `out of scope: ${entry.outOfScope}` : entry?.accepted ?? entry?.partial ?? entry?.native };
    });
    const problems = Object.keys(registry).filter((id) => !web.some((t) => t.id === id))
        .map((id) => `propertyTypes.${id}: the web resolver has no case for this type`);
    return { items, problems };
}

// The out-of-scope feature that owns a web path: one whose `web` list names
// the path or a directory above it.
export function outOfScopeFeature(path, outOfScope) {
    return Object.keys(outOfScope).find((name) =>
        (outOfScope[name].web ?? []).some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)));
}

export function censusComponents(web, registry, root = ROOT, outOfScope = {}) {
    const problems = [];
    const items = web.map(({ id }) => {
        const owner = outOfScopeFeature(id, outOfScope);
        const entry = registry[id] ?? (owner ? { outOfScope: owner } : undefined);
        const status = classify(entry, entry?.status === "partial" ? "partial" : "match");
        if (entry?.outOfScope && !outOfScope[entry.outOfScope]) {
            problems.push(`components.${id}: out-of-scope feature "${entry.outOfScope}" is not listed in outOfScope`);
        }
        if (entry?.native) {
            for (const path of entry.native) {
                if (!existsSync(join(root, path))) {
                    problems.push(`components.${id}: native file ${path} does not exist`);
                }
            }
        }
        const note = entry?.outOfScope ? `out of scope: ${entry.outOfScope}` : entry?.missing ?? entry?.accepted ?? entry?.note;
        return { id, status, native: entry?.native, inventory: entry?.inventory, note };
    });
    for (const id of Object.keys(registry)) {
        if (!web.some((c) => c.id === id)) {
            problems.push(`components.${id}: the web file does not exist`);
        }
    }
    return { items, problems };
}

// Features the native editor will not get. Each names its web sources, which
// must exist, so a renamed directory does not silently return to the count.
export function censusOutOfScope(outOfScope, root = ROOT) {
    const problems = [];
    for (const [name, feature] of Object.entries(outOfScope)) {
        if (!feature.reason) {
            problems.push(`outOfScope.${name}: no reason`);
        }
        if (!Array.isArray(feature.web) || feature.web.length === 0) {
            problems.push(`outOfScope.${name}: names no web sources`);
        }
        for (const path of feature.web ?? []) {
            if (!existsSync(join(root, path))) {
                problems.push(`outOfScope.${name}: web path ${path} does not exist`);
            }
        }
    }
    return problems;
}

export function summarize(items) {
    const counts = { match: 0, partial: 0, differs: 0, missing: 0, accepted: 0, outOfScope: 0, unreviewed: 0 };
    for (const item of items) {
        counts[item.status]++;
    }
    const scored = counts.match + counts.partial + counts.differs + counts.missing;
    const credit = Object.entries(CREDIT).reduce((sum, [status, value]) => sum + counts[status] * value, 0);
    const reviewable = items.length - counts.accepted - counts.outOfScope;
    return {
        total: items.length,
        counts,
        parity: scored === 0 ? null : Math.round((credit / scored) * 1000) / 10,
        coverage: reviewable === 0 ? null : Math.round((scored / reviewable) * 1000) / 10
    };
}

export async function runCensus(root = ROOT, registry = JSON.parse(readFileSync(REGISTRY, "utf8"))) {
    const webKeys = await webShortcuts(root);
    const nativeKeys = nativeShortcuts(root);
    const webTypes = webPropertyTypes(root);
    const nativeTypes = nativePropertyTypes(root);
    const components = webComponents(root);
    const inventories = {
        shortcuts: censusShortcuts(webKeys, nativeKeys, registry.shortcuts ?? {}),
        propertyTypes: censusPropertyTypes(webTypes, nativeTypes, registry.propertyTypes ?? {}),
        components: censusComponents(components, registry.components ?? {}, root, registry.outOfScope ?? {})
    };
    const problems = censusOutOfScope(registry.outOfScope ?? {}, root);
    for (const name of ["shortcuts", "propertyTypes"]) {
        for (const [id, entry] of Object.entries(registry[name] ?? {})) {
            if (entry.outOfScope && !registry.outOfScope?.[entry.outOfScope]) {
                problems.push(`${name}.${id}: out-of-scope feature "${entry.outOfScope}" is not listed in outOfScope`);
            }
        }
    }
    const read = { shortcuts: [webKeys.length, nativeKeys.length], propertyTypes: [webTypes.length, nativeTypes.types.size], components: [components.length, 1] };
    for (const [name, [webCount, nativeCount]] of Object.entries(read)) {
        if (webCount === 0 || nativeCount === 0) {
            problems.push(`${name}: the inventory read nothing (web ${webCount}, native ${nativeCount})`);
        }
    }
    for (const inventory of Object.values(inventories)) {
        problems.push(...inventory.problems);
    }
    const summaries = Object.fromEntries(Object.entries(inventories).map(([name, inv]) => [name, summarize(inv.items)]));
    const all = summarize(Object.values(inventories).flatMap((inv) => inv.items));
    return { version: 1, summary: all, outOfScope: registry.outOfScope ?? {}, inventories: Object.fromEntries(Object.entries(inventories).map(([name, inv]) => [name, { ...summaries[name], items: inv.items }])), problems, nativeShortcuts: nativeKeys };
}

function formatPercent(value) {
    return value === null ? "n/a" : `${value}%`;
}

export function formatReport(report, limit = 15) {
    const lines = [];
    const s = report.summary;
    lines.push(`Native parity census: ${formatPercent(s.parity)} parity on reviewed items, ${formatPercent(s.coverage)} of items reviewed`);
    for (const [name, inv] of Object.entries(report.inventories)) {
        const c = inv.counts;
        lines.push(`  ${name.padEnd(14)} ${formatPercent(inv.parity).padStart(6)} parity  ${formatPercent(inv.coverage).padStart(6)} reviewed  ` +
            `(${c.match} match, ${c.partial} partial, ${c.differs} differ, ${c.missing} missing, ${c.accepted} accepted, ${c.outOfScope} out of scope, ${c.unreviewed} unreviewed of ${inv.total})`);
    }
    const excluded = Object.entries(report.outOfScope ?? {});
    if (excluded.length > 0) {
        lines.push("", "Out of scope for the native editor (not counted):");
        for (const [name, feature] of excluded) {
            lines.push(`  ${name}: ${feature.reason}`);
        }
    }
    for (const [name, inv] of Object.entries(report.inventories)) {
        const open = inv.items.filter((item) => item.status === "missing" || item.status === "differs" || item.status === "partial");
        if (open.length === 0) {
            continue;
        }
        lines.push("", `${name}: ${open.length} open`);
        for (const item of open.slice(0, limit)) {
            const extra = item.detail ?? item.note;
            lines.push(`  ${item.status.padEnd(8)} ${item.id}${extra ? `  (${extra})` : ""}`);
        }
        if (open.length > limit) {
            lines.push(`  ... ${open.length - limit} more (--limit or --json for all)`);
        }
    }
    if (report.problems.length > 0) {
        lines.push("", "Registry problems:", ...report.problems.map((p) => `  ${p}`));
    }
    return lines.join("\n");
}

async function main(argv) {
    const args = { json: null, check: false, suggest: false, limit: 15 };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--json") {
            args.json = argv[++i];
        } else if (argv[i] === "--check") {
            args.check = true;
        } else if (argv[i] === "--suggest") {
            args.suggest = true;
        } else if (argv[i] === "--limit") {
            args.limit = Number(argv[++i]);
        } else {
            throw new Error(`Unknown argument ${argv[i]}. Usage: node native/parity/census.mjs [--json <file>] [--check] [--suggest] [--limit <n>]`);
        }
    }
    const report = await runCensus();
    if (args.json) {
        writeFileSync(args.json, `${JSON.stringify({ ...report, nativeShortcuts: undefined }, null, 2)}\n`);
    }
    if (args.suggest) {
        const byCombo = new Map();
        for (const binding of report.nativeShortcuts) {
            byCombo.set(binding.combo, binding.command);
        }
        const webKeys = await webShortcuts();
        const suggestions = {};
        for (const item of report.inventories.shortcuts.items.filter((i) => i.status === "unreviewed")) {
            const shortcut = webKeys.find((s) => s.id === item.id);
            const command = shortcut.combos.map((c) => byCombo.get(c)).find(Boolean);
            suggestions[item.id] = command ? { native: command } : { missing: "No native binding" };
        }
        process.stdout.write(`${JSON.stringify(suggestions, null, 2)}\n`);
        return 0;
    }
    process.stdout.write(`${formatReport(report, args.limit)}\n`);
    return args.check && report.problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
        console.error(`Parity census failed: ${error.message}`);
        process.exitCode = 1;
    });
}

