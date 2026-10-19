/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

import useLogsStore, { nodeLogKey } from "../../stores/LogStore";
import isEqual from "../../utils/isEqual";
import {
  CopyButton,
  Chip,
  EditorButton,
  Dialog,
  FlexColumn,
  FlexRow,
  BORDER_RADIUS,
  Z_INDEX,
  getSpacingPx,
  SPACING
} from "../ui_primitives";
import ListAltIcon from "@mui/icons-material/ListAlt";
import LogsTable, { LogRow, Severity } from "../common/LogsTable";

type NodeLogsProps = {
  id: string;
  workflowId: string;
};

type NodeLogsDialogProps = {
  id: string;
  workflowId: string;
  open: boolean;
  onClose: () => void;
};

const styles = (theme: Theme) =>
  css({
    width: "100%",
    zIndex: Z_INDEX.overlay,
    ".logs-button": {
      width: "100%",
      justifyContent: "space-between",
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[200],
      textTransform: "none",
      height: "3em",
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
      marginBottom: getSpacingPx(SPACING.xl),
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      "&:hover": { backgroundColor: theme.vars.palette.grey[600] }
    }
  });

export const NodeLogsDialog: React.FC<NodeLogsDialogProps> = memo(
  ({ id, workflowId, open, onClose }) => {
    const { t } = useTranslation();
    const logsRef = useRef<HTMLDivElement>(null);
    // O(1) lookup via pre-keyed map instead of filtering the full logs array.
    const logs = useLogsStore(
      (state) => state.logsByNode[nodeLogKey(workflowId, id)]
    );
    const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>(
      []
    );

    const count = logs?.length || 0;

    // Gated on `open`: while the dialog is closed there's no point walking
    // the (potentially large) logs array on every appended line. Kept even
    // though the dialog is now only mounted while open (see NodeHeader),
    // for robustness against other callers.
    const logText = useMemo(() => {
      if (!open) return "";
      const MAX_LINES = 2000;
      const logsToCopy = (logs || []).slice(-MAX_LINES);
      return logsToCopy
        .map((log) => `${log.timestamp} ${log.severity} ${log.content}`)
        .join("\n");
    }, [logs, open]);

    const logRows = useMemo(() => {
      if (!open) return [] as LogRow[];
      return (logs || []).map((l) => {
        const row: LogRow = {
          severity: l.severity,
          workflowId: l.workflowId,
          workflowName: l.workflowName,
          nodeId: l.nodeId,
          nodeName: l.nodeName,
          timestamp: l.timestamp,
          content: l.content,
          data: l.data
        };
        if (l.jobId) {
          row.jobId = l.jobId;
        }
        return row;
      });
    }, [logs, open]);

    useEffect(() => {
      if (!open) return;
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }, [logs, open]);

    const toggleSeverity = useCallback((severity: Severity) => {
      setSelectedSeverities((prev) =>
        prev.includes(severity)
          ? prev.filter((s) => s !== severity)
          : [...prev, severity]
      );
    }, []);

    const toggleInfoSeverity = useCallback(
      () => toggleSeverity("info"),
      [toggleSeverity]
    );
    const toggleWarningSeverity = useCallback(
      () => toggleSeverity("warning"),
      [toggleSeverity]
    );
    const toggleErrorSeverity = useCallback(
      () => toggleSeverity("error"),
      [toggleSeverity]
    );

    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="md"
        title={t("i18n-next36.nodeEditor.nodeLogs.title")}
        titleActions={
          <>
            <Chip size="small" label={`${count}`} />
            <CopyButton
              value={logText}
              tooltip={t("i18n-next36.nodeEditor.nodeLogs.copyLogs")}
              nodrag={false}
            />
          </>
        }
      >
        <FlexColumn gap={SPACING.md}>
          <FlexRow gap={SPACING.xs} align="center">
            <Chip
              size="small"
              label={t("i18n-next36.nodeEditor.nodeLogs.info")}
              active={selectedSeverities.includes("info")}
              onClick={toggleInfoSeverity}
            />
            <Chip
              size="small"
              label={t("i18n-next36.nodeEditor.nodeLogs.warnings")}
              color="warning"
              active={selectedSeverities.includes("warning")}
              onClick={toggleWarningSeverity}
            />
            <Chip
              size="small"
              label={t("i18n-next36.nodeEditor.nodeLogs.errors")}
              color="error"
              active={selectedSeverities.includes("error")}
              onClick={toggleErrorSeverity}
            />
          </FlexRow>
          <div ref={logsRef}>
            <LogsTable
              rows={logRows}
              height={400}
              severities={selectedSeverities}
            />
          </div>
        </FlexColumn>
      </Dialog>
    );
  },
  isEqual
);

NodeLogsDialog.displayName = "NodeLogsDialog";

const NodeLogsImpl: React.FC<NodeLogsProps> = ({ id, workflowId }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const memoizedStyles = useMemo(() => styles(theme), [theme]);
  // O(1) lookup via pre-keyed map instead of filtering the full logs array.
  const logs = useLogsStore(
    (state) => state.logsByNode[nodeLogKey(workflowId, id)]
  );
  const [open, setOpen] = useState(false);

  const count = logs?.length || 0;

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  if (count === 0) {
    return null;
  }

  return (
    <div className="node-logs-container" css={memoizedStyles}>
      <div className="node-logs">
        <EditorButton
          className="logs-button"
          size="small"
          variant="contained"
          onClick={handleOpen}
          startIcon={<ListAltIcon />}
        >
          <span>{t("i18n-next36.nodeEditor.nodeLogs.logs")}</span>
          <Chip size="small" label={count} sx={{ ml: 1 }} />
        </EditorButton>
      </div>

      <NodeLogsDialog
        id={id}
        workflowId={workflowId}
        open={open}
        onClose={handleClose}
      />
    </div>
  );
};

export const NodeLogs = memo(NodeLogsImpl, isEqual);
NodeLogs.displayName = "NodeLogs";
export default NodeLogs;
