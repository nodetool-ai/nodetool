import { useCallback, useState } from "react";

import type { ImportMode } from "../../../stores/AssetStore";
import { trpcClient } from "../../../trpc/client";
import { getLocalFilePath } from "../../../utils/localFile";

/** Files waiting for the creator to choose Copy or Link. */
export interface ImportModeRequest {
  readonly files: File[];
  /** Files at or above this size default to Link. */
  readonly thresholdBytes: number;
}

export interface ImportModeChoice {
  /** Non-null while the import dialog is open. */
  readonly request: ImportModeRequest | null;
  /** Import dropped or picked files, asking Copy or Link when it applies. */
  readonly importFiles: (files: File[]) => void;
  readonly choose: (mode: ImportMode) => void;
  readonly cancel: () => void;
}

/**
 * Ask Copy or Link before an import on the desktop app (PRD T6). The question
 * is asked only when a file has a disk path and the server can reference
 * files in place. A plain browser has no disk path and copies without asking.
 */
export function useImportModeChoice(
  upload: (files: File[], mode?: ImportMode) => void
): ImportModeChoice {
  const [request, setRequest] = useState<ImportModeRequest | null>(null);

  const importFiles = useCallback(
    (files: File[]) => {
      if (!files.some((file) => getLocalFilePath(file) !== null)) {
        upload(files);
        return;
      }
      trpcClient.assets.externalImportConfig.query().then(
        (config) => {
          if (config.enabled) {
            setRequest({ files, thresholdBytes: config.threshold_bytes });
          } else {
            upload(files, "copy");
          }
        },
        () => upload(files)
      );
    },
    [upload]
  );

  const choose = useCallback(
    (mode: ImportMode) => {
      if (request) {
        upload(request.files, mode);
      }
      setRequest(null);
    },
    [request, upload]
  );

  const cancel = useCallback(() => setRequest(null), []);

  return { request, importFiles, choose, cancel };
}
