import fs from "node:fs";
import path from "node:path";

/**
 * Shared table printer for the package command group. Duplicates the
 * formatter used by nodetool.ts so this file is self-contained when
 * imported from commands/.
 */
export function printTable<Row extends object>(
  rows: readonly Row[],
  columns?: string[]
): void {
  if (rows.length === 0) {
    console.log("(no results)");
    return;
  }
  // Render every cell up front, keyed by column name. A table prints whatever
  // column names the caller asked for off rows of any object shape, so the
  // lookup is by name — not by a property the row type declares.
  const cells = rows.map(
    (row) =>
      new Map(
        Object.entries(row).map(([column, value]): [string, string] => [
          column,
          String(value ?? "")
        ])
      )
  );
  const cols = columns ?? Object.keys(rows[0]!);
  const widths = cols.map((c) =>
    Math.max(c.length, ...cells.map((r) => (r.get(c) ?? "").length))
  );
  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join("│");
  console.log(header);
  console.log(sep);
  for (const rendered of cells) {
    console.log(
      cols
        .map((c, i) => ` ${(rendered.get(c) ?? "").padEnd(widths[i]!)} `)
        .join("│")
    );
  }
}

export function asJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Return filesystem roots discovered from the cwd's package.json workspaces
 * plus the cwd itself. Patterns like "packages/*" are expanded by a single
 * readdir — the typical workspace layout — rather than pulling in a glob lib.
 */
export function findWorkspaceRoots(cwd: string = process.cwd()): string[] {
  const roots = new Set<string>([cwd]);
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) return [...roots];

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return [...roots];
  }

  const patterns = Array.isArray(pkg["workspaces"])
    ? (pkg["workspaces"] as string[])
    : pkg["workspaces"] &&
        typeof pkg["workspaces"] === "object" &&
        Array.isArray(
          (pkg["workspaces"] as Record<string, unknown>)["packages"]
        )
      ? ((pkg["workspaces"] as Record<string, unknown>)[
          "packages"
        ] as string[])
      : [];

  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parentRel = pattern.slice(0, -2);
      const parent = path.resolve(cwd, parentRel);
      if (!fs.existsSync(parent)) continue;
      try {
        for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
          if (entry.isDirectory()) roots.add(path.join(parent, entry.name));
        }
      } catch {
        // ignore
      }
    } else if (!pattern.includes("*")) {
      const full = path.resolve(cwd, pattern);
      if (fs.existsSync(full)) roots.add(full);
    }
  }

  return [...roots];
}
