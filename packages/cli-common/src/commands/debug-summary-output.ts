/**
 * The console summary printed after a timeline, sketch or JS-script debug run.
 * Only the document-specific line and the bundle's document file differ.
 */

interface DebugSummaryReport {
  verdict: {
    ok: boolean;
    headline: string;
    issues: string[];
    warnings?: string[];
  };
  interactions: { ok: boolean }[];
}

export function printDebugSummary(
  report: DebugSummaryReport,
  bundleDir: string,
  doc: { label: string; meta: string; file: string }
): void {
  const column = Math.max(doc.label.length, "session".length) + 1;
  const row = (label: string, text: string): string =>
    `  ${`${label}:`.padEnd(column)} ${text}`;
  const mark = report.verdict.ok ? "✅" : "❌";
  console.log(`\n${mark} ${report.verdict.headline}`);
  console.log(row(doc.label, doc.meta));
  const failed = report.interactions.filter((i) => !i.ok).length;
  if (report.interactions.length > 0) {
    console.log(
      row("session", `${report.interactions.length} step(s), ${failed} failed`)
    );
  }
  if (report.verdict.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of report.verdict.issues) console.log(`  - ${issue}`);
  }
  if (report.verdict.warnings && report.verdict.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of report.verdict.warnings)
      console.log(`  - ${warning}`);
  }
  console.log(`\nDebug bundle: ${bundleDir}`);
  console.log(`  report.md / report.json · ${doc.file}`);
}
