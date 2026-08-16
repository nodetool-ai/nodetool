/**
 * `@nodetool-ai/sandbox-zip` — fflate, on the host.
 *
 * fflate is pure JavaScript and the M3 compiler admits it, so this pack *could*
 * have shipped as a guest module. It does not, and the reason is the cap below:
 * a zip bomb is a policy question, and a policy enforced inside the guest is
 * enforced by code the guest could simply not call. The guest's own 64 MB heap
 * does not replicate it — fflate inflates into host memory first. So the
 * library stays on the host, where {@link MAX_UNZIP_TOTAL_BYTES} sits between
 * the archive and the guest with nothing around it.
 */

import { toGuestBytes } from "../sandbox-bytes.js";
import { requireBytes, unwrapLibrary } from "./limits.js";
import {
  isFunction,
  isObjectLike,
  isString
} from "../utils/type-guards.js";

/** Total uncompressed size `unzip` will inflate before refusing. */
export const MAX_UNZIP_TOTAL_BYTES = 50 * 1024 * 1024;

interface FflateLike {
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
  zipSync: (data: Record<string, Uint8Array>) => Uint8Array;
}

async function loadFflate(where: string): Promise<FflateLike> {
  const mod: unknown = await import("fflate");
  return unwrapLibrary<FflateLike>(
    mod,
    where,
    "fflate",
    (v) => isFunction((v as FflateLike | undefined)?.unzipSync)
  );
}

/**
 * Extract a zip archive to a map of entry path to content bytes.
 *
 * Refuses an archive whose entries inflate past
 * {@link MAX_UNZIP_TOTAL_BYTES} — checked as the entries are walked, so a bomb
 * is stopped part way rather than after it has been materialized.
 */
export async function unzip(bytes: unknown): Promise<Record<string, unknown>> {
  const where = "zip.unzip";
  const archive = requireBytes(where, bytes);
  const fflate = await loadFflate(where);
  const entries = fflate.unzipSync(archive);
  let total = 0;
  const out: Record<string, unknown> = {};
  for (const [name, content] of Object.entries(entries)) {
    total += content.length;
    if (total > MAX_UNZIP_TOTAL_BYTES) {
      throw new Error(
        `${where}: archive inflates past the ${MAX_UNZIP_TOTAL_BYTES} byte limit`
      );
    }
    out[name] = toGuestBytes(content);
  }
  return out;
}

/** Build a zip archive from named entries; string values are UTF-8 encoded. */
export async function zip(files: unknown): Promise<Record<string, string>> {
  const where = "zip.zip";
  if (!isObjectLike(files) || Array.isArray(files)) {
    throw new Error(
      `${where}: files must be an object mapping names to Uint8Array or string content`
    );
  }
  const fflate = await loadFflate(where);
  const input: Record<string, Uint8Array> = {};
  let total = 0;
  for (const [name, content] of Object.entries(files)) {
    const bytes =
      content instanceof Uint8Array
        ? content
        : isString(content)
          ? new TextEncoder().encode(content)
          : null;
    if (bytes === null) {
      throw new Error(`${where}: entry "${name}" must be a Uint8Array or string`);
    }
    total += bytes.length;
    if (total > MAX_UNZIP_TOTAL_BYTES) {
      throw new Error(
        `${where}: entries exceed the ${MAX_UNZIP_TOTAL_BYTES} byte limit`
      );
    }
    input[name] = bytes;
  }
  return toGuestBytes(fflate.zipSync(input));
}
