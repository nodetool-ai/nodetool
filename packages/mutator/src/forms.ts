/**
 * Bind mutation sites to the functions that own them.
 *
 * A form is one named function: a function declaration, a class method,
 * accessor or constructor, an object-literal method, or an arrow or function
 * expression bound to a variable, property, or class field. Anonymous
 * callbacks belong to the nearest enclosing form. A site outside every form
 * (module top level) is not counted, as in unclebob/mutator.
 *
 * The namespace is the dotted module path relative to the project root, or
 * `module.Class` for class members, which is what crapper reports.
 */

import { createHash } from "node:crypto";
import ts from "typescript";
import { discoverSites, parse } from "./sites.js";
import type { Site } from "./model.js";

export interface Form {
  namespace: string;
  name: string;
  private: boolean;
  /** `defn/<name>` or `defn-/<name>`, the id uml-viewer splits. */
  id: string;
  start: number;
  end: number;
  line: number;
  endLine: number;
}

export function moduleNamespace(fileKey: string): string {
  return fileKey.replace(/\.(d\.)?[cm]?[jt]sx?$/, "").split("/").join(".");
}

export function formId(name: string, isPrivate: boolean): string {
  return `${isPrivate ? "defn-" : "defn"}/${name}`;
}

function propertyName(name: ts.PropertyName | ts.BindingName, file: ts.SourceFile): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    return `[${name.expression.getText(file)}]`;
  }
  return null;
}

function hasPrivateModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) ?? false)
  );
}

function isPrivateMember(node: ts.Node & { name?: ts.Node }): boolean {
  return hasPrivateModifier(node) || (node.name !== undefined && ts.isPrivateIdentifier(node.name));
}

function className(node: ts.ClassLikeDeclaration): string {
  if (node.name) {
    return node.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return "default";
}

function isFunctionValue(node: ts.Node | undefined): node is ts.ArrowFunction | ts.FunctionExpression {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

export function findForms(source: string, path: string, fileKey: string): Form[] {
  const file = parse(source, path);
  const module = moduleNamespace(fileKey);
  const forms: Form[] = [];

  const add = (node: ts.Node, namespace: string, name: string, isPrivate: boolean) => {
    const start = node.getStart(file);
    forms.push({
      namespace,
      name,
      private: isPrivate,
      id: formId(name, isPrivate),
      start,
      end: node.end,
      line: file.getLineAndCharacterOfPosition(start).line + 1,
      endLine: file.getLineAndCharacterOfPosition(node.end).line + 1
    });
  };

  const visit = (node: ts.Node, namespace: string): void => {
    let inner = namespace;
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      inner = `${module}.${className(node)}`;
    } else if (ts.isFunctionDeclaration(node) && node.body) {
      add(node, namespace, node.name?.text ?? "default", false);
    } else if (
      (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) &&
      node.body
    ) {
      const name = propertyName(node.name, file);
      if (name !== null) {
        add(node, namespace, name, isPrivateMember(node));
      }
    } else if (ts.isConstructorDeclaration(node) && node.body) {
      add(node, namespace, "constructor", hasPrivateModifier(node));
    } else if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) &&
      isFunctionValue(node.initializer)
    ) {
      const name = propertyName(node.name, file);
      if (name !== null) {
        add(node, namespace, name, ts.isPropertyDeclaration(node) && isPrivateMember(node));
      }
    }
    ts.forEachChild(node, (child) => visit(child, inner));
  };
  visit(file, module);
  return forms;
}

/** The tightest form containing `offset`. */
export function ownerOf(forms: Form[], offset: number): Form | null {
  let best: Form | null = null;
  for (const form of forms) {
    if (form.start <= offset && offset < form.end) {
      if (best === null || form.end - form.start < best.end - best.start) {
        best = form;
      }
    }
  }
  return best;
}

export function formKey(namespace: string, id: string): string {
  return `${namespace}\u0000${id}`;
}

export function mutationId(
  file: string,
  namespace: string,
  form: string,
  start: number,
  end: number,
  original: string,
  mutant: string
): string {
  return JSON.stringify([file, namespace, form, start, end, original, mutant]);
}

export function mutationFile(mutation: string): string | null {
  try {
    const value: unknown = JSON.parse(mutation);
    return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
  } catch {
    return null;
  }
}

export function sitesInFile(source: string, path: string, fileKey: string): Site[] {
  const forms = findForms(source, path, fileKey);
  const found: Site[] = [];
  for (const raw of discoverSites(source, path)) {
    const owner = ownerOf(forms, raw.start);
    if (owner === null) {
      continue;
    }
    found.push({
      ...raw,
      file: fileKey,
      namespace: owner.namespace,
      formId: owner.id,
      name: owner.name,
      mutationId: mutationId(fileKey, owner.namespace, owner.id, raw.start, raw.end, raw.original, raw.mutant)
    });
  }
  return found;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function digestLines(lines: string[], line: number, endLine: number): string {
  return sha256(
    lines
      .slice(line - 1, endLine)
      .map((text) => text.trimEnd())
      .join("\n")
  );
}

/** Map each form key to a hash of its text. Same-named forms hash together. */
export function formDigests(source: string, forms: Form[]): Map<string, string> {
  const lines = source.split(/\r?\n/);
  const grouped = new Map<string, Form[]>();
  for (const form of forms) {
    const key = formKey(form.namespace, form.id);
    grouped.set(key, [...(grouped.get(key) ?? []), form]);
  }
  const digests = new Map<string, string>();
  for (const [key, group] of grouped) {
    const ordered = [...group].sort((a, b) => a.line - b.line || a.endLine - b.endLine);
    digests.set(key, sha256(ordered.map((form) => digestLines(lines, form.line, form.endLine)).join("")));
  }
  return digests;
}

export interface FormSpan {
  namespace: string;
  id: string;
  name: string;
  private: boolean;
  line: number;
  endLine: number;
}

/** One span per form key, widened over same-named forms. */
export function formSpans(forms: Form[]): FormSpan[] {
  const spans = new Map<string, FormSpan>();
  for (const form of forms) {
    const key = formKey(form.namespace, form.id);
    const prior = spans.get(key);
    if (prior) {
      prior.line = Math.min(prior.line, form.line);
      prior.endLine = Math.max(prior.endLine, form.endLine);
    } else {
      spans.set(key, {
        namespace: form.namespace,
        id: form.id,
        name: form.name,
        private: form.private,
        line: form.line,
        endLine: form.endLine
      });
    }
  }
  return [...spans.values()].sort((a, b) => a.line - b.line);
}
