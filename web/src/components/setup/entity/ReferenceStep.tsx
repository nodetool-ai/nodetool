import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { EntityKind } from "@nodetool-ai/protocol";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import GenerateReferenceDialog from "../../entities/GenerateReferenceDialog";
import {
  BORDER_RADIUS,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  ResponsiveImage,
  Text
} from "../../ui_primitives";
import { SETUP_CONTENT_WIDTH, SETUP_MEDIA_WIDTH } from "../layout";
import { GalleryFrame } from "../MediaGallery";

interface ReferenceStepProps {
  readonly name: string;
  readonly kind: EntityKind;
  readonly descriptor: string;
  readonly assetId: string | null;
  readonly excludedAssetIds: readonly string[];
  readonly assetsLoading: boolean;
  readonly assetsError: boolean;
  readonly pickerOpen: boolean;
  readonly onOpenPicker: () => void;
  readonly onClosePicker: () => void;
  readonly onPick: (assetId: string) => void;
}

export const ReferenceStep = ({
  name,
  kind,
  descriptor,
  assetId,
  excludedAssetIds,
  assetsLoading,
  assetsError,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onPick
}: ReferenceStepProps) => {
  const { t } = useTranslation();
  const [generatorOpen, setGeneratorOpen] = useState(false);

  return (
    <FlexColumn gap={GAP.spacious} sx={{ maxWidth: SETUP_CONTENT_WIDTH }}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h1">
          {t("i18n-cont-setup-05.entity.reference.title")}
        </Text>
        <Text color="secondary">
          {t("i18n-cont-setup-05.entity.reference.description")}
        </Text>
      </FlexColumn>

      {assetId ? (
        <GalleryFrame
          locator={`asset://${assetId}`}
          kind="image"
          caption={
            name
              ? t("i18n-cont-setup-05.entity.reference.imageCaption", { name })
              : t("i18n-cont-setup-05.entity.reference.selectedCaption")
          }
        >
          <ResponsiveImage
            locator={`asset://${assetId}`}
            alt={t("i18n-cont-setup-05.entity.reference.selectedAlt")}
            // Stable hook for the reference slot. The rendered <img> is not one:
            // jsdom fetches a src but has no image codec, so it fires `error`
            // for even a valid data: URI and the error fallback replaces the
            // <img>.
            data-testid="entity-reference-preview"
            aspectRatio="1/1"
            fit="contain"
            borderRadius={BORDER_RADIUS.md}
            showErrorFallback
            sx={{
              width: SETUP_MEDIA_WIDTH,
              maxWidth: "100%",
              maxHeight: "48vh"
            }}
          />
        </GalleryFrame>
      ) : null}

      <FlexRow gap={GAP.normal} wrap>
        <EditorButton
          variant={assetId ? "outlined" : "contained"}
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          onClick={onOpenPicker}
          disabled={assetsLoading || assetsError}
        >
          {assetsError
            ? t("i18n-cont-setup-05.entity.reference.assets.unavailable")
            : assetsLoading
              ? t("i18n-cont-setup-05.entity.reference.assets.loading")
              : assetId
                ? t("i18n-cont-setup-05.entity.reference.assets.change")
                : t("i18n-cont-setup-05.entity.reference.assets.choose")}
        </EditorButton>
        <EditorButton
          variant="outlined"
          startIcon={<AutoAwesomeOutlinedIcon />}
          onClick={() => setGeneratorOpen(true)}
        >
          {t("i18n-cont-setup-05.entity.reference.generate.open")}
        </EditorButton>
      </FlexRow>

      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={onClosePicker}
        onPick={onPick}
        excludedAssetIds={excludedAssetIds}
      />
      {/* Mounted only while open, so each opening starts from the entity's
          current name, description and picture. */}
      {generatorOpen ? (
        <GenerateReferenceDialog
          open
          name={name}
          kind={kind}
          descriptor={descriptor}
          currentAssetId={assetId}
          onClose={() => setGeneratorOpen(false)}
          onPick={onPick}
        />
      ) : null}
    </FlexColumn>
  );
};

export default ReferenceStep;
