/** @jsxImportSource @emotion/react */
/**
 * Dialog for searching and selecting node types.
 * Shows quick action tiles when idle, uses the main node search engine when typing.
 */

import { css } from "@emotion/react";
import React, { useState, useMemo, useCallback, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  InputAdornment,
  Box,
  Dialog,
  EmptyState,
  FlexColumn,
  Text,
  TextInput,
  HighlightText,
  SHADOW
} from "../ui_primitives";
import SearchIcon from "@mui/icons-material/Search";
import { useVirtualizer } from "@tanstack/react-virtual";
import useMetadataStore from "../../stores/MetadataStore";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import { computeSearchResults } from "../../utils/nodeSearch";
import {
  QUICK_ACTION_BUTTONS,
  type QuickActionDefinition
} from "../node_menu/QuickActionTiles.constants";
import type { NodeMetadata } from "../../stores/ApiTypes";

interface NodePickerDialogProps {
  open: boolean;
  onSelect: (metadata: NodeMetadata) => void;
  onClose: () => void;
}

const quickTileStyles = (theme: Theme) =>
  css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: theme.spacing(SPACING.xs),
    padding: theme.spacing(SPACING.micro),

    ".quick-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(SPACING.sm, SPACING.xs),
      borderRadius: theme.spacing(1.5),
      cursor: "pointer",
      border: "1px solid transparent",
      background: theme.vars.palette.action.hover,
      transition: `all ${MOTION.fast}`,
      minHeight: 70,
      "&:hover": {
        borderColor: theme.vars.palette.divider,
        background: theme.vars.palette.action.selected,
        transform: "translateY(-1px)",
        boxShadow: SHADOW(theme).md
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing(SPACING.micro),
      "& svg": { fontSize: "var(--fontSizeBig)" }
    },
    ".tile-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 500,
      textAlign: "center",
      color: theme.vars.palette.text.primary
    }
  });

export const NodePickerDialog: React.FC<NodePickerDialogProps> = ({
  open,
  onSelect,
  onClose
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const autoFocusEnabled = useAutoFocusEnabled();
  const allMetadata = useMetadataStore((s) => s.metadata);
  const getMetadata = useMetadataStore((s) => s.getMetadata);

  const metadataList = useMemo(() => Object.values(allMetadata), [allMetadata]);

  const hasSearch = searchQuery.trim().length > 0;

  // Use the same search engine as the main NodeMenu
  const searchResults = useMemo(() => {
    if (!hasSearch) return [];
    const { sortedResults } = computeSearchResults(
      metadataList,
      searchQuery,
      [], // no selected path
      undefined, // no input type filter
      undefined, // no output type filter
      false, // non-strict matching
      "all" // all providers
    );
    return sortedResults;
  }, [metadataList, searchQuery, hasSearch]);

  const handleSelect = useCallback(
    (m: NodeMetadata) => {
      onSelect(m);
      setSearchQuery("");
    },
    [onSelect]
  );

  const handleQuickAction = useCallback(
    (action: QuickActionDefinition) => {
      const metadata = getMetadata(action.nodeType);
      if (metadata) {
        handleSelect(metadata);
      }
    },
    [getMetadata, handleSelect]
  );

  const tileStyles = useMemo(() => quickTileStyles(theme), [theme]);

  const ROW_HEIGHT = 32;
  const LIST_HEIGHT = 400;

  const listScrollRef = useRef<HTMLDivElement>(null);
  const resultsVirtualizer = useVirtualizer({
    count: searchResults.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: theme.virtualScroll.overscan.small
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add node"
      maxWidth="sm"
      fullWidth
    >
      <FlexColumn gap={SPACING.md} sx={{ minHeight: 400 }}>
        {/* autoFocus is skipped on touch, where the virtual keyboard would
            cover the node list the dialog just opened to show. */}
        <TextInput
          fullWidth
          size="small"
          placeholder="Search nodes"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus={autoFocusEnabled}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon
                    sx={{
                      fontSize: 18,
                      color: theme.vars.palette.text.secondary
                    }}
                  />
                </InputAdornment>
              )
            }
          }}
        />

        <Box sx={{ flex: 1 }}>
          {!hasSearch ? (
            <FlexColumn gap={SPACING.md}>
              <Text size="small" weight={600} color="secondary">
                Quick actions
              </Text>
              <div css={tileStyles}>
                {QUICK_ACTION_BUTTONS.map((action) => (
                  <div
                    key={action.key}
                    className="quick-tile"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleQuickAction(action)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        handleQuickAction(action);
                    }}
                  >
                    <div
                      className="tile-icon"
                      style={{ color: action.iconColor }}
                    >
                      {action.icon}
                    </div>
                    <span className="tile-label">{action.label}</span>
                  </div>
                ))}
              </div>
            </FlexColumn>
          ) : searchResults.length === 0 ? (
            <EmptyState
              variant="no-results"
              size="small"
              title="No nodes found"
            />
          ) : (
            <FlexColumn gap={SPACING.none}>
              <Text
                size="smaller"
                color="secondary"
                sx={{ mb: SPACING.micro, px: SPACING.micro }}
              >
                {searchResults.length}{" "}
                {searchResults.length === 1 ? "result" : "results"}
              </Text>
              <div
                ref={listScrollRef}
                style={{
                  height: Math.min(
                    LIST_HEIGHT,
                    searchResults.length * ROW_HEIGHT
                  ),
                  width: "100%",
                  overflow: "auto"
                }}
              >
                <div
                  style={{
                    height: resultsVirtualizer.getTotalSize(),
                    width: "100%",
                    position: "relative"
                  }}
                >
                  {resultsVirtualizer.getVirtualItems().map((vi) => {
                    const node = searchResults[vi.index];
                    return (
                      <div
                        key={vi.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: vi.size,
                          transform: `translateY(${vi.start}px)`,
                          padding: `0 ${getSpacingPx(SPACING.md)}`,
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          borderRadius: BORDER_RADIUS.sm
                        }}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelect(node)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            handleSelect(node);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            theme.vars.palette.action.hover;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <Text size="small" weight={500} component="span">
                          <HighlightText
                            text={node.title}
                            query={searchQuery}
                            matchStyle="primary"
                          />
                        </Text>
                      </div>
                    );
                  })}
                </div>
              </div>
            </FlexColumn>
          )}
        </Box>
      </FlexColumn>
    </Dialog>
  );
};
