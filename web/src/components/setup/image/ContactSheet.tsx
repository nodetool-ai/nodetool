/**
 * The image flow's landing (PRD § 10.4): the variations as they land.
 *
 * Nothing generated is thrown away. `Pick` makes one variation visible and
 * hides the rest — they stay on the document as hidden layers, each with the
 * `layerVersion` its generation recorded (criterion 5), so a creator who picks
 * the wrong one just toggles visibility in the layers panel.
 *
 * A batch can also fail, in whole or in part, and `Pick` needs a landed asset.
 * So the sheet is never the only way out: it says how many landed and how many
 * failed, gives each failure the reason its take recorded, retries one
 * variation at a time, and keeps two exits — back to the look step, or
 * straight into the editor — that work with nothing rendered at all (F7).
 *
 * Every tile renders through `ResponsiveImage` with a `locator`: a generated
 * layer's asset is an `asset://` id, not a URL, and only media resolution can
 * turn one into something an `<img>` can load.
 */

import React, { memo, useCallback, useMemo, useState } from "react";

import {
  AlertBanner,
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
import {
  describeDirectGenFailure,
  directGenFailure,
  useDirectGenJob
} from "../../../hooks/sketch/useDirectGenJob";
import { resolveMediaUri } from "../../../utils/resolveMediaUri";

export interface ContactSheetProps {
  /** The batch, in the order it was enqueued. */
  layerIds: readonly string[];
  /** Runs after `Pick` has set visibility — the host closes the flow. */
  onPick: (layerId: string) => void;
  /** Enqueue another batch with the same settings. */
  onMakeMore: () => void;
  /** True while another batch is being enqueued. */
  makeMorePending?: boolean;
  /** Why the last `Make more variations` was refused. */
  makeMoreError?: string | null;
  /** Back to the look step, keeping every variation already on the document. */
  onBackToSettings: () => void;
  /** Leave the flow for the editor without picking one. */
  onOpenEditor: () => void;
  /** Save a variation to the entity library, so a board can cast it. */
  onSaveToLibrary: (layerId: string) => Promise<void>;
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

/** Statuses that mean the request has not settled yet. */
const PENDING = new Set(["draft", "queued", "generating"]);

/** What a failure says when the take recorded no reason of its own. */
const UNRECORDED_REASON = "This one did not render, and gave no reason.";

/** Where saving a variation to the library has got to. */
type SaveState = "idle" | "saving" | "saved" | "failed";

const ContactSheetInternal: React.FC<ContactSheetProps> = ({
  layerIds,
  onPick,
  onMakeMore,
  makeMorePending = false,
  makeMoreError = null,
  onBackToSettings,
  onOpenEditor,
  onSaveToLibrary
}) => {
  const bindings = useSketchSessionStore((state) => state.bindings);
  const { start } = useDirectGenJob();
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const tiles = useMemo(
    () =>
      layerIds.map((layerId, index) => {
        const binding = bindings[layerId];
        const status = binding?.status ?? "draft";
        const failure = status === "failed" ? directGenFailure(layerId) : null;
        return {
          layerId,
          label: `Variation ${index + 1}`,
          assetId: binding?.currentAssetId,
          status,
          pending: PENDING.has(status),
          failed: status === "failed",
          // The remedy, in the provider's own terms where it gave any: a
          // refused prompt and a missing key are not the same problem (F7).
          reason:
            status !== "failed"
              ? null
              : failure
                ? describeDirectGenFailure(failure)
                : UNRECORDED_REASON
        };
      }),
    [bindings, layerIds]
  );

  const landed = tiles.filter((tile) => tile.assetId !== undefined).length;
  const failedTiles = tiles.filter((tile) => tile.failed);
  const failed = failedTiles.length;
  const pending = tiles.filter((tile) => tile.pending).length;

  // A batch usually fails for one reason — a key, a quota, a prompt — so the
  // sheet says it once above the grid instead of on every tile.
  const reasons = Array.from(
    new Set(failedTiles.map((tile) => tile.reason ?? UNRECORDED_REASON))
  );
  const sharedReason = failed > 1 && reasons.length === 1 ? reasons[0] : null;

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

  const saveToLibrary = useCallback(async () => {
    if (!subject) {
      return;
    }
    setSaveState("saving");
    try {
      await onSaveToLibrary(subject.layerId);
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }, [onSaveToLibrary, subject]);

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
        {/* What the batch did, said once and out loud, so a reader who cannot
            see the grid still learns that three landed and one did not. */}
        <Text size="small" color="secondary" role="status" aria-live="polite">
          {`${landed} of ${tiles.length} rendered` +
            (failed > 0 ? ` · ${failed} failed` : "") +
            (pending > 0 ? ` · ${pending} still running` : "")}
        </Text>
      </FlexColumn>

      {failed > 0 && landed === 0 && pending === 0 ? (
        <AlertBanner severity="error">
          <FlexColumn gap={GAP.tight}>
            <Text size="small">
              Nothing rendered. Try a variation again, change the model or size
              under the generation settings, or open the editor and work from
              the canvas.
            </Text>
            {reasons.map((reason) => (
              <Text key={reason} size="small">
                {reason}
              </Text>
            ))}
          </FlexColumn>
        </AlertBanner>
      ) : sharedReason ? (
        <AlertBanner severity="warning">{sharedReason}</AlertBanner>
      ) : null}

      {makeMoreError ? (
        <AlertBanner severity="error" role="alert">
          {makeMoreError}
        </AlertBanner>
      ) : null}

      <Box
        role="group"
        aria-label="Variations"
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))",
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
            {/* The reason sits beside the retry, unless every failed tile
                shares it and the banner above already said it once. */}
            {tile.failed && tile.reason && sharedReason === null ? (
              <Caption color="secondary">{tile.reason}</Caption>
            ) : null}
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
                disabled={tile.pending}
                onClick={() => void start(tile.layerId)}
              >
                {tile.failed ? `Try ${tile.label} again` : "Regenerate"}
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
        <EditorButton
          variant="outlined"
          disabled={makeMorePending}
          onClick={onMakeMore}
        >
          {makeMorePending ? "Making more…" : "Make more variations"}
        </EditorButton>
        <EditorButton variant="text" onClick={onBackToSettings}>
          Back to generation settings
        </EditorButton>
        <EditorButton variant="text" onClick={onOpenEditor}>
          Open editor
        </EditorButton>
        {/* The entity library is where a saved picture is cast from; this
            action writes there and nowhere else, so it says so (F30). */}
        <EditorButton
          variant="outlined"
          disabled={subject === undefined || saveState === "saving"}
          onClick={() => void saveToLibrary()}
        >
          {saveState === "saving" ? "Saving…" : "Save to reference library"}
        </EditorButton>
      </FlexRow>

      {saveState === "saved" ? (
        <Text size="small" role="status" aria-live="polite">
          Saved to your reference library. A storyboard can cast it from there.
        </Text>
      ) : null}
      {saveState === "failed" ? (
        <AlertBanner
          severity="error"
          role="alert"
          action={
            <EditorButton variant="text" onClick={() => void saveToLibrary()}>
              Try again
            </EditorButton>
          }
        >
          That variation could not be saved to your reference library.
        </AlertBanner>
      ) : null}
    </FlexColumn>
  );
};

export const ContactSheet = memo(ContactSheetInternal);
ContactSheet.displayName = "ContactSheet";

export default ContactSheet;
