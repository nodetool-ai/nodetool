/**
 * EffectSourcePicker
 *
 * The one picture an effect is applied to: a drop target that also opens the
 * file chooser, showing the picture once it is uploaded. The picture is
 * uploaded as an asset, because `generate_media` reads its source by asset id.
 */

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";

import {
  AlertBanner,
  Caption,
  DropZone,
  FlexColumn,
  LoadingSpinner,
  MediaThumbnail,
  SPACING,
  UploadButton
} from "../ui_primitives";
import { useAssetStore } from "../../stores/AssetStore";
import { creationProjectId } from "../../stores/WorkspaceTabsStore";

interface EffectSourcePickerProps {
  assetId: string | null;
  onChange: (assetId: string) => void;
  disabled?: boolean;
}

const isImage = (file: File): boolean => file.type.startsWith("image/");
const ignoreDrop = (): void => undefined;

const EffectSourcePicker = ({
  assetId,
  onChange,
  disabled = false
}: EffectSourcePickerProps) => {
  const { t } = useTranslation();
  const createAsset = useAssetStore((state) => state.createAsset);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: File[]) => {
      const file = files.find(isImage);
      if (!file) {
        setError(t("effectsGallery.source.notImage"));
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const asset = await createAsset(
          file,
          undefined,
          undefined,
          undefined,
          undefined,
          creationProjectId()
        );
        onChange(asset.id);
      } catch {
        setError(t("effectsGallery.source.uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [createAsset, onChange, t]
  );

  const busy = disabled || uploading;
  const chooseLabel = assetId
    ? t("effectsGallery.source.replace")
    : t("effectsGallery.source.choose");
  return (
    <FlexColumn gap={SPACING.sm} sx={{ minWidth: 0 }}>
      <DropZone
        // A disabled zone still takes the drop, or the browser opens the file.
        onFilesDrop={disabled ? ignoreDrop : upload}
        aria-label={t("effectsGallery.source.zoneLabel")}
        data-testid="effects-drop-zone"
        sx={{
          aspectRatio: "16/10",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden"
        }}
      >
        {uploading ? (
          <LoadingSpinner size="small" />
        ) : assetId ? (
          <MediaThumbnail
            locator={{ asset_id: assetId }}
            kind="image"
            alt={t("effectsGallery.source.previewAlt")}
            aspectRatio="16/10"
            fit="contain"
          />
        ) : (
          <FlexColumn
            align="center"
            gap={SPACING.xs}
            sx={{ color: "text.secondary", textAlign: "center", p: SPACING.md }}
          >
            <AddPhotoAlternateOutlinedIcon />
            <Caption color="secondary">
              {t("effectsGallery.source.dropHint")}
            </Caption>
          </FlexColumn>
        )}
      </DropZone>
      <UploadButton
        label={chooseLabel}
        // The tooltip is the button's accessible name, so it repeats the label.
        tooltip={chooseLabel}
        accept="image/*"
        multiple={false}
        disabled={busy}
        onFileSelect={upload}
        iconVariant="file"
      />
      {error ? (
        <AlertBanner severity="error" compact>
          {error}
        </AlertBanner>
      ) : null}
    </FlexColumn>
  );
};

export default memo(EffectSourcePicker);
