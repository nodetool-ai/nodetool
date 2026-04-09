/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import { Visibility } from "@mui/icons-material";
import { typeFor, resolveAssetUri } from "./output";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface ResultPreviewStripProps {
  result: unknown;
  onClick: () => void;
}

/**
 * Extracts a human-readable label for a result value.
 */
function getResultLabel(value: unknown): string {
  if (value === null || value === undefined) return "";

  const type = typeFor(value);

  switch (type) {
    case "image":
      return "Image";
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "string":
      return "Text";
    case "number":
      return String(value);
    case "boolean":
      return String(value);
    case "array":
      return `Array [${(value as unknown[]).length}]`;
    case "dataframe":
      return "DataFrame";
    case "model_3d":
      return "3D Model";
    case "html":
      return "HTML";
    case "document":
      return "Document";
    default:
      if (typeof value === "object" && value !== null) {
        const keys = Object.keys(value);
        if (keys.length <= 3) return keys.join(", ");
        return `Object {${keys.length}}`;
      }
      return type;
  }
}

/**
 * Extracts a thumbnail image URI from a result, if available.
 */
function getThumbnailUri(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  // Direct image result
  if (v.type === "image" && typeof v.uri === "string") {
    return resolveAssetUri(v.uri);
  }

  // Result with output that is an image
  if (
    v.output &&
    typeof v.output === "object" &&
    (v.output as Record<string, unknown>).type === "image"
  ) {
    const uri = (v.output as Record<string, unknown>).uri;
    if (typeof uri === "string") return resolveAssetUri(uri);
  }

  // Array of images — use first
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (first && typeof first === "object" && first.type === "image" && typeof first.uri === "string") {
      return resolveAssetUri(first.uri);
    }
  }

  return null;
}

/**
 * A compact strip shown at the bottom of a node when viewing inputs,
 * indicating that a result is available. Clicking it switches to the result view.
 */
const ResultPreviewStrip: React.FC<ResultPreviewStripProps> = ({
  result,
  onClick
}) => {
  const unwrapped = useMemo(() => {
    if (
      result &&
      typeof result === "object" &&
      "output" in (result as Record<string, unknown>) &&
      (result as Record<string, unknown>).output !== undefined
    ) {
      return (result as Record<string, unknown>).output;
    }
    return result;
  }, [result]);

  const label = useMemo(() => getResultLabel(unwrapped), [unwrapped]);
  const thumbnail = useMemo(() => getThumbnailUri(unwrapped), [unwrapped]);

  if (!label) return null;

  return (
    <Tooltip title="Show Result" enterDelay={TOOLTIP_ENTER_DELAY} placement="top">
      <Box
        className="nodrag nopan"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1,
          py: 0.5,
          mx: 0.5,
          mb: 0.5,
          cursor: "pointer",
          borderRadius: "6px",
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          transition: "all 0.15s ease",
          overflow: "hidden",
          minHeight: 28,
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            borderColor: "var(--node-primary-color, rgba(255, 255, 255, 0.15))"
          }
        }}
      >
        {thumbnail ? (
          <Box
            component="img"
            src={thumbnail}
            alt=""
            sx={{
              width: 22,
              height: 22,
              borderRadius: "3px",
              objectFit: "cover",
              flexShrink: 0
            }}
          />
        ) : (
          <Visibility
            sx={{
              fontSize: 14,
              opacity: 0.5,
              flexShrink: 0
            }}
          />
        )}
        <Typography
          variant="caption"
          sx={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "text.secondary",
            fontSize: "0.7rem",
            lineHeight: 1.2
          }}
        >
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
};

export default memo(ResultPreviewStrip);
