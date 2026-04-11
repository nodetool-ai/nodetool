/** @jsxImportSource @emotion/react */
/**
 * Dialog for searching and selecting node types.
 * Groups nodes by namespace with fuzzy text search.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
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
import type { NodeMetadata } from "../../stores/ApiTypes";

interface NodePickerDialogProps {
  open: boolean;
  onSelect: (metadata: NodeMetadata) => void;
  onClose: () => void;
}

interface Section {
  title: string;
  nodes: NodeMetadata[];
}

function formatNamespace(ns: string): string {
  const parts = ns.split(".");
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export const NodePickerDialog: React.FC<NodePickerDialogProps> = ({
  open,
  onSelect,
  onClose,
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const allMetadata = useMetadataStore((s) => s.metadata);

  const metadataList = useMemo(
    () => Object.values(allMetadata),
    [allMetadata]
  );

  const sections = useMemo((): Section[] => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? metadataList.filter(
          (m) =>
            m.title.toLowerCase().includes(query) ||
            m.description.toLowerCase().includes(query) ||
            m.node_type.toLowerCase().includes(query)
        )
      : metadataList;

    const groups = new Map<string, NodeMetadata[]>();
    for (const m of filtered) {
      if (!groups.has(m.namespace)) groups.set(m.namespace, []);
      groups.get(m.namespace)!.push(m);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ns, nodes]) => ({
        title: ns,
        nodes: nodes.sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }, [metadataList, searchQuery]);

  const handleSelect = useCallback(
    (m: NodeMetadata) => {
      onSelect(m);
      setSearchQuery("");
    },
    [onSelect]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Node"
      minWidth={520}
    >
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
                  <SearchIcon sx={{ fontSize: 18, color: theme.vars.palette.text.secondary }} />
                </InputAdornment>
              ),
            },
          }}
        />

        <Box sx={{ overflow: "auto", flex: 1 }}>
          {sections.length === 0 ? (
            <FlexColumn align="center" justify="center" sx={{ py: 6 }}>
              <Text size="small" color="secondary">No nodes found</Text>
            </FlexColumn>
          ) : (
            sections.map((section) => (
              <Box key={section.title} sx={{ mb: 2 }}>
                <FlexRow gap={1} align="center" sx={{ py: 0.5, px: 0.5 }}>
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
                      border: `1px solid transparent`,
                      "&:hover": {
                        backgroundColor: theme.vars.palette.action.hover,
                        borderColor: theme.vars.palette.divider,
                      },
                      transition: "all 0.15s",
                    }}
                  >
                    <FlexColumn gap={0.5} sx={{ flex: 1, minWidth: 0 }}>
                      <Text size="small" weight={600}>{node.title}</Text>
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
            ))
          )}
        </Box>
      </FlexColumn>
    </Dialog>
  );
};
