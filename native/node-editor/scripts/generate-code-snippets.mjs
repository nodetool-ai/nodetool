#!/usr/bin/env node
// Executes the web code snippet catalog under Node and writes the snippet
// resource the native node menu reads: one catalog entry per snippet and the
// Code node data a snippet creates (web/src/config/snippetMetadata.ts).
//
//   node native/node-editor/scripts/generate-code-snippets.mjs [--check]
//
// --check exits 1 when the checked-in resource differs from the web output.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const editor = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(editor, "../..");
const web = join(root, "web/src");
const output = join(editor, "resources/code/snippets.json");

const entry = String.raw`
import { CODE_SNIPPETS } from "${web}/config/codeSnippets.ts";
import { generateSnippetMetadata, snippetCodeNodeData, snippetNodeType } from "${web}/config/snippetMetadata.ts";

const metadata = generateSnippetMetadata();
const snippets = CODE_SNIPPETS.map((snippet) => {
    const nodeType = snippetNodeType(snippet);
    return { node_type: nodeType, title: snippet.title, code: snippet.code, metadata: metadata[nodeType], data: snippetCodeNodeData(snippet) ?? {} };
});
process.stdout.write(JSON.stringify(snippets));
`;

const work = mkdtempSync(join(tmpdir(), "code-snippets-"));
try {
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
    const snippets = JSON.parse(execFileSync(process.execPath, [join(work, "bundle.mjs")], {
        cwd: work,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
    }));
    const text = JSON.stringify({ source: "web/src/config/snippetMetadata.ts", snippets }, null, 2) + "\n";
    if (process.argv.includes("--check")) {
        let current = "";
        try {
            current = readFileSync(output, "utf8");
        } catch {
            current = "";
        }
        if (snippets.length === 0 || current !== text) {
            console.error("Stale snippet resource: " + output + "\nRun: node native/node-editor/scripts/generate-code-snippets.mjs");
            process.exitCode = 1;
        }
    } else {
        writeFileSync(output, text);
        console.log("Wrote " + snippets.length + " snippets to " + output);
    }
} finally {
    rmSync(work, { recursive: true, force: true });
}
