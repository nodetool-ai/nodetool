/**
 * Per-run media handles: the currency media transforms trade in instead of
 * bytes.
 *
 * The guest is a courier. In the shape that motivated this — generate two
 * images, combine them — it never reads a pixel; it only carries each result
 * to the next host call. Carrying them *as bytes* meant every hop paid a
 * guest→host copy plus a base64 round trip back, so the guest briefly held
 * ~2.3× each payload. A chain of three ops on one 1024² image moved the same
 * image across the boundary six times, and a large enough run leaked enough
 * engine handles to abort the runtime at teardown — after it had already
 * computed the answer.
 *
 * A handle is plain data (so it crosses as a small object, no marker, no
 * base64) naming bytes the host holds for the life of the run. `image.*`,
 * `audio.*`, and `video.*` accept one anywhere they accept bytes and return
 * one from every transform, so intermediates never enter the guest.
 *
 * Intermediates stay in memory rather than becoming assets: a three-op chain
 * should not write three rows to storage. `media.toImage/toAudio/toVideo` (or
 * the matching namespace's `toAsset`) explicitly promotes a result.
 */

/** Marks an object as a handle into this run's media store. */
export const SANDBOX_MEDIA_HANDLE = "__nodetool_sandbox_media__";

/** The scheme a handle's `uri` carries, so it reads as a locator in logs. */
export const SANDBOX_MEDIA_SCHEME = "sandbox://media/";

/**
 * Total bytes one run may hold in its media store.
 *
 * There are per-call ceilings already (`MAX_IMAGE_INPUT_BYTES` 25 MB,
 * `MAX_MEDIA_REF_BYTES` 16 MB) but nothing bounded the aggregate. A run could
 * make fifty individually legal calls and die anyway, with an Emscripten
 * assertion as the only explanation. The store is where an aggregate is
 * finally countable, so this is the limit that replaces that failure with a
 * sentence naming what was exceeded.
 */
export const MAX_RUN_MEDIA_BYTES = 256 * 1024 * 1024;

export type SandboxMediaType = "image" | "audio" | "video";

/** What a handle looks like to the guest. */
export interface SandboxMediaHandle {
  [SANDBOX_MEDIA_HANDLE]: string;
  type: SandboxMediaType;
  uri: string;
  mimeType: string;
  byteLength: number;
  width?: number;
  height?: number;
}

/** Metadata a producer knows and the guest can read without a round trip. */
export interface SandboxMediaMeta {
  type?: SandboxMediaType;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface SandboxMediaEntry {
  bytes: Uint8Array;
  type: SandboxMediaType;
  mimeType: string;
}

export interface SandboxMediaStore {
  /** Store bytes and return the handle naming them. */
  put(bytes: Uint8Array, meta?: SandboxMediaMeta): SandboxMediaHandle;
  /** The bytes behind a handle, or undefined if the value is not one. */
  resolve(
    value: unknown,
    expectedType?: SandboxMediaType
  ): Uint8Array | undefined;
  /** The bytes and media metadata behind a handle. */
  entry(
    value: unknown,
    expectedType?: SandboxMediaType
  ): SandboxMediaEntry | undefined;
  /** Whether a value is a handle into *this* store. */
  isHandle(value: unknown): boolean;
  /** Bytes currently held, for the budget check and for tests. */
  totalBytes(): number;
  /** Drop everything; called when the run ends. */
  clear(): void;
}

/** Whether a value carries the handle marker, whoever minted it. */
export function isSandboxMediaHandle(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>)[SANDBOX_MEDIA_HANDLE] === "string"
  );
}

export function createSandboxMediaStore(
  limitBytes: number = MAX_RUN_MEDIA_BYTES
): SandboxMediaStore {
  const entries = new Map<string, SandboxMediaEntry>();
  let held = 0;
  let counter = 0;

  return {
    put(bytes: Uint8Array, meta: SandboxMediaMeta = {}): SandboxMediaHandle {
      if (held + bytes.length > limitBytes) {
        throw new Error(
          `This run has moved ${held + bytes.length} bytes of media, over the ` +
            `${limitBytes} byte limit for one run. Process fewer or smaller ` +
            `files per action, or save intermediate results as assets and ` +
            `reload them in a later action.`
        );
      }
      const id = `m${++counter}`;
      const type = meta.type ?? "image";
      const mimeType =
        meta.mimeType ??
        (type === "audio"
          ? "audio/wav"
          : type === "video"
            ? "video/mp4"
            : "image/png");
      entries.set(id, { bytes, type, mimeType });
      held += bytes.length;
      const handle: SandboxMediaHandle = {
        [SANDBOX_MEDIA_HANDLE]: id,
        type,
        uri: `${SANDBOX_MEDIA_SCHEME}${id}`,
        mimeType,
        byteLength: bytes.length
      };
      if (meta.width !== undefined) handle.width = meta.width;
      if (meta.height !== undefined) handle.height = meta.height;
      return handle;
    },

    entry(
      value: unknown,
      expectedType?: SandboxMediaType
    ): SandboxMediaEntry | undefined {
      if (!isSandboxMediaHandle(value)) return undefined;
      const id = (value as Record<string, unknown>)[
        SANDBOX_MEDIA_HANDLE
      ] as string;
      const entry = entries.get(id);
      if (!entry) {
        // A handle from another run, or one used after its run ended. Say so
        // rather than falling through to "expected image bytes", which would
        // send the reader looking at the wrong thing.
        throw new Error(
          `${SANDBOX_MEDIA_SCHEME}${id} is not available in this run. A media ` +
            `handle only lives for the action that produced it — save it as an ` +
            `asset to carry it further.`
        );
      }
      if (expectedType && entry.type !== expectedType) {
        const article =
          expectedType === "audio" || expectedType === "image" ? "an" : "a";
        throw new Error(
          `Expected ${article} ${expectedType} handle, but ${SANDBOX_MEDIA_SCHEME}${id} ` +
            `contains ${entry.type}.`
        );
      }
      return entry;
    },

    resolve(
      value: unknown,
      expectedType?: SandboxMediaType
    ): Uint8Array | undefined {
      return this.entry(value, expectedType)?.bytes;
    },

    isHandle(value: unknown): boolean {
      if (!isSandboxMediaHandle(value)) return false;
      return entries.has(
        (value as Record<string, unknown>)[SANDBOX_MEDIA_HANDLE] as string
      );
    },

    totalBytes: () => held,

    clear(): void {
      entries.clear();
      held = 0;
    }
  };
}
