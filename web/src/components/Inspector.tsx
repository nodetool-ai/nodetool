/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo } from "react";
import PropertyField from "./node/PropertyField";
import { Box, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../stores/NodeMenuStore";
import useMetadataStore from "../stores/MetadataStore";
import { useNodes } from "../contexts/NodeContext";
import NodeDescription from "./node/NodeDescription";
import NodeExplorer from "./node/NodeExplorer";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import { findOutputHandle } from "../utils/handleUtils";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { typesAreEqual } from "../utils/TypeHandler";
import isEqual from "lodash/isEqual";
import { EditorUiProvider } from "./editor_ui";
import { CloseButton, EditorButton } from "./ui_primitives";
import PanelHeadline from "./ui/PanelHeadline";

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
      gap: "10px",
      width: "100%",
      height: "100%",
      padding: "0.5em",
      overflowY: "auto",
      overflowX: "hidden",
      transformOrigin: "top left"
    },
    ".inspector-header h5": {
      margin: ".5em 0 .5em 0"
    },
    ".bottom": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      width: "100%",
      maxHeight: "20vh",
      padding: "0.5em "
    },
    ".inspector-header": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      width: "100%",
      padding: "0 0 0.5em 0",
      margin: 0,
      marginBottom: "1em"
    },
    ".inspector-header .header-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5em"
    },
    ".title": {
      width: "100%",
      userSelect: "none",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal
    },
    ".description": {
      color: "var(--palette-grey-100)",
      fontSize: theme.fontSizeSmall,
      paddingRight: "0.5em",
      maxHeight: "400px",
      marginTop: "auto",
      overflowY: "auto"
    },
    ".namespace": {
      justifyContent: "center",
      overflowY: "auto",
      marginBottom: ".75em",
      width: "100%",
      textAlign: "center",
      overflow: "hidden",
      wordBreak: "break-word",
      lineHeight: "1.25em",
      color: "var(--palette-primary-main)",
      textTransform: "uppercase",
      fontSize: theme.fontSizeSmaller
    },
    ".multi-property-row": {
      display: "flex",
      position: "relative",
      alignItems: "flex-start",
      gap: "0.5em"
    },
    ".mixed-indicator": {
      display: "inline-flex",
      position: "absolute",
      zIndex: theme.zIndex.tooltip,
      right: "2em",
      top: "-0.1em",
      alignItems: "center",
      color: theme.vars.palette.warning.main
    },
    ".close-button": {
      position: "absolute",
      right: "0.5em",
      top: "0.5em"
    }
  });

const Inspector: React.FC = () => {
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const findNode = useNodes((state) => state.findNode);
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);
  // Only subscribe to edges that are connected to the selected node (for dynamic properties)
  // Use shallow equality to avoid re-renders when unrelated edges change
  const edges = useNodes((state) => state.edges);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const theme = useTheme();
  const inspectorStyles = styles(theme);
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
    return first.metadata.properties.filter((property) =>
      rest.every(({ metadata }) =>
        metadata.properties.some(
          (candidate) =>
            candidate.name === property.name &&
            typesAreEqual(candidate.type, property.type)
        )
      )
    );
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
    (propertyName: string, value: any) => {
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

  const handleOpenNodeMenu = useCallback(() => {
    if (!metadata) {return;}
    openNodeMenu({
      x: 500,
      y: 200,
      dropType: metadata.namespace
    });
  }, [openNodeMenu, metadata]);

  const handleTagClick = useCallback((tag: string) => {
    openNodeMenu({
      x: 500,
      y: 200,
      searchTerm: tag
    });
  }, [openNodeMenu]);

  if (selectedNodes.length === 0) {
    return (
      <EditorUiProvider scope="inspector">
        <Box className="inspector" css={inspectorStyles}>
          <Box className="top">
            <Box className="top-content">
              <NodeExplorer />
            </Box>
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
            <Box className="top-content">
              <Typography>
                Metadata is not available for all selected nodes.
              </Typography>
            </Box>
          </Box>
        </Box>
      );
    }

    return (
      <EditorUiProvider scope="inspector">
        <Box className="inspector" css={inspectorStyles}>
          <Box className="top">
            <Box className="top-content">
              <div className="inspector-header">
                <PanelHeadline
                  title="Inspector"
                  actions={
                    <CloseButton
                      onClick={handleInspectorClose}
                      tooltip="Close inspector"
                      buttonSize="small"
                      nodrag={false}
                    />
                  }
                />
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
                    {isMixed && (
                      <Tooltip
                        title="Mixed values across the selected nodes"
                        placement="top-start"
                      >
                        <span className="mixed-indicator">
                          <WarningAmberOutlinedIcon fontSize="small" />
                        </span>
                      </Tooltip>
                    )}
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
                      onValueChange={(newValue) =>
                        handleMultiPropertyChange(property.name, newValue)
                      }
                    />
                  </div>
                ))
              ) : (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ padding: "0.25em 0" }}
                >
                  No shared editable properties across the selected nodes.
                </Typography>
              )}
            </Box>
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
          <Box className="top-content">
            <Box className="inspector-header">
              <PanelHeadline title="Inspector" />
              <Typography variant="body2" color="text.secondary">
                Select nodes to edit
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box className="bottom"></Box>
      </Box>
    );
  }

  if (!metadata) {
    return <Typography>No metadata available for this node</Typography>;
  }

  return (
    <EditorUiProvider scope="inspector">
      <Box className="inspector" css={inspectorStyles}>
        <Box className="top">
          <Box className="top-content">
            <div className="inspector-header">
              <PanelHeadline
                title="Inspector"
                actions={
                  <CloseButton
                    onClick={handleInspectorClose}
                    tooltip="Close inspector"
                    buttonSize="small"
                    nodrag={false}
                  />
                }
              />
              <div className="header-row">
                <div className="title">{metadata.title}</div>
              </div>
            </div>
            {/* Base properties */}
            {metadata.properties.map((property, index) => (
              <PropertyField
                key={`inspector-${property.name}-${selectedNode.id}`}
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
            ))}

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

                let resolvedType: TypeMetadata = (dynamicInputMeta as TypeMetadata) || {
                  type: "any",
                  type_args: [],
                  optional: false
                } as any;

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

                const isFalNode = selectedNode.type === "fal.dynamic_schema.FalAI";

                return (
                  <PropertyField
                    key={`inspector-dynamic-${name}-${selectedNode.id}`}
                    id={selectedNode.id}
                    value={value}
                    property={{
                      ...dynamicInputMeta,
                      name,
                      type: resolvedType,
                    } as any}
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
          </Box>
        </Box>
        <div className="bottom">
          <NodeDescription
            className="description"
            description={metadata.description}
            onTagClick={handleTagClick}
          />
          <Tooltip title="Show in NodeMenu" placement="top-start">
            <EditorButton
              variant="outlined"
              sx={{
                padding: ".5em"
              }}
              className="namespace"
              onClick={handleOpenNodeMenu}
              density="compact"
            >
              {metadata.namespace}
            </EditorButton>
          </Tooltip>
        </div>
      </Box>
    </EditorUiProvider>
  );
};

export default React.memo(Inspector, (_prevProps, _nextProps) => {
  // Inspector has no props, so always prevent re-render
  return true;
});
