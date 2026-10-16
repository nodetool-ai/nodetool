import type { GameSnapshot3D } from "@nodetool-ai/protocol";

function canonical(value: unknown, scriptStates?: GameSnapshot3D["scriptState"]): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonical(entry, scriptStates)).join(",")}]`;
  }
  return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${value === scriptStates ? JSON.stringify(entry) : canonical(entry, scriptStates)}`).join(",")}}`;
}

async function digest(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digestGame3D(value: unknown): Promise<string> {
  return digest(canonical(value));
}

/** Guest state uses ordinary JSON property order, which scripts can observe on the next call. */
export async function digestGameSnapshot3D(snapshot: GameSnapshot3D): Promise<string> {
  return digest(canonical(snapshot, snapshot.scriptState));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let encoded = "";
  const chunkSize = 8192;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    encoded += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return btoa(encoded);
}

export function base64ToBytes(value: string): Uint8Array {
  if (value.length > 32 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid or oversized physics snapshot encoding");
  }
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
