/**
 * The image flow as it renders over a live sketch editor (PRD § 10.1–10.4).
 *
 * The editor stays mounted underneath. That is what makes the flow work at
 * all: the setup writes, the layer bindings, the autosave and the
 * `ui_sketch_*` tools all address the editor's own store instance, so a step
 * that adds a layer adds it to the document the creator is about to open, and
 * `Pick` is nothing more than this overlay getting out of the way.
 *
 * Mounted is not the same as reachable. While the flow covers the editor, the
 * editor's own controls are `inert`, so the tab key stays inside setup instead
 * of walking through a toolbar nobody can see, and focus moves into the flow
 * on the way in and back to where it was on the way out (F6). It is still not
 * a modal dialog: the flow is the document's surface, not something on top of
 * it.
 *
 * Which surface shows is a function of two things and no wizard state: the
 * document's stage (D3), and whether a batch was enqueued in this session. A
 * reload after a batch lands on the editor with every variation present, which
 * is the same outcome `Pick` produces minus the visibility change.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";

import { Box, PADDING, ScrollArea, Z_INDEX } from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useOnboardingStore } from "../../../stores/OnboardingStore";
import { useSaveEntity } from "../../../serverState/useEntities";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../../stores/WorkspaceTabsStore";
import { SetupFlow } from "../SetupFlow";
import { ContactSheet } from "./ContactSheet";
import { MediaGalleryProvider } from "../MediaGallery";
import { useImageSetupFlow } from "./useImageSetupFlow";

export interface ImageSetupOverlayProps {
  /** Runs whenever the flow hands the document back to the editor. */
  onFinish?: () => void;
}

export const ImageSetupOverlay: React.FC<ImageSetupOverlayProps> = ({
  onFinish
}) => {
  const theme = useTheme();
  const createWorkflow = useWorkflowManager((state) => state.create);
  const [batch, setBatch] = useState<readonly string[]>([]);
  // Every variation layer this session generated, across batches. `Back to
  // generation settings` starts a new sheet, but picking from it still has to
  // hide the earlier batches, or they stay visible over the pick (F13).
  const [sessionLayers, setSessionLayers] = useState<readonly string[]>([]);
  const [makingMore, setMakingMore] = useState(false);
  const [makeMoreError, setMakeMoreError] = useState<string | null>(null);
  const saveEntity = useSaveEntity();
  const setSetup = useSketchStore((state) => state.setSetup);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Moves on every exit from the contact sheet, so a "Make more" batch that
  // lands after the creator left it does not bring the sheet back (F4).
  const sheetSessionRef = useRef(0);

  const handleGenerated = useCallback((layerIds: readonly string[]) => {
    setBatch(layerIds);
    setSessionLayers((current) => [...current, ...layerIds]);
  }, []);

  const finish = useCallback(() => {
    sheetSessionRef.current += 1;
    setBatch([]);
    setMakingMore(false);
    onFinish?.();
  }, [onFinish]);

  const pickRenderedImage = useCallback(
    (layerId: string) => {
      if (!useSketchSessionStore.getState().bindings[layerId]?.currentAssetId) {
        return;
      }
      useOnboardingStore.getState().markStep("start-guided-flow");
      finish();
    },
    [finish]
  );

  const { config, look } = useImageSetupFlow({
    onGenerated: handleGenerated,
    onFinish: finish
  });

  const makeMore = useCallback(() => {
    setMakeMoreError(null);
    setMakingMore(true);
    const session = sheetSessionRef.current;
    void look
      .generate()
      .then((layerIds) => {
        // A late batch is still this session's, so a later pick hides it.
        setSessionLayers((current) => [...current, ...layerIds]);
        if (session === sheetSessionRef.current) {
          setBatch((current) => [...current, ...layerIds]);
        }
      })
      .catch((cause: unknown) => {
        if (session !== sheetSessionRef.current) {
          return;
        }
        setMakeMoreError(
          cause instanceof Error
            ? cause.message
            : "Another batch could not be started."
        );
      })
      .finally(() => {
        if (session === sheetSessionRef.current) {
          setMakingMore(false);
        }
      });
  }, [look]);

  // Back to the look step with every variation kept: they are layers on the
  // document, and the next batch is added beside them (F7).
  const backToSettings = useCallback(() => {
    sheetSessionRef.current += 1;
    setBatch([]);
    setMakingMore(false);
    setMakeMoreError(null);
    setSetup({ stage: "look" });
  }, [setSetup]);

  const saveToLibrary = useCallback(
    async (layerId: string) => {
      const assetId =
        useSketchSessionStore.getState().bindings[layerId]?.currentAssetId;
      if (!assetId) {
        throw new Error("That variation has not rendered yet.");
      }
      const setup = useSketchStore.getState().document.setup;
      const name = (setup?.refined?.subject || setup?.brief || "Image").slice(
        0,
        60
      );
      // A generated picture is a thing a board can cast, so it lands as a
      // `prop`: the kind whose descriptor seasons the shots it appears in.
      await saveEntity.mutateAsync({
        assetId,
        kind: "prop",
        name,
        descriptor: setup?.refined?.subject ?? ""
      });
    },
    [saveEntity]
  );

  const openCanvas = useCallback(
    async (layerId: string, animate: boolean) => {
      const assetId =
        useSketchSessionStore.getState().bindings[layerId]?.currentAssetId;
      if (!assetId) throw new Error("That variation has not rendered yet.");
      const projectId = creationProjectId();
      const image = {
        type: "image",
        asset_id: assetId,
        uri: `asset://${assetId}`
      };
      const name = animate ? "Image to video" : "Image canvas";
      const workflow = await createWorkflow({
        name,
        description: "",
        tags: [],
        access: "private",
        graph: {
          nodes: [
            {
              id: crypto.randomUUID(),
              type: animate
                ? "nodetool.video.ImageToVideo"
                : "nodetool.constant.Image",
              data: animate ? { image: [image] } : { value: image },
              ui_properties: { position: { x: 0, y: 0 } }
            }
          ],
          edges: []
        }
      });
      useWorkspaceTabsStore.getState().openTab({
        type: "workflow",
        ref: workflow.id,
        title: name,
        projectId
      });
    },
    [createWorkflow]
  );

  // Nothing to show once the flow is finished and its batch has been picked
  // from: the editor underneath is the whole surface.
  const covering = batch.length > 0 || config.stage !== "done";

  useEffect(() => {
    const surface = surfaceRef.current;
    const parent = surface?.parentElement;
    if (!covering || !surface || !parent) {
      return;
    }
    const covered = Array.from(parent.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== surface
    );
    // A step field that took focus on mount (the brief) keeps it; only focus
    // still outside the flow is pulled in, and only that is returned to.
    const focusInside = surface.contains(document.activeElement);
    const returnTo =
      !focusInside && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    for (const element of covered) {
      element.setAttribute("inert", "");
    }
    if (!focusInside) {
      surface.focus({ preventScroll: true });
    }
    return () => {
      for (const element of covered) {
        element.removeAttribute("inert");
      }
      returnTo?.focus({ preventScroll: true });
    };
  }, [covering]);

  if (!covering) {
    return null;
  }

  return (
    <Box
      ref={surfaceRef}
      tabIndex={-1}
      data-image-setup
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: Z_INDEX.sticky,
        backgroundColor: theme.vars.palette.background.default,
        overflow: "hidden",
        outline: "none"
      }}
    >
      <ScrollArea fullHeight>
        {batch.length > 0 ? (
          <Box sx={{ padding: PADDING.section }}>
            <MediaGalleryProvider>
              <ContactSheet
                layerIds={batch}
                siblingLayerIds={sessionLayers}
                onPick={pickRenderedImage}
                onMakeMore={makeMore}
                makeMorePending={makingMore}
                makeMoreError={makeMoreError}
                onBackToSettings={backToSettings}
                onOpenEditor={finish}
                onSaveToLibrary={saveToLibrary}
                onOpenCanvas={openCanvas}
              />
            </MediaGalleryProvider>
          </Box>
        ) : (
          <SetupFlow config={config} />
        )}
      </ScrollArea>
    </Box>
  );
};

export default ImageSetupOverlay;
