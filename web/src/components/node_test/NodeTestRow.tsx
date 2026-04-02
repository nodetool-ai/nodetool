import React, { memo, useCallback, useState } from "react";
import {
  IconButton,
  Typography,
  Chip,
  Box,
  DialogTitle,
  DialogContent
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CloseIcon from "@mui/icons-material/Close";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeTestResult } from "./useNodeTestRunner";
import OutputRenderer from "../node/OutputRenderer";
import { Dialog } from "../ui_primitives";

const STATUS_COLORS: Record<
  string,
  "default" | "info" | "success" | "error" | "warning"
> = {
  idle: "default",
  queued: "info",
  running: "warning",
  passed: "success",
  failed: "error"
};

interface NodeTestRowProps {
  metadata: NodeMetadata;
  result: NodeTestResult | undefined;
  onRun: (metadata: NodeMetadata) => void;
  style: React.CSSProperties;
}

function NodeTestRowInner({
  metadata,
  result,
  onRun,
  style
}: NodeTestRowProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const status = result?.status || "idle";
  const hasOutput = !!(result?.output || result?.error);

  const handleRun = useCallback(() => {
    onRun(metadata);
  }, [metadata, onRun]);

  const handleRowClick = useCallback(() => {
    if (hasOutput) setModalOpen(true);
  }, [hasOutput]);

  const handleClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <div style={{ ...style, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          height: 48,
          px: 1,
          gap: 1,
          cursor: hasOutput ? "pointer" : "default",
          "&:hover": { bgcolor: "action.hover" }
        }}
        onClick={handleRowClick}
      >
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleRun();
          }}
          disabled={status === "running" || status === "queued"}
          sx={{ width: 32, height: 32 }}
        >
          <PlayArrowIcon fontSize="small" />
        </IconButton>

        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {metadata.node_type}
        </Typography>

        <Typography
          variant="body2"
          sx={{
            width: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.7
          }}
        >
          {metadata.title}
        </Typography>

        <Chip
          label={
            status === "idle"
              ? "\u2014"
              : result?.durationMs
                ? `${status} ${result.durationMs}ms`
                : status
          }
          color={STATUS_COLORS[status]}
          size="small"
          sx={{ width: 120, justifyContent: "center" }}
        />

        <Typography
          variant="body2"
          sx={{
            width: 300,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity: 0.6,
            fontFamily: "monospace",
            fontSize: "0.75rem"
          }}
        >
          {result?.error
            ? result.error
            : result?.output
              ? JSON.stringify(result.output).slice(0, 100)
              : ""}
        </Typography>
      </Box>

      {modalOpen && hasOutput && (
        <Dialog open={modalOpen} onClose={handleClose} maxWidth="md" fullWidth>
          <DialogTitle
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontFamily: "monospace",
              fontSize: "0.9rem"
            }}
          >
            <span>
              {metadata.title}
              <Typography
                component="span"
                sx={{ ml: 1, opacity: 0.5, fontSize: "0.8rem" }}
              >
                {metadata.node_type}
              </Typography>
            </span>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {result?.durationMs && (
                <Chip
                  label={`${result.durationMs}ms`}
                  size="small"
                  color={STATUS_COLORS[status]}
                />
              )}
              <IconButton size="small" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ minHeight: 200 }}>
            {result?.error ? (
              <Typography
                color="error"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  whiteSpace: "pre-wrap"
                }}
              >
                {result.error}
              </Typography>
            ) : (
              <OutputRenderer value={result?.output} showTextActions={true} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export const NodeTestRow = memo(NodeTestRowInner);
