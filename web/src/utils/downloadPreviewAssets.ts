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
  const assetFiles = createAssetFile(payload, nodeId);
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

