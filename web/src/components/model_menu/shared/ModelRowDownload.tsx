import React, { useCallback } from "react";
import DownloadIcon from "@mui/icons-material/Download";

import { EditorButton, Tooltip } from "../../ui_primitives";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../../hugging_face/DownloadProgress";
import type { ModelDownloadTarget } from "../../../utils/modelNormalization";

interface ModelRowDownloadProps {
  target: ModelDownloadTarget;
  onDownload: () => void;
  /** Human-readable download destination, shown in the tooltip. */
  targetLabel?: string;
}

/**
 * The Download button on a picker row whose model needs its files first. It
 * turns into live progress while the files download; the row becomes
 * selectable once the model list refreshes after the download.
 */
const ModelRowDownload: React.FC<ModelRowDownloadProps> = ({
  target,
  onDownload,
  targetLabel
}) => {
  const downloadId = target.path
    ? `${target.repoId}/${target.path}`
    : target.repoId;
  // Select the flag, not the `downloads` map: the map is replaced on every
  // progress message, which would re-render every row in the list.
  const isDownloading = useModelDownloadStore((s) =>
    Boolean(s.downloads[downloadId])
  );

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onDownload();
    },
    [onDownload]
  );

  if (isDownloading) {
    return <DownloadProgress name={downloadId} minimal />;
  }

  return (
    <Tooltip title={`Download ${target.repoId} to ${targetLabel ?? "this computer"}`}>
      <EditorButton
        variant="outlined"
        onClick={handleClick}
        startIcon={<DownloadIcon sx={{ fontSize: "1.1em" }} />}
        sx={{ flexShrink: 0 }}
      >
        Download
      </EditorButton>
    </Tooltip>
  );
};

export default React.memo(ModelRowDownload);
