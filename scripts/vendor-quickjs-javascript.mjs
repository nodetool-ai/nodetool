import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// Run against an unpacked @sebastianwessel/quickjs@3.0.1 npm artifact.
// Keep the existing engine and bridges, removing only the unused compiler API.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] ?? join(root, "node_modules/@sebastianwessel/quickjs"));
const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
if (manifest.name !== "@sebastianwessel/quickjs" || manifest.version !== "3.0.1") {
  throw new Error("Expected @sebastianwessel/quickjs@3.0.1");
}
const expectedTree = "3537d085ff5f01fb797945cbf25fd8b6a32901b3c6a73bcddfb9d68303dc0ed5";
const upstream = createHash("sha256");
function hashTree(directory, relative = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const name = relative + entry.name;
    if (entry.isDirectory()) { hashTree(join(directory, entry.name), `${name}/`); }
    else { upstream.update(`${name}\0`); upstream.update(readFileSync(join(directory, entry.name))); }
  }
}
hashTree(join(source, "dist/esm"));
upstream.update("LICENSE\0");
upstream.update(readFileSync(join(source, "LICENSE")));
if (upstream.digest("hex") !== expectedTree) { throw new Error("QuickJS upstream ESM/license hash differs from the pinned artifact"); }
const target = join(root, "packages/sandbox-runtime/vendor/quickjs");
rmSync(target, { recursive: true, force: true });
cpSync(join(source, "dist/esm"), target, { recursive: true });
cpSync(join(source, "LICENSE"), join(target, "LICENSE"));
writeFileSync(join(target, "PROVENANCE.json"), JSON.stringify({
  name: manifest.name, version: manifest.version, license: "MIT",
  npmIntegrity: "sha512-9pKTzjtsHIBxokMhYgNPyqvBSpX9WLus5j+cqspB2VHOKbC0L45NQiVQhbEiaWXEyBtxd3W8MLnvlxvtBLo0Ew==",
  esmAndLicenseSha256: expectedTree, generator: "scripts/vendor-quickjs-javascript.mjs"
}, null, 2) + "\n");
function patch(file, before, after) {
  const path = join(target, file);
  const content = readFileSync(path, "utf8");
  if (!content.includes(before)) { throw new Error(`Upstream patch no longer matches ${file}`); }
  writeFileSync(path, content.replace(before, after));
}
for (const extension of ["js", "d.ts"]) {
  patch(`index.${extension}`, "export * from './getTypescriptSupport.js';\n", "");
  rmSync(join(target, `getTypescriptSupport.${extension}`));
}
for (const file of ["loadQuickJs.js", "loadAsyncQuickJs.js"]) {
  patch(file, "import { getTypescriptSupport } from './getTypescriptSupport.js';\n", "");
  patch(file, `            // TypeScript Support:
            const { transpileVirtualFs, transpileFile } = await getTypescriptSupport(sandboxOptions.transformTypescript, sandboxOptions.typescriptImportFile, sandboxOptions.transformCompilerOptions);
            // if typescript support is enabled, transpile all ts files in file system
            transpileVirtualFs(fs);`, "            const transpileFile = (value) => value;");
}
for (const file of ["types/SandboxOptions.d.ts", "types/RuntimeOptions.d.ts"]) {
  patch(file, "import type { default as TS } from 'typescript';\n", "");
  const path = join(target, file);
  let content = readFileSync(path, "utf8");
  for (const name of ["typescriptImportFile", "transformTypescript", "transformCompilerOptions"]) {
    content = content.replace(new RegExp(`    /\\*\\*(?:(?!    /\\*\\*)[\\s\\S])*?    ${name}\\?: [^;]+;\\n`), "");
  }
  writeFileSync(path, content);
}
// Upstream emits no source maps. Retain all built guest modules and declarations.
let files = 0;
function verify(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { verify(path); }
    else {
      files++;
      if (/\.(js|ts)$/.test(entry.name) && /getTypescriptSupport|from ['"]typescript['"]|import\(['"]typescript['"]\)|TS\.(CompilerOptions|Diagnostic)/.test(readFileSync(path, "utf8"))) {
        throw new Error(`Compiler API remains in ${path}`);
      }
    }
  }
}
verify(target);
if (!files) { throw new Error("No vendor files inspected"); }
process.stdout.write(`Vendored QuickJS 3.0.1 JavaScript profile: ${files} files\n`);
