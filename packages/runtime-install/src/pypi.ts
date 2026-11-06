import * as https from "node:https";

import { errorMessage, type RuntimeInstallHost } from "./host.js";
import { PYPI_SIMPLE_INDEX_URL } from "./python.js";
import {
  canonicalizePackageName,
  compareVersions,
  extractVersionFromFilename,
  isPreReleaseVersion,
} from "./versions.js";

/** GET a URL over HTTPS and return the body. */
export function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", (err) => reject(err));
    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timeout for ${url}`));
    });
  });
}

/**
 * The newest release of a package on the PyPI simple index. A pre-release is
 * returned only when the package has never published anything else.
 */
export async function fetchLatestVersionFromSimpleIndex(
  host: RuntimeInstallHost,
  packageName: string
): Promise<string | null> {
  try {
    const url = `${PYPI_SIMPLE_INDEX_URL}/${canonicalizePackageName(packageName)}/`;
    const html = await httpsGet(url);

    const candidates: string[] = [];
    for (const match of html.matchAll(/>([^<>]+)</g)) {
      const version = extractVersionFromFilename(match[1], packageName);
      if (version) {
        candidates.push(version);
      }
    }
    if (candidates.length === 0) {
      for (const match of html.matchAll(/href="([^"]+)"/gi)) {
        const version = extractVersionFromFilename(match[1], packageName);
        if (version) {
          candidates.push(version);
        }
      }
    }

    const releases = candidates.filter((version) => !isPreReleaseVersion(version));
    const pool = releases.length > 0 ? releases : candidates;
    pool.sort(compareVersions);
    return pool[pool.length - 1] ?? null;
  } catch (error: unknown) {
    host.log("warn", `Failed to fetch latest version for ${packageName}: ${errorMessage(error)}`);
    return null;
  }
}
