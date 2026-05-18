/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo } from "react";
import PropertyField from "./node/PropertyField";
import { Box } from "@mui/material";
import useMetadataStore from "../stores/MetadataStore";
import { useNodes } from "../contexts/NodeContext";
import NodeExplorer from "./node/NodeExplorer";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { NodeMetadata, TypeMetadata, Property } from "../stores/ApiTypes";
import { findOutputHandle } from "../utils/handleUtils";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import isEqual from "fast-deep-equal";
import { areNodesEqualIgnoringPosition } from "../utils/nodeEquality";
import { EditorUiProvider } from "./editor_ui";
import {
  Caption,
  CloseButton,
  CollapsibleSection,
  ScrollArea,
  Text,
  Tooltip
} from "./ui_primitives";
import FalPricingFooter from "./node/FalPricingFooter";
import { DYNAMIC_KIE_NODE_TYPE } from "./node/DynamicKieSchemaNode";
import PropertyVisibilityToggle from "./properties/PropertyVisibilityToggle";
import {
  addExposedInput,
  removeExposedInput
} from "../utils/exposedInputs";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "grid",
      gridTemplateRows: "1fr auto",
      gridTemplateColumns: "100%",
      backgroundColor: theme.vars.palette.background.default,
      padding: "0",
      width: "100%",
      maxWidth: "500px",
      height: "100%",
      overflow: "hidden"
    },
    ".top": {
      overflow: "hidden",
      position: "relative",
      width: "100%"
    },
    ".top-content": {
      position: "absolute",
      top: 0,
      left: 0,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(3),
      width: "100%",
      height: "100%",
      padding: `${theme.spacing(2)} ${theme.spacing(3)} ${theme.spacing(2)} ${theme.spacing(5)}`,
      transformOrigin: "top left"
    },
    ".header-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    ".inspector-header": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      paddingBottom: theme.spacing(1),
      marginBottom: theme.spacing(0.5),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".title": {
      width: "100%",
      userSelect: "none",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      fontWeight: 500
    },
    ".namespace": {
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.text.disabled,
      fontFamily: "monospace",
      letterSpacing: "0.02em",
      marginTop: theme.spacing(0.25)
    },
    ".header-description": {
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeTiny,
      lineHeight: 1.4,
      marginTop: theme.spacing(0.5),
      opacity: 0.8,
      whiteSpace: "pre-wrap"
    },
    ".description": {
      color: "var(--palette-grey-100)",
      fontSize: theme.fontSizeTiny,
      paddingRight: "0.5em",
      maxHeight: "200px",
      overflowY: "auto"
    },
    ".multi-property-row": {
      display: "flex",
      position: "relative",
      alignItems: "flex-start",
      gap: "0.5em",
      width: "100%",
      minWidth: 0
    },
    ".multi-property-row .node-property": {
      flex: "1 1 auto",
      minWidth: 0,
      width: "100%"
    },
    ".top-content > .node-property": {
      display: "contents"
    },
    ".mixed-indicator": {
      display: "inline-flex",
      flex: "0 0 auto",
      alignItems: "center",
      marginTop: "0.15em",
      color: theme.vars.palette.warning.main
    },
    ".close-button": {
      position: "absolute",
      right: "0.5em",
      top: "0.5em"
    },
    ".property-row": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(0.5),
      width: "100%",
      minWidth: 0
    },
    ".property-row .node-property": {
      flex: "1 1 auto",
      minWidth: 0,
      width: "100%"
    },
    ".property-row .property-visibility-toggle": {
      flex: "0 0 auto",
      marginTop: "0.15em"
    }
  });

const Inspector: React.FC = () => {
  // Use selector directly instead of calling getSelectedNodes() to avoid filtering on every store update
  // We use a custom equality function to avoid re-renders when nodes are moved (position changes)
  // but their data remains the same.
  const selectedNodes = useNodes(
    (state) => state.nodes.filter((node) => node.selected),
    areNodesEqualIgnoringPosition
  );
  const findNode = useNodes((state) => state.findNode);
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const deleteEdges = useNodes((state) => state.deleteEdges);
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);

  // Optimize: Only subscribe to edges that are connected to selected nodes to avoid re-renders
  // when unrelated edges change. This is especially important for dynamic properties lookup.
  const selectedNodeIds = useMemo(
    () => new Set(selectedNodes.map((node) => node.id)),
    [selectedNodes]
  );

  // Use strict equality for allEdges to avoid O(E) shallow scan on every frame.
  // Filter inside useMemo to avoid allocating new array on every frame.
  const allEdges = useNodes((state) => state.edges, (a, b) => a === b);
  const edges = useMemo(
    () =>
      allEdges.filter(
        (edge) =>
          selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)
      ),
    [allEdges, selectedNodeIds]
  );

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const theme = useTheme();
  const inspectorStyles = useMemo(() => styles(theme), [theme]);
  const nodesWithMetadata = useMemo(
    () =>
      selectedNodes
        .map((node) => ({
          node,
          metadata: node.type ? getMetadata(node.type as string) : null
        }))
        .filter(
          (
            entry
          ): entry is {
            node: (typeof selectedNodes)[number];
            metadata: NodeMetadata;
          } => Boolean(entry.metadata)
        ),
    [selectedNodes, getMetadata]
  );
  const isMultiSelect = selectedNodes.length > 1;
  const metadataCoverageMatches =
    nodesWithMetadata.length === selectedNodes.length;
  const handleInspectorClose = useCallback(() => {
    setSelectedNodes([]);
  }, [setSelectedNodes]);
  const sharedProperties = useMemo(() => {
    if (!isMultiSelect || nodesWithMetadata.length === 0) {
      return [];
    }
    const [first, ...rest] = nodesWithMetadata;

    // Build a Set of property signatures from all other nodes for O(1) lookup
    // This reduces the complexity from O(n*m) to O(n+m) where n is properties in first node
    // and m is total properties in all other nodes
    const otherPropertySignatures = new Set<string>();
    for (const { metadata } of rest) {
      for (const prop of metadata.properties) {
        // Create a unique signature for each property based on name and type
        // We use JSON.stringify for type comparison as it's more efficient than deep comparison
        const typeSignature = JSON.stringify(prop.type);
        otherPropertySignatures.add(`${prop.name}:${typeSignature}`);
      }
    }

    return first.metadata.properties.filter((property) => {
      const typeSignature = JSON.stringify(property.type);
      return otherPropertySignatures.has(`${property.name}:${typeSignature}`);
    });
  }, [isMultiSelect, nodesWithMetadata]);

  const multiPropertyEntries = useMemo(() => {
    if (!isMultiSelect || nodesWithMetadata.length === 0) {
      return [];
    }
    return sharedProperties.map((property) => {
      const values = nodesWithMetadata.map(
        ({ node }) => node.data.properties[property.name]
      );
      const baseValue = values[0];
      const allEqual = values.every((value) => isEqual(value, baseValue));
      return {
        property,
        value: allEqual ? baseValue : undefined,
        isMixed: !allEqual
      };
    });
  }, [isMultiSelect, nodesWithMetadata, sharedProperties]);

  const multiNodeIds = useMemo(
    () => nodesWithMetadata.map(({ node }) => node.id),
    [nodesWithMetadata]
  );

  const handleMultiPropertyChange = useCallback(
    (propertyName: string, value: unknown) => {
      multiNodeIds.forEach((nodeId) =>
        updateNodeProperties(nodeId, { [propertyName]: value })
      );
    },
    [multiNodeIds, updateNodeProperties]
  );

  // Define selectedNode and metadata early so callbacks can reference them
  const selectedNode = selectedNodes[0] || null;
  const metadata = selectedNode
    ? getMetadata(selectedNode.type as string)
    : null;

  // Connected target-handle names for the focused node, used to (a) gate the
  // demotion confirmation prompt and (b) flag the toggle as "connected".
  const connectedTargetHandles = useMemo(() => {
    if (!selectedNode) {
      return new Set<string>();
    }
    return new Set(
      edges
        .filter(
          (edge) =>
            edge.target === selectedNode.id && typeof edge.targetHandle === "string"
        )
        .map((edge) => edge.targetHandle as string)
    );
  }, [edges, selectedNode]);

  // Properties whose handle is already determined by metadata don't get
  // the user-facing visibility toggle — there's nothing to opt into.
  const metadataHandleNames = useMemo(() => {
    if (!metadata) {
      return new Set<string>();
    }
    return new Set([
      ...(metadata.inline_fields ?? []),
      ...(metadata.input_fields ?? [])
    ]);
  }, [metadata]);

  const handleToggleExposed = useCallback(
    (propertyName: string) => {
      if (!selectedNode) {
        return;
      }
      const current = selectedNode.data.exposedInputs ?? [];
      const isExposed = current.includes(propertyName);
      if (isExposed) {
        const isConnected = connectedTargetHandles.has(propertyName);
        if (
          isConnected &&
          !window.confirm(
            `Hide input handle for "${propertyName}"? The connected edge will be removed.`
          )
        ) {
          return;
        }
        if (isConnected) {
          const edgeIds = edges
            .filter(
              (edge) =>
                edge.target === selectedNode.id &&
                edge.targetHandle === propertyName
            )
            .map((edge) => edge.id);
          if (edgeIds.length > 0) {
            deleteEdges(edgeIds);
          }
        }
        const next = removeExposedInput(current, propertyName);
        if (next !== current) {
          updateNodeData(selectedNode.id, { exposedInputs: next });
        }
      } else {
        const next = addExposedInput(current, propertyName);
        if (next !== current) {
          updateNodeData(selectedNode.id, { exposedInputs: next });
        }
      }
    },
    [selectedNode, connectedTargetHandles, edges, deleteEdges, updateNodeData]
  );

  if (selectedNodes.length === 0) {
    return (
      <EditorUiProvider scope="inspector">
        <Box className="inspector" css={inspectorStyles}>
          <Box className="top">
            <ScrollArea className="top-content" direction="vertical">
              <NodeExplorer />
            </ScrollArea>
          </Box>
          <Box className="bottom"></Box>
        </Box>
      </EditorUiProvider>
    );
  }

  if (isMultiSelect) {
    if (!metadataCoverageMatches) {
      return (
        <Box className="inspector" css={inspectorStyles}>
          <Box className="top">
            <ScrollArea className="top-content" direction="vertical">
              <Text size="small" color="secondary">
                Metadata is not available for all selected nodes.
              </Text>
            </ScrollArea>
          </Box>
        </Box>
      );
    }

    return (
      <EditorUiProvider scope="inspector">
        <Box className="inspector" css={inspectorStyles}>
          <Box className="top">
            <ScrollArea className="top-content" direction="vertical">
              <div className="inspector-header">
                <div className="header-row">
                  <div className="title">{selectedNodes.length} nodes selected</div>
                  <CloseButton
                    onClick={handleInspectorClose}
                    tooltip="Close inspector"
                    buttonSize="small"
                    nodrag={false}
                  />
                </div>
                <div className="title">
                  {`Editing ${selectedNodes.length} nodes`}
                </div>
              </div>
              {multiPropertyEntries.length > 0 ? (
                multiPropertyEntries.map(({ property, value, isMixed }) => (
                  <div
                    className="multi-property-row"
                    key={`multi-${property.name}-${nodesWithMetadata[0].node.id}`}
                  >
                    <PropertyField
                      id={nodesWithMetadata[0].node.id}
                      value={value}
                      property={property}
                      propertyIndex={property.name}
                      showHandle={false}
                      isInspector={true}
                      nodeType="inspector"
                      data={nodesWithMetadata[0].node.data}
                      layout=""
                      inspectorBatchNodeIds={multiNodeIds}
                      onValueChange={(newValue) =>
                        handleMultiPropertyChange(property.name, newValue)
                      }
                    />
                    {isMixed && (
                      <Tooltip
                        title="Mixed values across the selected nodes"
                        placement="top-start"
                        delay={200}
                      >
                        <span className="mixed-indicator">
                          <WarningAmberOutlinedIcon fontSize="small" />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                ))
              ) : (
                <Caption size="smaller" color="muted" sx={{ padding: "0.25em 0" }}>
                  No shared editable properties across the selected nodes.
                </Caption>
              )}
            </ScrollArea>
          </Box>
          <div className="bottom"></div>
        </Box>
      </EditorUiProvider>
    );
  }

  if (!selectedNode) {
    return (
      <Box className="inspector" css={inspectorStyles}>
        <Box className="top">
          <ScrollArea className="top-content" direction="vertical">
            <Box className="inspector-header">
              <Caption size="smaller" color="muted">
                Select a node to inspect
              </Caption>
            </Box>
          </ScrollArea>
        </Box>
        <Box className="bottom"></Box>
      </Box>
    );
  }

  if (!metadata) {
    return <Text size="small" color="secondary">No metadata available for this node</Text>;
  }

  return (
    <EditorUiProvider scope="inspector">
      <Box className="inspector" css={inspectorStyles}>
        <Box className="top">
          <ScrollArea className="top-content" direction="vertical">
            <div className="inspector-header">
              <div className="header-row">
                <div className="title">{metadata.title}</div>
                <CloseButton
                  onClick={handleInspectorClose}
                  tooltip="Close inspector"
                  buttonSize="small"
                  nodrag={false}
                />
              </div>
              {metadata.fal_unit_pricing ? (
                <Box sx={{ mt: 0.5 }}>
                  <FalPricingFooter
                    metadata={metadata}
                    selected
                    variant="inline"
                    popoverResetDep={selectedNode.id}
                  />
                </Box>
              ) : null}
              <div className="namespace">{metadata.node_type}</div>
              {metadata.description && (
                <CollapsibleSection
                  title={<Caption size="tiny" color="muted">Description</Caption>}
                  defaultOpen={false}
                  compact
                >
                  <div className="header-description">
                    {metadata.description}
                  </div>
                </CollapsibleSection>
              )}
            </div>
            {/* Property list — every property gets the show-as-input
                toggle except those whose handle is already determined by
                metadata (inline rows or declared input_fields). */}
            {metadata.properties.map((property, index) => {
              const hasToggle = !metadataHandleNames.has(property.name);
              const exposed = (selectedNode.data.exposedInputs ?? []).includes(
                property.name
              );
              const connected = connectedTargetHandles.has(property.name);
              return (
                <div
                  className="property-row"
                  key={`inspector-${property.name}-${selectedNode.id}`}
                >
                  <PropertyField
                    id={selectedNode.id}
                    value={selectedNode.data.properties[property.name]}
                    property={property}
                    propertyIndex={index.toString()}
                    showHandle={false}
                    isInspector={true}
                    nodeType="inspector"
                    data={selectedNode.data}
                    layout=""
                  />
                  {hasToggle && (
                    <PropertyVisibilityToggle
                      exposed={exposed}
                      connected={connected}
                      onToggle={() => handleToggleExposed(property.name)}
                    />
                  )}
                </div>
              );
            })}

            {/* Dynamic properties, if any */}
            {Object.entries(selectedNode.data.dynamic_properties || {}).map(
              ([name, value], index) => {
                // Infer type from incoming edge or dynamic_inputs metadata
                const incoming = edges.find(
                  (edge) =>
                    edge.target === selectedNode.id &&
                    edge.targetHandle === name
                );

                const dynamicInputMeta = selectedNode.data.dynamic_inputs?.[name];

                const defaultTypeMetadata: TypeMetadata = {
                  type: "any",
                  type_args: [],
                  optional: false
                };

                let resolvedType: TypeMetadata = (dynamicInputMeta as TypeMetadata) || defaultTypeMetadata;

                if (incoming && !dynamicInputMeta) {
                  const sourceNode = findNode(incoming.source);
                  if (sourceNode) {
                    const sourceMeta = getMetadata(sourceNode.type || "");
                    const handle = sourceMeta
                      ? findOutputHandle(
                        sourceNode,
                        incoming.sourceHandle || "",
                        sourceMeta
                      )
                      : undefined;
                    if (handle?.type) {
                      resolvedType = handle.type;
                    }
                  }
                }

                const isFalNode = selectedNode.type === "fal.DynamicFal" ||
                  selectedNode.type === DYNAMIC_KIE_NODE_TYPE ||
                  selectedNode.type === "kie.DynamicKie";

                // Build property object with proper typing
                const property: Property = {
                  ...(dynamicInputMeta || {}),
                  name,
                  type: resolvedType as Property["type"],
                  required: false,
                };

                return (
                  <PropertyField
                    key={`inspector-dynamic-${name}-${selectedNode.id}`}
                    id={selectedNode.id}
                    value={value}
                    property={property}
                    propertyIndex={`dynamic-${index}`}
                    showHandle={false}
                    isInspector={true}
                    nodeType="inspector"
                    data={selectedNode.data}
                    layout=""
                    isDynamicProperty={true}
                    hideActionIcons={isFalNode}
                  />
                );
              }
            )}
          </ScrollArea>
        </Box>
        <div className="bottom"></div>
      </Box>
    </EditorUiProvider>
  );
};

export default React.memo(Inspector, () => {
  // Inspector has no props, so always prevent re-render
  return true;
});
