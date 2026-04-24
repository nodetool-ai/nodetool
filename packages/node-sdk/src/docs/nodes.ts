import type {
  NodeMetadata,
  PropertyMetadata,
  OutputSlotMetadata,
  TypeMetadata
} from "../metadata.js";

export interface NodeDocOptions {
  /** Filter by package_name (matches NodeMetadata.namespace prefix). */
  packageName?: string;
}

function typeMetaToString(type: TypeMetadata): string {
  const args = (type.type_args ?? []).map(typeMetaToString).filter(Boolean);
  if (args.length === 0) return type.type;
  return `${type.type}[${args.join(", ")}]`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatDefault(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") {
    return value.length > 40 ? `"${value.slice(0, 37)}..."` : `"${value}"`;
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 40 ? `${s.slice(0, 37)}...` : s;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Build a filesystem-safe filename for a node: "<namespace>-<title>.md". */
export function slugifyNodeFilename(node: NodeMetadata): string {
  const base = `${node.namespace}.${node.title || node.node_type}`;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}.md`;
}

function propertyRow(prop: PropertyMetadata): string {
  const name = escapeCell(prop.name);
  const typeStr = escapeCell(typeMetaToString(prop.type));
  const def = escapeCell(formatDefault(prop.default));
  const desc = escapeCell(prop.description ?? "");
  return `| ${name} | ${typeStr} | ${def} | ${desc} |`;
}

function outputRow(output: OutputSlotMetadata): string {
  const name = escapeCell(output.name);
  const typeStr = escapeCell(typeMetaToString(output.type));
  const streaming = output.stream ? " (stream)" : "";
  return `| ${name} | ${typeStr}${streaming} |`;
}

export function generateNodeMarkdown(node: NodeMetadata): string {
  const lines: string[] = [];
  lines.push(`# ${node.title}`, "");
  lines.push(`\`${node.node_type}\``, "");
  if (node.description) {
    lines.push(node.description, "");
  }

  lines.push("## Properties", "");
  if (!node.properties || node.properties.length === 0) {
    lines.push("_(none)_", "");
  } else {
    lines.push("| Name | Type | Default | Description |");
    lines.push("|------|------|---------|-------------|");
    for (const prop of node.properties) {
      lines.push(propertyRow(prop));
    }
    lines.push("");
  }

  lines.push("## Outputs", "");
  if (!node.outputs || node.outputs.length === 0) {
    lines.push("_(none)_", "");
  } else {
    lines.push("| Name | Type |");
    lines.push("|------|------|");
    for (const output of node.outputs) {
      lines.push(outputRow(output));
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function generateAllNodeDocs(
  nodes: NodeMetadata[],
  opts: NodeDocOptions = {}
): Map<string, string> {
  const docs = new Map<string, string>();
  for (const node of nodes) {
    if (
      opts.packageName &&
      !node.namespace.startsWith(opts.packageName)
    ) {
      continue;
    }
    docs.set(slugifyNodeFilename(node), generateNodeMarkdown(node));
  }
  return docs;
}
