/**
 * EntityAssetPickerDialog — pick the image asset an entity is tagged onto.
 * Shared by the entities page and the sidebar panel so both start the same
 * "pick an image, then describe it" flow.
 */

import React, { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import {
  AutoGrid,
  BORDER_RADIUS,
  Caption,
  Dialog,
  EmptyState,
  FlexRow,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import type { Asset } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import ImageRefPreview from "../node/ImageRefPreview";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";

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
  title = "Pick a reference image",
  assetIds,
  excludedAssetIds,
  emptyTitle = "No images",
  emptyDescription = "Generate or upload an image first."
}) => {
  const theme = useTheme();
  const activeProjectId =
    useWorkspaceTabsStore((state) => state.activeProjectId) ?? LOOSE_PROJECT_ID;
  const scopedProjectId = projectId ?? activeProjectId;
  const allowed = assetIds ? new Set(assetIds) : null;
  const excluded = excludedAssetIds ? new Set(excludedAssetIds) : null;
  const { data, isLoading } = useQuery({
    queryKey: ["entity-asset-picker", scopedProjectId],
    queryFn: async (): Promise<Asset[]> => {
      const result = await trpcClient.assets.search.query({
        query: "",
        page_size: 500,
        project_id: scopedProjectId
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

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {isLoading ? (
        <FlexRow align="center" justify="center" sx={{ p: 3 }}>
          <LoadingSpinner />
        </FlexRow>
      ) : !assets || assets.length === 0 ? (
        <EmptyState
          variant="no-data"
          title={emptyTitle}
          description={emptyDescription}
          size="small"
        />
      ) : (
        <AutoGrid
          minItemWidth={180}
          gap={SPACING.md}
          sx={{ width: "100%", maxHeight: "60vh", overflow: "auto" }}
        >
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onPick(asset.id)}
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
                  p: 0.5,
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
      )}
    </Dialog>
  );
};

export const EntityAssetPickerDialog = memo(EntityAssetPickerDialogInternal);
export default EntityAssetPickerDialog;
