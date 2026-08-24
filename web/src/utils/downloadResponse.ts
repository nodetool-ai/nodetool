/**
 * Turning a REST response into a file the browser saves. Shared by every
 * download endpoint the app offers (workflow bundles, app bundles, storyboard
 * archives), so they name and revoke the blob the same way.
 */

/** The server's filename from `content-disposition`, or `fallback`. */
export function filenameFromDisposition(
  header: string | null,
  fallback: string
): string {
  if (header) {
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return fallback;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Defer the revoke: releasing the blob synchronously cancels the download in
  // Firefox and for large files (archives can be large).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save a download response under the name it declares, or `fallback`. */
export async function saveResponseAsFile(
  res: Response,
  fallback: string
): Promise<void> {
  const blob = await res.blob();
  triggerDownload(
    blob,
    filenameFromDisposition(res.headers.get("content-disposition"), fallback)
  );
}
