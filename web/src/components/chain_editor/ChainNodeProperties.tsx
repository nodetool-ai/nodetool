/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { createElement, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  BORDER_RADIUS,
  FlexColumn,
  FlexRow,
  Text,
  Chip
} from "../ui_primitives";
import { NodeContext } from "../../contexts/NodeContext";
import { createNodeStore } from "../../stores/NodeStore";
import { EditorUiProvider } from "../editor_ui";
import { getComponentForProperty } from "../node/PropertyInput.resolver";
import type { Property } from "../../stores/ApiTypes";

interface ChainNodePropertiesProps {
  nodeId: string;
  nodeType: string;
  properties: Property[];
  values: Record<string, unknown>;
  connectedInputs: string[];
  onUpdate: (name: string, value: unknown) => void;
}

/** Lazily created empty NodeStore so property components that call useNodes work. */
let emptyStore: ReturnType<typeof createNodeStore> | null = null;
function getEmptyStore() {
  if (!emptyStore) {
    emptyStore = createNodeStore();
  }
  return emptyStore;
}

/**
 * Override styles for property components inside chain cards.
 * The property components are designed for compact ReactFlow nodes —
 * here we give them more breathing room.
 */
const chainPropertyStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(3),

    /* Labels */
    "& .property-label": {
      marginBottom: theme.spacing(1),
    },
    "& .property-label label": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      marginBottom: 0,
    },

    /* Number inputs: give the value a visible container */
    "& .number-input": {
      width: "100%",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.vars.palette.action.hover,
      padding: theme.spacing(1, 1),
      cursor: "ew-resize",
    },
    "& .number-input .value": {
      fontSize: theme.fontSizeNormal,
    },

    /* Text fields and selects */
    "& .MuiOutlinedInput-root": {
      fontSize: theme.fontSizeNormal,
      minHeight: 44,
    },
  });

export const ChainNodeProperties: React.FC<ChainNodePropertiesProps> = ({
  nodeId,
  nodeType,
  properties,
  values,
  connectedInputs,
  onUpdate,
}) => {
  const theme = useTheme();
  const store = useMemo(() => getEmptyStore(), []);
  const cssStyles = useMemo(() => chainPropertyStyles(theme), [theme]);

  if (properties.length === 0) {
    return (
      <Box sx={{ py: 1.5, textAlign: "center" }}>
        <Text size="smaller" color="secondary" sx={{ fontStyle: "italic" }}>
          No configurable properties
        </Text>
      </Box>
    );
  }

  return (
    <NodeContext.Provider value={store}>
      <EditorUiProvider scope="inspector">
        <div css={cssStyles}>
          {properties.map((prop, i) => {
            const isConnected = connectedInputs.includes(prop.name);
            const value = values[prop.name] ?? prop.default;

            if (isConnected) {
              return (
                <FlexColumn key={prop.name} gap={0.5}>
                  <FlexRow gap={1} align="center">
                    <Text size="small" weight={600}>
                      {prop.title ?? prop.name}
                    </Text>
                    <Chip
                      label="connected"
                      color="secondary"
                      compact
                      size="small"
                    />
                  </FlexRow>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: BORDER_RADIUS.xs,
                      border: `1px dashed ${theme.vars.palette.secondary.main}40`,
                      backgroundColor: `${theme.vars.palette.secondary.main}08`,
                    }}
                  >
                    <Text
                      size="smaller"
                      color="secondary"
                      sx={{ fontStyle: "italic" }}
                    >
                      Value provided by previous node
                    </Text>
                  </Box>
                </FlexColumn>
              );
            }

            const Component = getComponentForProperty(prop);
            return (
              <div className="chain-property-item" key={prop.name}>
                {createElement(Component, {
                  property: prop,
                  value,
                  nodeType,
                  nodeId,
                  propertyIndex: `chain-${nodeId}-${i}`,
                  onChange: (v: unknown) => onUpdate(prop.name, v),
                })}
              </div>
            );
          })}
        </div>
      </EditorUiProvider>
    </NodeContext.Provider>
  );
};
