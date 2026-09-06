/**
 * EntityAssetPickerDialog — pick the image asset an entity is tagged onto.
 * Shared by the entities page and the sidebar panel so both start the same
 * "pick an image, then describe it" flow.
 */

import React, { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import {
  BORDER_RADIUS,
  Caption,
  Dialog,
  EmptyState,
  FlexRow,
  LoadingSpinner,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import type { Asset } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import ImageRefPreview from "../node/ImageRefPreview";

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: getSpacingPx(SPACING.md),
  width: "100%",
  maxHeight: "60vh",
  overflow: "auto"
};

interface EntityAssetPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onPick: (assetId: string) => void;
  /** Dialog heading. Defaults to the "tag a new entity" wording. */
  title?: string;
  /** When given, only these asset ids are offered — e.g. entities already tagged. */
  assetIds?: readonly string[];
  /** Shown when nothing matches, so a filtered picker can say why. */
  emptyTitle?: string;
  emptyDescription?: string;
}

const EntityAssetPickerDialogInternal: React.FC<
  EntityAssetPickerDialogProps
> = ({
  open,
  onClose,
  onPick,
  title = "Pick a reference image",
  assetIds,
  emptyTitle = "No images",
  emptyDescription = "Generate or upload an image first."
}) => {
  const theme = useTheme();
  const allowed = assetIds ? new Set(assetIds) : null;
  const { data, isLoading } = useQuery({
    queryKey: ["entity-asset-picker"],
    queryFn: async (): Promise<Asset[]> => {
      const result = await trpcClient.assets.search.query({
        query: "",
        page_size: 500
      });
      return (result.assets as Asset[]).filter((a) =>
        (a.content_type ?? "").startsWith("image/")
      );
    },
    enabled: open,
    staleTime: 30_000
  });

  const assets = allowed
    ? data?.filter((asset) => allowed.has(asset.id))
    : data;

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
        <div style={gridStyle}>
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
        </div>
      )}
    </Dialog>
  );
};

export const EntityAssetPickerDialog = memo(EntityAssetPickerDialogInternal);
export default EntityAssetPickerDialog;
