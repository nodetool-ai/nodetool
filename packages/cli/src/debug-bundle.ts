import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Default `nodetool-debug/<kind>-<slug>-<timestamp>` bundle directory. */
export function defaultDebugOutDir(kind: string, ref: string): string {
  const slug =
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || kind;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/${kind}-${slug}-${stamp}`);
}

/** Write `<kind>.json`, `report.json` and `report.md` into the bundle directory. */
export async function writeDebugBundle(args: {
  kind: string;
  ref: string;
  outDir?: string;
  raw: unknown;
  report: unknown;
  reportMarkdown: string;
}): Promise<string> {
  const bundleDir = args.outDir
    ? resolve(args.outDir)
    : defaultDebugOutDir(args.kind, args.ref);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    join(bundleDir, `${args.kind}.json`),
    JSON.stringify(args.raw, null, 2),
    "utf8"
  );
  await writeFile(
    join(bundleDir, "report.json"),
    JSON.stringify(args.report, null, 2),
    "utf8"
  );
  await writeFile(join(bundleDir, "report.md"), args.reportMarkdown, "utf8");
  return bundleDir;
}
