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
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  MagicGenerationFill,
  ResponsiveImage,
  Text
} from "../../ui_primitives";
import { GalleryExpandButton, MEDIA_GALLERY_HOST_CLASS } from "../MediaGallery";
import ReportBugButton from "../../support/ReportBugButton";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import {
  describeDirectGenFailure,
  directGenFailure,
  useDirectGenJob
} from "../../../hooks/sketch/useDirectGenJob";
import { variationSeeds } from "../../../hooks/sketch/useGenerateVariations";
import { resolveMediaUri } from "../../../utils/resolveMediaUri";

export interface ContactSheetProps {
  /** The batch, in the order it was enqueued. */
  layerIds: readonly string[];
  /**
   * Variation layers from earlier batches in this session. `Pick` hides them
   * too, so only the picked one is visible. Defaults to none.
   */
  siblingLayerIds?: readonly string[];
  /** Runs after `Pick` has set visibility — the host closes the flow. */
  onPick: (layerId: string) => void;
  /** Enqueue another batch with the same settings. */
  onMakeMore: () => void;
  /** What another batch costs, as the look step priced it. */
  makeMoreDetail?: string;
  /** What one Regenerate costs. */
  regenerateDetail?: string;
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
  onOpenCanvas: (layerId: string, animate: boolean) => Promise<void>;
}

/** File extensions for the image types a provider returns. */
const IMAGE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
};

/**
 * Save one variation's asset to disk. An `asset://` id is not a URL, so the
 * resolved one is fetched to a blob first: a browser ignores `download` on a
 * cross-origin link and would open the picture instead, and the blob's type
 * names the file's real extension. Throws when the picture cannot be read.
 */
export const downloadVariation = async (
  assetId: string,
  label: string,
  translate: (key: string, options?: Record<string, unknown>) => string = (
    key,
    options
  ) => {
    if (key === "pass3_7.imageSetup.contact.downloadMissing") {
      return "Its file could not be found.";
    }
    if (key === "pass3_7.imageSetup.contact.downloadUnreadable") {
      return `The image could not be downloaded (status ${String(options?.status)}).`;
    }
    return key;
  }
): Promise<void> => {
  const url = await resolveMediaUri(`asset://${assetId}`);
  if (!url) {
    throw new Error(translate("pass3_7.imageSetup.contact.downloadMissing"));
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      translate("pass3_7.imageSetup.contact.downloadUnreadable", {
        status: response.status
      })
    );
  }
  const blob = await response.blob();
  const extension = IMAGE_EXTENSION[blob.type] ?? "png";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${label.replace(/\s+/g, "-").toLowerCase()}.${extension}`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoked after the click has handed the blob to the download.
  setTimeout(() => URL.revokeObjectURL(objectUrl));
};

/** Statuses that mean the request has not settled yet. */
const PENDING = new Set(["draft", "queued", "generating"]);

/** What a failure says when the take recorded no reason of its own. */
/** Where saving a variation to the library has got to. */
type SaveState = "idle" | "saving" | "saved" | "failed";

const NO_SIBLINGS: readonly string[] = [];

const NAME_SEPARATOR = "\u241f";

const ContactSheetInternal: React.FC<ContactSheetProps> = ({
  layerIds,
  siblingLayerIds = NO_SIBLINGS,
  onPick,
  onMakeMore,
  makeMoreDetail,
  regenerateDetail,
  makeMorePending = false,
  makeMoreError = null,
  onBackToSettings,
  onOpenEditor,
  onSaveToLibrary,
  onOpenCanvas
}) => {
  const { t } = useTranslation();
  const bindings = useSketchSessionStore((state) => state.bindings);
  const { start } = useDirectGenJob();
  const [actions, setActions] = useState<
    Record<string, { state: SaveState; message: string }>
  >({});

  // Tiles carry their layer's name, so a tile and the layers panel agree once
  // a later batch continues the numbering (F18). Joined into one string so
  // the selector returns a stable value.
  const layerNames = useSketchStore((state) =>
    layerIds
      .map(
        (layerId) =>
          state.document.layers.find((layer) => layer.id === layerId)?.name ??
          ""
      )
      .join(NAME_SEPARATOR)
  );

  const tiles = useMemo(() => {
    const names = layerNames.split(NAME_SEPARATOR);
    return layerIds.map((layerId, index) => {
      const binding = bindings[layerId];
      const status = binding?.status ?? "draft";
      const failure = status === "failed" ? directGenFailure(layerId) : null;
      return {
        layerId,
        label:
          names[index] ||
          t("pass3_7.imageSetup.contact.variation", { number: index + 1 }),
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
              : t("pass3_7.imageSetup.contact.unrecordedFailure")
      };
    });
  }, [bindings, layerIds, layerNames, t]);

  const landed = tiles.filter((tile) => tile.assetId !== undefined).length;
  const failedTiles = tiles.filter((tile) => tile.failed);
  const failed = failedTiles.length;
  const pending = tiles.filter((tile) => tile.pending).length;

  // A batch usually fails for one reason — a key, a quota, a prompt — so the
  // sheet says it once above the grid instead of on every tile.
  const reasons = Array.from(
    new Set(
      failedTiles.map(
        (tile) =>
          tile.reason ?? t("pass3_7.imageSetup.contact.unrecordedFailure")
      )
    )
  );
  const sharedReason = failed > 1 && reasons.length === 1 ? reasons[0] : null;

  // Visibility changes through the store's layer action and one history
  // entry, the way the layers panel toggles it. Replacing the document would
  // clear undo history (F13).
  const pick = useCallback(
    (layerId: string) => {
      const sketch = useSketchStore.getState();
      const variations = new Set([...siblingLayerIds, ...layerIds]);
      let changed = false;
      for (const layer of sketch.document.layers) {
        if (
          variations.has(layer.id) &&
          layer.visible !== (layer.id === layerId)
        ) {
          sketch.toggleLayerVisibility(layer.id);
          changed = true;
        }
      }
      sketch.setActiveLayer(layerId);
      if (changed) {
        useSketchStore.getState().pushHistory("pick variation");
      }
      onPick(layerId);
    },
    [layerIds, onPick, siblingLayerIds]
  );

  // A regeneration with the seed it already had asks a seeded provider for
  // the same picture again, so it gets a fresh one. A failed take retries
  // with its seed, since nothing was rendered from it (F12).
  const regenerate = useCallback(
    (layerId: string, failed: boolean) => {
      if (!failed) {
        useSketchSessionStore
          .getState()
          .patchBinding(layerId, { seed: variationSeeds(1)[0] });
      }
      void start(layerId);
    },
    [start]
  );

  const sendTo = useCallback(
    async (layerId: string, destination: "entity" | "canvas" | "video") => {
      setActions((current) => ({
        ...current,
        [layerId]: {
          state: "saving",
          message:
            destination === "entity"
              ? t("pass3_7.imageSetup.contact.savingEntity")
              : t("pass3_7.imageSetup.contact.opening")
        }
      }));
      try {
        if (destination === "entity") {
          await onSaveToLibrary(layerId);
        } else {
          await onOpenCanvas(layerId, destination === "video");
        }
        setActions((current) => ({
          ...current,
          [layerId]: {
            state: "saved",
            message:
              destination === "entity"
                ? t("pass3_7.imageSetup.contact.savedEntity")
                : t("pass3_7.imageSetup.contact.openedCanvas")
          }
        }));
      } catch (cause) {
        const reason = cause instanceof Error ? ` ${cause.message}` : "";
        setActions((current) => ({
          ...current,
          [layerId]: {
            state: "failed",
            message:
              destination === "entity"
                ? `${t("pass3_7.imageSetup.contact.saveEntityFailed")}${reason}`
                : `${t("pass3_7.imageSetup.contact.openCanvasFailed")}${reason}`
          }
        }));
      }
    },
    [onSaveToLibrary, onOpenCanvas, t]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_7.imageSetup.contact.heading")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_7.imageSetup.contact.intro")}
        </Text>
        {/* What the batch did, said once and out loud, so a reader who cannot
            see the grid still learns that three landed and one did not. */}
        <Text size="small" color="secondary" role="status" aria-live="polite">
          {t("pass3_7.imageSetup.contact.batchStatus", {
            landed,
            total: tiles.length
          })}
          {failed > 0
            ? ` · ${failed} ${t("pass3_7.imageSetup.contact.failedCount")}`
            : ""}
          {pending > 0
            ? ` · ${pending} ${t("pass3_7.imageSetup.contact.pendingCount")}`
            : ""}
        </Text>
      </FlexColumn>

      {failed > 0 && landed === 0 && pending === 0 ? (
        <AlertBanner
          severity="error"
          action={
            <ReportBugButton
              context={{
                source: "provider-call",
                summary: t("pass3_7.imageSetup.contact.renderFailed"),
                errorText: reasons.join("\n")
              }}
            />
          }
        >
          <FlexColumn gap={GAP.tight}>
            <Text size="small">
              {t("pass3_7.imageSetup.contact.nothingRendered")}
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
        <AlertBanner
          severity="error"
          role="alert"
          action={
            <ReportBugButton
              context={{
                source: "provider-call",
                summary: t("pass3_7.imageSetup.contact.moreFailed"),
                errorText: makeMoreError
              }}
            />
          }
        >
          {makeMoreError}
        </AlertBanner>
      ) : null}

      <Box
        role="group"
        aria-label={t("pass3_7.imageSetup.contact.variations")}
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(min(100%, 220px), 1fr))",
          gap: GAP.comfortable
        }}
      >
        {tiles.map((tile) => (
          // Every tile repeats the same buttons, so each is a named group: a
          // screen reader hears which variation "Sketch editor" picks.
          <FlexColumn
            key={tile.layerId}
            gap={GAP.normal}
            role="group"
            aria-label={tile.label}
          >
            <Box
              role="group"
              aria-label={t("pass3_7.imageSetup.contact.previewLabel", {
                label: tile.label
              })}
              aria-busy={tile.pending}
              className={MEDIA_GALLERY_HOST_CLASS}
              // A click on the still picks it, the same as `Sketch editor`
              // beneath it, which stays the keyboard route.
              onClick={tile.assetId ? () => pick(tile.layerId) : undefined}
              sx={{
                position: "relative",
                aspectRatio: "1/1",
                overflow: "hidden",
                borderRadius: BORDER_RADIUS.sm,
                cursor: tile.assetId ? "pointer" : "default",
                "& img": { pointerEvents: "none", userSelect: "none" }
              }}
            >
              {tile.assetId ? (
                <>
                  <ResponsiveImage
                    locator={`asset://${tile.assetId}`}
                    preferThumbnail
                    alt={tile.label}
                    aspectRatio="1/1"
                    fit="contain"
                    borderRadius={BORDER_RADIUS.sm}
                  />
                  <GalleryExpandButton
                    locator={`asset://${tile.assetId}`}
                    kind="image"
                    caption={tile.label}
                  />
                </>
              ) : (
                <Box
                  sx={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    borderRadius: BORDER_RADIUS.sm,
                    border: "1px solid",
                    borderColor: "divider"
                  }}
                >
                  <Caption color="secondary">
                    {t(`pass3_7.imageSetup.contact.status.${tile.status}`, {
                      defaultValue: t(
                        "pass3_7.imageSetup.contact.status.generating"
                      )
                    })}
                  </Caption>
                </Box>
              )}
              {tile.pending ? (
                <MagicGenerationFill borderRadius={BORDER_RADIUS.sm} />
              ) : null}
            </Box>
            <Text size="small" component="span">
              {tile.label}
            </Text>
            {/* The reason sits beside the retry, unless every failed tile
                shares it and the banner above already said it once. */}
            {tile.failed && tile.reason && sharedReason === null ? (
              <Caption color="secondary">{tile.reason}</Caption>
            ) : null}
            {/* Nothing here is offered for a variation that has not rendered:
                a disabled contained button looks like an enabled one in this
                theme. A failed one keeps its retry, and a running one has
                none, since its tile already says it is rendering. */}
            {tile.assetId || tile.failed ? (
              <FlexRow gap={GAP.normal} wrap>
                {tile.assetId ? (
                  <>
                    <EditorButton
                      variant="contained"
                      disabled={!tile.assetId}
                      onClick={() => pick(tile.layerId)}
                    >
                      {t("pass3_7.imageSetup.contact.sketchEditor")}
                    </EditorButton>
                    {(
                      [
                        [
                          "entity",
                          t("pass3_7.imageSetup.contact.saveToEntities")
                        ],
                        [
                          "canvas",
                          t("pass3_7.imageSetup.contact.newNodeCanvas")
                        ],
                        ["video", t("pass3_7.imageSetup.contact.imageToVideo")]
                      ] as const
                    ).map(([destination, label]) => (
                      <EditorButton
                        key={destination}
                        variant="outlined"
                        disabled={
                          !tile.assetId ||
                          actions[tile.layerId]?.state === "saving"
                        }
                        onClick={() => void sendTo(tile.layerId, destination)}
                      >
                        {label}
                      </EditorButton>
                    ))}
                  </>
                ) : null}
                <EditorButton
                  variant="text"
                  disabled={tile.pending}
                  onClick={() => regenerate(tile.layerId, tile.failed)}
                >
                  {tile.failed
                    ? t("pass3_7.imageSetup.contact.retryVariation", {
                        label: tile.label
                      })
                    : t("pass3_7.imageSetup.contact.regenerate")}
                  {/* Another render is paid for, so its price sits on the button. */}
                  {regenerateDetail ? ` · ${regenerateDetail}` : ""}
                </EditorButton>
                {tile.assetId ? (
                  <EditorButton
                    variant="text"
                    onClick={() => {
                      if (tile.assetId) {
                        downloadVariation(tile.assetId, tile.label, t).catch(
                          (cause: unknown) => {
                            const reason =
                              cause instanceof Error ? ` ${cause.message}` : "";
                            setActions((current) => ({
                              ...current,
                              [tile.layerId]: {
                                state: "failed",
                                message: `${t("pass3_7.imageSetup.contact.downloadFailed", { label: tile.label })}${reason}`
                              }
                            }));
                          }
                        );
                      }
                    }}
                  >
                    {t("pass3_7.imageSetup.contact.download")}
                  </EditorButton>
                ) : null}
              </FlexRow>
            ) : null}
            {actions[tile.layerId] ? (
              <Text
                size="small"
                role={
                  actions[tile.layerId].state === "failed" ? "alert" : "status"
                }
              >
                {actions[tile.layerId].message}
              </Text>
            ) : null}
          </FlexColumn>
        ))}
      </Box>

      <FlexRow gap={GAP.normal} wrap>
        <EditorButton
          variant="outlined"
          disabled={makeMorePending}
          onClick={onMakeMore}
        >
          {makeMorePending
            ? t("pass3_7.imageSetup.contact.makingMore")
            : t("pass3_7.imageSetup.contact.makeMore")}
        </EditorButton>
        {makeMoreDetail && !makeMorePending ? (
          <Caption color="secondary" sx={{ alignSelf: "center" }}>
            {makeMoreDetail}
          </Caption>
        ) : null}
        <EditorButton variant="text" onClick={onBackToSettings}>
          {t("pass3_7.imageSetup.contact.backToSettings")}
        </EditorButton>
        <EditorButton variant="text" onClick={onOpenEditor}>
          {t("pass3_7.imageSetup.contact.openEditor")}
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
};

export const ContactSheet = memo(ContactSheetInternal);
ContactSheet.displayName = "ContactSheet";

export default ContactSheet;
