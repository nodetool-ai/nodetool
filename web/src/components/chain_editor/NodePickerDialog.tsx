/** @jsxImportSource @emotion/react */
/**
 * Dialog for searching and selecting node types.
 * Shows quick action tiles when idle, uses the main node search engine when typing.
 */

import { css } from "@emotion/react";
import React, { useState, useMemo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { Dialog } from "../ui_primitives/Dialog";
import { FlexRow } from "../ui_primitives/FlexRow";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";
import { TextInput } from "../ui_primitives/TextInput";
import { Chip } from "../ui_primitives/Chip";
import useMetadataStore from "../../stores/MetadataStore";
import { computeSearchResults } from "../../utils/nodeSearch";
import {
  QUICK_ACTION_BUTTONS,
  type QuickActionDefinition,
} from "../node_menu/QuickActionTiles";
import type { NodeMetadata } from "../../stores/ApiTypes";

interface NodePickerDialogProps {
  open: boolean;
  onSelect: (metadata: NodeMetadata) => void;
  onClose: () => void;
}

function formatNamespace(ns: string): string {
  const parts = ns.split(".");
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
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

  // Group search results by namespace
  const sections = useMemo(() => {
    const groups = new Map<string, NodeMetadata[]>();
    for (const m of searchResults) {
      if (!groups.has(m.namespace)) groups.set(m.namespace, []);
      groups.get(m.namespace)!.push(m);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ns, nodes]) => ({ title: ns, nodes }));
  }, [searchResults]);

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

        <Box sx={{ overflow: "auto", flex: 1 }}>
          {!hasSearch ? (
            /* Quick action tiles when no search */
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
          ) : sections.length === 0 ? (
            <FlexColumn align="center" justify="center" sx={{ py: 6 }}>
              <Text size="small" color="secondary">
                No nodes found
              </Text>
            </FlexColumn>
          ) : (
            <>
              <Text size="tiny" color="secondary" sx={{ mb: 1 }}>
                {searchResults.length}{" "}
                {searchResults.length === 1 ? "result" : "results"}
              </Text>
              {sections.map((section) => (
                <Box key={section.title} sx={{ mb: 2 }}>
                  <FlexRow
                    gap={1}
                    align="center"
                    sx={{ py: 0.5, px: 0.5 }}
                  >
                    <Text
                      size="smaller"
                      weight={600}
                      color="secondary"
                      sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
                    >
                      {formatNamespace(section.title)}
                    </Text>
                    <Text size="tiny" color="secondary">
                      {section.nodes.length}
                    </Text>
                  </FlexRow>

                  {section.nodes.map((node) => (
                    <Box
                      key={node.node_type}
                      onClick={() => handleSelect(node)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        p: 1.5,
                        borderRadius: 1.5,
                        cursor: "pointer",
                        border: "1px solid transparent",
                        "&:hover": {
                          backgroundColor: theme.vars.palette.action.hover,
                          borderColor: theme.vars.palette.divider,
                        },
                        transition: "all 0.15s",
                      }}
                    >
                      <FlexColumn gap={0.5} sx={{ flex: 1, minWidth: 0 }}>
                        <Text size="small" weight={600}>
                          {node.title}
                        </Text>
                        {node.description && (
                          <Text size="smaller" color="secondary" lineClamp={2}>
                            {node.description}
                          </Text>
                        )}
                        <FlexRow gap={0.5} wrap>
                          {node.outputs.length > 0 && (
                            <Chip
                              label={`${node.outputs.length} output${node.outputs.length !== 1 ? "s" : ""}`}
                              color="primary"
                              compact
                              size="small"
                            />
                          )}
                          {node.properties.length > 0 && (
                            <Chip
                              label={`${node.properties.length} input${node.properties.length !== 1 ? "s" : ""}`}
                              color="secondary"
                              compact
                              size="small"
                            />
                          )}
                        </FlexRow>
                      </FlexColumn>
                      <AddCircleOutlineIcon
                        sx={{
                          fontSize: 22,
                          color: theme.vars.palette.primary.main,
                          flexShrink: 0,
                        }}
                      />
                    </Box>
                  ))}
                </Box>
              ))}
            </>
          )}
        </Box>
      </FlexColumn>
    </Dialog>
  );
};
