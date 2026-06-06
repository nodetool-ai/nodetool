/**
 * Constant "package" assets — files that ship with a node package (and the
 * Electron build) and are referenced by example workflows and templates.
 *
 * Scheme: `package://<package-name>/<relative-path>`
 *   e.g. `package://nodetool-base/audio/sample-loop.mp3`
 *
 * Unlike user assets (`asset://<id>`, `/api/storage/<key>`), package assets have
 * stable, machine-independent URIs: the same URI resolves on every install
 * because the bytes are bundled with the package rather than stored per-user.
 * The backend serves them at
 * `/api/assets/packages/<package-name>/<relative-path>`.
 *
 * This is what makes a workflow portable as a template — referenced inputs
 * (sample images, audio, documents) can be materialized into the package's
 * asset directory and the refs rewritten to `package://` URIs.
 */

export const PACKAGE_ASSET_SCHEME = "package://";

/** HTTP route prefix the backend serves package assets from. */
export const PACKAGE_ASSET_HTTP_PREFIX = "/api/assets/packages/";

export interface PackageAssetRef {
  /** Owning package, e.g. `nodetool-base`. */
  packageName: string;
  /** Path of the file within the package's asset directory. */
  path: string;
}

export function isPackageAssetUri(uri: string | null | undefined): uri is string {
  return typeof uri === "string" && uri.startsWith(PACKAGE_ASSET_SCHEME);
}

/**
 * Parse `package://<pkg>/<path>` into its parts. Returns null when the URI is
 * not a package asset URI or is missing a package/path segment.
 */
export function parsePackageAssetUri(
  uri: string | null | undefined
): PackageAssetRef | null {
  if (!isPackageAssetUri(uri)) {
    return null;
  }
  const rest = uri.slice(PACKAGE_ASSET_SCHEME.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  const packageName = rest.slice(0, slash);
  const path = rest.slice(slash + 1).replace(/^\/+/, "");
  if (!packageName || !path) {
    return null;
  }
  return { packageName, path };
}

export function buildPackageAssetUri(packageName: string, path: string): string {
  const cleanPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${PACKAGE_ASSET_SCHEME}${packageName}/${cleanPath}`;
}

/**
 * Map a package asset URI to the backend HTTP path that serves it
 * (`/api/assets/packages/<pkg>/<path>`). Returns null for non-package URIs.
 */
export function packageAssetHttpPath(
  uri: string | null | undefined
): string | null {
  const ref = parsePackageAssetUri(uri);
  if (!ref) {
    return null;
  }
  const encodedPath = ref.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${PACKAGE_ASSET_HTTP_PREFIX}${encodeURIComponent(ref.packageName)}/${encodedPath}`;
}
