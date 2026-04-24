export interface AvailablePackage {
  name: string;
  repo_id: string;
  description?: string;
}

export const PACKAGE_REGISTRY_URL =
  process.env["NODETOOL_PACKAGE_REGISTRY_URL"] ??
  "https://raw.githubusercontent.com/nodetool-ai/nodetool-registry/main/index.json";

function isAvailablePackage(value: unknown): value is AvailablePackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["name"] === "string" &&
    typeof record["repo_id"] === "string" &&
    (record["description"] === undefined ||
      typeof record["description"] === "string")
  );
}

/**
 * Fetch the package index. Returns [] on network or parse failure
 * (logged to stderr). Never throws.
 */
export async function fetchAvailablePackages(): Promise<AvailablePackage[]> {
  try {
    const res = await fetch(PACKAGE_REGISTRY_URL);
    if (!res.ok) {
      console.error(
        `Failed to fetch package registry: HTTP ${res.status} ${res.statusText}`
      );
      return [];
    }
    const parsed: unknown = await res.json();
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["packages"])
        ? ((parsed as Record<string, unknown>)["packages"] as unknown[])
        : null;
    if (!list) {
      console.error("Package registry response has no packages array");
      return [];
    }
    return list.filter(isAvailablePackage);
  } catch (error) {
    console.error(`Failed to fetch package registry: ${String(error)}`);
    return [];
  }
}
