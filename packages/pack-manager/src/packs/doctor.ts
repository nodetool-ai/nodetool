import type { InstalledPackSnapshot } from "./installed.js";

export type PackDoctorIssue =
  | { readonly kind: "wrong_version"; readonly pack: string; readonly npm: string; readonly version: string;
      readonly expectedVersion: string; readonly packageRoot: string }
  | { readonly kind: "invalid_package"; readonly pack: string; readonly npm: string;
      readonly reason: string; readonly packageRoot: string };

export interface PackDoctorReport {
  readonly mode: InstalledPackSnapshot["mode"]["kind"];
  readonly cliRoot: string;
  readonly coreVersion: string;
  readonly healthy: boolean;
  readonly issues: readonly PackDoctorIssue[];
}

/** Report rejected tree entries without importing them or mutating the installed tree. */
export function reportPackInstallation(snapshot: InstalledPackSnapshot): PackDoctorReport {
  const issues: PackDoctorIssue[] = [
    ...snapshot.wrongVersions.map((entry): PackDoctorIssue => ({ kind: "wrong_version", pack: entry.id,
      npm: entry.npm, version: entry.version, expectedVersion: entry.expectedVersion, packageRoot: entry.packageRoot })),
    ...snapshot.invalidPackages.map((entry): PackDoctorIssue => ({ kind: "invalid_package", pack: entry.id,
      npm: entry.npm, reason: entry.reason, packageRoot: entry.packageRoot }))
  ];
  return { mode: snapshot.mode.kind, cliRoot: snapshot.mode.cliRoot, coreVersion: snapshot.mode.coreVersion,
    healthy: issues.length === 0, issues };
}
