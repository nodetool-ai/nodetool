/**
 * Asset picker behind "Replace clip…" in the clip context menu and the
 * inspector's replace-output button. Picking an asset makes it the clip's
 * current output; generation state and param overrides stay as they are.
 *
 * The clip context menu unmounts the moment an item is clicked, so its caller
 * mounts this dialog only once the action has asked for it.
 *
 * In a named project it also offers Personal. An asset picked there is copied
 * into the project and the clip gets the copy.
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClipMediaType } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { MentionAssetTile } from "../../node_types/editing/promptComposer/MentionAssetTile";
import { useAssetMentionSearch } from "../../node_types/editing/promptComposer/useAssetMentionSearch";
import { AssetPickSourceTabs } from "../../assets/AssetPickSourceTabs";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  Dialog,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  SearchInput,
  SPACING
} from "../../ui_primitives";
import {
  useProjectAssetPick,
  type AssetPickSource
} from "../../../hooks/assets/useProjectAssetPick";

/** Fixed so the dialog does not resize while results load. */
const PANEL_HEIGHT = 360;

/**
 * The content-type prefix a replacement must share with the clip, so a video
 * clip is only offered videos. Kinds without a backing media file offer
 * every asset.
 */
export const replacementContentType = (
  mediaType: ClipMediaType | undefined
): string | undefined => {
  switch (mediaType) {
    case "image":
    case "video":
    case "audio":
      return `${mediaType}/`;
    case "model3d":
      return "model/";
    default:
      return undefined;
  }
};

const KIND_LABEL: Record<string, string> = {
  "image/": "images",
  "video/": "videos",
  "audio/": "audio files",
  "model/": "3D models"
};

interface ReplaceClipAssetDialogProps {
  clipId: string;
  onClose: () => void;
}

export const ReplaceClipAssetDialog: React.FC<ReplaceClipAssetDialogProps> =
  memo(({ clipId, onClose }) => {
    const { t } = useTranslation();
    const replaceClipOutput = useTimelineStore((s) => s.replaceClipOutput);
    const mediaType = useTimelineStore(
      (s) => findClipById(s.clips, clipId)?.mediaType
    );
    const currentAssetId = useTimelineStore(
      (s) => findClipById(s.clips, clipId)?.currentAssetId
    );
    const contentType = replacementContentType(mediaType);
    const kindLabel = t(`i18n-next59.replace.kind.${contentType ?? "assets"}`, { defaultValue: contentType ? KIND_LABEL[contentType] : "assets" });

    const pick = useProjectAssetPick();
    const [source, setSource] = useState<AssetPickSource>("project");
    const [copying, setCopying] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);
    const fromPersonal =
      source === "personal" && pick.personalProjectId !== null;

    const [query, setQuery] = useState("");
    const { displayedAssets, hasMoreSaved, loadMoreSaved, handleRename } =
      useAssetMentionSearch(
        query,
        "saved",
        contentType,
        true,
        fromPersonal && pick.personalProjectId
          ? pick.personalProjectId
          : pick.projectId
      );

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (
          hasMoreSaved &&
          el.scrollHeight - el.scrollTop - el.clientHeight < 120
        ) {
          loadMoreSaved();
        }
      },
      [hasMoreSaved, loadMoreSaved]
    );

    const handlePick = useCallback(
      async (assetId: string) => {
        setCopyError(null);
        setCopying(true);
        let usedId: string;
        try {
          usedId = await pick.idForProject(
            assetId,
            fromPersonal ? "personal" : "project"
          );
        } catch (error) {
          setCopyError(error instanceof Error ? error.message : String(error));
          setCopying(false);
          return;
        }
        if (usedId !== currentAssetId) {
          replaceClipOutput(clipId, usedId);
        }
        onClose();
      },
      [clipId, currentAssetId, fromPersonal, onClose, pick, replaceClipOutput]
    );

    return (
      <Dialog
        open
        onClose={onClose}
        title={t("i18n-next59.replace.title")}
        maxWidth="sm"
        fullWidth
      >
        <FlexColumn gap={SPACING.md}>
          <Caption color="secondary">
            {t("i18n-next59.replace.description", { kind: kindLabel })}
          </Caption>
          {pick.personalProjectId !== null && (
            <AssetPickSourceTabs value={source} onChange={setSource} />
          )}
          {copyError !== null && (
            <ErrorBanner
              report={{
                source: "operation-failure",
                summary: "Could not copy a Personal asset into the project",
                errorText: copyError
              }}
              onDismiss={() => setCopyError(null)}
            >
              {t("assetPicker.copyFailed")}
            </ErrorBanner>
          )}
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("i18n-next59.replace.search", { kind: kindLabel })}
            ariaLabel={t("i18n-next59.replace.search", { kind: kindLabel })}
            size="small"
            autoFocus
            fullWidth
          />
          {copying ? (
            <FlexRow align="center" justify="center" sx={{ height: PANEL_HEIGHT }}>
              <LoadingSpinner text={t("assetPicker.copying")} />
            </FlexRow>
          ) : displayedAssets.length === 0 ? (
            <EmptyState
              variant={query ? "no-results" : "empty"}
              title={query ? t("i18n-next59.replace.noMatch", { kind: kindLabel }) : t("i18n-next59.replace.noneYet", { kind: kindLabel })}
              description={
                query
                  ? t("i18n-next59.replace.tryAnotherName")
                  : t("i18n-next59.replace.uploadOrGenerate")
              }
              size="small"
            />
          ) : (
            <ScrollArea sx={{ height: PANEL_HEIGHT }} onScroll={handleScroll}>
              <FlexRow
                wrap
                gap={SPACING.xs}
                role="listbox"
                aria-label={t("i18n-next59.replace.replacementKind", { kind: kindLabel })}
              >
                {displayedAssets.map((asset) => (
                  <MentionAssetTile
                    key={asset.id}
                    asset={asset}
                    selected={asset.id === currentAssetId}
                    onSelect={() => void handlePick(asset.id)}
                    onRename={handleRename}
                    focusable
                  />
                ))}
              </FlexRow>
            </ScrollArea>
          )}
        </FlexColumn>
      </Dialog>
    );
  });

ReplaceClipAssetDialog.displayName = "ReplaceClipAssetDialog";
