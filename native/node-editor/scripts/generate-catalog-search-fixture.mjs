#!/usr/bin/env node
// Runs the web catalog search under Node on real node metadata and writes the
// ranking the native catalog must reproduce.
//
//   node native/node-editor/scripts/generate-catalog-search-fixture.mjs [--check]
//
// Needs `npm run build:packages`. The metadata comes from the pack registries.
// --check exits 1 when the checked-in fixture differs from the web output.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const editor = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(editor, "../..");
const web = join(root, "web/src");
const output = join(editor, "tests/ui/CatalogSearchFixture.json");
const TOP = 40;

// Every pack of the catalog contributes. Provider packs are sampled so the
// fixture stays small, in registry order, so the same run always picks the same nodes.
const PACKS = [
    ["base-nodes", "registerBaseNodes", 1],
    ["elevenlabs-nodes", "registerElevenLabsNodes", 1],
    ["fal-nodes", "registerFalNodes", 10],
    ["replicate-nodes", "registerReplicateNodes", 10],
    ["kie-nodes", "registerKieNodes", 10]
];

// The recent list and the case queries cover each branch of the web ranking.
const CASES = [
    { name: "browse", query: "" },
    { name: "browse with recents", query: "", recent: ["nodetool.text.Concat", "nodetool.control.If"] },
    { name: "title word", query: "image" },
    { name: "title word with recents", query: "image", recent: ["nodetool.image.Crop"] },
    { name: "multi word", query: "text to image" },
    { name: "comma list", query: "crop, resize" },
    { name: "dotted type", query: "nodetool.text" },
    { name: "dotted last segment", query: "text.concat" },
    { name: "single character", query: "a" },
    { name: "two characters", query: "if" },
    { name: "prefix", query: "conc" },
    { name: "namespace word", query: "control" },
    { name: "description word", query: "branch" },
    { name: "provider word", query: "flux" },
    { name: "provider namespace", query: "fal" },
    { name: "case and duplicate terms", query: "Image image" },
    { name: "squashed words", query: "texttoimage" },
    { name: "typo", query: "resise" },
    { name: "typo of a long word", query: "tranformation" },
    { name: "abbreviation", query: "txtimg" },
    { name: "tag word", query: "llm" },
    { name: "audio", query: "audio" },
    { name: "speech", query: "speech to text" },
    { name: "agent", query: "agent" },
    { name: "no match", query: "zzzzqx" }
];

const entry = String.raw`
import { rankSearchNodes } from "${web}/utils/nodeSearch.ts";
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const results = input.cases.map((spec) => {
    const ranked = rankSearchNodes(input.nodes, spec.query, spec.recent ?? []);
    return { ...spec, total: ranked.length, top: ranked.slice(0, input.top).map((node) => node.node_type) };
});
process.stdout.write(JSON.stringify(results));
`;

async function registryNodes() {
    const { NodeRegistry } = await import("@nodetool-ai/node-sdk");
    const nodes = [];
    for (const [pack, register, step] of PACKS) {
        const registry = new NodeRegistry();
        (await import("@nodetool-ai/" + pack))[register](registry);
        registry.listMetadata().filter((meta) => !meta.hidden).forEach((meta, index) => {
            if (index % step === 0) {
                nodes.push(meta);
            }
        });
    }
    // The web menu adds the code snippets after the server nodes
    // (serverState/useMetadata.ts). The snippet resource holds that metadata.
    const snippets = JSON.parse(readFileSync(join(editor, "resources/code/snippets.json"), "utf8")).snippets;
    nodes.push(...snippets.map((snippet) => snippet.metadata));
    // The ranking reads these fields only.
    return nodes.map((meta) => ({
        node_type: meta.node_type,
        title: meta.title,
        namespace: meta.namespace,
        description: meta.description ?? "",
        ...(meta.deprecated ? { deprecated: true } : {})
    }));
}

const work = mkdtempSync(join(tmpdir(), "catalog-search-fixture-"));
try {
    const nodes = await registryNodes();
    writeFileSync(join(work, "input.json"), JSON.stringify({ nodes, cases: CASES, top: TOP }));
    writeFileSync(join(work, "stub.mjs"), "export const MOTION = {}, sanitizeText = (text) => text, highlightText = () => ({ html: \"\" }), formatBulletList = (text) => text, escapeHtml = (text) => text; export default {};\n");
    writeFileSync(join(work, "entry.ts"), entry);
    const { build } = await import(join(root, "node_modules/esbuild/lib/main.js"));
    // Rendering helpers the ranking never calls.
    const stubbed = /(\/|^)(highlightText|sanitize|NodeMenuStore|ui_primitives)(\.ts)?$/;
    await build({
        entryPoints: [join(work, "entry.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        outfile: join(work, "bundle.mjs"),
        conditions: ["nodetool-dev"],
        logLevel: "error",
        absWorkingDir: join(root, "web"),
        loader: { ".svg": "empty", ".css": "empty", ".png": "empty", ".wasm": "empty" },
        define: { "import.meta.env": "{}" },
        plugins: [{
            name: "stub",
            setup(builder) {
                builder.onResolve({ filter: stubbed }, () => ({ path: join(work, "stub.mjs") }));
            }
        }]
    });
    const cases = JSON.parse(execFileSync(process.execPath, [join(work, "bundle.mjs"), join(work, "input.json")], {
        cwd: work,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"]
    }));
    const text = JSON.stringify({ source: "web/src/utils/nodeSearch.ts rankSearchNodes", nodes, cases }, null, 1) + "\n";
    if (process.argv.includes("--check")) {
        let current = "";
        try {
            current = readFileSync(output, "utf8");
        } catch {
            current = "";
        }
        if (current !== text) {
            console.error("Stale fixture: " + output);
            process.exitCode = 1;
        }
    } else {
        writeFileSync(output, text);
        console.log("Wrote " + output + " with " + nodes.length + " nodes and " + cases.length + " cases.");
    }
} finally {
    rmSync(work, { recursive: true, force: true });
}
