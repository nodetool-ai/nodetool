/** @jsxImportSource @emotion/react */
/**
 * Dialog for searching and selecting node types.
 * Shows quick action tiles when idle, uses the main node search engine when typing.
 */

import { css } from "@emotion/react";
import React, { useState, useMemo, useCallback, type CSSProperties } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { Dialog } from "../ui_primitives/Dialog";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";
import { TextInput } from "../ui_primitives/TextInput";
import { HighlightText } from "../ui_primitives/HighlightText";
import useMetadataStore from "../../stores/MetadataStore";
import { computeSearchResults } from "../../utils/nodeSearch";
import {
  QUICK_ACTION_BUTTONS,
  type QuickActionDefinition,
} from "../node_menu/QuickActionTiles";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { FixedSizeList } from "react-window";

interface NodePickerDialogProps {
  open: boolean;
  onSelect: (metadata: NodeMetadata) => void;
  onClose: () => void;
}

const quickTileStyles = (theme: Theme) =>
  css({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: theme.spacing(1),
    padding: theme.spacing(0.5),

    ".quick-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(1.5, 1),
      borderRadius: theme.spacing(1.5),
      cursor: "pointer",
      border: "1px solid transparent",
      background: theme.vars.palette.action.hover,
      transition: "all 0.15s",
      minHeight: 70,
      "&:hover": {
        borderColor: theme.vars.palette.divider,
        background: theme.vars.palette.action.selected,
        transform: "translateY(-1px)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      },
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing(0.5),
      "& svg": { fontSize: "1.5rem" },
    },
    ".tile-label": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 500,
      textAlign: "center",
      color: theme.vars.palette.text.primary,
    },
  });

export const NodePickerDialog: React.FC<NodePickerDialogProps> = ({
  open,
  onSelect,
  onClose,
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const allMetadata = useMetadataStore((s) => s.metadata);
  const getMetadata = useMetadataStore((s) => s.getMetadata);

  const metadataList = useMemo(
    () => Object.values(allMetadata),
    [allMetadata]
  );

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

  const ResultRow = useCallback(
    ({ index, style }: { index: number; style: CSSProperties }) => {
      const node = searchResults[index];
      return (
        <div
          style={{
            ...style,
            padding: "0 8px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            borderRadius: "var(--rounded-sm)",
          }}
          onClick={() => handleSelect(node)}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              theme.vars.palette.action.hover as string;
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
    },
    [searchResults, searchQuery, handleSelect, theme]
  );

  return (
    <Dialog open={open} onClose={onClose} title="Add Node" minWidth={520}>
      <FlexColumn gap={2} sx={{ minHeight: 400, maxHeight: "70vh" }}>
        <TextInput
          fullWidth
          size="small"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon
                    sx={{
                      fontSize: 18,
                      color: theme.vars.palette.text.secondary,
                    }}
                  />
                </InputAdornment>
              ),
            },
          }}
        />

        <Box sx={{ flex: 1 }}>
          {!hasSearch ? (
            <FlexColumn gap={2}>
              <Text size="small" weight={600} color="secondary">
                Quick Actions
              </Text>
              <div css={tileStyles}>
                {QUICK_ACTION_BUTTONS.map((action) => (
                  <div
                    key={action.key}
                    className="quick-tile"
                    onClick={() => handleQuickAction(action)}
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
            <FlexColumn align="center" justify="center" sx={{ py: 6 }}>
              <Text size="small" color="secondary">
                No nodes found
              </Text>
            </FlexColumn>
          ) : (
            <FlexColumn gap={0}>
              <Text size="tiny" color="secondary" sx={{ mb: 0.5, px: 0.5, opacity: 0.5 }}>
                {searchResults.length}{" "}
                {searchResults.length === 1 ? "result" : "results"}
              </Text>
              <FixedSizeList
                height={Math.min(
                  LIST_HEIGHT,
                  searchResults.length * ROW_HEIGHT
                )}
                itemCount={searchResults.length}
                itemSize={ROW_HEIGHT}
                width="100%"
              >
                {ResultRow}
              </FixedSizeList>
            </FlexColumn>
          )}
        </Box>
      </FlexColumn>
    </Dialog>
  );
};
