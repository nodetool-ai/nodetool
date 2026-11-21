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

const PEP440 =
  /^v?(\d+(?:\.\d+)*)(?:[-_.]?(a|alpha|b|beta|c|rc|pre|preview)[-_.]?(\d*))?(?:[-_.]?post[-_.]?(\d*))?(?:[-_.]?dev[-_.]?(\d*))?(?:\+.*)?$/i;

const PRE_PHASE: Record<string, number> = { a: 0, alpha: 0, b: 1, beta: 1, c: 2, rc: 2, pre: 2, preview: 2 };

interface ParsedVersion {
  release: number[];
  /** Sorts a bare `.devN` before any pre-release, a final release after all of them. */
  phase: number;
  pre: number;
  post: number;
  dev: number;
}

function parsePep440(version: string): ParsedVersion | null {
  const m = PEP440.exec(version.trim());
  if (!m) return null;
  const release = m[1].split(".").map(Number);
  while (release.length > 1 && release[release.length - 1] === 0) release.pop();
  const hasPre = m[2] !== undefined;
  const hasPost = m[4] !== undefined;
  const hasDev = m[5] !== undefined;
  return {
    release,
    phase: hasPre ? PRE_PHASE[m[2].toLowerCase()] : !hasPost && hasDev ? -1 : 3,
    pre: Number(m[3] || 0),
    post: hasPost ? Number(m[4] || 0) : -1,
    dev: hasDev ? Number(m[5] || 0) : Infinity
  };
}

function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePep440(a: ParsedVersion, b: ParsedVersion): number {
  const length = Math.max(a.release.length, b.release.length);
  for (let i = 0; i < length; i += 1) {
    const cmp = compareNumbers(a.release[i] ?? 0, b.release[i] ?? 0);
    if (cmp !== 0) return cmp;
  }
  return (
    compareNumbers(a.phase, b.phase) ||
    compareNumbers(a.pre, b.pre) ||
    compareNumbers(a.post, b.post) ||
    compareNumbers(a.dev, b.dev)
  );
}

/** Compare two PEP 440-style versions: negative, zero or positive. */
export function compareVersions(a: string, b: string): number {
  if (a === b) return 0;
  const parsedA = parsePep440(a);
  const parsedB = parsePep440(b);
  if (parsedA && parsedB) return comparePep440(parsedA, parsedB);
  return compareTokens(a, b);
}

/** Fallback for strings PEP 440 does not describe. */
function compareTokens(a: string, b: string): number {
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
