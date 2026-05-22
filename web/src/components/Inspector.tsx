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
import { InspectorHeaderActionsProvider } from "../contexts/InspectorPropertyHeaderContext";
import { canPromotePropertyToInputHandle } from "../utils/exposedInputs";
import { useExposedInputToggle } from "../hooks/nodes/useExposedInputToggle";
import usePropertyValidationStore from "../stores/PropertyValidationStore";

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
      position: "relative",
      width: "100%",
      minWidth: 0,
      "--property-visibility-toggle-size": "28px",
      "--property-reset-slot-size": "22px"
    },
    ".property-row.has-header-editor-actions": {
      "--property-reset-button-offset": "40px"
    },
    ".property-row .node-property": {
      width: "100%",
      minWidth: 0
    },
    ".property-row.has-visibility-toggle .property-label": {
      paddingRight:
        "calc(var(--property-reset-button-offset, 0px) + var(--property-reset-slot-size, 22px) + var(--property-visibility-toggle-size, 28px))"
    },
    ".property-row.has-visibility-toggle .property-visibility-toggle": {
      position: "absolute",
      top: 0,
      right:
        "calc(var(--property-reset-button-offset, 0px) + var(--property-reset-slot-size, 22px))",
      zIndex: 3,
      marginTop: 0
    },
    ".validation-banner": {
      margin: "0.5em 0 0.75em",
      padding: "0.5em 0.75em",
      borderLeft: `3px solid ${theme.vars.palette.error.main}`,
      backgroundColor: "var(--palette-error-overlay)",
      borderRadius: "2px",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.error.main
    },
    ".validation-banner .validation-banner-title": {
      fontWeight: 600,
      marginBottom: "0.25em",
      display: "flex",
      alignItems: "center",
      gap: "0.25em"
    },
    ".validation-banner .validation-banner-row": {
      display: "block",
      width: "100%",
      textAlign: "left",
      padding: "0.15em 0",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: "inherit",
      font: "inherit"
    },
    ".validation-banner .validation-banner-row:hover": {
      textDecoration: "underline"
    },
    ".validation-banner .validation-banner-row-property": {
      fontFamily: "var(--fontFamily2)",
      fontWeight: 600
    }
  });

interface ValidationErrorBannerProps {
  workflowId: string | undefined;
  nodeId: string;
}

const ValidationErrorBanner: React.FC<ValidationErrorBannerProps> = ({
  workflowId,
  nodeId
}) => {
  const errors = usePropertyValidationStore((state) => {
    if (!workflowId) return [];
    const prefix = `${workflowId}:${nodeId}:`;
    const out: { property: string; message: string }[] = [];
    for (const k in state.errors) {
      if (k.startsWith(prefix)) {
        out.push({
          property: k.slice(prefix.length),
          message: state.errors[k as `${string}:${string}:${string}`]
        });
      }
    }
    return out;
  });

  const handleScrollToField = useCallback((property: string) => {
    // Find the PropertyField inside the inspector and scroll it into view.
    const root = document.querySelector(".inspector");
    if (!root) return;
    const target = root.querySelector(
      `.node-property.has-validation-error[data-property="${CSS.escape(property)}"]`
    );
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // Fallback: scroll the banner itself into view (the message is here).
    const banner = root.querySelector(".validation-banner");
    if (banner instanceof HTMLElement) {
      banner.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (errors.length === 0) return null;

  return (
    <div className="validation-banner" role="alert">
      <div className="validation-banner-title">
        <WarningAmberOutlinedIcon fontSize="small" />
        {errors.length === 1 ? "1 issue" : `${errors.length} issues`} to fix
      </div>
      {errors.map((err) => (
        <button
          type="button"
          key={`${err.property}::${err.message}`}
          className="validation-banner-row"
          onClick={() => handleScrollToField(err.property)}
        >
          {err.property ? (
            <>
              <span className="validation-banner-row-property">{err.property}</span>
              {": "}
            </>
          ) : null}
          {err.message}
        </button>
      ))}
    </div>
  );
};

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
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);
  const { toggleExposedInput } = useExposedInputToggle();

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
            {/* Validation errors banner — surfaces every issue for this
                node so users see errors even when the field is on a handle
                that has no Inspector row (output slots, dynamic inputs,
                multi-edge list handles, graph-level issues). */}
            <ValidationErrorBanner
              workflowId={selectedNode.data.workflow_id}
              nodeId={selectedNode.id}
            />
            {/* Property list — every property gets the show-as-input
                toggle except those whose handle is already determined by
                metadata (inline rows or declared input_fields). */}
            {metadata.properties.map((property, index) => {
              if (property.json_schema_extra?.hidden_in_inspector === true) {
                return null;
              }
              const hasToggle = canPromotePropertyToInputHandle(
                metadata,
                property.name
              );
              const exposed = (selectedNode.data.exposedInputs ?? []).includes(
                property.name
              );
              const connected = connectedTargetHandles.has(property.name);
              const propertyRowClass = [
                "property-row",
                hasToggle && "has-visibility-toggle"
              ]
                .filter(Boolean)
                .join(" ");
              const visibilityToggle = hasToggle ? (
                <PropertyVisibilityToggle
                  exposed={exposed}
                  connected={connected}
                  onToggle={() =>
                    selectedNode &&
                    toggleExposedInput(selectedNode.id, property.name)
                  }
                />
              ) : null;
              return (
                <div
                  className={propertyRowClass}
                  key={`inspector-${property.name}-${selectedNode.id}`}
                >
                  <InspectorHeaderActionsProvider actions={visibilityToggle}>
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
                  </InspectorHeaderActionsProvider>
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
