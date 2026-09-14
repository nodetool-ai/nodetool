#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, "..");

const CONTROLLER_FILES = new Set([
  "web/src/hooks/jsScript/useJsScriptServerSync.ts",
  "web/src/hooks/script/useScriptServerSync.ts",
  "web/src/hooks/storyboard/useStoryboardServerSync.ts",
  "web/src/hooks/timeline/useTimelineAutosave.ts",
  "web/src/stores/sketch/SketchSessionStore.ts"
]);

const SUBSCRIBER_FILES = new Set([
  "web/src/components/appbuilder/ApplicationAppBuilder.tsx",
  "web/src/hooks/jsScript/useJsScriptServerSync.ts",
  "web/src/hooks/script/useScriptServerSync.ts",
  "web/src/hooks/storyboard/useStoryboardServerSync.ts",
  "web/src/hooks/timeline/useTimelineExternalSync.ts",
  "web/src/stores/sketch/SketchSessionStore.ts"
]);

const SAVE_REGISTRY_FILES = new Set([
  "web/src/hooks/jsScript/jsScriptSaveRegistry.ts",
  "web/src/hooks/storyboard/storyboardSaveRegistry.ts"
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIRS = new Set([
  "__tests__",
  "node_modules",
  "dist",
  "build",
  "coverage"
]);

function parseSource(path, source) {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function isDocumentSyncModule(moduleName) {
  return /(?:^|\/)documentSync$/.test(moduleName);
}

function documentSyncBindings(sourceFile) {
  const bindings = new Map();
  let prohibitedImport = false;
  let prohibitedReExport = false;

  for (const statement of sourceFile.statements) {
    if (
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const moduleName = statement.moduleSpecifier.text;
    if (!isDocumentSyncModule(moduleName)) {
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const typeOnlyExport =
        statement.isTypeOnly ||
        (statement.exportClause &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.every(
            (specifier) => specifier.isTypeOnly
          ));
      prohibitedReExport ||= !typeOnlyExport;
      continue;
    }
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) {
      continue;
    }
    if (clause.name || !clause.namedBindings) {
      prohibitedImport = true;
      continue;
    }
    if (ts.isNamespaceImport(clause.namedBindings)) {
      prohibitedImport = true;
      continue;
    }
    for (const specifier of clause.namedBindings.elements) {
      if (specifier.isTypeOnly) {
        continue;
      }
      const imported = specifier.propertyName?.text ?? specifier.name.text;
      bindings.set(imported, specifier.name.text);
    }
  }

  return { sourceFile, bindings, prohibitedImport, prohibitedReExport };
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function callsBinding(sourceFile, binding) {
  if (!binding) {
    return false;
  }
  const aliases = new Set([binding]);
  let changed = true;
  while (changed) {
    changed = false;
    const collectAliases = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isIdentifier(unwrapExpression(node.initializer)) &&
        aliases.has(unwrapExpression(node.initializer).text) &&
        !aliases.has(node.name.text)
      ) {
        aliases.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, collectAliases);
    };
    collectAliases(sourceFile);
  }
  let found = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(unwrapExpression(node.expression)) &&
      aliases.has(unwrapExpression(node.expression).text)
    ) {
      found = true;
      return;
    }
    if (!found) {
      ts.forEachChild(node, visit);
    }
  };
  visit(sourceFile);
  return found;
}

function isExported(node) {
  return (
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false
  );
}

function exportedFunctions(sourceFile) {
  const functions = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      isExported(statement)
    ) {
      functions.push({ name: statement.name.text, node: statement });
      continue;
    }
    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        functions.push({
          name: declaration.name.text,
          node: declaration.initializer
        });
      }
    }
  }
  return functions;
}

function isAsyncFunction(node) {
  return (
    node.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
    ) ?? false
  );
}

function isAsyncCallbackType(
  typeNode,
  aliases,
  seen = new Set(),
  knownNames = new Set()
) {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return isAsyncCallbackType(typeNode.type, aliases, seen, knownNames);
  }
  if (ts.isFunctionTypeNode(typeNode)) {
    return /\bPromise\s*</.test(typeNode.type.getText());
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    return typeNode.members.some(
      (member) =>
        ts.isCallSignatureDeclaration(member) &&
        /\bPromise\s*</.test(member.type?.getText() ?? "")
    );
  }
  if (ts.isInterfaceDeclaration(typeNode)) {
    return typeNode.members.some(
      (member) =>
        ts.isCallSignatureDeclaration(member) &&
        /\bPromise\s*</.test(member.type?.getText() ?? "")
    );
  }
  if (
    !ts.isTypeReferenceNode(typeNode) ||
    !ts.isIdentifier(typeNode.typeName)
  ) {
    return false;
  }
  const name = typeNode.typeName.text;
  if (knownNames.has(name)) {
    return true;
  }
  if (seen.has(name)) {
    return false;
  }
  const target = aliases.get(name);
  if (!target) {
    return false;
  }
  seen.add(name);
  return isAsyncCallbackType(target, aliases, seen, knownNames);
}

function localTypeAliases(sourceFile) {
  const typeAliases = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement)) {
      typeAliases.set(statement.name.text, statement.type);
    } else if (ts.isInterfaceDeclaration(statement)) {
      typeAliases.set(statement.name.text, statement);
    }
  }
  return typeAliases;
}

function relativeModulePath(fromPath, moduleName, availablePaths) {
  if (!moduleName.startsWith(".")) {
    return null;
  }
  const base = posix.normalize(posix.join(posix.dirname(fromPath), moduleName));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`
  ]) {
    if (availablePaths.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function asyncCallbackTypesByFile(sourceFiles) {
  const knownByPath = new Map(
    [...sourceFiles.keys()].map((path) => [path, new Set()])
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const [path, sourceFile] of sourceFiles) {
      const known = knownByPath.get(path);
      const aliases = localTypeAliases(sourceFile);
      for (const [name, typeNode] of aliases) {
        if (
          !known.has(name) &&
          isAsyncCallbackType(typeNode, aliases, new Set(), known)
        ) {
          known.add(name);
          changed = true;
        }
      }
      for (const statement of sourceFile.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          !statement.importClause?.namedBindings ||
          !ts.isNamedImports(statement.importClause.namedBindings)
        ) {
          continue;
        }
        const targetPath = relativeModulePath(
          path,
          statement.moduleSpecifier.text,
          sourceFiles
        );
        if (!targetPath) {
          continue;
        }
        const targetKnown = knownByPath.get(targetPath);
        for (const specifier of statement.importClause.namedBindings.elements) {
          const importedName =
            specifier.propertyName?.text ?? specifier.name.text;
          if (
            targetKnown.has(importedName) &&
            !known.has(specifier.name.text)
          ) {
            known.add(specifier.name.text);
            changed = true;
          }
        }
      }
    }
  }
  return knownByPath;
}

function declaresSaveRegistry(sourceFile, knownCallbackTypes = new Set()) {
  const typeAliases = localTypeAliases(sourceFile);

  const mapNames = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isNewExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "Map"
    ) {
      mapNames.push({
        name: node.name.text,
        hasAsyncCallbackValue:
          node.initializer.typeArguments?.length === 2 &&
          isAsyncCallbackType(
            node.initializer.typeArguments[1],
            typeAliases,
            new Set(),
            knownCallbackTypes
          )
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const functions = exportedFunctions(sourceFile);
  for (const mapEntry of mapNames) {
    const mapName = mapEntry.name;
    const mutates = functions.some(({ node }) => {
      const parameters = new Map(
        node.parameters
          .filter((parameter) => ts.isIdentifier(parameter.name))
          .map((parameter) => [parameter.name.text, parameter])
      );
      let storesSaveCallback = false;
      const inspectMutation = (candidate) => {
        if (
          ts.isCallExpression(candidate) &&
          ts.isPropertyAccessExpression(candidate.expression) &&
          ts.isIdentifier(candidate.expression.expression) &&
          candidate.expression.expression.text === mapName &&
          candidate.expression.name.text === "set" &&
          candidate.arguments.length >= 2 &&
          ts.isIdentifier(candidate.arguments[1])
        ) {
          const parameter = parameters.get(candidate.arguments[1].text);
          const semanticSaveEvidence = Boolean(
            parameter &&
            (/save|writer|flush/i.test(parameter.name.getText(sourceFile)) ||
              (parameter.type &&
                /save|writer|flush/i.test(parameter.type.getText(sourceFile))))
          );
          storesSaveCallback = Boolean(
            parameter &&
            semanticSaveEvidence &&
            (mapEntry.hasAsyncCallbackValue ||
              (parameter.type &&
                isAsyncCallbackType(
                  parameter.type,
                  typeAliases,
                  new Set(),
                  knownCallbackTypes
                )))
          );
        }
        if (!storesSaveCallback) {
          ts.forEachChild(candidate, inspectMutation);
        }
      };
      inspectMutation(node);
      return storesSaveCallback;
    });
    const reads = functions.some(({ node }) => {
      if (!isAsyncFunction(node)) {
        return false;
      }
      const retrievedCallbacks = new Set();
      let awaitsRetrievedCallback = false;
      const inspectRead = (candidate) => {
        if (
          ts.isVariableDeclaration(candidate) &&
          ts.isIdentifier(candidate.name) &&
          candidate.initializer &&
          ts.isCallExpression(candidate.initializer) &&
          ts.isPropertyAccessExpression(candidate.initializer.expression) &&
          ts.isIdentifier(candidate.initializer.expression.expression) &&
          candidate.initializer.expression.expression.text === mapName &&
          candidate.initializer.expression.name.text === "get"
        ) {
          retrievedCallbacks.add(candidate.name.text);
        }
        if (ts.isAwaitExpression(candidate)) {
          const awaited = unwrapExpression(candidate.expression);
          const awaitedCallee = ts.isCallExpression(awaited)
            ? unwrapExpression(awaited.expression)
            : null;
          if (
            awaitedCallee &&
            ((ts.isIdentifier(awaitedCallee) &&
              retrievedCallbacks.has(awaitedCallee.text)) ||
              (ts.isCallExpression(awaitedCallee) &&
                ts.isPropertyAccessExpression(awaitedCallee.expression) &&
                ts.isIdentifier(awaitedCallee.expression.expression) &&
                awaitedCallee.expression.expression.text === mapName &&
                awaitedCallee.expression.name.text === "get"))
          ) {
            awaitsRetrievedCallback = true;
          }
        }
        ts.forEachChild(candidate, inspectRead);
      };
      inspectRead(node);
      return awaitsRetrievedCallback;
    });
    if (mutates && reads) {
      return true;
    }
  }
  return false;
}

export function auditDocumentSyncSources(files) {
  const violations = [];
  const counts = { controllers: 0, subscribers: 0, saveRegistries: 0 };
  const parsedSources = new Map(
    files.map((file) => [file.path, parseSource(file.path, file.source)])
  );
  const callbackTypes = asyncCallbackTypesByFile(parsedSources);

  for (const file of files) {
    const sync = documentSyncBindings(parsedSources.get(file.path));
    if (sync.prohibitedImport) {
      violations.push(
        `${file.path}: imports the Document sync module through a default or namespace binding`
      );
    }
    if (sync.prohibitedReExport) {
      violations.push(
        `${file.path}: re-exports the Document sync module through a barrel`
      );
    }
    if (
      callsBinding(
        sync.sourceFile,
        sync.bindings.get("createDocumentSyncController")
      )
    ) {
      counts.controllers += 1;
      if (!CONTROLLER_FILES.has(file.path)) {
        violations.push(
          `${file.path}: constructs a Document sync controller outside the canonical inventory`
        );
      }
    }
    if (
      callsBinding(sync.sourceFile, sync.bindings.get("registerDocumentSync"))
    ) {
      counts.subscribers += 1;
      if (!SUBSCRIBER_FILES.has(file.path)) {
        violations.push(
          `${file.path}: registers a Document sync subscriber outside the canonical inventory`
        );
      }
    }
    if (declaresSaveRegistry(sync.sourceFile, callbackTypes.get(file.path))) {
      counts.saveRegistries += 1;
      if (!SAVE_REGISTRY_FILES.has(file.path)) {
        violations.push(
          `${file.path}: declares a parallel Document save registry outside the canonical inventory`
        );
      }
    }
  }

  return { violations, counts };
}

async function collectSourceFiles(dir, repoRoot) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...(await collectSourceFiles(fullPath, repoRoot)));
      }
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push({
        path: relative(repoRoot, fullPath).replaceAll("\\", "/"),
        source: await readFile(fullPath, "utf8")
      });
    }
  }
  return files;
}

export async function auditDocumentSyncRepository(repoRoot = defaultRepoRoot) {
  const files = await collectSourceFiles(
    join(repoRoot, "web", "src"),
    repoRoot
  );
  return { ...auditDocumentSyncSources(files), inspectedFiles: files.length };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await auditDocumentSyncRepository();
  if (result.inspectedFiles === 0) {
    console.error("Document sync boundary check inspected no source files.");
    process.exitCode = 1;
  } else if (result.violations.length > 0) {
    console.error("Document sync boundary violations:\n");
    for (const violation of result.violations) {
      console.error(`  ${violation}`);
    }
    console.error(
      "\nUse the shared controller and subscription seam in web/src/stores/documentSync.ts. " +
        "Update docs/document-sync.md when intentionally adding a new editor integration."
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Document sync boundary check passed (${result.inspectedFiles} files, ` +
        `${result.counts.controllers} controllers, ${result.counts.subscribers} subscribers, ` +
        `${result.counts.saveRegistries} save registries).`
    );
  }
}
