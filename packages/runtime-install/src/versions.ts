/** PEP 503 name normalization: `Nodetool_Core` and `nodetool-core` are one package. */
export function canonicalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function stripFileExtension(filename: string): string {
  const base = filename.replace(/#.*/, "");
  if (base.toLowerCase().endsWith(".tar.gz")) {
    return base.slice(0, -7);
  }
  return base.replace(/\.(whl|zip|tar|gz)$/gi, "");
}

/** The version in a wheel or sdist filename of `packageName`, or null. */
export function extractVersionFromFilename(filename: string, packageName: string): string | null {
  const sanitized = filename.trim();
  if (!sanitized) return null;
  const baseName = stripFileExtension(sanitized.split("/").pop() || sanitized);
  const parts = baseName.split("-");
  if (parts.length < 2) {
    return null;
  }
  if (canonicalizePackageName(packageName) !== canonicalizePackageName(parts[0])) {
    return null;
  }
  return parts[1] || null;
}

function tokenizeVersion(version: string): string[] {
  const normalized = version
    .replace(/([0-9])([a-zA-Z])/g, "$1.$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1.$2");
  return normalized.split(/[.\-_+]/).filter(Boolean);
}

// PEP 440 pre-release and dev tags. They sort below the release they precede,
// unlike `.postN`, which sorts above it.
const PRE_RELEASE_TAGS = new Set(["a", "alpha", "b", "beta", "c", "rc", "pre", "preview", "dev"]);

function isPreReleaseTag(token: string): boolean {
  return PRE_RELEASE_TAGS.has(token.toLowerCase());
}

export function isPreReleaseVersion(version: string): boolean {
  return tokenizeVersion(version).some(isPreReleaseTag);
}

/** Compare two PEP 440-style versions: negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0;
  const tokensA = tokenizeVersion(a);
  const tokensB = tokenizeVersion(b);
  const length = Math.max(tokensA.length, tokensB.length);

  for (let i = 0; i < length; i += 1) {
    const segA = tokensA[i];
    const segB = tokensB[i];

    if (segA === undefined) return isPreReleaseTag(segB) ? 1 : -1;
    if (segB === undefined) return isPreReleaseTag(segA) ? -1 : 1;
    if (segA === segB) continue;

    const numA = Number(segA);
    const numB = Number(segB);
    const isNumA = Number.isInteger(numA);
    const isNumB = Number.isInteger(numB);

    if (isNumA && isNumB) {
      if (numA > numB) return 1;
      if (numA < numB) return -1;
      continue;
    }

    if (isNumA) return 1;
    if (isNumB) return -1;

    const cmp = segA.localeCompare(segB);
    if (cmp !== 0) return cmp;
  }

  return 0;
}
