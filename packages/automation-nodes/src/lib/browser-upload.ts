/**
 * Inject a NodeTool asset into a page `<input type="file">`.
 *
 * Two paths, tried in order:
 *
 *   1. NATIVE — write the bytes to a real temp file Chrome can reach, resolve
 *      the input to a CDP nodeId, and `DOM.setFileInputFiles`. This is the
 *      faithful upload most sites accept. Requires the file to live on the same
 *      machine as Chrome (host process for local Chrome, container for the
 *      sandbox).
 *   2. DATA_TRANSFER — when no reachable path exists (the extension transport
 *      drives the user's own Chrome from the server), build a `File` from the
 *      base64 bytes via `DataTransfer` inside the page, assign it to
 *      `input.files`, and dispatch `input`/`change`. Some upload widgets reject
 *      a programmatic `FileList`, but it is the only option without a shared
 *      filesystem.
 *
 * An IDENTICAL copy lives at
 * `packages/sandbox-agent/src/lib/browser-upload.ts`. Keep the two in sync.
 */

import type {
  BrowserUploadAssetRaw,
  BrowserUploadAssetOutput
} from "@nodetool-ai/sandbox/schemas";
import { Buffer } from "node:buffer";
import { promises as fs, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CdpPage } from "./cdp-page.js";

/**
 * Temp dirs holding files handed to `DOM.setFileInputFiles`. Chrome reads the
 * file lazily (on form submit / `File` byte access), so we must NOT delete it
 * right after the command — that would zero the upload. We keep each file for
 * the process lifetime and sweep them on exit.
 */
const pendingUploadDirs = new Set<string>();
let uploadExitHookInstalled = false;

function trackUploadDir(dir: string): void {
  pendingUploadDirs.add(dir);
  if (!uploadExitHookInstalled) {
    uploadExitHookInstalled = true;
    process.once("exit", () => {
      for (const d of pendingUploadDirs) {
        try {
          rmSync(d, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    });
  }
}

/** Temp-tag attribute used to address a coordinate-located input for native upload. */
const UPLOAD_TAG_ATTR = "data-nt-upload";

/**
 * Resolve a CSS selector that uniquely addresses the target file input.
 *
 * Index refs map directly to the `data-nt-idx` tag browser_view assigns.
 * Coordinate refs have no stable selector, so we tag the element under the
 * point with a one-shot attribute and return that selector; the caller is
 * responsible for nothing further — the tag is harmless and overwritten on the
 * next view.
 */
async function resolveInputSelector(
  page: CdpPage,
  input: BrowserUploadAssetRaw
): Promise<string> {
  if (input.index !== undefined) {
    return `[data-nt-idx="${input.index}"]`;
  }
  const tag = `${randomUUID()}`;
  const ok = await page.evaluate(
    (x: number, y: number, attr: string, value: string) => {
      const at = document.elementFromPoint(x, y) as HTMLElement | null;
      const el = (at?.closest("input[type='file']") ??
        at) as HTMLElement | null;
      if (!el) return false;
      el.setAttribute(attr, value);
      return true;
    },
    input.coordinate_x!,
    input.coordinate_y!,
    UPLOAD_TAG_ATTR,
    tag
  );
  if (!ok) {
    throw new Error(
      `No element at coordinates (${input.coordinate_x}, ${input.coordinate_y})`
    );
  }
  return `[${UPLOAD_TAG_ATTR}="${tag}"]`;
}

/**
 * Native upload: materialize the bytes to a temp file on the local filesystem
 * and hand the path to Chrome via `DOM.setFileInputFiles`. The temp file is
 * removed afterwards. Throws if the path isn't reachable by this Chrome.
 */
async function uploadNative(
  page: CdpPage,
  selector: string,
  input: BrowserUploadAssetRaw,
  bytes: Buffer
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nt-upload-"));
  const filePath = path.join(dir, input.file_name);
  await fs.writeFile(filePath, bytes);
  // Keep the file until process exit: Chrome reads it lazily when the page
  // submits the form, well after this call returns.
  trackUploadDir(dir);
  await page.setFileInputFiles(selector, [filePath]);
}

/**
 * DataTransfer fallback: build a `File` in the page from base64 bytes, assign
 * it to the input's `files`, and dispatch the events sites listen for. Runs
 * entirely in-page so it works without a shared filesystem.
 */
async function uploadDataTransfer(
  page: CdpPage,
  selector: string,
  input: BrowserUploadAssetRaw
): Promise<void> {
  const ok = await page.evaluate(
    (sel: string, b64: string, name: string, mime: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el || el.tagName !== "INPUT" || el.type !== "file") return false;
      const binary = atob(b64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const file = new File([buf], name, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    selector,
    input.file_b64,
    input.file_name,
    input.mime_type
  );
  if (!ok) {
    throw new Error(`No <input type="file"> matched by ${selector}`);
  }
}

/**
 * Inject the asset into the addressed file input, trying the native path first
 * and falling back to the in-page DataTransfer injection automatically.
 */
export async function uploadAssetToInput(
  page: CdpPage,
  input: BrowserUploadAssetRaw
): Promise<BrowserUploadAssetOutput> {
  const bytes = Buffer.from(input.file_b64, "base64");
  const selector = await resolveInputSelector(page, input);

  try {
    await uploadNative(page, selector, input, bytes);
    return {
      uploaded: true,
      file_name: input.file_name,
      bytes: bytes.length,
      via: "native"
    };
  } catch {
    // No reachable filesystem path (or native injection rejected) — fall back
    // to the in-page DataTransfer File injection.
  }

  await uploadDataTransfer(page, selector, input);
  return {
    uploaded: true,
    file_name: input.file_name,
    bytes: bytes.length,
    via: "data_transfer"
  };
}
