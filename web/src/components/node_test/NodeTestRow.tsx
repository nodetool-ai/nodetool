import React, { memo, useCallback, useState } from "react";
import { IconButton, Typography, Chip, Box, Collapse } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeTestResult } from "./useNodeTestRunner";
import OutputRenderer from "../node/OutputRenderer";

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
  const [expanded, setExpanded] = useState(false);
  const status = result?.status || "idle";

  const handleRun = useCallback(() => {
    onRun(metadata);
  }, [metadata, onRun]);

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
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
          cursor: result?.output || result?.error ? "pointer" : "default",
          "&:hover": { bgcolor: "action.hover" }
        }}
        onClick={toggleExpand}
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

      {expanded && (result?.output || result?.error) && (
        <Collapse in={expanded}>
          <Box sx={{ px: 2, py: 1, maxHeight: 400, overflow: "auto" }}>
            {result?.error ? (
              <Typography
                color="error"
                sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}
              >
                {result.error}
              </Typography>
            ) : (
              <OutputRenderer value={result?.output} showTextActions={false} />
            )}
          </Box>
        </Collapse>
      )}
    </div>
  );
}

export const NodeTestRow = memo(NodeTestRowInner);
