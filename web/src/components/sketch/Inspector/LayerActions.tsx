/** @jsxImportSource @emotion/react */
/**
 * LayerActions
 *
 * Inspector action toolbar for a generated sketch layer. Mirrors
 * `ClipActions`, retargeted from clip → layer:
 *
 *   - Generate / Cancel — drives the bound workflow via `useGenerateLayer`.
 *   - Duplicate Linked  — server clone keeping the same workflow id.
 *   - Duplicate Variation — clones the workflow + layer for an independent take.
 *   - Lock / Unlock     — successful generations skip locked layers.
 *   - Revert            — clears the current asset back to draft.
 *   - Open in Node Editor — round-trips with `?from=sketch:{documentId}:{layerId}`.
 */

import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";

import { trpcClient } from "../../../trpc/client";
import { useSketchDocumentStore } from "../../../stores/sketch/SketchDocumentStore";
import {
  useSketchLayerBindingsStore,
  type LayerWorkflowBinding
} from "../../../stores/sketch/SketchLayerBindingsStore";
import { useSketchStore } from "../state/useSketchStore";
import { useGenerateLayer } from "../../../hooks/sketch/useGenerateLayer";
import { ToolbarIconButton, FlexRow, Toast } from "../../ui_primitives";

const actionsRowStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(0.5, 1),
    gap: theme.spacing(0.5),
    flexWrap: "wrap",
    alignItems: "center"
  });

const sectionLabelStyles = (theme: Theme) =>
  css({
    fontSize: 11,
    color: theme.vars.palette.text.secondary,
    userSelect: "none",
    paddingRight: theme.spacing(0.5)
  });

export interface LayerActionsProps {
  layerId: string;
  binding: LayerWorkflowBinding;
}

export const LayerActions: React.FC<LayerActionsProps> = memo(
  ({ layerId, binding }) => {
    const theme = useTheme();
    const navigate = useNavigate();

    const documentId = useSketchDocumentStore((s) => s.documentId);

    const setLocked = useSketchLayerBindingsStore((s) => s.setLocked);
    const upsertBinding = useSketchLayerBindingsStore((s) => s.upsertBinding);
    const revert = useSketchLayerBindingsStore((s) => s.revert);

    const addLayer = useSketchStore((s) => s.addLayer);
    const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
    const removeLayer = useSketchStore((s) => s.removeLayer);
    const layers = useSketchStore((s) => s.document.layers);

    const isLocked = binding.status === "locked";

    const { generateLayer, cancelLayerGeneration, isActive, isGenerating } =
      useGenerateLayer({
        binding: {
          documentId: documentId ?? "",
          layerId,
          workflowId: binding.workflowId,
          selectedOutputNodeId: binding.selectedOutputNodeId,
          paramOverrides: binding.paramOverrides,
          dependencyHash: binding.dependencyHash,
          locked: isLocked
        }
      });

    const variationBusyRef = useRef(false);
    const [variationBusy, setVariationBusy] = useState(false);
    const [variationError, setVariationError] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [linkedBusy, setLinkedBusy] = useState(false);

    const sourceName = layers.find((l) => l.id === layerId)?.name ?? "Layer";

    const handleDuplicateLinked = useCallback(async () => {
      if (!documentId || linkedBusy) {
        return;
      }
      setLinkedBusy(true);
      const newLayerId = addLayer(`${sourceName} (copy)`, "raster");
      try {
        const newBinding = await trpcClient.sketch.layers.duplicate.mutate({
          id: documentId,
          layerId,
          newLayerId,
          mode: "linked"
        });
        upsertBinding(newBinding);
        setActiveLayer(newLayerId);
      } catch (err) {
        // Roll back the visual layer if the server bind failed.
        removeLayer(newLayerId);
        setVariationError(
          err instanceof Error ? err.message : "Failed to duplicate layer"
        );
      } finally {
        setLinkedBusy(false);
      }
    }, [
      addLayer,
      documentId,
      layerId,
      linkedBusy,
      removeLayer,
      setActiveLayer,
      sourceName,
      upsertBinding
    ]);

    const handleDuplicateVariation = useCallback(async () => {
      if (!documentId || variationBusyRef.current) {
        return;
      }
      variationBusyRef.current = true;
      setVariationBusy(true);
      const newLayerId = addLayer(`${sourceName} (variation)`, "raster");
      try {
        const newBinding = await trpcClient.sketch.layers.duplicate.mutate({
          id: documentId,
          layerId,
          newLayerId,
          mode: "variation"
        });
        upsertBinding(newBinding);
        setActiveLayer(newLayerId);
      } catch (err) {
        removeLayer(newLayerId);
        setVariationError(
          err instanceof Error ? err.message : "Failed to create variation"
        );
      } finally {
        variationBusyRef.current = false;
        setVariationBusy(false);
      }
    }, [
      addLayer,
      documentId,
      layerId,
      removeLayer,
      setActiveLayer,
      sourceName,
      upsertBinding
    ]);

    const handleToggleLock = useCallback(() => {
      setLocked(layerId, !isLocked);
    }, [isLocked, layerId, setLocked]);

    const handleRevert = useCallback(() => {
      revert(layerId);
    }, [layerId, revert]);

    const handleGenerate = useCallback(async () => {
      try {
        await generateLayer();
      } catch (err) {
        setGenerationError(
          err instanceof Error
            ? err.message
            : "Failed to start layer generation"
        );
      }
    }, [generateLayer]);

    const handleCancelGeneration = useCallback(async () => {
      try {
        await cancelLayerGeneration();
      } catch (err) {
        setGenerationError(
          err instanceof Error ? err.message : "Failed to cancel generation"
        );
      }
    }, [cancelLayerGeneration]);

    const handleOpenInNodeEditor = useCallback(() => {
      if (!binding.workflowId || !documentId) {
        return;
      }
      navigate(
        `/editor/${binding.workflowId}?from=sketch:${documentId}:${layerId}`
      );
    }, [binding.workflowId, documentId, layerId, navigate]);

    return (
      <>
        <FlexRow css={actionsRowStyles(theme)}>
          <span css={sectionLabelStyles(theme)}>Layer</span>

          <ToolbarIconButton
            icon={
              isActive ? (
                <StopIcon fontSize="small" />
              ) : (
                <PlayArrowIcon fontSize="small" />
              )
            }
            tooltip={
              isActive
                ? "Cancel generation"
                : "Generate layer from the bound workflow and overrides"
            }
            onClick={
              isActive
                ? () => void handleCancelGeneration()
                : () => void handleGenerate()
            }
            active={isGenerating}
            aria-label={isActive ? "Cancel layer generation" : "Generate layer"}
            disabled={!binding.workflowId || isLocked}
            data-testid="layer-action-generate"
          />

          <ToolbarIconButton
            icon={<ContentCopyIcon fontSize="small" />}
            tooltip="Duplicate Linked — same graph, independent param overrides"
            onClick={() => void handleDuplicateLinked()}
            disabled={linkedBusy || !documentId}
            aria-label="Duplicate layer linked"
            data-testid="layer-action-duplicate-linked"
          />

          <ToolbarIconButton
            icon={<CallSplitIcon fontSize="small" />}
            tooltip={
              variationBusy
                ? "Cloning workflow…"
                : "Duplicate as Variation — clones graph for an independent take"
            }
            onClick={() => void handleDuplicateVariation()}
            disabled={variationBusy || !documentId}
            aria-label="Duplicate layer as variation"
            data-testid="layer-action-duplicate-variation"
          />

          <ToolbarIconButton
            icon={
              isLocked ? (
                <LockIcon fontSize="small" />
              ) : (
                <LockOpenIcon fontSize="small" />
              )
            }
            tooltip={
              isLocked
                ? "Locked — successful generations do not replace current output"
                : "Unlocked — successful generations replace current output"
            }
            active={isLocked}
            onClick={handleToggleLock}
            aria-label={isLocked ? "Unlock layer" : "Lock layer"}
            data-testid="layer-action-lock"
          />

          <ToolbarIconButton
            icon={<RestartAltIcon fontSize="small" />}
            tooltip="Revert — clear the current generation back to draft"
            onClick={handleRevert}
            disabled={!binding.lastGeneratedHash}
            aria-label="Revert layer to draft"
            data-testid="layer-action-revert"
          />

          {binding.workflowId && documentId && (
            <ToolbarIconButton
              icon={<OpenInNewIcon fontSize="small" />}
              tooltip="Open in Node Editor"
              onClick={handleOpenInNodeEditor}
              aria-label="Open layer workflow in node editor"
              data-testid="layer-action-open-in-editor"
            />
          )}
        </FlexRow>

        <Toast
          open={variationError !== null}
          message={variationError ?? ""}
          severity="error"
          onClose={() => setVariationError(null)}
          vertical="top"
          horizontal="center"
        />

        <Toast
          open={generationError !== null}
          message={generationError ?? ""}
          severity="error"
          onClose={() => setGenerationError(null)}
          vertical="top"
          horizontal="center"
        />
      </>
    );
  }
);

LayerActions.displayName = "LayerActions";

export default LayerActions;
