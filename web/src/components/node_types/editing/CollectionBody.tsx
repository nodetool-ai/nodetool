/** @jsxImportSource @emotion/react */
/**
 * CollectionBody — bespoke body for `nodetool.control.Collection`.
 *
 * A curation tray: drop media in (from the asset panel, the OS / other apps,
 * or generation-history tiles), see it as a persistent grid, and stream each
 * item downstream. The collection is homogeneous — the first item locks the
 * type and mismatched drops are rejected.
 *
 * Items are stored on the `items` property as `{ type, uri, asset_id }` records
 * (the same value shape that flows over `output_update`), so they round-trip in
 * the saved graph and resolve on reload via their durable `asset_id`.
 */
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CollectionsBookmarkRoundedIcon from "@mui/icons-material/CollectionsBookmarkRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ClearAllRoundedIcon from "@mui/icons-material/ClearAllRounded";

import {
  FlexColumn,
  FlexRow,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  thinScrollbarStyles
} from "../../ui_primitives";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeStoreRef, useNodes } from "../../../contexts/NodeContext";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import { useAssetStore } from "../../../stores/AssetStore";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useDropZone } from "../../../lib/dragdrop/useDropZone";
import type { Asset } from "../../../stores/ApiTypes";
import {
  appendItems,
  assetToItem,
  collectionElementType,
  collectionType,
  readItems,
  type CollectionItem
} from "../../../utils/collectionItems";
import { COLLECTION_NODE_TYPE } from "../../../constants/nodeTypes";
import type { BespokeBodyProps } from "./bespokeRegistry";

export { COLLECTION_NODE_TYPE };

const styles = (theme: Theme) =>
  css({
    position: "relative",
    minHeight: 0,
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(SPACING.sm),
    padding: theme.spacing(SPACING.md),

    ".col-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(SPACING.sm),
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmaller
    },
    ".col-header .spacer": { flex: 1 },
    ".col-type": {
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: theme.vars.palette.primary.main
    },
    ".col-grid": {
      flex: "1 1 auto",
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
      gap: theme.spacing(SPACING.sm),
      alignContent: "start",
      borderRadius: BORDER_RADIUS.sm,
      transition: MOTION.background,
      ...thinScrollbarStyles(theme)
    },
    "&.drag-over .col-grid": {
      outline: `2px dashed ${theme.vars.palette.primary.main}`,
      outlineOffset: -2,
      backgroundColor: theme.vars.palette.action.hover
    },
    ".col-tile": {
      position: "relative",
      aspectRatio: "1 / 1",
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.background.default,
      border: `1px solid ${theme.vars.palette.divider}`,
      "& img, & video": {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block"
      }
    },
    ".col-fallback": {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.disabled,
      textAlign: "center",
      padding: theme.spacing(SPACING.xs),
      wordBreak: "break-word"
    },
    ".col-index": {
      position: "absolute",
      top: 2,
      left: 2,
      minWidth: 16,
      height: 16,
      padding: `0 ${theme.spacing(SPACING.xs)}`,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: theme.vars.palette.secondary.main,
      color: theme.vars.palette.secondary.contrastText,
      fontSize: theme.fontSizeSmaller,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".col-remove": {
      position: "absolute",
      top: 2,
      right: 2,
      opacity: 0,
      transition: MOTION.opacity
    },
    ".col-tile:hover .col-remove, .col-tile:focus-within .col-remove": {
      opacity: 1
    },
    ".col-empty": {
      gridColumn: "1 / -1",
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(SPACING.sm),
      textAlign: "center",
      color: theme.vars.palette.text.disabled,
      fontSize: theme.fontSizeSmaller,
      padding: theme.spacing(SPACING.lg),
      border: `1px dashed ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm
    }
  });

const Thumb: React.FC<{ item: CollectionItem }> = ({ item }) => {
  const uri = typeof item.uri === "string" ? item.uri : "";
  const alt = item.name ?? item.type;
  if (item.type === "image" && uri) {
    return <img src={uri} alt={alt} draggable={false} />;
  }
  if (item.type === "video" && uri) {
    return (
      <video
        src={`${uri}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        draggable={false}
        aria-label={alt}
      />
    );
  }
  return <div className="col-fallback">{item.name ?? item.type}</div>;
};

const CollectionBodyInner: React.FC<BespokeBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const isRunning = status === "running";

  const storeRef = useNodeStoreRef();
  const { setProperty } = useBespokePropertyWriter({ nodeId: id, nodeType });
  const uploadAsset = useAssetUpload((s) => s.uploadAsset);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const items = useMemo(
    () => readItems(data.properties?.items),
    [data.properties?.items]
  );
  const lockedType = collectionType(items);

  // Narrow the `output` handle to the collection's media type (image/video/
  // audio) so its color, tooltip, and connection validation reflect what it
  // emits. Persisted on `dynamic_outputs.output` and read back by the
  // output-type-inference registry (same mechanism as Get Variable).
  const updateNodeData = useNodes((s) => s.updateNodeData, shallow);
  useEffect(() => {
    const desired = collectionElementType(items);
    const current = data.dynamic_outputs?.output;
    if (desired) {
      if (current?.type === desired.type) return;
      updateNodeData(id, {
        dynamic_outputs: { ...(data.dynamic_outputs ?? {}), output: desired }
      });
    } else {
      if (!current) return;
      const next = { ...(data.dynamic_outputs ?? {}) };
      delete next.output;
      updateNodeData(id, { dynamic_outputs: next });
    }
  }, [id, items, data.dynamic_outputs, updateNodeData]);

  /** Read the freshest items from the store (async drops can race the prop). */
  const currentItems = useCallback((): CollectionItem[] => {
    const node = storeRef.getState().findNode(id);
    return readItems(node?.data?.properties?.items);
  }, [id, storeRef]);

  const addItems = useCallback(
    (incoming: CollectionItem[]) => {
      const result = appendItems(currentItems(), incoming);
      if (result.ok) {
        setProperty("items", result.items);
        return;
      }
      if (result.reason === "type-mismatch") {
        addNotification({
          type: "warning",
          content: `Collection only accepts "${result.expected}" items.`,
          dedupeKey: `collection-type-${id}`
        });
      }
    },
    [addNotification, currentItems, id, setProperty]
  );

  const removeAt = useCallback(
    (index: number) => {
      const next = currentItems().filter((_, i) => i !== index);
      setProperty("items", next);
    },
    [currentItems, setProperty]
  );

  const clear = useCallback(() => setProperty("items", []), [setProperty]);

  const handleAsset = useCallback(
    (asset: Asset) => {
      const item = assetToItem(asset);
      if (item) addItems([item]);
    },
    [addItems]
  );

  const dropProps = useDropZone({
    accepts: ["asset", "assets-multiple", "file"],
    activeClassName: "drag-over",
    onDrop: async (dragData) => {
      if (dragData.type === "asset") {
        handleAsset(dragData.payload as Asset);
        return;
      }
      if (dragData.type === "assets-multiple") {
        const ids = dragData.payload as string[];
        const get = useAssetStore.getState().get;
        const assets = await Promise.all(
          ids.map((assetId) => get(assetId).catch(() => undefined))
        );
        const collected = assets
          .filter((a): a is Asset => Boolean(a))
          .map(assetToItem)
          .filter((i): i is CollectionItem => Boolean(i));
        if (collected.length > 0) addItems(collected);
        return;
      }
      if (dragData.type === "file") {
        uploadAsset({
          file: dragData.payload as File,
          workflow_id: workflowId,
          source: "file",
          onCompleted: handleAsset
        });
      }
    }
  });

  return (
    <div css={styles(theme)} className={`nodrag ${dropProps.className ?? ""}`}>
      <div className="col-header">
        <CollectionsBookmarkRoundedIcon
          sx={{ fontSize: "var(--fontSizeSmall)" }}
        />
        <span>
          {items.length === 0
            ? "Collection"
            : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </span>
        {lockedType ? <span className="col-type">{lockedType}</span> : null}
        <span className="spacer" />
        {items.length > 0 ? (
          <ToolbarIconButton
            ariaLabel="Clear collection"
            tooltip="Clear collection"
            onClick={clear}
          >
            <ClearAllRoundedIcon fontSize="inherit" />
          </ToolbarIconButton>
        ) : null}
      </div>

      <div
        className="col-grid nowheel"
        onDragEnter={dropProps.onDragEnter}
        onDragOver={dropProps.onDragOver}
        onDragLeave={dropProps.onDragLeave}
        onDrop={dropProps.onDrop}
        data-dropzone={dropProps["data-dropzone"]}
      >
        {items.length === 0 ? (
          <div className="col-empty">
            <span>Drop assets here</span>
            <span>from the asset panel, files, or generation history</span>
          </div>
        ) : (
          items.map((item, i) => (
            <div
              className="col-tile"
              key={item.asset_id ?? item.uri ?? `${item.type}-${i}`}
            >
              <Thumb item={item} />
              <span className="col-index">{i + 1}</span>
              <span className="col-remove">
                <ToolbarIconButton
                  ariaLabel={`Remove item ${i + 1}`}
                  tooltip="Remove"
                  onClick={() => removeAt(i)}
                >
                  <CloseRoundedIcon fontSize="inherit" />
                </ToolbarIconButton>
              </span>
            </div>
          ))
        )}
      </div>

      {!isOutputNode && (
        <FlexColumn gap={0}>
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </FlexColumn>
      )}
      {isRunning && (
        <FlexRow>
          <NodeProgress id={id} workflowId={workflowId} />
        </FlexRow>
      )}
    </div>
  );
};

export default memo(CollectionBodyInner);
