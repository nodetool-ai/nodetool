/**
 * Web modules must not dereference `@nodetool-ai/timeline/render` values at
 * module scope.
 *
 * The render entry pulls in Yoga, which has a top-level await, so the
 * production chunk holding it is an async module. iOS Safari evaluated
 * `Model3DOrbitOverlay` before that await resumed, and its module-level
 * `PREVIEW_OVERLAY_Z.gizmo` threw "undefined is not an object". Every page
 * that loaded the timeline preview crashed. Dereferencing the import inside a
 * function defers it until the module has finished.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "__mocks__" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Value bindings imported from `@nodetool-ai/timeline/render`. */
function timelineValueImports(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text !== "@nodetool-ai/timeline/render") {
      continue;
    }
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) {
      continue;
    }
    if (clause.name) {
      names.add(clause.name.text);
    }
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      names.add(bindings.name.text);
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) {
          names.add(element.name.text);
        }
      }
    }
  }
  return names;
}

/** The import is the object of `x.y`, `x[y]`, or the callee of `x()`. */
function isDereferenced(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
      parent.expression === node) ||
    (ts.isCallExpression(parent) && parent.expression === node)
  );
}

/** `file:line name` for each module-scope dereference of a render import. */
function moduleScopeDereferences(path: string): string[] {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const imports = timelineValueImports(file);
  if (imports.size === 0) {
    return [];
  }
  const reads: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node) || ts.isImportDeclaration(node) || ts.isTypeNode(node)) {
      return;
    }
    if (ts.isExportDeclaration(node)) {
      return;
    }
    if (ts.isIdentifier(node) && imports.has(node.text) && isDereferenced(node)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart());
      reads.push(`${relative(SRC, path)}:${line + 1} ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
  return reads;
}

describe("timeline render imports at module scope", () => {
  const importers = sourceFiles(SRC).filter((path) =>
    readFileSync(path, "utf8").includes('"@nodetool-ai/timeline/render"')
  );

  it("inspects the files that import the render entry", () => {
    expect(importers.length).toBeGreaterThan(10);
  });

  it("dereferences render values only inside functions", () => {
    expect(importers.flatMap(moduleScopeDereferences)).toEqual([]);
  });
});
