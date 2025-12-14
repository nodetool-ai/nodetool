/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useRef, useEffect, useMemo, useCallback, useState } from "react";
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
import { isEqual } from "lodash";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloseIcon from "@mui/icons-material/Close";
import ListAltIcon from "@mui/icons-material/ListAlt";
import LogsTable, { LogRow, Severity } from "../common/LogsTable";

type NodeLogsProps = {
  id: string;
  workflowId: string;
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

export const NodeLogs: React.FC<NodeLogsProps> = ({ id, workflowId }) => {
  const theme = useTheme();
  const logsRef = useRef<HTMLDivElement>(null);
  const logs = useLogsStore((state) => state.getLogs(workflowId, id));
  const [open, setOpen] = useState(false);
  const [selectedSeverities, setSelectedSeverities] = useState<Severity[]>([]);

  const count = logs?.length || 0;

  const copyText = useMemo(
    () =>
      (logs || [])
        .map((log) => `${log.timestamp} ${log.severity} ${log.content}`)
        .join("\n"),
    [logs]
  );

  const onCopy = useCallback(() => {
    if (!copyText) return;
    navigator.clipboard?.writeText(copyText).catch(() => {});
  }, [copyText]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  if (count === 0) return null;

  return (
    <div className="node-logs-container" css={styles(theme)}>
      <div className="node-logs">
        <Button
          className="logs-button"
          size="small"
          variant="contained"
          onClick={() => setOpen(true)}
          startIcon={<ListAltIcon />}
        >
          <span>Logs</span>
          <Chip size="small" label={count} sx={{ ml: 1 }} />
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
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
              onClick={() =>
                setSelectedSeverities((prev) =>
                  prev.includes("info")
                    ? prev.filter((s) => s !== "info")
                    : [...prev, "info"]
                )
              }
            />
            <Chip
              size="small"
              label={`Warnings`}
              color="warning"
              variant={
                selectedSeverities.includes("warning") ? "filled" : "outlined"
              }
              onClick={() =>
                setSelectedSeverities((prev) =>
                  prev.includes("warning")
                    ? prev.filter((s) => s !== "warning")
                    : [...prev, "warning"]
                )
              }
            />
            <Chip
              size="small"
              label={`Errors`}
              color="error"
              variant={
                selectedSeverities.includes("error") ? "filled" : "outlined"
              }
              onClick={() =>
                setSelectedSeverities((prev) =>
                  prev.includes("error")
                    ? prev.filter((s) => s !== "error")
                    : [...prev, "error"]
                )
              }
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
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default memo(NodeLogs, isEqual);
