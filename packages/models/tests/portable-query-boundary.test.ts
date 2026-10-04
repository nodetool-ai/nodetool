import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SOURCE_DIRS = ["packages/models/src", "packages/websocket/src"];
const FIXTURE_FILE = path.join(ROOT, "packages/models/tests/portable-query-fixtures.ts");
const FIXTURE_SOURCE = `
import Database from "better-sqlite3";
import { getPortableDb, getDatabase, getDbType, type DbTransaction } from "../src/db.js";
import { workflows } from "../src/schema/workflows.js";
function unguarded() { getPortableDb().select().from(workflows).all(); }
function sqliteBranch() { if (getDbType() === "sqlite") { getPortableDb().select().from(workflows).all(); } }
function wrongBranch() { if (getDbType() !== "sqlite") { getPortableDb().select().from(workflows).all(); } }
function earlyGuard() { if (getDbType() !== "sqlite") { throw new Error("SQLite required"); } getPortableDb().select().from(workflows).all(); }
function dialectAlias() { const dialect = getDbType(); if (dialect === "sqlite") { getPortableDb().select().from(workflows).all(); } }
function connectionGuard() { const connection = getDatabase(); if (connection.dialect === "sqlite") { connection.db.select().from(workflows).all(); } }
function rawSqlite() { const sqlite = new Database(":memory:"); sqlite.prepare("select 1").get(); }
function mapLookup() { new Map<string, number>().get("item"); }
function erased() { const builders = (tx: DbTransaction): unknown[] => [tx.delete(workflows)]; getPortableDb().transaction(tx => { for (const query of builders(tx)) { (query as { run: () => void }).run(); } }); }
function erasedGuarded() { const builders = (tx: DbTransaction): unknown[] => [tx.delete(workflows)]; if (getDbType() === "sqlite") { getPortableDb().transaction(tx => { for (const query of builders(tx)) { (query as { run: () => void }).run(); } }); } }
function structuralArray() { const builders = (tx: DbTransaction) => { const items: Array<{ run: () => void }> = []; items.push(tx.delete(workflows)); return items; }; getPortableDb().transaction(tx => { for (const query of builders(tx)) { query.run(); } }); }
function ordinaryClosure() { if (getDbType() === "sqlite") { const later = () => getPortableDb().select().from(workflows).all(); return later; } }
function nestedDeclaration() { if (getDbType() === "sqlite") { function later() { getPortableDb().select().from(workflows).all(); } return later; } }
function fakeDialect() { const connection = { dialect: "sqlite" }; if (connection.dialect === "sqlite") { getPortableDb().select().from(workflows).all(); } }
`;
interface AuditCall {
  file: string;
  line: number;
  method: string;
  scope: string;
  sqlite: boolean;
}
function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}
function sourceFiles(): string[] {
  return SOURCE_DIRS.flatMap((directory) =>
    readdirSync(path.join(ROOT, directory), { recursive: true })
      .filter(
        (entry) => typeof entry === "string" && entry.endsWith(".ts") && !entry.endsWith(".d.ts")
      )
      .map((entry) => path.join(ROOT, directory, String(entry)))
  );
}
function auditProgram(files: string[]): {
  calls: AuditCall[];
  fixtures: AuditCall[];
} {
  const configuration = ts.readConfigFile(path.join(ROOT, "tsconfig.base.json"), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(configuration.config, ts.sys, ROOT).options;
  const host = ts.createCompilerHost(options);
  const originalSourceFile = host.getSourceFile;
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
    path.resolve(file) === FIXTURE_FILE
      ? ts.createSourceFile(file, FIXTURE_SOURCE, languageVersion, true)
      : originalSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram(
    [...files, FIXTURE_FILE],
    {
      ...options,
      composite: false,
      incremental: false,
      customConditions: ["nodetool-dev"]
    },
    host
  );
  const checker = program.getTypeChecker();
  const provenance = new Map<ts.Symbol, boolean>();
  const fromDrizzle = (symbol: ts.Symbol | undefined): boolean =>
    symbol?.declarations?.some((declaration) => {
      const filename = declaration.getSourceFile().fileName.split(path.sep).join("/");
      return filename.includes("/drizzle-orm/sqlite-core/");
    }) ?? false;
  const resolvedSymbol = (node: ts.Node): ts.Symbol | undefined => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  };
  const pushedArguments = new Map<ts.Symbol, ts.Expression[]>();
  for (const file of [...files, FIXTURE_FILE]) {
    const source = program.getSourceFile(file);
    if (!source) {
      throw new Error(`Source not indexed: ${file}`);
    }
    const indexPushes = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "push"
      ) {
        const symbol = resolvedSymbol(node.expression.expression);
        if (symbol) {
          const argumentsForSymbol = pushedArguments.get(symbol) ?? [];
          argumentsForSymbol.push(...node.arguments);
          pushedArguments.set(symbol, argumentsForSymbol);
        }
      }
      ts.forEachChild(node, indexPushes);
    };
    indexPushes(source);
  }
  const databaseFunction = (expression: ts.Expression, name: string): boolean => {
    expression = unwrap(expression);
    if (!ts.isCallExpression(expression)) {
      return false;
    }
    const symbol = resolvedSymbol(expression.expression);
    return (
      symbol?.name === name &&
      symbol.declarations?.some(
        (declaration) =>
          path.resolve(declaration.getSourceFile().fileName) ===
          path.join(ROOT, "packages/models/src/db.ts")
      ) === true
    );
  };
  const variableInitializer = (expression: ts.Expression): ts.Expression | undefined => {
    if (!ts.isIdentifier(expression)) {
      return undefined;
    }
    const declaration = resolvedSymbol(expression)?.declarations?.find(ts.isVariableDeclaration);
    if (
      !declaration ||
      !ts.isVariableDeclarationList(declaration.parent) ||
      !(declaration.parent.flags & ts.NodeFlags.Const)
    ) {
      return undefined;
    }
    return declaration.initializer;
  };
  const isConnection = (expression: ts.Expression): boolean =>
    databaseFunction(expression, "getDatabase") ||
    Boolean(variableInitializer(expression) && isConnection(variableInitializer(expression)!));
  const isDialect = (expression: ts.Expression): boolean => {
    expression = unwrap(expression);
    if (databaseFunction(expression, "getDbType")) {
      return true;
    }
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === "dialect") {
      return isConnection(expression.expression);
    }
    const initializer = variableInitializer(expression);
    return initializer ? isDialect(initializer) : false;
  };
  const sqliteCondition = (
    condition: ts.Expression
  ): {
    yes: boolean;
    no: boolean;
  } => {
    condition = unwrap(condition);
    if (
      ts.isPrefixUnaryExpression(condition) &&
      condition.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const nested = sqliteCondition(condition.operand);
      return { yes: nested.no, no: nested.yes };
    }
    if (ts.isBinaryExpression(condition)) {
      const { left, right, operatorToken } = condition;
      const comparesSqlite =
        (isDialect(left) && ts.isStringLiteral(right) && right.text === "sqlite") ||
        (isDialect(right) && ts.isStringLiteral(left) && left.text === "sqlite");
      if (comparesSqlite && operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
        return { yes: true, no: false };
      }
      if (comparesSqlite && operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
        return { yes: false, no: true };
      }
    }
    return { yes: false, no: false };
  };
  const builderValue = (expression: ts.Expression): boolean => {
    expression = unwrap(expression);
    const type = checker.getTypeAtLocation(expression);
    if (["get", "run", "all"].some((method) => fromDrizzle(type.getProperty(method)))) {
      return true;
    }
    if (ts.isArrayLiteralExpression(expression)) {
      return expression.elements.some(
        (element) => ts.isExpression(element) && builderValue(element)
      );
    }
    const symbol = resolvedSymbol(
      ts.isCallExpression(expression) ? expression.expression : expression
    );
    if (!symbol) {
      return false;
    }
    const cached = provenance.get(symbol);
    if (cached !== undefined) {
      return cached;
    }
    provenance.set(symbol, false);
    let result = false;
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isVariableDeclaration(declaration)) {
        if (
          ts.isVariableDeclarationList(declaration.parent) &&
          ts.isForOfStatement(declaration.parent.parent)
        ) {
          result ||= builderValue(declaration.parent.parent.expression);
        }
        if (declaration.initializer) {
          if (
            ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer)
          ) {
            result ||= returnedBuilder(declaration.initializer.body);
          } else {
            result ||= builderValue(declaration.initializer);
          }
        }
      } else if (ts.isFunctionDeclaration(declaration) && declaration.body) {
        result ||= returnedBuilder(declaration.body);
      }
    }
    result ||= pushedArguments.get(symbol)?.some(builderValue) ?? false;
    provenance.set(symbol, result);
    return result;
  };
  const returnedBuilder = (body: ts.ConciseBody): boolean => {
    if (!ts.isBlock(body)) {
      return builderValue(body);
    }
    let found = false;
    const visit = (node: ts.Node): void => {
      if (ts.isReturnStatement(node) && node.expression) {
        found ||= builderValue(node.expression);
      }
      if (ts.isFunctionLike(node)) {
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return found;
  };
  const exits = (statement: ts.Statement): boolean =>
    ts.isReturnStatement(statement) ||
    ts.isThrowStatement(statement) ||
    (ts.isBlock(statement) &&
      statement.statements.length > 0 &&
      exits(statement.statements[statement.statements.length - 1]));
  const calls: AuditCall[] = [];
  const fixtures: AuditCall[] = [];
  for (const file of [...files, FIXTURE_FILE]) {
    const source = program.getSourceFile(file);
    if (!source) {
      throw new Error(`Source not inspected: ${file}`);
    }
    const visit = (node: ts.Node, sqlite: boolean): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const parent = node.parent;
        const immediateTransaction =
          ts.isCallExpression(parent) &&
          ts.isPropertyAccessExpression(parent.expression) &&
          parent.expression.name.text === "transaction" &&
          fromDrizzle(checker.getSymbolAtLocation(parent.expression.name));
        ts.forEachChild(node, (child) => visit(child, sqlite && immediateTransaction));
        return;
      }
      if (ts.isBlock(node) || ts.isSourceFile(node)) {
        let narrowed = sqlite;
        for (const statement of node.statements) {
          visit(statement, narrowed);
          if (ts.isIfStatement(statement)) {
            const condition = sqliteCondition(statement.expression);
            if (exits(statement.thenStatement) && !statement.elseStatement) {
              narrowed ||= condition.no;
            }
            if (statement.elseStatement && exits(statement.elseStatement)) {
              narrowed ||= condition.yes;
            }
          }
        }
        return;
      }
      if (ts.isIfStatement(node)) {
        const condition = sqliteCondition(node.expression);
        visit(node.expression, sqlite);
        visit(node.thenStatement, sqlite || condition.yes);
        if (node.elseStatement) {
          visit(node.elseStatement, sqlite || condition.no);
        }
        return;
      }
      if (ts.isConditionalExpression(node)) {
        const condition = sqliteCondition(node.condition);
        visit(node.condition, sqlite);
        visit(node.whenTrue, sqlite || condition.yes);
        visit(node.whenFalse, sqlite || condition.no);
        return;
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (
          ["get", "run", "all"].includes(method) &&
          (fromDrizzle(checker.getSymbolAtLocation(node.expression.name)) ||
            builderValue(node.expression.expression))
        ) {
          let ancestor: ts.Node = node;
          while (ancestor.parent && !ts.isFunctionDeclaration(ancestor)) {
            ancestor = ancestor.parent;
          }
          const record: AuditCall = {
            file: path.relative(ROOT, file),
            line:
              source.getLineAndCharacterOfPosition(node.expression.name.getStart(source)).line + 1,
            method,
            scope: ts.isFunctionDeclaration(ancestor) ? (ancestor.name?.text ?? "") : "",
            sqlite
          };
          (file === FIXTURE_FILE ? fixtures : calls).push(record);
        }
      }
      ts.forEachChild(node, (child) => visit(child, sqlite));
    };
    visit(source, false);
  }
  return { calls, fixtures };
}
describe("portable query boundary", () => {
  const files = sourceFiles();
  const result = auditProgram(files);
  it("inspects real files and Drizzle synchronous calls", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(result.calls.length).toBeGreaterThan(0);
  });
  it("requires SQLite narrowing for each synchronous Drizzle call", () => {
    expect(result.calls.filter((call) => !call.sqlite)).toEqual([]);
  });
  it("detects misplaced calls, erased builder types, and delayed closures", () => {
    expect(result.fixtures.filter((call) => !call.sqlite).map((call) => call.scope)).toEqual([
      "unguarded",
      "wrongBranch",
      "erased",
      "structuralArray",
      "ordinaryClosure",
      "later",
      "fakeDialect"
    ]);
    expect(result.fixtures.filter((call) => call.sqlite).map((call) => call.scope)).toEqual([
      "sqliteBranch",
      "earlyGuard",
      "dialectAlias",
      "connectionGuard",
      "erasedGuarded"
    ]);
    expect(result.fixtures.map((call) => call.scope)).not.toContain("rawSqlite");
    expect(result.fixtures.map((call) => call.scope)).not.toContain("mapLookup");
  });
});
