import path from "node:path";

export interface WorkflowDocOptions {
  packageName?: string;
}

export interface WorkflowFile {
  path: string;
  data: Record<string, unknown>;
}

interface WorkflowNode {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

function asGraph(
  data: Record<string, unknown>
): { nodes: WorkflowNode[]; edges: unknown[] } {
  const graph = (data["graph"] ?? data) as Record<string, unknown>;
  const nodes = Array.isArray(graph["nodes"])
    ? (graph["nodes"] as WorkflowNode[])
    : [];
  const edges = Array.isArray(graph["edges"])
    ? (graph["edges"] as unknown[])
    : [];
  return { nodes, edges };
}

function filterIO(
  nodes: WorkflowNode[],
  prefix: "nodetool.input." | "nodetool.output."
): WorkflowNode[] {
  return nodes.filter(
    (n) => typeof n.type === "string" && n.type.startsWith(prefix)
  );
}

function slotName(node: WorkflowNode): string {
  const props = (node.properties ?? node.data ?? {}) as Record<string, unknown>;
  if (typeof props["name"] === "string" && props["name"]) return props["name"];
  return node.id ?? (node.type ?? "unknown");
}

function slotDescription(node: WorkflowNode): string {
  const props = (node.properties ?? node.data ?? {}) as Record<string, unknown>;
  if (typeof props["description"] === "string") return props["description"];
  return "";
}

function slotType(node: WorkflowNode): string {
  const t = node.type ?? "";
  const lastDot = t.lastIndexOf(".");
  return lastDot > 0 ? t.slice(lastDot + 1) : t;
}

function slugifyWorkflowName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateWorkflowMarkdown(wf: WorkflowFile): string {
  const { nodes, edges } = asGraph(wf.data);
  const name =
    typeof wf.data["name"] === "string"
      ? wf.data["name"]
      : path.basename(wf.path, ".json");
  const description =
    typeof wf.data["description"] === "string" ? wf.data["description"] : "";

  const inputs = filterIO(nodes, "nodetool.input.");
  const outputs = filterIO(nodes, "nodetool.output.");

  const lines: string[] = [];
  lines.push(`# ${name}`, "");
  if (description) lines.push(description, "");
  lines.push(`**Source:** \`${wf.path}\``);
  lines.push(`**Nodes:** ${nodes.length}`);
  lines.push(`**Edges:** ${edges.length}`, "");

  lines.push("## Inputs", "");
  if (inputs.length === 0) {
    lines.push("_(none)_", "");
  } else {
    lines.push("| Name | Type | Description |");
    lines.push("|------|------|-------------|");
    for (const input of inputs) {
      const cells = [
        slotName(input),
        slotType(input),
        slotDescription(input)
      ].map((c) =>
        c
          .replace(/\\/g, "\\\\")
          .replace(/\|/g, "\\|")
          .replace(/\r?\n/g, " ")
      );
      lines.push(`| ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## Outputs", "");
  if (outputs.length === 0) {
    lines.push("_(none)_", "");
  } else {
    lines.push("| Name | Type | Description |");
    lines.push("|------|------|-------------|");
    for (const output of outputs) {
      const cells = [
        slotName(output),
        slotType(output),
        slotDescription(output)
      ].map((c) =>
        c
          .replace(/\\/g, "\\\\")
          .replace(/\|/g, "\\|")
          .replace(/\r?\n/g, " ")
      );
      lines.push(`| ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function generateAllWorkflowDocs(
  workflows: WorkflowFile[],
  opts: WorkflowDocOptions = {}
): Map<string, string> {
  const docs = new Map<string, string>();
  for (const wf of workflows) {
    if (opts.packageName) {
      const pkg = wf.data["package_name"];
      if (typeof pkg === "string" && pkg !== opts.packageName) continue;
    }
    const name =
      typeof wf.data["name"] === "string"
        ? wf.data["name"]
        : path.basename(wf.path, ".json");
    const filename = `${slugifyWorkflowName(name)}.md`;
    docs.set(filename, generateWorkflowMarkdown(wf));
  }
  return docs;
}
