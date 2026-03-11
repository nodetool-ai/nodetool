#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const tsRoot = "/Users/mg/workspace/nodetool-core/ts";
const workspaceRoot = "/Users/mg/workspace";
const nodesRoot = path.join(tsRoot, "packages/base-nodes/src/nodes");

function resolvePythonNode(map, nodeType) {
  return map.get(nodeType) ?? (nodeType.endsWith("Node") ? map.get(nodeType.slice(0, -4)) : undefined);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(fullPath);
    }
  }
  return out;
}

function loadPythonMetadata(root) {
  const files = [];
  function scan(dir, depth = 0) {
    if (depth > 3) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
        if (fullPath.endsWith(path.join("src", "nodetool", "package_metadata"))) {
          for (const file of fs.readdirSync(fullPath)) {
            if (file.endsWith(".json")) files.push(path.join(fullPath, file));
          }
          continue;
        }
        scan(fullPath, depth + 1);
      }
    }
  }
  scan(root);
  const map = new Map();
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8").replace(/\bNaN\b|-?Infinity\b/g, "null");
    const parsed = JSON.parse(raw);
    for (const node of parsed.nodes ?? []) {
      map.set(node.node_type, node);
    }
  }
  return map;
}

function typeToString(typeMeta) {
  const args = (typeMeta.type_args ?? []).map(typeToString).filter(Boolean);
  return args.length > 0 ? `${typeMeta.type}[${args.join(", ")}]` : typeMeta.type;
}

function jsLiteral(value, indent = 0) {
  const spacing = " ".repeat(indent);
  const nextSpacing = " ".repeat(indent + 2);
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${nextSpacing}${jsLiteral(item, indent + 2)}`).join(",\n")}\n${spacing}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(([key, nested]) => `${nextSpacing}${JSON.stringify(key)}: ${jsLiteral(nested, indent + 2)}`)
      .join(",\n")}\n${spacing}}`;
  }
  return "undefined";
}

function propOptionsLiteral(property) {
  const entries = [
    ["type", typeToString(property.type)],
  ];
  if (Object.prototype.hasOwnProperty.call(property, "default")) entries.push(["default", property.default]);
  if (property.title != null) entries.push(["title", property.title]);
  if (property.description != null) entries.push(["description", property.description]);
  if (property.min != null) entries.push(["min", property.min]);
  if (property.max != null) entries.push(["max", property.max]);
  if (property.required) entries.push(["required", true]);
  const values = property.values ?? property.type?.values;
  if (values != null) entries.push(["values", values]);
  if (property.json_schema_extra != null) entries.push(["json_schema_extra", property.json_schema_extra]);
  return `{ ${entries.map(([key, value]) => `${key}: ${jsLiteral(value)}`).join(", ")} }`;
}

function objectLiteralFromEntries(entries, indent = 2) {
  const spacing = " ".repeat(indent);
  const nextSpacing = " ".repeat(indent + 2);
  if (entries.length === 0) {
    return "{}";
  }
  return `{\n${entries
    .map(([key, value]) => `${nextSpacing}${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)}: ${value}`)
    .join(",\n")}\n${spacing}}`;
}

function propertyBlock(properties) {
  if (!properties || properties.length === 0) return "";
  return properties
    .map(
      (property) =>
        `  @prop(${propOptionsLiteral(property)})\n  declare ${property.name}: any;`
    )
    .join("\n\n");
}

function canHaveDecorators(node) {
  return typeof ts.canHaveDecorators === "function" && ts.canHaveDecorators(node);
}

function getDecorators(node) {
  return canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function isManagedPropMember(member, sourceFile) {
  if (!ts.isPropertyDeclaration(member)) return false;
  const isStatic = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
  if (isStatic) return false;
  return getDecorators(member).some((decorator) => {
    const expr = decorator.expression;
    return ts.isCallExpression(expr) && expr.expression.getText(sourceFile) === "prop";
  });
}

function getExtendedClassName(node) {
  const clause = node.heritageClauses?.find((entry) => entry.token === ts.SyntaxKind.ExtendsKeyword);
  const typeNode = clause?.types?.[0];
  if (!typeNode) return null;
  if (ts.isIdentifier(typeNode.expression)) return typeNode.expression.text;
  return typeNode.expression.getText();
}

function collectDerivedBaseNodeClassNames(sourceFile) {
  const derived = new Set(["BaseNode"]);
  const classes = [];

  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      classes.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    for (const classDecl of classes) {
      const name = classDecl.name?.text;
      if (!name || derived.has(name)) continue;
      const baseName = getExtendedClassName(classDecl);
      if (baseName && derived.has(baseName)) {
        derived.add(name);
        changed = true;
      }
    }
  }

  derived.delete("BaseNode");
  return derived;
}

function getStaticPropertyMembers(classDecl) {
  const map = new Map();
  for (const member of classDecl.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    const isStatic = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
    if (!isStatic || !member.name || !ts.isIdentifier(member.name)) continue;
    map.set(member.name.text, member);
  }
  return map;
}

function getInitializerText(member, sourceFile) {
  return member.initializer ? sourceFile.text.slice(member.initializer.getStart(sourceFile), member.initializer.getEnd()) : "";
}

function replaceRange(text, start, end, replacement) {
  return text.slice(0, start) + replacement + text.slice(end);
}

function applyPatches(text, patches) {
  const sorted = [...patches].sort((a, b) => b.start - a.start);
  let out = text;
  for (const patch of sorted) {
    out = replaceRange(out, patch.start, patch.end, patch.replacement);
  }
  return out;
}

function lineStart(sourceFile, pos) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
  return sourceFile.getLineStarts()[line];
}

function lineEndWithNewline(text, pos) {
  let end = pos;
  while (end < text.length && text[end] !== "\n") {
    end += 1;
  }
  if (end < text.length) {
    end += 1;
  }
  return end;
}

function getMemberReplacementRange(member, sourceFile, text) {
  return {
    start: lineStart(sourceFile, member.getStart(sourceFile)),
    end: lineEndWithNewline(text, member.end),
  };
}

const pythonMetadataByType = loadPythonMetadata(workspaceRoot);
const files = walk(nodesRoot);

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const derivedBaseNodeClassNames = collectDerivedBaseNodeClassNames(sourceFile);
  const patches = [];

  function visit(node) {
    if (!ts.isClassDeclaration(node) || !node.name || !derivedBaseNodeClassNames.has(node.name.text)) {
      ts.forEachChild(node, visit);
      return;
    }

    const staticMembers = getStaticPropertyMembers(node);
    const nodeTypeMember = staticMembers.get("nodeType");
    if (!nodeTypeMember) return;
    const nodeType = getInitializerText(nodeTypeMember, sourceFile).slice(1, -1);
    const py = resolvePythonNode(pythonMetadataByType, nodeType);
    if (!py) return;

    const classStart = node.getStart(sourceFile);
    const insertPos = (() => {
      const descriptionMember = staticMembers.get("description");
      if (descriptionMember) return descriptionMember.end;
      return nodeTypeMember.end;
    })();

    const managedPropMembers = node.members.filter((member) => isManagedPropMember(member, sourceFile));

    const propertyNames = py.properties?.map((property) => property.name) ?? [];
    const managedStaticNames = [
      "layout",
      "title",
      "description",
      "basicFields",
      "requiredSettings",
      "isStreamingOutput",
      "isDynamic",
      "exposeAsTool",
      "supportsDynamicOutputs",
      "theModelInfo",
      "recommendedModels",
      "modelPacks",
      "metadataOutputTypes",
    ];
    const desiredStatics = new Map();
    desiredStatics.set("title", `  static readonly title = ${jsLiteral(py.title)};`);
    desiredStatics.set("description", `  static readonly description = ${jsLiteral(py.description)};`);
    if (py.layout != null) {
      desiredStatics.set("layout", `  static readonly layout = ${jsLiteral(py.layout)};`);
    }
    if (JSON.stringify(py.basic_fields ?? []) !== JSON.stringify(propertyNames)) {
      desiredStatics.set("basicFields", `  static readonly basicFields = ${jsLiteral(py.basic_fields ?? [])};`);
    }
    if ((py.required_settings?.length ?? 0) > 0) {
      desiredStatics.set("requiredSettings", `  static readonly requiredSettings = ${jsLiteral(py.required_settings)};`);
    }
    if (py.is_streaming_output) {
      desiredStatics.set("isStreamingOutput", "  static readonly isStreamingOutput = true;");
    }
    if (py.is_dynamic) {
      desiredStatics.set("isDynamic", "  static readonly isDynamic = true;");
    }
    if (py.expose_as_tool) {
      desiredStatics.set("exposeAsTool", "  static readonly exposeAsTool = true;");
    }
    if (py.supports_dynamic_outputs) {
      desiredStatics.set("supportsDynamicOutputs", "  static readonly supportsDynamicOutputs = true;");
    }
    if (py.the_model_info != null) {
      desiredStatics.set("theModelInfo", `  static readonly theModelInfo = ${jsLiteral(py.the_model_info, 2)};`);
    }
    if ((py.recommended_models?.length ?? 0) > 0) {
      desiredStatics.set("recommendedModels", `  static readonly recommendedModels = ${jsLiteral(py.recommended_models, 2)};`);
    }
    if ((py.model_packs?.length ?? 0) > 0) {
      desiredStatics.set("modelPacks", `  static readonly modelPacks = ${jsLiteral(py.model_packs, 2)};`);
    }
    if ((py.outputs?.length ?? 0) > 0) {
      desiredStatics.set(
        "metadataOutputTypes",
        `  static readonly metadataOutputTypes = ${objectLiteralFromEntries(
          (py.outputs ?? []).map((output) => [output.name, jsLiteral(typeToString(output.type))])
        )};`
      );
    }

    const missingStatics = [];
    for (const name of managedStaticNames) {
      const existing = staticMembers.get(name);
      const replacement = desiredStatics.get(name);
      if (replacement) {
        if (existing) {
          patches.push({
            start: existing.getStart(sourceFile),
            end: existing.end,
            replacement,
          });
        } else {
          missingStatics.push(replacement);
        }
      } else if (existing) {
        const range = getMemberReplacementRange(existing, sourceFile, original);
        patches.push({
          start: range.start,
          end: range.end,
          replacement: "",
        });
      }
    }

    if (missingStatics.length > 0) {
      patches.push({
        start: insertPos,
        end: insertPos,
        replacement: `\n${missingStatics.join("\n")}`,
      });
    }

    const desiredPropBlock = propertyBlock(py.properties ?? []);
    if (managedPropMembers.length > 0) {
      const firstManaged = managedPropMembers[0];
      const lastManaged = managedPropMembers[managedPropMembers.length - 1];
      const start = lineStart(sourceFile, firstManaged.getStart(sourceFile));
      const end = lineEndWithNewline(original, lastManaged.end);
      patches.push({
        start,
        end,
        replacement: desiredPropBlock ? `${desiredPropBlock}\n\n` : "",
      });
    } else if (desiredPropBlock) {
      const firstInstanceMember = node.members.find((member) => {
        if (!ts.isPropertyDeclaration(member) && !ts.isMethodDeclaration(member) && !ts.isGetAccessorDeclaration(member) && !ts.isSetAccessorDeclaration(member)) {
          return false;
        }
        return !member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
      });
      const insertAt = firstInstanceMember
        ? lineStart(sourceFile, firstInstanceMember.getStart(sourceFile))
        : node.end - 1;
      patches.push({
        start: insertAt,
        end: insertAt,
        replacement: `${desiredPropBlock}\n\n`,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (patches.length > 0) {
    const updated = applyPatches(original, patches);
    fs.writeFileSync(file, updated);
  }
}
