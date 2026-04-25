import type { PackageMetadata, NodeMetadata } from "../metadata.js";
import { slugifyNodeFilename } from "./nodes.js";

export interface OverviewOptions {
  compact?: boolean;
}

function shortDescription(text: string | undefined): string {
  if (!text) return "";
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  return firstLine.trim();
}

function exampleLabel(example: unknown): string {
  if (!example || typeof example !== "object" || Array.isArray(example)) {
    return String(example);
  }
  const record = example as Record<string, unknown>;
  return (
    (typeof record["name"] === "string" && record["name"]) ||
    (typeof record["id"] === "string" && record["id"]) ||
    "example"
  );
}

export function generatePackageOverviewMarkdown(
  pkg: PackageMetadata,
  opts: OverviewOptions = {}
): string {
  const nodes: NodeMetadata[] = pkg.nodes ?? [];
  const examples = pkg.examples ?? [];
  const authors = (pkg.authors ?? []).join(", ");

  if (opts.compact) {
    const nodeList = nodes
      .map(
        (n) =>
          `- ${n.title} (\`${n.node_type}\`)${
            shortDescription(n.description)
              ? ` — ${shortDescription(n.description)}`
              : ""
          }`
      )
      .join("\n");
    const header = [
      `# ${pkg.name}${pkg.version ? ` (${pkg.version})` : ""}`,
      pkg.description ?? "",
      `Nodes: ${nodes.length}  Examples: ${examples.length}`
    ]
      .filter(Boolean)
      .join(" · ");
    return `${header}\n\n${nodeList}\n`;
  }

  const lines: string[] = [];
  lines.push(`# ${pkg.name}`, "");
  if (pkg.description) {
    lines.push(pkg.description, "");
  }
  if (pkg.version) lines.push(`**Version:** ${pkg.version}`);
  if (authors) lines.push(`**Authors:** ${authors}`);
  if (pkg.version || authors) lines.push("");

  lines.push(`## Nodes (${nodes.length})`, "");
  if (nodes.length === 0) {
    lines.push("_(no nodes)_", "");
  } else {
    for (const node of nodes) {
      const desc = shortDescription(node.description);
      const file = slugifyNodeFilename(node);
      lines.push(`- [${node.title}](${file})${desc ? ` — ${desc}` : ""}`);
    }
    lines.push("");
  }

  lines.push(`## Examples (${examples.length})`, "");
  if (examples.length === 0) {
    lines.push("_(no examples)_", "");
  } else {
    for (const example of examples) {
      lines.push(`- ${exampleLabel(example)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
