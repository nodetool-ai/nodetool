import JSZip from "jszip";
import { createAssetFile } from "./createAssetFile";

interface DownloadOptions {
  nodeId: string;
  previewValue?: any;
  rawResult?: any;
}

const getDownloadPayload = ({
  previewValue,
  rawResult
}: Pick<DownloadOptions, "previewValue" | "rawResult">) => {
  if (previewValue !== null && previewValue !== undefined) {
    return previewValue;
  }
  if (rawResult?.output !== undefined) {
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
}: DownloadOptions) => {
  const payload = getDownloadPayload({ previewValue, rawResult });
  console.log("[downloadPreviewAssets] payload summary", {
    nodeId,
    hasPreview: previewValue !== undefined,
    hasRawResult: rawResult !== undefined,
    payloadType: typeof payload,
    payloadKeys:
      payload && typeof payload === "object" ? Object.keys(payload) : undefined
  });
  let assetFiles: Awaited<ReturnType<typeof createAssetFile>>;
  try {
    assetFiles = await createAssetFile(payload, nodeId);
  } catch (error) {
    const uri =
      typeof payload === "object" && payload && "uri" in payload
        ? (payload as { uri?: string }).uri
        : undefined;
    if (uri) {
      console.warn(
        "[downloadPreviewAssets] Falling back to direct URI download due to error",
        error
      );
      const anchor = document.createElement("a");
      anchor.href = uri;
      anchor.download = uri.split("/").pop() ?? "preview_download";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }
    throw error;
  }
  console.log("[downloadPreviewAssets] generated files", {
    count: assetFiles.length,
    files: assetFiles.map((entry) => ({
      name: entry.filename,
      type: entry.type,
      size: entry.file.size
    }))
  });
  const electronApi = (window as any)?.electron || (window as any)?.api;

  if (!assetFiles.length) {
    throw new Error("No assets generated for download");
  }

  if (assetFiles.length === 1) {
    const { file, filename } = assetFiles[0];
    const buffer = await file.arrayBuffer();

    if (electronApi?.saveFile) {
      const result = await electronApi.saveFile(buffer, filename, [
        { name: "All Files", extensions: ["*"] }
      ]);
      if (!result.success && !result.canceled) {
        throw new Error(result.error || "Failed to save file");
      }
      return;
    }

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

  const zip = new JSZip();
  assetFiles.forEach(({ file, filename }) => {
    zip.file(filename, file);
  });
  const zipContent = await zip.generateAsync({ type: "arraybuffer" });
  const zipName = `preview_${nodeId}.zip`;

  if (electronApi?.saveFile) {
    const result = await electronApi.saveFile(zipContent, zipName, [
      { name: "ZIP Files", extensions: ["zip"] }
    ]);
    if (!result.success && !result.canceled) {
      throw new Error(result.error || "Failed to save zip file");
    }
    return;
  }

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
