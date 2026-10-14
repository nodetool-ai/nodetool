import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";
import { CORE_PACKAGES, NODE_PACKS } from "../../../scripts/node-catalog/tiers.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const coreDirectories = new Set(CORE_PACKAGES.map((name) => name.split("/")[1]));
const blockedNames = new Set([
  "@nodetool-ai/base-nodes",
  ...NODE_PACKS.flatMap((pack) => [pack.npmName, ...pack.provides])
]);
const baseline = JSON.parse(readFileSync(new URL("./migration-baseline.json", import.meta.url), "utf8"));

export function importSiteKey(kind, specifier, statement) {
  return `${kind}:${specifier}:${createHash("sha256").update(statement).digest("hex")}`;
}

export function isPackSpecifier(specifier) {
  return [...blockedNames].some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

function literalPrefix(node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral") {
    return node.quasis[0]?.value.cooked;
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = literalPrefix(node.left);
    const right = literalPrefix(node.right);
    return left === undefined ? undefined : right === undefined ? left : left + right;
  }
}

const noDirectPackImports = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      direct: "Core imports pack {{specifier}} directly. Use importPack from @nodetool-ai/node-catalog.",
      stale: "Remove the unused migration baseline for {{specifier}} from tools/oxlint/pack-boundaries/migration-baseline.json."
    }
  },
  createOnce(context) {
    let file = "";
    let active = false;
    let allowed = new Map();
    let seen = new Map();
    const inspect = (node, source, kind) => {
      if (!active || !source) { return; }
      const specifier = literalPrefix(source);
      if (!specifier || !isPackSpecifier(specifier)) { return; }
      const key = importSiteKey(kind, specifier, context.sourceCode.getText(node));
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > (allowed.get(key)?.count ?? 0)) {
        context.report({ node, messageId: "direct", data: { specifier } });
      }
    };
    return {
      Program() {
        file = relative(root, context.filename).split(sep).join("/");
        const parts = file.split("/");
        active = parts[0] === "packages" && coreDirectories.has(parts[1]) && parts[2] === "src" &&
          !parts.includes("__tests__") && !/\.test\.[cm]?[jt]sx?$/.test(file);
        allowed = new Map((baseline[file] ?? []).map((site) => [importSiteKey(site.kind, site.specifier, site.statement), site]));
        seen = new Map();
      },
      ImportDeclaration(node) {
        if (node.importKind !== "type" && !(node.specifiers.length > 0 && node.specifiers.every((item) => item.importKind === "type"))) {
          inspect(node, node.source, "import");
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== "type") { inspect(node, node.source, "export"); }
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind !== "type" && !(node.specifiers.length > 0 && node.specifiers.every((item) => item.exportKind === "type"))) {
          inspect(node, node.source, "export");
        }
      },
      ImportExpression(node) { inspect(node, node.source, "dynamic"); },
      CallExpression(node) {
        const importer = node.callee.type === "Identifier" && ["require", "importHidden", "importOptionalModule"].includes(node.callee.name);
        const resolver = context.sourceCode.getText(node.callee) === "import.meta.resolve";
        if (importer || resolver) {
          inspect(node, node.arguments[0], "call");
        }
      },
      "Program:exit"(node) {
        if (!active) { return; }
        for (const [key, site] of allowed) {
          if ((seen.get(key) ?? 0) < site.count) {
            context.report({ node, messageId: "stale", data: { specifier: site.specifier } });
          }
        }
      }
    };
  }
});

export default eslintCompatPlugin({
  meta: { name: "pack-boundaries" },
  rules: { "no-direct-pack-imports": noDirectPackImports }
});
