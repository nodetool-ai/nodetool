/**
 * Field names that must never appear in an analytics payload, at any depth.
 *
 * The validator already rejects every key outside the envelope and the event
 * table, so this list is a second guard: it keeps a future schema edit from
 * adding a property that carries identity or content under an obvious name,
 * and a test pins that no event in the table uses one. Names are compared
 * after lowercasing and removing `_` and `-`.
 */
export const FORBIDDEN_FIELD_NAMES = [
  // Identity
  "userId",
  "accountId",
  "email",
  "name",
  "username",
  "organizationId",
  "orgId",
  "workspaceId",
  "teamId",
  "customerId",
  "billingId",
  "subscriptionId",
  "projectId",
  "workflowId",
  "jobId",
  "assetId",
  "machineId",
  "deviceId",
  "hardwareId",
  "serialNumber",
  "macAddress",
  "ip",
  "ipAddress",
  "hostname",
  "host",
  "location",
  "latitude",
  "longitude",
  // Credentials
  "apiKey",
  "token",
  "accessToken",
  "secret",
  "password",
  "credential",
  "authorization",
  "cookie",
  // Content
  "prompt",
  "text",
  "content",
  "message",
  "output",
  "result",
  "response",
  "workflow",
  "graph",
  "script",
  "code",
  "source",
  "title",
  "filename",
  "fileName",
  "path",
  "filePath",
  "cwd",
  "directory",
  "url",
  "uri",
  "command",
  "commandLine",
  "args",
  "argv",
  "env",
  "stdin",
  "stdout",
  "stderr",
  "clipboard",
  "userAgent",
  "referrer"
] as const;

const normalize = (key: string): string =>
  key.toLowerCase().replace(/[-_]/g, "");

const FORBIDDEN = new Set<string>(FORBIDDEN_FIELD_NAMES.map(normalize));

export function isForbiddenFieldName(key: string): boolean {
  return FORBIDDEN.has(normalize(key));
}

/** The first forbidden key anywhere inside `value`, or null. */
export function findForbiddenField(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenField(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenFieldName(key)) return key;
    const found = findForbiddenField(child, depth + 1);
    if (found) return found;
  }
  return null;
}
