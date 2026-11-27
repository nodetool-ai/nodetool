/**
 * EntityAssetPickerDialog — pick the image asset an entity is tagged onto.
 * Shared by the entities page and the sidebar panel so both start the same
 * "pick an image, then describe it" flow.
 *
 * In a named project it also offers Personal. An image picked there is
 * copied into the project, and `onPick` receives the copy's id.
 *
 * "Upload a picture" takes a file from the computer into the project and
 * picks it. Without it a person with a photo and an empty library reached a
 * dead end here and had to find the Library first (UX research study 23).
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import {
  AutoGrid,
  BORDER_RADIUS,
  Caption,
  CloseButton,
  Dialog,
  EmptyState,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  SPACING,
  UploadButton
} from "../ui_primitives";
import type { Asset } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import { useAssetStore } from "../../stores/AssetStore";
import ImageRefPreview from "../node/ImageRefPreview";
import { AssetPickSourceTabs } from "../assets/AssetPickSourceTabs";
import ErrorBanner from "../support/ErrorBanner";
import {
  useProjectAssetPick,
  type AssetPickSource
} from "../../hooks/assets/useProjectAssetPick";

interface EntityAssetPickerDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPick: (assetId: string) => void;
  /** Project whose image assets may back the entity. Defaults to the active project. */
  readonly projectId?: string;
  /** Dialog heading. Defaults to the "tag a new entity" wording. */
  readonly title?: string;
  /** When given, only these asset ids are offered — e.g. entities already tagged. */
  readonly assetIds?: readonly string[];
  /** Asset ids to hide, such as images already serving as entities. */
  readonly excludedAssetIds?: readonly string[];
  /** Shown when nothing matches, so a filtered picker can say why. */
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
}

const EntityAssetPickerDialogInternal: React.FC<
  EntityAssetPickerDialogProps
> = ({
  open,
  onClose,
  onPick,
  projectId,
  title,
  assetIds,
  excludedAssetIds,
  emptyTitle,
  emptyDescription
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const pick = useProjectAssetPick(projectId);
  const [source, setSource] = useState<AssetPickSource>("project");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // A picker limited to given ids offers only those, so it has no library tab.
  const personalProjectId = assetIds ? null : pick.personalProjectId;
  const fromPersonal = source === "personal" && personalProjectId !== null;
  const listedProjectId =
    fromPersonal && personalProjectId ? personalProjectId : pick.projectId;
  const allowed = assetIds ? new Set(assetIds) : null;
  const excluded = excludedAssetIds ? new Set(excludedAssetIds) : null;
  const { data, isLoading } = useQuery({
    queryKey: ["entity-asset-picker", listedProjectId],
    queryFn: async (): Promise<Asset[]> => {
      const result = await trpcClient.assets.search.query({
        query: "",
        page_size: 500,
        project_id: listedProjectId
      });
      return (result.assets as Asset[]).filter((a) =>
        (a.content_type ?? "").startsWith("image/")
      );
    },
    enabled: open,
    staleTime: 30_000
  });

  const assets = data?.filter(
    (asset) =>
      (allowed === null || allowed.has(asset.id)) &&
      (excluded === null || !excluded.has(asset.id))
  );

  const handlePick = async (assetId: string): Promise<void> => {
    setCopyError(null);
    setCopying(true);
    try {
      onPick(await pick.idForProject(assetId, fromPersonal ? "personal" : "project"));
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : String(error));
    } finally {
      setCopying(false);
    }
  };

  // An uploaded picture lands in the entity's project, so it needs no copy.
  const handleUpload = useCallback(
    async (files: File[]): Promise<void> => {
      const file = files[0];
      if (!file) {
        return;
      }
      setUploadError(null);
      setUploading(true);
      try {
        const asset = await useAssetStore
          .getState()
          .createAsset(file, undefined, undefined, undefined, "file", pick.projectId);
        onPick(asset.id);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : String(error));
      } finally {
        setUploading(false);
      }
    },
    [onPick, pick.projectId]
  );
  // A picker limited to given ids picks among those only.
  const canUpload = !assetIds;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title ?? t("screens4_22.entities.pickImageTitle")}
      showCloseButton={false}
      titleActions={
        <CloseButton
          onClick={onClose}
          tooltip={t("screens4_22.entities.closeDialog")}
        />
      }
    >
      {(personalProjectId !== null || canUpload) && (
        <FlexRow
          align="center"
          justify={personalProjectId !== null ? "space-between" : "flex-end"}
          gap={SPACING.sm}
          wrap
        >
          {personalProjectId !== null && (
            <AssetPickSourceTabs value={source} onChange={setSource} />
          )}
          {canUpload && (
            <UploadButton
              label={
                uploading
                  ? t("screens4_22.entities.uploading")
                  : t("screens4_22.entities.uploadImage")
              }
              tooltip={t("screens4_22.entities.uploadImage")}
              accept="image/*"
              multiple={false}
              disabled={uploading || copying}
              onFileSelect={(files) => void handleUpload(files)}
            />
          )}
        </FlexRow>
      )}
      {uploadError !== null && (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Could not upload an entity reference image",
            errorText: uploadError
          }}
          onDismiss={() => setUploadError(null)}
        >
          {t("screens4_22.entities.uploadFailed")}
        </ErrorBanner>
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
      {copying || uploading ? (
        <FlexRow align="center" justify="center" sx={{ p: SPACING.lg }}>
          <LoadingSpinner
            text={uploading ? t("screens4_22.entities.uploading") : t("assetPicker.copying")}
          />
        </FlexRow>
      ) : isLoading ? (
        <FlexRow align="center" justify="center" sx={{ p: SPACING.lg }}>
          <LoadingSpinner text={t("screens4_22.entities.loadingImages")} />
        </FlexRow>
      ) : !assets || assets.length === 0 ? (
        <EmptyState
          variant="no-data"
          title={emptyTitle ?? t("screens4_22.entities.noImages")}
          description={
            emptyDescription ??
            (canUpload
              ? t("screens4_22.entities.noImagesUploadDescription")
              : t("screens4_22.entities.noImagesDescription"))
          }
          size="small"
        />
      ) : (
        <ScrollArea maxHeight="60vh" sx={{ width: "100%" }}>
          <AutoGrid minItemWidth={180} gap={SPACING.md} sx={{ width: "100%" }}>
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                aria-label={t("screens4_22.entities.pickImage", {
                  name: asset.name
                })}
                onClick={() => void handlePick(asset.id)}
                style={{
                  border: `1px solid ${theme.vars.palette.divider}`,
                  borderRadius: BORDER_RADIUS.sm,
                  padding: 0,
                  background: "transparent",
                  cursor: "pointer",
                  overflow: "hidden"
                }}
              >
                <div style={{ width: "100%", aspectRatio: "1 / 1" }}>
                  <ImageRefPreview
                    value={{
                      type: "image",
                      uri: asset.thumb_url ?? asset.get_url
                    }}
                  />
                </div>
                <Caption
                  sx={{
                    display: "block",
                    p: SPACING.micro,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {asset.name}
                </Caption>
              </button>
            ))}
          </AutoGrid>
        </ScrollArea>
      )}
    </Dialog>
  );
};

export const EntityAssetPickerDialog = memo(EntityAssetPickerDialogInternal);
export default EntityAssetPickerDialog;
