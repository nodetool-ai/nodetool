/**
 * The image flow as it renders over a live sketch editor (PRD § 10.1–10.4).
 *
 * The editor stays mounted underneath. That is what makes the flow work at
 * all: the setup writes, the layer bindings, the autosave and the
 * `ui_sketch_*` tools all address the editor's own store instance, so a step
 * that adds a layer adds it to the document the creator is about to open, and
 * `Pick` is nothing more than this overlay getting out of the way.
 *
 * Which surface shows is a function of two things and no wizard state: the
 * document's stage (D3), and whether a batch was enqueued in this session. A
 * reload after a batch lands on the editor with every variation present, which
 * is the same outcome `Pick` produces minus the visibility change.
 */

import React, { useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";

import { Box, PADDING, ScrollArea, Z_INDEX } from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSaveEntity } from "../../../serverState/useEntities";
import { SetupFlow } from "../SetupFlow";
import { ContactSheet } from "./ContactSheet";
import { useImageSetupFlow } from "./useImageSetupFlow";

export interface ImageSetupOverlayProps {
  /** Runs whenever the flow hands the document back to the editor. */
  onFinish?: () => void;
}

export const ImageSetupOverlay: React.FC<ImageSetupOverlayProps> = ({
  onFinish
}) => {
  const theme = useTheme();
  const [batch, setBatch] = useState<readonly string[]>([]);
  const saveEntity = useSaveEntity();

  const handleGenerated = useCallback((layerIds: readonly string[]) => {
    setBatch(layerIds);
  }, []);

  const finish = useCallback(() => {
    setBatch([]);
    onFinish?.();
  }, [onFinish]);

  const { config, look } = useImageSetupFlow({
    onGenerated: handleGenerated,
    onFinish: finish
  });

  const makeMore = useCallback(() => {
    void look.generate().then((layerIds) => {
      setBatch((current) => [...current, ...layerIds]);
    });
  }, [look]);

  const useInStoryboard = useCallback(
    (layerId: string) => {
      const assetId =
        useSketchSessionStore.getState().bindings[layerId]?.currentAssetId;
      if (!assetId) {
        return;
      }
      const setup = useSketchStore.getState().document.setup;
      const name = (setup?.refined?.subject || setup?.brief || "Image").slice(
        0,
        60
      );
      // A generated picture is a thing a board can cast, so it lands as a
      // `prop`: the kind whose descriptor seasons the shots it appears in.
      void saveEntity.mutateAsync({
        assetId,
        kind: "prop",
        name,
        descriptor: setup?.refined?.subject ?? ""
      });
    },
    [saveEntity]
  );

  // Nothing to show once the flow is finished and its batch has been picked
  // from: the editor underneath is the whole surface.
  if (batch.length === 0 && config.stage === "done") {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: Z_INDEX.sticky,
        backgroundColor: theme.vars.palette.background.default,
        overflow: "hidden"
      }}
    >
      <ScrollArea fullHeight>
        {batch.length > 0 ? (
          <Box sx={{ padding: PADDING.section }}>
            <ContactSheet
              layerIds={batch}
              onPick={finish}
              onMakeMore={makeMore}
              onUseInStoryboard={useInStoryboard}
            />
          </Box>
        ) : (
          <SetupFlow config={config} />
        )}
      </ScrollArea>
    </Box>
  );
};

export default ImageSetupOverlay;
