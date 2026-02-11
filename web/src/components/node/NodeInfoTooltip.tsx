/**
 * NodeInfoTooltip - Context-sensitive help tooltip for nodes
 *
 * Displays comprehensive node information including:
 * - Node name and description
 * - Input/output types
 * - Category/namespace
 * - Helpful usage tips
 */

import React, { memo, useMemo } from "react";
import {
  Tooltip,
  Box,
  Typography,
  Chip,
  Divider,
  SxProps,
  Theme
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { NodeMetadata } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface NodeInfoTooltipProps {
  /** Node metadata */
  metadata: NodeMetadata;
  /** Node type identifier */
  nodeType: string;
  /** Child element to wrap with tooltip */
  children: React.ReactElement;
  /** Optional additional styles */
  sx?: SxProps<Theme>;
  /** Tooltip placement */
  placement?: "top" | "bottom" | "left" | "right" | "top-start" | "top-end" | "bottom-start" | "bottom-end";
}

/**
 * Format type information for display
 */
function formatType(type: { type: string }): string {
  return type.type || "unknown";
}

/**
 * Extract a helpful usage tip from the description
 */
function extractUsageTip(description?: string): string | null {
  if (!description) {
    return null;
  }

  // Look for common patterns that indicate usage tips
  const tipPatterns = [
    /(?:tip|hint|note|suggestion)[:\s]*(.+?)(?:\.|$)/i,
    /(?:try|use|recommended|best practice)[:\s]*(.+?)(?:\.|$)/i,
    /(?:for\s+best\s+results|to\s+optimize)[:\s]*(.+?)(?:\.|$)/i
  ];

  for (const pattern of tipPatterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // If no explicit tip found, use first sentence if description is multi-sentence
  const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 1) {
    return sentences[0].trim();
  }

  return null;
}

/**
 * NodeInfoTooltip Component
 */
export const NodeInfoTooltip: React.FC<NodeInfoTooltipProps> = memo(
  ({ metadata, nodeType, children, sx, placement = "top" }) => {
    const tooltipContent = useMemo(() => {
      // Extract namespace for display
      const namespace = metadata.namespace || nodeType;

      // Get input types
      const inputTypes = metadata.properties?.map(p => formatType(p.type)) || [];
      const outputTypes = metadata.outputs?.map(o => formatType(o.type)) || [];

      // Extract usage tip
      const usageTip = extractUsageTip(metadata.description);

      return (
        <Box
          sx={{
            maxWidth: 400,
            p: 1
          }}
        >
          {/* Node title */}
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              mb: 0.5,
              color: "text.primary"
            }}
          >
            {metadata.title}
          </Typography>

          {/* Description (truncated if too long) */}
          {metadata.description && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 1,
                color: "text.secondary",
                lineHeight: 1.4,
                maxHeight: 100,
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {metadata.description.length > 150
                ? `${metadata.description.substring(0, 150)}...`
                : metadata.description}
            </Typography>
          )}

          {/* Namespace/Category */}
          <Box sx={{ mb: 1 }}>
            <Chip
              label={namespace}
              size="small"
              variant="outlined"
              sx={{
                fontSize: "0.65rem",
                height: 20,
                borderColor: "divider",
                color: "text.secondary"
              }}
            />
          </Box>

          {/* Input/Output Types */}
          {(inputTypes.length > 0 || outputTypes.length > 0) && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {/* Inputs */}
                {inputTypes.length > 0 && (
                  <Box sx={{ flex: "1 1 auto", minWidth: 120 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        fontWeight: 500,
                        mb: 0.5,
                        color: "text.secondary",
                        fontSize: "0.65rem",
                        textTransform: "uppercase",
                        letterSpacing: 0.5
                      }}
                    >
                      Inputs
                    </Typography>
                    {inputTypes.slice(0, 3).map((type, idx) => (
                      <Chip
                        key={`input-${idx}`}
                        label={type}
                        size="small"
                        sx={{
                          fontSize: "0.65rem",
                          height: 18,
                          mr: 0.5,
                          mb: 0.5,
                          bgcolor: "action.selected"
                        }}
                      />
                    ))}
                    {inputTypes.length > 3 && (
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.6rem",
                          color: "text.secondary",
                          ml: 0.5
                        }}
                      >
                        +{inputTypes.length - 3} more
                      </Typography>
                    )}
                  </Box>
                )}

                {/* Outputs */}
                {outputTypes.length > 0 && (
                  <Box sx={{ flex: "1 1 auto", minWidth: 120 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        fontWeight: 500,
                        mb: 0.5,
                        color: "text.secondary",
                        fontSize: "0.65rem",
                        textTransform: "uppercase",
                        letterSpacing: 0.5
                      }}
                    >
                      Outputs
                    </Typography>
                    {outputTypes.slice(0, 3).map((type, idx) => (
                      <Chip
                        key={`output-${idx}`}
                        label={type}
                        size="small"
                        sx={{
                          fontSize: "0.65rem",
                          height: 18,
                          mr: 0.5,
                          mb: 0.5,
                          bgcolor: "primary.main",
                          color: "primary.contrastText"
                        }}
                      />
                    ))}
                    {outputTypes.length > 3 && (
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "0.6rem",
                          color: "text.secondary",
                          ml: 0.5
                        }}
                      >
                        +{outputTypes.length - 3} more
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            </>
          )}

          {/* Usage Tip */}
          {usageTip && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box
                sx={{
                  p: 0.75,
                  bgcolor: "info.dark",
                  borderRadius: 1,
                  borderLeft: 3,
                  borderColor: "info.main"
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 0.5,
                    fontSize: "0.7rem",
                    color: "info.light",
                    fontStyle: "italic"
                  }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 14, mt: 0.25, flexShrink: 0 }} />
                  <span>{usageTip}</span>
                </Typography>
              </Box>
            </>
          )}
        </Box>
      );
    }, [metadata, nodeType]);

    return (
      <Tooltip
        title={tooltipContent}
        enterDelay={TOOLTIP_ENTER_DELAY}
        placement={placement}
        arrow
        sx={sx}
      >
        {children}
      </Tooltip>
    );
  }
);

NodeInfoTooltip.displayName = "NodeInfoTooltip";

export default NodeInfoTooltip;
