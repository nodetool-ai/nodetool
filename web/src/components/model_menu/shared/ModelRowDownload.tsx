import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";

import { EditorButton, Tooltip } from "../../ui_primitives";
import {
  ACTIVE_DOWNLOAD_STATUSES,
  useModelDownloadStore
} from "../../../stores/ModelDownloadStore";
import { DownloadProgress } from "../../hugging_face/DownloadProgress";
import {
  modelDownloadId,
  type ModelDownloadTarget
} from "../../../utils/modelNormalization";

interface ModelRowDownloadProps {
  /** Every repository the model loads files from, the main one first. */
  targets: ModelDownloadTarget[];
  /** The row's `modelRowKey`. */
  modelKey: string;
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
  targets,
  modelKey,
  onDownload,
  targetLabel
}) => {
  const { t } = useTranslation();
  const idKey = targets.map(modelDownloadId).join("\n");
  const ids = useMemo(() => idKey.split("\n"), [idKey]);
  // Select one id, not the `downloads` map: the map is replaced on every
  // progress message, which would re-render every row in the list. Models
  // share repositories, so a row follows only the downloads it asked for:
  // a running one first, then a failed one, then its main repository.
  const downloadingId = useModelDownloadStore((s) => {
    if (!s.requestedModels[modelKey]) {
      return null;
    }
    const statusOf = (id: string) => s.downloads[id]?.status;
    return (
      ids.find((id) => {
        const status = statusOf(id);
        return status !== undefined && ACTIVE_DOWNLOAD_STATUSES.has(status);
      }) ??
      ids.find((id) => statusOf(id) === "error") ??
      (statusOf(ids[0]) ? ids[0] : null)
    );
  });

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onDownload();
    },
    [onDownload]
  );

  if (downloadingId) {
    return <DownloadProgress name={downloadingId} minimal />;
  }

  const [main, ...rest] = targets;
  const what = rest.length === 0
    ? main?.repoId
    : t("screen_modelMenu.repositoryAndMore", { repository: main?.repoId, count: rest.length });
  return (
    <Tooltip title={t("screen_modelMenu.downloadToTarget", { item: what, target: targetLabel ?? t("screen_modelMenu.thisComputer") })}>
      <EditorButton
        variant="outlined"
        onClick={handleClick}
        startIcon={<DownloadIcon />}
        sx={{ flexShrink: 0 }}
      >
        {t("screen_modelMenu.download")}
      </EditorButton>
    </Tooltip>
  );
};

export default React.memo(ModelRowDownload);
