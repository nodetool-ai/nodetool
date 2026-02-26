import JSZip from "jszip";
import { createAssetFile } from "./createAssetFile";

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
  if (rawResult && typeof rawResult === "object" && "output" in rawResult && rawResult.output !== undefined) {
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

  type ElectronSaveFile = (
    data: ArrayBuffer,
    filename: string,
    filters?: { name: string; extensions: string[] }[]
  ) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;

  const electronApi =
    (
      window as unknown as {
        electron?: { saveFile?: ElectronSaveFile };
        api?: { saveFile?: ElectronSaveFile };
      }
    ).electron ||
    (window as unknown as { api?: { saveFile?: ElectronSaveFile } }).api;

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
