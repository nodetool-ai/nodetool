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
}

const EntityAssetPickerDialogInternal: React.FC<
  EntityAssetPickerDialogProps
> = ({ open, onClose, onPick }) => {
  const theme = useTheme();
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

  return (
    <Dialog open={open} onClose={onClose} title="Pick a reference image">
      {isLoading ? (
        <FlexRow align="center" justify="center" sx={{ p: 3 }}>
          <LoadingSpinner />
        </FlexRow>
      ) : !data || data.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="No images"
          description="Generate or upload an image first."
          size="small"
        />
      ) : (
        <div style={gridStyle}>
          {data.map((asset) => (
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
