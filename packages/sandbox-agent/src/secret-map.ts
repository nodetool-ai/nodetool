/**
 * In-container registry of named secrets.
 *
 * Populated by the host via POST /internal/set-secret-map.
 */

let secretMap: Record<string, string> = {};

export function setSecretMap(next: Record<string, string>): void {
  secretMap = { ...next };
}

export function getSecret(name: string): string | null {
  return secretMap[name] ?? null;
}

export function _resetForTests(): void {
  secretMap = {};
}
