import type { Asset } from "../../../stores/ApiTypes";
import type { UploadFileInput } from "../../../serverState/useAssetUpload";
import {
  mediaRefFromAsset,
  type MediaRefFromAsset
} from "../../../utils/mediaRef";

/** Uploads one file and resolves to the media ref of the stored asset. */
export const uploadMediaFile = <T extends string>(
  uploadAsset: (input: UploadFileInput) => void,
  file: File,
  type: T
): Promise<MediaRefFromAsset<T>> =>
  new Promise((resolve, reject) => {
    uploadAsset({
      file,
      onCompleted: (asset: Asset) => {
        if (!asset.id) {
          reject(new Error("Asset id is missing"));
          return;
        }
        resolve(mediaRefFromAsset(asset, type));
      },
      onFailed: (error: string) => {
        reject(new Error(error));
      }
    });
  });

/** Reads a file the Electron file dialog returned into a `File`. */
export const readNativeFile = async (
  filePath: string,
  fallbackName: string
): Promise<File> => {
  const result = await window.api.clipboard?.readFileBuffer(filePath);
  if (!result) {
    throw new Error("Failed to read file");
  }
  const fileName = filePath.split(/[\\/]/).pop() || fallbackName;
  return new File([result.buffer as BlobPart], fileName, {
    type: result.mimeType
  });
};
