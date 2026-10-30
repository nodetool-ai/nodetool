import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SANDBOX_PACKAGES = new Set([
  "@nodetool-ai/server-feature-sandbox", "@nodetool-ai/sandbox-runtime",
  "@jitl/quickjs-ng-wasmfile-release-sync", "@jitl/quickjs-ffi-types",
  "@sebastianwessel/quickjs", "quickjs-emscripten-core"
]);
const FORBIDDEN_PACKAGES = new Set([
  "@llamaindex/liteparse", "pdfjs-dist", "pdf-lib", "mammoth", "office-text-extractor", "epub2",
  "@nodetool-ai/document-processing", "@nodetool-ai/feature-documents", "@nodetool-ai/antigravity-cli",
  "ink", "@inkjs/ui", "react", "react-dom", "react-reconciler",
  "webgpu", "node-webgpu", "dawn", "@webgpu/glslang", "@webgpu/types",
  "@anthropic-ai/sdk", "@google/genai", "@google/generative-ai", "@mistralai/mistralai", "replicate", "groq-sdk", "cohere-ai",
  "@huggingface/inference", "@huggingface/transformers", "onnxruntime-node", "onnxruntime-web",
  "@tensorflow/tfjs", "@tensorflow/tfjs-node", "@tensorflow/tfjs-core",
  "@swc/core", "@babel/core", "@typescript/native-preview", "rollup", "vite", "webpack",
  "@modelcontextprotocol/sdk", "@google-cloud/storage", "@google-cloud/vertexai",
  "@opentelemetry/exporter-trace-otlp-http", "@opentelemetry/exporter-trace-otlp-grpc"
]);
const FORBIDDEN = /(?:^|[/@-])(?:ink|react|browser|playwright|puppeteer|gpu|node-av|mediabunny|sharp|canvas|tensorflow|transformers|llama|whisper|tesseract|pdf-parse|docx|exceljs|pptxgenjs|sandbox|quickjs|esbuild|typescript|vectorstore|sqlite-vec|modelcontextprotocol|aws-sdk|sdk-trace|trace-exporter)(?:[/@-]|$)/i;

const BROAD_INTERNAL = /^@nodetool-ai\/(?:runtime|models|server|websocket|cli|cli-full|deploy|compute|huggingface|agents|chat|base-nodes|core-nodes|text-nodes|llm-nodes|data-nodes|code-nodes|integration-nodes|automation-nodes|blender-nodes|game-nodes|app-export|game-renderer|game-runtime|model3d|image-editor|timeline|document-nodes|image-nodes|audio-nodes|video-nodes)(?:\/|$)/;

export function assertMinimalDependency(name, source, { entryPackageName, profile } = {}) {
  if ((name === "@nodetool-ai/cli" || name.startsWith("@nodetool-ai/cli/")) && entryPackageName === "@nodetool-ai/cli") { return; }
  const packageName = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
  if (profile === "sandbox" && SANDBOX_PACKAGES.has(packageName)) { return; }
  if (!name.startsWith(".") && !name.startsWith("node:") && (FORBIDDEN_PACKAGES.has(packageName) || FORBIDDEN.test(packageName) || BROAD_INTERNAL.test(name))) {
    throw new Error(`Forbidden minimal dependency ${name} in ${source}`);
  }
}

export function inspectMinimalTree(packageDirectories, { entryPackageName, profile } = {}) {
  const assertDependency = (name, source) => assertMinimalDependency(name, source, { entryPackageName, profile });
  let inspectedFiles = 0;
  const packages = new Set();
  const visited = new Set();
  const pending = [];
  const resolutionCache = ts.createModuleResolutionCache(process.cwd(), path => path);
  const runtimeResolutionCache = ts.createModuleResolutionCache(process.cwd(), path => path);
  const compilerOptions = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, allowJs: true };
  function inspectFile(path) {
    const actual = realpathSync(path);
    if (visited.has(actual)) { return; }
    visited.add(actual);
    inspectedFiles += 1;
    const parsed = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    function dependency(specifier, mode = /\.(?:cjs|cts)$/.test(path) ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext) {
      assertDependency(specifier, path);
      if (specifier.startsWith("node:") || ts.sys.fileExists(specifier) && specifier.endsWith(".node")) { return; }
      for (const runtime of [false, true]) {
        // TypeScript's runtime resolution mode follows package exports without substituting declarations.
        const options = runtime ? { ...compilerOptions, noDtsResolution: true } : compilerOptions;
        const cache = runtime ? runtimeResolutionCache : resolutionCache;
        const resolved = ts.resolveModuleName(specifier, path, options, ts.sys, cache, undefined, mode).resolvedModule;
        if (resolved && /\.(?:[cm]?js|[cm]?ts)$/.test(resolved.resolvedFileName)) { pending.push(resolved.resolvedFileName); }
      }
    }
    for (const reference of parsed.typeReferenceDirectives) {
      assertDependency(reference.fileName, path);
      const resolved = ts.resolveTypeReferenceDirective(reference.fileName, path, compilerOptions, ts.sys).resolvedTypeReferenceDirective;
      if (resolved) { pending.push(resolved.resolvedFileName); }
    }
    for (const reference of parsed.referencedFiles) {
      const referenced = resolve(dirname(path), reference.fileName);
      if (ts.sys.fileExists(referenced)) { pending.push(referenced); }
    }
    function inspect(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        dependency(node.moduleSpecifier.text);
      }
      if (ts.isExternalModuleReference(node) && ts.isStringLiteral(node.expression)) {
        dependency(node.expression.text, ts.ModuleKind.CommonJS);
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        dependency(node.argument.literal.text);
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const [argument] = node.arguments;
        if (argument && ts.isStringLiteral(argument)) { dependency(argument.text, node.expression.kind === ts.SyntaxKind.ImportKeyword ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS); }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(parsed);
  }
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") { continue; }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { walk(path); }
      else if (entry.isFile() && /\.(?:[cm]?js|[cm]?ts)$/.test(entry.name)) { pending.push(path); }
    }
  }
  for (const directory of packageDirectories) {
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    packages.add(manifest.name);
    assertDependency(manifest.name, directory);
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (field === "peerDependencies" && manifest.peerDependenciesMeta?.[name]?.optional) { continue; }
        assertDependency(name, join(directory, "package.json"));
      }
    }
    if (manifest.name.startsWith("@nodetool-ai/") || !directory.includes("node_modules")) { walk(directory); }
  }
  for (let index = 0; index < pending.length; index++) { inspectFile(pending[index]); }
  if (inspectedFiles === 0) { throw new Error("Minimal dependency guard inspected no JavaScript or declaration files"); }
  return { inspectedFiles, packages: packages.size };
}

export function installedPackageDirectories(directory) {
  const result = [];
  function scan(modules) {
    for (const entry of readdirSync(modules, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) { continue; }
      const path = join(modules, entry.name);
      if (entry.isSymbolicLink()) { throw new Error(`Installed consumer contains a symlink: ${path}`); }
      if (!entry.isDirectory()) { continue; }
      if (entry.name.startsWith("@")) { scan(path); continue; }
      result.push(path);
      try { if (lstatSync(join(path, "node_modules")).isDirectory()) { scan(join(path, "node_modules")); } }
      catch (error) { if (error.code !== "ENOENT") { throw error; } }
    }
  }
  scan(join(directory, "node_modules"));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] ?? ".");
  process.stdout.write(`${JSON.stringify(inspectMinimalTree(installedPackageDirectories(directory), { entryPackageName: process.argv[3] }))}\n`);
}
