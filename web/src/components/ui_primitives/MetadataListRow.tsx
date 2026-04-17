/**
 * MetadataListRow Component
 *
 * A row layout combining a truncated primary label, a set of inline
 * "key · value" metadata columns, and an optional trailing actions slot.
 * Replaces the hand-written `textOverflow: ellipsis` + `· separator` pattern
 * repeated across logs, workflows, collections, and version lists.
 *
 * All text nodes default to theme-based truncation so rows don't overflow
 * their container. Metadata items are rendered muted and joined by a
 * middle-dot separator.
 */

import React, { memo, Fragment } from "react";
import { Box, BoxProps } from "@mui/material";
import { Caption } from "./Caption";
import { TruncatedText } from "./TruncatedText";

export interface MetadataItem {
  /** Optional short label rendered before the value (e.g. "size"). */
  label?: React.ReactNode;
  /** Metadata value. */
  value: React.ReactNode;
  /** Optional tooltip title forwarded by the consumer (wrap externally). */
  key?: string;
}

export interface MetadataListRowProps extends Omit<BoxProps, "title"> {
  /** Primary label (gets ellipsis truncation). */
  primary: React.ReactNode;
  /** Secondary label shown below primary (muted, truncated). */
  secondary?: React.ReactNode;
  /** Inline metadata columns shown after primary, separated by " · ". */
  metadata?: MetadataItem[];
  /** Trailing slot (actions, chip, etc.). Takes fixed width. */
  actions?: React.ReactNode;
  /** Primary text weight (default 600) */
  primaryWeight?: number;
  /**
   * Where to place the metadata items.
   * - "inline" (default): on the same line as primary, after it
   * - "below": beneath the primary text as a second line
   */
  metadataPlacement?: "inline" | "below";
  /** Gap between primary / metadata / actions (theme units). Default: 1 */
  gap?: number;
}

const SEPARATOR = "\u00A0·\u00A0";

/**
 * MetadataListRow - Primary + metadata + actions row
 *
 * @example
 * <MetadataListRow
 *   primary={`v${version.version}`}
 *   metadata={[
 *     { value: timeAgo },
 *     { value: formatBytes(version.size_bytes) }
 *   ]}
 *   actions={<HoverActionGroup>…</HoverActionGroup>}
 * />
 */
export const MetadataListRow: React.FC<MetadataListRowProps> = memo(
  function MetadataListRow({
    primary,
    secondary,
    metadata,
    actions,
    primaryWeight = 600,
    metadataPlacement = "inline",
    gap = 1,
    sx,
    ...props
  }) {
    const renderMetadata = () => {
      if (!metadata || metadata.length === 0) {
        return null;
      }
      return metadata.map((item, index) => (
        <Fragment key={item.key ?? index}>
          {index > 0 && <span aria-hidden="true">{SEPARATOR}</span>}
          {item.label && (
            <>
              <Caption size="tiny" color="muted">
                {item.label}
              </Caption>{" "}
            </>
          )}
          <Caption size="tiny" color="muted">
            {item.value}
          </Caption>
        </Fragment>
      ));
    };

    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap,
          minWidth: 0,
          width: "100%",
          ...sx
        }}
        {...props}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              gap: 0.75,
              minWidth: 0,
              flexWrap: "nowrap"
            }}
          >
            <TruncatedText
              component="span"
              sx={{ fontWeight: primaryWeight, minWidth: 0 }}
            >
              {primary}
            </TruncatedText>
            {metadataPlacement === "inline" && metadata && metadata.length > 0 && (
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  minWidth: 0,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis"
                }}
              >
                {renderMetadata()}
              </Box>
            )}
          </Box>
          {metadataPlacement === "below" && metadata && metadata.length > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "baseline",
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis"
              }}
            >
              {renderMetadata()}
            </Box>
          )}
          {secondary && (
            <TruncatedText
              component="div"
              sx={{ color: "text.secondary", fontSize: "0.8em" }}
            >
              {secondary}
            </TruncatedText>
          )}
        </Box>
        {actions && (
          <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
            {actions}
          </Box>
        )}
      </Box>
    );
  }
);

MetadataListRow.displayName = "MetadataListRow";
