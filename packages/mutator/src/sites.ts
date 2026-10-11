/**
 * Find mutation sites in TypeScript and JavaScript source.
 *
 * The operators follow unclebob/mutator's TypeScript set, which is the Java
 * set (mutate4java) spelled in TypeScript plus `===`/`!==`, `??` to `||`,
 * and `?.` to `.`. Tokens inside strings, comments, and type positions are
 * never mutated, because only expression nodes are visited.
 */

import ts from "typescript";

export type SiteCategory =
  | "arithmetic"
  | "comparison"
  | "equality"
  | "logical"
  | "unary"
  | "boolean"
  | "constant"
  | "optional";

export interface RawSite {
  /** 1-based line of the replaced token. */
  line: number;
  /** UTF-16 offset of the first replaced character. */
  start: number;
  /** UTF-16 offset one past the last replaced character. */
  end: number;
  original: string;
  /** Replacement text. An empty string deletes the token. */
  mutant: string;
  category: SiteCategory;
}

const BINARY: ReadonlyMap<ts.SyntaxKind, [string, string, SiteCategory]> = new Map([
  [ts.SyntaxKind.PlusToken, ["+", "-", "arithmetic"]],
  [ts.SyntaxKind.MinusToken, ["-", "+", "arithmetic"]],
  [ts.SyntaxKind.AsteriskToken, ["*", "/", "arithmetic"]],
  [ts.SyntaxKind.SlashToken, ["/", "*", "arithmetic"]],
  [ts.SyntaxKind.GreaterThanToken, [">", ">=", "comparison"]],
  [ts.SyntaxKind.GreaterThanEqualsToken, [">=", ">", "comparison"]],
  [ts.SyntaxKind.LessThanToken, ["<", "<=", "comparison"]],
  [ts.SyntaxKind.LessThanEqualsToken, ["<=", "<", "comparison"]],
  [ts.SyntaxKind.EqualsEqualsToken, ["==", "!=", "equality"]],
  [ts.SyntaxKind.ExclamationEqualsToken, ["!=", "==", "equality"]],
  [ts.SyntaxKind.EqualsEqualsEqualsToken, ["===", "!==", "equality"]],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, ["!==", "===", "equality"]],
  [ts.SyntaxKind.AmpersandAmpersandToken, ["&&", "||", "logical"]],
  [ts.SyntaxKind.BarBarToken, ["||", "&&", "logical"]],
  [ts.SyntaxKind.QuestionQuestionToken, ["??", "||", "logical"]]
]);

export function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (path.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (/\.[cm]?js$/.test(path)) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

export function parse(source: string, path: string): ts.SourceFile {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKindFor(path));
}

/** Declarations and type syntax hold no runtime behavior to mutate. */
function skipped(node: ts.Node): boolean {
  if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) {
    return true;
  }
  return (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node) ||
    (ts.isModuleDeclaration(node) &&
      (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword) ?? false))
  );
}

function lineOf(file: ts.SourceFile, offset: number): number {
  return file.getLineAndCharacterOfPosition(offset).line + 1;
}

function optionalReplacement(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node)) {
    return ".";
  }
  if (ts.isCallExpression(node) || ts.isElementAccessExpression(node)) {
    return "";
  }
  return null;
}

function visitNode(node: ts.Node, file: ts.SourceFile, found: RawSite[]): void {
  const add = (start: number, end: number, original: string, mutant: string, category: SiteCategory) => {
    found.push({ line: lineOf(file, start), start, end, original, mutant, category });
  };
  if (ts.isBinaryExpression(node)) {
    const entry = BINARY.get(node.operatorToken.kind);
    if (entry) {
      const [original, mutant, category] = entry;
      add(node.operatorToken.getStart(file), node.operatorToken.end, original, mutant, category);
    }
    return;
  }
  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.ExclamationToken) {
      const start = node.getStart(file);
      add(start, start + 1, "!", "", "unary");
    } else if (node.operator === ts.SyntaxKind.MinusToken) {
      const start = node.getStart(file);
      add(start, start + 1, "-", "", "unary");
    }
    return;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    add(node.getStart(file), node.end, "true", "false", "boolean");
    return;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    add(node.getStart(file), node.end, "false", "true", "boolean");
    return;
  }
  if (ts.isNumericLiteral(node)) {
    const text = node.getText(file);
    if (text === "0" || text === "1") {
      add(node.getStart(file), node.end, text, text === "0" ? "1" : "0", "constant");
    }
    return;
  }
  const questionDot = (node as { questionDotToken?: ts.Node }).questionDotToken;
  if (questionDot) {
    const mutant = optionalReplacement(node);
    if (mutant !== null) {
      add(questionDot.getStart(file), questionDot.end, "?.", mutant, "optional");
    }
  }
}

/** Mutation sites in source order. */
export function discoverSites(source: string, path: string): RawSite[] {
  const file = parse(source, path);
  const found: RawSite[] = [];
  // An explicit stack: a 1,200-term expression must not overflow the call stack.
  const stack: ts.Node[] = [file];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (skipped(node)) {
      continue;
    }
    visitNode(node, file, found);
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => {
      children.push(child);
    });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  return found;
}

export function applySite(source: string, site: Pick<RawSite, "start" | "end" | "mutant">): string {
  return source.slice(0, site.start) + site.mutant + source.slice(site.end);
}
