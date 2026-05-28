/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import PropertyField from "./node/PropertyField";
import useMetadataStore from "../stores/MetadataStore";
import { useNodes } from "../contexts/NodeContext";
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
  CopyButton,
  EditorButton,
  ScrollArea,
  Text,
  Tooltip,
  Box
} from "./ui_primitives";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { TOOLTIP_ENTER_DELAY } from "../config/constants";
import FalPricingFooter from "./node/FalPricingFooter";
import KieCreditsFooter from "./node/KieCreditsFooter";
import { isKieNodeMetadata } from "../utils/isKieNode";
import { DYNAMIC_KIE_NODE_TYPE } from "./node/DynamicKieSchemaNode";
import PropertyVisibilityToggle from "./properties/PropertyVisibilityToggle";
import { InspectorHeaderActionsProvider } from "../contexts/InspectorPropertyHeaderContext";
import { canConfigureExposedPlacement } from "../utils/exposedInputs";
import { useExposedInputToggle } from "../hooks/nodes/useExposedInputToggle";
import usePropertyValidationStore from "../stores/PropertyValidationStore";
import { useStoreWithEqualityFn } from "zustand/traditional";
import RunSelectedNodesSection from "./inspector/RunSelectedNodesSection";
import { IconForType, colorForType } from "../config/data_types";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "grid",
      gridTemplateRows: "auto auto 1fr auto",
      gridTemplateColumns: "100%",
      backgroundColor: theme.vars.palette.background.default,
      padding: "0",
      width: "100%",
      maxWidth: "500px",
      height: "100%",
      overflow: "hidden"
    },

    /* ---------- Head: icon + title + namespace + close ---------- */
    ".inspector-head": {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: theme.spacing(1.5),
      padding: `${theme.spacing(2.5)} ${theme.spacing(4)} ${theme.spacing(2)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".inspector-head-icon": {
      width: 32,
      height: 32,
      borderRadius: "var(--rounded-md)",
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
      backgroundColor:
        "var(--inspector-icon-tint, rgba(102,144,212,0.22))",
      "& .icon-container": {
        width: 16,
        height: 16
      },
      "& .icon-container svg, & svg": {
        width: 16,
        height: 16,
        fontSize: 16
      }
    },
    ".inspector-head-text": {
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 0
    },
    ".inspector-title": {
      fontFamily: theme.fontFamily1,
      fontSize: "1.0625rem",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.2,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      userSelect: "text"
    },
    ".inspector-namespace": {
      display: "inline-flex",
      alignItems: "center",
      gap: "2px",
      minWidth: 0,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      letterSpacing: "0.01em"
    },
    ".inspector-namespace-button": {
      background: "transparent",
      border: "none",
      padding: 0,
      cursor: "pointer",
      color: "inherit",
      font: "inherit",
      minWidth: 0,
      display: "inline-flex",
      alignItems: "center"
    },
    ".inspector-namespace-text": {
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "26ch"
    },
    ".inspector-namespace .copy-button": {
      width: 16,
      height: 16,
      padding: 0,
      opacity: 0.55,
      "&:hover": { opacity: 1, backgroundColor: "transparent" },
      "& svg": { fontSize: "0.75rem" }
    },
    ".inspector-head-close": {
      paddingTop: "2px"
    },

    /* ---------- Tabs ---------- */
    ".inspector-tabs": {
      display: "flex",
      alignItems: "stretch",
      gap: 0,
      padding: `0 ${theme.spacing(4)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default
    },
    ".inspector-tab": {
      position: "relative",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      padding: `${theme.spacing(1.25)} ${theme.spacing(1.5)} ${theme.spacing(1.25)} 0`,
      marginRight: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      letterSpacing: "-0.005em",
      lineHeight: 1.2,
      display: "inline-flex",
      alignItems: "baseline",
      gap: "6px",
      transition: "color 120ms ease",
      "&:hover": { color: theme.vars.palette.text.primary },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: 2
      }
    },
    ".inspector-tab .tab-count": {
      fontFamily: theme.fontFamily2,
      fontSize: "0.7rem",
      color: theme.vars.palette.text.disabled,
      fontVariantNumeric: "tabular-nums"
    },
    ".inspector-tab.is-active": {
      color: theme.vars.palette.text.primary
    },
    ".inspector-tab.is-active::after": {
      content: '""',
      position: "absolute",
      left: 0,
      right: theme.spacing(1.5),
      bottom: -1,
      height: 2,
      backgroundColor: theme.vars.palette.primary.main,
      borderRadius: 2
    },
    ".inspector-tab.is-active .tab-count": {
      color: theme.vars.palette.primary.main
    },

    /* ---------- Scrolling tab body ---------- */
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
      gap: theme.spacing(2.5),
      width: "100%",
      height: "100%",
      padding: theme.spacing(4)
    },
    ".top-content.tab-params": {
      paddingLeft: `calc(${theme.spacing(3)} - 2px)`
    },
    ".top-content > .node-property": {
      display: "contents"
    },

    /* ---------- Property rows ---------- */
    ".property-row": {
      width: "100%",
      minWidth: 0
    },
    ".property-row .node-property": {
      width: "100%",
      minWidth: 0
    },
    ".property-row .property-label label": {
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      fontWeight: 400,
      letterSpacing: "-0.005em",
      textTransform: "none"
    },
    ".property-row .inspector-header-toolbar.inspector-toolbar-hoverable .MuiIconButton-root, .property-row .inspector-header-toolbar.inspector-toolbar-hoverable .MuiButtonBase-root":
      {
        opacity: 0,
        transition: "opacity 120ms ease"
      },
    ".property-row:hover .inspector-header-toolbar.inspector-toolbar-hoverable .MuiIconButton-root, .property-row:hover .inspector-header-toolbar.inspector-toolbar-hoverable .MuiButtonBase-root, .property-row .inspector-header-toolbar.inspector-toolbar-hoverable:focus-within .MuiIconButton-root, .property-row .inspector-header-toolbar.inspector-toolbar-hoverable:focus-within .MuiButtonBase-root":
      {
        opacity: 1
      },
    ".property-required-badge": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.625rem",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.disabled,
      padding: "0 4px",
      userSelect: "none"
    },
    ".property-required-badge.is-required": {
      color: theme.vars.palette.warning.main,
      opacity: 0.85
    },

    /* ---------- Multi-select row ---------- */
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
    ".mixed-indicator": {
      display: "inline-flex",
      flex: "0 0 auto",
      alignItems: "center",
      marginTop: "0.15em",
      color: theme.vars.palette.warning.main
    },

    /* ---------- Validation banner ---------- */
    ".validation-banner": {
      padding: "0.5em 0.75em",
      border: `1px solid ${theme.vars.palette.error.main}`,
      backgroundColor: "var(--palette-error-overlay)",
      borderRadius: "var(--rounded-md)",
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
    },

    /* ---------- I/O tab ---------- */
    ".io-section + .io-section": {
      marginTop: theme.spacing(2)
    },
    ".io-section-title": {
      fontFamily: theme.fontFamily1,
      fontSize: "0.6875rem",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      marginBottom: theme.spacing(1)
    },
    ".io-row": {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: theme.spacing(1),
      alignItems: "center",
      padding: `${theme.spacing(0.75)} 0`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": { borderBottom: "none" }
    },
    ".io-row-name": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".io-row-type": {
      fontFamily: theme.fontFamily2,
      fontSize: "0.6875rem",
      letterSpacing: "0.02em",
      color: theme.vars.palette.text.secondary,
      padding: "2px 6px",
      borderRadius: "var(--rounded-sm)",
      backgroundColor: "rgba(255,255,255,0.04)"
    },

    /* ---------- Help tab ---------- */
    ".help-section": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(3)
    },
    ".help-description": {
      fontSize: theme.fontSizeNormal,
      lineHeight: 1.65,
      color: theme.vars.palette.text.primary,
      whiteSpace: "pre-wrap",
      maxWidth: "65ch"
    },
    ".help-tags": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.75)
    },
    ".help-tag": {
      fontFamily: theme.fontFamily2,
      fontSize: "0.6875rem",
      letterSpacing: "0.02em",
      color: theme.vars.palette.text.secondary,
      padding: "2px 8px",
      borderRadius: "var(--rounded-pill)",
      backgroundColor: "rgba(255,255,255,0.04)",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    ".help-meta": {
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      paddingTop: theme.spacing(0.5)
    },
    ".help-meta-row": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: theme.spacing(2),
      padding: `${theme.spacing(1.25)} 0`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      fontSize: theme.fontSizeSmall,
      "&:last-child": { borderBottom: "none" }
    },
    ".help-meta-key": {
      color: theme.vars.palette.text.secondary,
      letterSpacing: "0.01em",
      flexShrink: 0
    },
    ".help-meta-value": {
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily2,
      textAlign: "right",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0
    },

    /* ---------- Empty / placeholder tabs ---------- */
    ".tab-empty": {
      padding: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      textAlign: "center"
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
  const errors = useStoreWithEqualityFn(
    usePropertyValidationStore,
    (state) => {
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
    },
    isEqual
  );

  const handleScrollToField = useCallback((property: string) => {
    const root = document.querySelector(".inspector");
    if (!root) return;
    const target = root.querySelector(
      `.node-property.has-validation-error[data-property="${CSS.escape(property)}"]`
    );
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
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

type InspectorTab = "params" | "io" | "help";

const TAB_DEFS: { value: InspectorTab; label: string; hasCount: boolean }[] = [
  { value: "params", label: "Params", hasCount: true },
  { value: "io", label: "I/O", hasCount: true },
  { value: "help", label: "Help", hasCount: false }
];

interface InspectorTabsProps {
  active: InspectorTab;
  onChange: (next: InspectorTab) => void;
  counts: Partial<Record<InspectorTab, number>>;
}

const InspectorTabs: React.FC<InspectorTabsProps> = ({
  active,
  onChange,
  counts
}) => (
  <div className="inspector-tabs" role="tablist">
    {TAB_DEFS.map((tab) => {
      const count = counts[tab.value];
      const isActive = active === tab.value;
      return (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={isActive}
          className={`inspector-tab${isActive ? " is-active" : ""}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.hasCount && typeof count === "number" ? (
            <span className="tab-count">{count}</span>
          ) : null}
        </button>
      );
    })}
  </div>
);

const TypeLabel: React.FC<{ type?: TypeMetadata | null }> = ({ type }) => {
  const label = type?.type ?? "any";
  return <span className="io-row-type">{label}</span>;
};

const Inspector: React.FC = () => {
  // Use selector directly instead of calling getSelectedNodes() to avoid filtering on every store update
  const selectedNodes = useNodes(
    (state) => state.nodes.filter((node) => node.selected),
    areNodesEqualIgnoringPosition
  );
  const findNode = useNodes((state) => state.findNode);
  const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
  const setSelectedNodes = useNodes((state) => state.setSelectedNodes);
  const { cycleExposedInputPlacement, getPlacement } = useExposedInputToggle();

  const selectedNodeIds = useMemo(
    () => new Set(selectedNodes.map((node) => node.id)),
    [selectedNodes]
  );

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
          metadata: node.type ? getMetadata(node.type) : null
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
    const otherPropertySignatures = new Set<string>();
    for (const { metadata } of rest) {
      for (const prop of metadata.properties) {
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

  const selectedNode = selectedNodes[0] || null;
  const metadata = selectedNode?.type
    ? getMetadata(selectedNode.type)
    : null;

  // --- Header identity (icon + tint) -------------------------------------
  const iconType = useMemo(() => {
    return (
      metadata?.outputs?.[0]?.type?.type ??
      metadata?.properties?.[0]?.type?.type ??
      "any"
    );
  }, [metadata]);

  const iconTintStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!metadata) return undefined;
    const color = colorForType(iconType);
    if (!color) return undefined;
    return {
      ["--inspector-icon-tint" as string]: `${color}40`
    } as React.CSSProperties;
  }, [metadata, iconType]);

  // --- Tabs --------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<InspectorTab>("params");

  // Reset tab when the focused node changes so we don't strand the user
  // on Help/Cache from a previous node.
  useEffect(() => {
    setActiveTab("params");
  }, [selectedNode?.id]);

  const handleNamespaceClick = useCallback(
    (e: React.MouseEvent) => {
      if (!metadata?.namespace) {
        return;
      }
      e.stopPropagation();
      useNodeMenuStore.getState().openNodeMenu({
        x: e.clientX,
        y: e.clientY,
        selectedPath: metadata.namespace.split(".")
      });
    },
    [metadata?.namespace]
  );

  // Connected target-handle names for the focused node.
  const connectedTargetHandles = useMemo(() => {
    if (!selectedNode) {
      return new Set<string>();
    }
    return new Set(
      edges
        .filter(
          (edge): edge is typeof edge & { targetHandle: string } =>
            edge.target === selectedNode.id && typeof edge.targetHandle === "string"
        )
        .map((edge) => edge.targetHandle)
    );
  }, [edges, selectedNode]);

  const visibleProperties = useMemo(() => {
    if (!metadata) return [];
    return metadata.properties.filter(
      (p) => p.json_schema_extra?.hidden_in_inspector !== true
    );
  }, [metadata]);

  const tabCounts = useMemo(() => {
    if (!metadata) return {};
    return {
      params: visibleProperties.length,
      io:
        (metadata.properties?.length ?? 0) +
        (metadata.outputs?.length ?? 0)
    } as Partial<Record<InspectorTab, number>>;
  }, [metadata, visibleProperties.length]);

  if (selectedNodes.length === 0) {
    return null;
  }

  if (isMultiSelect) {
    if (!metadataCoverageMatches) {
      return (
        <Box className="inspector" css={inspectorStyles}>
          <div className="inspector-head">
            <div className="inspector-head-text">
              <div className="inspector-title">
                {selectedNodes.length} nodes selected
              </div>
              <div className="inspector-namespace">
                <span className="inspector-namespace-text">
                  Metadata unavailable for some nodes
                </span>
              </div>
            </div>
            <div className="inspector-head-close">
              <CloseButton
                onClick={handleInspectorClose}
                tooltip="Close inspector"
                buttonSize="small"
                nodrag={false}
              />
            </div>
          </div>
        </Box>
      );
    }

    return (
      <EditorUiProvider scope="inspector">
        <Box className="inspector" css={inspectorStyles}>
          <div className="inspector-head">
            <div className="inspector-head-text">
              <div className="inspector-title">
                {selectedNodes.length} nodes selected
              </div>
              <div className="inspector-namespace">
                <span className="inspector-namespace-text">
                  Editing shared properties
                </span>
              </div>
            </div>
            <div className="inspector-head-close">
              <CloseButton
                onClick={handleInspectorClose}
                tooltip="Close inspector"
                buttonSize="small"
                nodrag={false}
              />
            </div>
          </div>
          <div />
          <Box className="top">
            <ScrollArea className="top-content" direction="vertical">
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
                      nodeType={nodesWithMetadata[0].node.type ?? "inspector"}
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
          <div className="bottom">
            <RunSelectedNodesSection />
          </div>
        </Box>
      </EditorUiProvider>
    );
  }

  if (!selectedNode) {
    return null;
  }

  if (!metadata) {
    return <Text size="small" color="secondary">No metadata available for this node</Text>;
  }

  return (
    <EditorUiProvider scope="inspector">
      <Box className="inspector" css={inspectorStyles}>
        {/* HEAD: icon + title + namespace + close */}
        <div className="inspector-head">
          <div className="inspector-head-icon" style={iconTintStyle}>
            <IconForType
              iconName={iconType}
              showTooltip={false}
              iconSize="small"
            />
          </div>
          <div className="inspector-head-text">
            <div className="inspector-title" title={metadata.title}>
              {metadata.title}
            </div>
            {metadata.namespace ? (
              <div className="inspector-namespace">
                <Tooltip
                  delay={TOOLTIP_ENTER_DELAY}
                  title="Browse this namespace in the node menu"
                  placement="bottom-start"
                >
                  <button
                    type="button"
                    onClick={handleNamespaceClick}
                    className="inspector-namespace-button"
                  >
                    <span className="inspector-namespace-text">
                      {metadata.namespace}
                    </span>
                  </button>
                </Tooltip>
                <CopyButton
                  value={metadata.namespace}
                  tooltip="Copy namespace"
                  buttonSize="small"
                />
              </div>
            ) : null}
          </div>
          <div className="inspector-head-close">
            <CloseButton
              onClick={handleInspectorClose}
              tooltip="Close inspector"
              buttonSize="small"
              nodrag={false}
            />
          </div>
        </div>

        {/* TABS */}
        <InspectorTabs
          active={activeTab}
          onChange={setActiveTab}
          counts={tabCounts}
        />

        {/* TAB BODY */}
        <Box className="top">
          <ScrollArea
            className={`top-content${activeTab === "params" ? " tab-params" : ""}`}
            direction="vertical"
          >
            {activeTab === "params" && (
              <>
                {metadata.fal_unit_pricing ? (
                  <FalPricingFooter
                    metadata={metadata}
                    selected
                    variant="inline"
                    popoverResetDep={selectedNode.id}
                  />
                ) : null}
                {isKieNodeMetadata(metadata) ? (
                  <KieCreditsFooter
                    metadata={metadata}
                    selected
                    variant="inline"
                    nodeId={selectedNode.id}
                    workflowId={selectedNode.data.workflow_id}
                    popoverResetDep={selectedNode.id}
                  />
                ) : null}
                <ValidationErrorBanner
                  workflowId={selectedNode.data.workflow_id}
                  nodeId={selectedNode.id}
                />
                {visibleProperties.map((property, index) => {
                  const hasToggle = canConfigureExposedPlacement(
                    metadata,
                    property.name
                  );
                  const exposurePlacement = getPlacement(
                    selectedNode.id,
                    property.name
                  );
                  const connected = connectedTargetHandles.has(property.name);
                  const visibilityToggle = hasToggle ? (
                    <PropertyVisibilityToggle
                      placement={exposurePlacement}
                      connected={connected}
                      onToggle={() =>
                        selectedNode &&
                        cycleExposedInputPlacement(
                          selectedNode.id,
                          property.name
                        )
                      }
                    />
                  ) : null;
                  const headerActions = property.required ? (
                    <>
                      <span className="property-required-badge is-required">
                        Required
                      </span>
                      {visibilityToggle}
                    </>
                  ) : (
                    visibilityToggle
                  );
                  return (
                    <div
                      className="property-row"
                      key={`inspector-${property.name}-${selectedNode.id}`}
                    >
                      <InspectorHeaderActionsProvider actions={headerActions}>
                        <PropertyField
                          id={selectedNode.id}
                          value={selectedNode.data.properties[property.name]}
                          property={property}
                          propertyIndex={index.toString()}
                          showHandle={false}
                          isInspector={true}
                          nodeType={selectedNode.type ?? "inspector"}
                          data={selectedNode.data}
                          layout=""
                        />
                      </InspectorHeaderActionsProvider>
                    </div>
                  );
                })}

                {Object.entries(selectedNode.data.dynamic_properties || {}).map(
                  ([name, value], index) => {
                    const incoming = edges.find(
                      (edge) =>
                        edge.target === selectedNode.id &&
                        edge.targetHandle === name
                    );

                    const dynamicInputMeta =
                      selectedNode.data.dynamic_inputs?.[name];

                    const defaultTypeMetadata: TypeMetadata = {
                      type: "any",
                      type_args: [],
                      optional: false
                    };

                    let resolvedType: TypeMetadata =
                      (dynamicInputMeta as TypeMetadata) || defaultTypeMetadata;

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

                    const isFalNode =
                      selectedNode.type === "fal.DynamicFal" ||
                      selectedNode.type === DYNAMIC_KIE_NODE_TYPE ||
                      selectedNode.type === "kie.DynamicKie";

                    const property: Property = {
                      ...(dynamicInputMeta || {}),
                      name,
                      type: resolvedType as Property["type"],
                      required: false
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
                        nodeType={selectedNode.type ?? "inspector"}
                        data={selectedNode.data}
                        layout=""
                        isDynamicProperty={true}
                        hideActionIcons={isFalNode}
                      />
                    );
                  }
                )}
              </>
            )}

            {activeTab === "io" && (
              <>
                <div className="io-section">
                  <div className="io-section-title">
                    Inputs ({metadata.properties.length})
                  </div>
                  {metadata.properties.length === 0 ? (
                    <Caption size="smaller" color="muted">
                      No inputs.
                    </Caption>
                  ) : (
                    metadata.properties.map((property) => (
                      <div key={`io-in-${property.name}`} className="io-row">
                        <span className="io-row-name">{property.name}</span>
                        <TypeLabel type={property.type as TypeMetadata} />
                      </div>
                    ))
                  )}
                </div>
                <div className="io-section">
                  <div className="io-section-title">
                    Outputs ({metadata.outputs.length})
                  </div>
                  {metadata.outputs.length === 0 ? (
                    <Caption size="smaller" color="muted">
                      No outputs.
                    </Caption>
                  ) : (
                    metadata.outputs.map((output) => (
                      <div key={`io-out-${output.name}`} className="io-row">
                        <span className="io-row-name">{output.name}</span>
                        <TypeLabel type={output.type as TypeMetadata} />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeTab === "help" && (
              <div className="help-section">
                {(() => {
                  const raw = (metadata.description || "").trim();
                  if (!raw) {
                    return (
                      <Caption size="smaller" color="muted">
                        No description provided for this node.
                      </Caption>
                    );
                  }
                  // Description bodies are conventionally `<paragraph>\n<tags>`.
                  // Detect a trailing comma-separated keyword line so we can
                  // present it as chips instead of crammed text.
                  const lines = raw.split(/\n+/);
                  const last = lines[lines.length - 1] || "";
                  const looksLikeTags =
                    lines.length > 1 &&
                    /,/.test(last) &&
                    last.length <= 120 &&
                    !/[.!?]\s*$/.test(last);
                  const body = looksLikeTags ? lines.slice(0, -1).join("\n\n") : raw;
                  const tags = looksLikeTags
                    ? last.split(",").map((t) => t.trim()).filter(Boolean)
                    : [];
                  return (
                    <>
                      <div className="help-description">{body}</div>
                      {tags.length > 0 ? (
                        <div className="help-tags">
                          {tags.map((tag) => (
                            <span key={tag} className="help-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
                <div className="help-meta">
                  <div className="help-meta-row">
                    <span className="help-meta-key">Type</span>
                    <span
                      className="help-meta-value"
                      title={metadata.node_type}
                    >
                      {metadata.node_type}
                    </span>
                  </div>
                  <div className="help-meta-row">
                    <span className="help-meta-key">Namespace</span>
                    <span className="help-meta-value" title={metadata.namespace}>
                      {metadata.namespace}
                    </span>
                  </div>
                  {metadata.supports_dynamic_inputs ? (
                    <div className="help-meta-row">
                      <span className="help-meta-key">Dynamic</span>
                      <span className="help-meta-value">yes</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </ScrollArea>
        </Box>

        <div className="bottom">
          <RunSelectedNodesSection />
        </div>
      </Box>
    </EditorUiProvider>
  );
};

export default React.memo(Inspector, () => {
  // Inspector has no props, so always prevent re-render
  return true;
});
