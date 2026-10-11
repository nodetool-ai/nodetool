/** Text reports for a mutation run and for --scan. */

import { describeSite, formScore, type FormResult, type Site, type Status } from "./model.js";

function percent(score: number | null): string {
  return score === null ? "n/a" : `${(score * 100).toFixed(1)}%`;
}

export function formatResults(forms: FormResult[]): string {
  if (forms.length === 0) {
    return "No functions to mutate.\n";
  }
  const nameWidth = Math.max(8, Math.min(48, Math.max(...forms.map((form) => form.name.length))));
  const nsWidth = Math.max(9, Math.min(72, Math.max(...forms.map((form) => form.namespace.length))));
  const row = (name: string, namespace: string, cells: (string | number)[]) =>
    `${name.padEnd(nameWidth)} ${namespace.padEnd(nsWidth)} ${[7, 9, 10, 6, 7]
      .map((width, index) => String(cells[index]).padStart(width))
      .join(" ")}`;
  const header = row("Function", "Namespace", ["Killed", "Survived", "Uncovered", "Sites", "Score"]);
  const ordered = [...forms].sort((a, b) => {
    const sa = formScore(a);
    const sb = formScore(b);
    if ((sa === null) !== (sb === null)) {
      return sa === null ? -1 : 1;
    }
    return (sa ?? 0) - (sb ?? 0) || b.survived - a.survived || a.name.localeCompare(b.name);
  });
  const rule = "-".repeat(header.length);
  const lines = [header, rule];
  const total = { killed: 0, survived: 0, uncovered: 0, sites: 0 };
  for (const form of ordered) {
    lines.push(
      row(form.name, form.namespace, [
        form.killed,
        form.survived,
        form.uncovered,
        form.sites,
        percent(formScore(form))
      ])
    );
    total.killed += form.killed;
    total.survived += form.survived;
    total.uncovered += form.uncovered;
    total.sites += form.sites;
  }
  lines.push(rule);
  lines.push(
    row("Total", "", [total.killed, total.survived, total.uncovered, total.sites, percent(formScore(total))])
  );
  return `${lines.join("\n")}\n`;
}

export function formatSiteLog(sites: Site[], statuses: Map<string, Status>): string {
  const lines: string[] = [];
  for (const site of sites) {
    const status = statuses.get(site.mutationId);
    if (status !== undefined) {
      lines.push(`${status.toUpperCase().padEnd(9)} ${site.file}:${site.line} ${describeSite(site)}`);
    }
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

export function formatScan(
  path: string,
  sites: Site[],
  changed: Set<string>,
  covered: Map<string, boolean> | null,
  keyOf: (site: Site) => string
): string {
  const lines = [`Scan: ${sites.length} mutation sites in ${path}`];
  for (const site of sites) {
    const mark = changed.has(keyOf(site)) ? "*" : " ";
    const coverage = covered !== null && covered.get(site.mutationId) === false ? " uncovered" : "";
    lines.push(`${mark} ${path}:${site.line} ${describeSite(site)}${coverage}  [${site.formId}]`);
  }
  if (changed.size > 0) {
    lines.push("* marks a function whose text changed since the last snapshot.");
  }
  return `${lines.join("\n")}\n`;
}
