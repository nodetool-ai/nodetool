/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useRef, useEffect, useCallback, useState } from "react";
import {
  Typography,
  Tooltip,
  IconButton,
  Chip,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box
} from "@mui/material";
import useLogsStore from "../../stores/LogStore";
import isEqual from "lodash/isEqual";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
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
    zIndex: 100,
    ".logs-button": {
      width: "100%",
      justifyContent: "space-between",
      borderRadius: 8,
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[200],
      textTransform: "none",
      height: "3em",
      padding: ".6em .8em",
      marginBottom: "1em",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      "&:hover": { backgroundColor: theme.vars.palette.grey[600] }
    }
  });

/**
 * Standalone dialog component for displaying node logs.
 * Can be controlled externally via open/onClose props.
 */
export const NodeLogsDialog: React.FC<NodeLogsDialogProps> = memo(
  ({ id, workflowId, open, onClose }) => {
    const theme = useTheme();
    const logsRef = useRef<HTMLDivElement>(null);
    const logs = useLogsStore((state) => state.getLogs(workflowId, id));
    const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>(
      []
    );

    const count = logs?.length || 0;

    const onCopy = useCallback(() => {
      const MAX_LINES = 2000;
      const logsToCopy = (logs || []).slice(-MAX_LINES);

      const text = logsToCopy
        .map((log) => `${log.timestamp} ${log.severity} ${log.content}`)
        .join("\n");

      if (!text) {
        return;
      }
      navigator.clipboard?.writeText(text).catch((err) => {
        console.warn("Failed to copy logs to clipboard:", err);
      });
    }, [logs]);

    useEffect(() => {
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }, [logs]);

    const toggleSeverity = useCallback((severity: Severity) => {
      setSelectedSeverities((prev) =>
        prev.includes(severity)
          ? prev.filter((s) => s !== severity)
          : [...prev, severity]
      );
    }, []);

    const toggleInfoSeverity = useCallback(() => toggleSeverity("info"), [toggleSeverity]);
    const toggleWarningSeverity = useCallback(() => toggleSeverity("warning"), [toggleSeverity]);
    const toggleErrorSeverity = useCallback(() => toggleSeverity("error"), [toggleSeverity]);

    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="md"
        slotProps={{
          backdrop: {
            style: {
              backdropFilter: theme.vars.palette.glass.blur,
              backgroundColor: theme.vars.palette.glass.backgroundDialog
            }
          },
          paper: {
            style: {
              maxWidth: "950px",
              width: "950px",
              border: `1px solid ${theme.vars.palette.grey[700]}`,
              borderRadius: theme.vars.rounded.dialog,
              background: theme.vars.palette.glass.backgroundDialogContent
            }
          }
        }}
      >
        <DialogTitle className="dialog-title">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" component="h6">
              Node Logs
            </Typography>
            <Chip size="small" label={`${count}`} />
            <Tooltip title="Copy logs">
              <IconButton size="small" onClick={onCopy} aria-label="Copy logs">
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ p: 2 }}>
            <Chip
              size="small"
              label={`Info`}
              variant={
                selectedSeverities.includes("info") ? "filled" : "outlined"
              }
              onClick={toggleInfoSeverity}
            />
            <Chip
              size="small"
              label={`Warnings`}
              color="warning"
              variant={
                selectedSeverities.includes("warning") ? "filled" : "outlined"
              }
              onClick={toggleWarningSeverity}
            />
            <Chip
              size="small"
              label={`Errors`}
              color="error"
              variant={
                selectedSeverities.includes("error") ? "filled" : "outlined"
              }
              onClick={toggleErrorSeverity}
            />
          </Box>
          <div style={{ padding: 10 }} ref={logsRef}>
            <LogsTable
              rows={(logs || []).map((l) => ({
                severity: l.severity as LogRow["severity"],
                timestamp: l.timestamp,
                content: l.content,
                workflowName: undefined,
                data: l.data
              }))}
              height={400}
              severities={selectedSeverities}
            />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  },
  isEqual
);

NodeLogsDialog.displayName = "NodeLogsDialog";

export const NodeLogs: React.FC<NodeLogsProps> = ({ id, workflowId }) => {
  const theme = useTheme();
  const logs = useLogsStore((state) => state.getLogs(workflowId, id));
  const [open, setOpen] = useState(false);

  const count = logs?.length || 0;

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  if (count === 0) {
    return null;
  }

  return (
    <div className="node-logs-container" css={styles(theme)}>
      <div className="node-logs">
        <Button
          className="logs-button"
          size="small"
          variant="contained"
          onClick={handleOpen}
          startIcon={<ListAltIcon />}
        >
          <span>Logs</span>
          <Chip size="small" label={count} sx={{ ml: 1 }} />
        </Button>
      </div>

      <NodeLogsDialog
        id={id}
        workflowId={workflowId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

export default memo(NodeLogs, isEqual);
