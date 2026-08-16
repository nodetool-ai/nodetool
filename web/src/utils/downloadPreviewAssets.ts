import { zipSync } from "fflate";
import { createAssetFile } from "./createAssetFile";
import { resolveMediaUri } from "./resolveMediaUri";
import { isObjectLike } from "./typePredicates";

interface DownloadOptions {
  nodeId: string;
  previewValue?: unknown;
  rawResult?: unknown;
}

const getDownloadPayload = ({
  previewValue,
  rawResult
}: Pick<DownloadOptions, "previewValue" | "rawResult">) => {
  if (previewValue != null) {
    return previewValue;
  }
  if (rawResult && isObjectLike(rawResult) && "output" in rawResult && rawResult.output !== undefined) {
    return rawResult.output;
  }
  if (rawResult !== undefined) {
    return rawResult;
  }
  throw new Error("No content available to download");
};

export const downloadPreviewAssets = async ({
  nodeId,
  previewValue,
  rawResult
}: DownloadOptions): Promise<void> => {
  const payload = getDownloadPayload({ previewValue, rawResult });
  let assetFiles: Awaited<ReturnType<typeof createAssetFile>>;
  try {
    assetFiles = await createAssetFile(payload, nodeId);
  } catch (error) {
    const uri =
      typeof payload === "object" && payload && "uri" in payload
        ? (payload as { uri?: string }).uri
        : undefined;
    // An `asset://` locator needs the asset's own `get_url` — the anchor
    // cannot fetch the raw locator.
    const resolvedUri = uri ? await resolveMediaUri(uri) : "";
    if (resolvedUri) {
      console.warn(
        "[downloadPreviewAssets] Falling back to direct URI download due to error",
        error
      );
      const anchor = document.createElement("a");
      anchor.href = resolvedUri;
      // A signed URL carries a query string; it is not part of the file name.
      anchor.download =
        resolvedUri.split(/[?#]/)[0].split("/").pop() || "preview_download";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }
    throw error;
  }

  if (!assetFiles.length) {
    throw new Error("No assets generated for download");
  }

  if (assetFiles.length === 1) {
    const { file, filename } = assetFiles[0];
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return;
  }

  const files: Record<string, Uint8Array> = {};
  for (const { file, filename } of assetFiles) {
    files[filename] = new Uint8Array(await file.arrayBuffer());
  }
  const zipped = zipSync(files);
  // Copy into a standalone ArrayBuffer (fflate may return a Uint8Array that is a
  // view into a larger pooled buffer; Blob expects the exact bytes).
  const zipContent = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength
  );
  const zipName = `preview_${nodeId}.zip`;

  const blob = new Blob([zipContent], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = zipName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
