/**
 * The image flow's landing (PRD § 10.4): the variations as they land.
 *
 * Nothing generated is thrown away. `Pick` makes one variation visible and
 * hides the rest — they stay on the document as hidden layers, each with the
 * `layerVersion` its generation recorded (criterion 5), so a creator who picks
 * the wrong one just toggles visibility in the layers panel.
 *
 * Every tile renders through `ResponsiveImage` with a `locator`: a generated
 * layer's asset is an `asset://` id, not a URL, and only media resolution can
 * turn one into something an `<img>` can load.
 */

import React, { memo, useCallback, useMemo } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  ResponsiveImage,
  Text
} from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useDirectGenJob } from "../../../hooks/sketch/useDirectGenJob";
import { resolveMediaUri } from "../../../utils/resolveMediaUri";

export interface ContactSheetProps {
  /** The batch, in the order it was enqueued. */
  layerIds: readonly string[];
  /** Runs after `Pick` has set visibility — the host closes the flow. */
  onPick: (layerId: string) => void;
  /** Enqueue another batch with the same settings. */
  onMakeMore: () => void;
  /** Create an entity from a variation, so a board can cast it. */
  onUseInStoryboard: (layerId: string) => void;
}

/**
 * Save one variation's asset to disk. An `asset://` id is not a URL, so the
 * anchor gets the resolved one — the same rule the preview download follows.
 */
const downloadVariation = async (
  assetId: string,
  label: string
): Promise<void> => {
  const url = await resolveMediaUri(`asset://${assetId}`);
  if (!url) {
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${label.replace(/\s+/g, "-").toLowerCase()}.png`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

/** Status wording that says what is happening rather than naming a state. */
const STATUS_TEXT: Record<string, string> = {
  draft: "Waiting to start",
  queued: "Queued",
  generating: "Rendering",
  failed: "This one failed"
};

const ContactSheetInternal: React.FC<ContactSheetProps> = ({
  layerIds,
  onPick,
  onMakeMore,
  onUseInStoryboard
}) => {
  const bindings = useSketchSessionStore((state) => state.bindings);
  const { start } = useDirectGenJob();

  const tiles = useMemo(
    () =>
      layerIds.map((layerId, index) => {
        const binding = bindings[layerId];
        return {
          layerId,
          label: `Variation ${index + 1}`,
          assetId: binding?.currentAssetId,
          status: binding?.status ?? "draft"
        };
      }),
    [bindings, layerIds]
  );

  const pick = useCallback(
    (layerId: string) => {
      const sketch = useSketchStore.getState();
      sketch.setDocument({
        ...sketch.document,
        layers: sketch.document.layers.map((layer) =>
          layerIds.includes(layer.id)
            ? { ...layer, visible: layer.id === layerId }
            : layer
        )
      });
      useSketchStore.getState().setActiveLayer(layerId);
      onPick(layerId);
    },
    [layerIds, onPick]
  );

  // The strip acts on the variation the creator is looking at: the active
  // layer when it belongs to this batch, otherwise the first one that landed.
  const activeLayerId = useSketchStore((state) => state.document.activeLayerId);
  const subject =
    tiles.find((tile) => tile.layerId === activeLayerId && tile.assetId) ??
    tiles.find((tile) => tile.assetId);

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Pick your image
        </Text>
        <Text size="normal" color="secondary">
          Every variation stays on the document, so nothing you rendered is
          lost.
        </Text>
      </FlexColumn>

      <Box
        role="group"
        aria-label="Variations"
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: GAP.comfortable
        }}
      >
        {tiles.map((tile) => (
          <FlexColumn key={tile.layerId} gap={GAP.normal}>
            {tile.assetId ? (
              <ResponsiveImage
                locator={`asset://${tile.assetId}`}
                alt={tile.label}
                aspectRatio="1/1"
                fit="contain"
                borderRadius={BORDER_RADIUS.sm}
              />
            ) : (
              <Box
                sx={{
                  aspectRatio: "1/1",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: BORDER_RADIUS.sm,
                  border: "1px solid",
                  borderColor: "divider"
                }}
              >
                <Caption color="secondary">
                  {STATUS_TEXT[tile.status] ?? "Rendering"}
                </Caption>
              </Box>
            )}
            <Text size="small" component="span">
              {tile.label}
            </Text>
            <FlexRow gap={GAP.normal} wrap>
              <EditorButton
                variant="contained"
                disabled={!tile.assetId}
                onClick={() => pick(tile.layerId)}
              >
                Pick
              </EditorButton>
              <EditorButton
                variant="text"
                onClick={() => void start(tile.layerId)}
              >
                Regenerate
              </EditorButton>
              <EditorButton
                variant="text"
                disabled={!tile.assetId}
                onClick={() => {
                  if (tile.assetId) {
                    void downloadVariation(tile.assetId, tile.label);
                  }
                }}
              >
                Download
              </EditorButton>
            </FlexRow>
          </FlexColumn>
        ))}
      </Box>

      <FlexRow gap={GAP.normal} wrap>
        <EditorButton variant="outlined" onClick={onMakeMore}>
          Make more variations
        </EditorButton>
        <EditorButton
          variant="outlined"
          disabled={subject === undefined}
          onClick={() => {
            if (subject) {
              onUseInStoryboard(subject.layerId);
            }
          }}
        >
          Use in a storyboard
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
};

export const ContactSheet = memo(ContactSheetInternal);
ContactSheet.displayName = "ContactSheet";

export default ContactSheet;
