import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";

import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import {
  BORDER_RADIUS,
  EditorButton,
  FlexColumn,
  GAP,
  ResponsiveImage,
  Text
} from "../../ui_primitives";
import { SETUP_CONTENT_WIDTH, SETUP_MEDIA_WIDTH } from "../layout";

interface ReferenceStepProps {
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
  assetId,
  excludedAssetIds,
  assetsLoading,
  assetsError,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onPick
}: ReferenceStepProps) => (
  <FlexColumn gap={GAP.spacious} sx={{ maxWidth: SETUP_CONTENT_WIDTH }}>
    <FlexColumn gap={GAP.tight}>
      <Text size="big" component="h1">
        Choose a reference image
      </Text>
      <Text color="secondary">
        Pick the clearest image of the traits you want future generations to
        preserve.
      </Text>
    </FlexColumn>

    {assetId ? (
      <ResponsiveImage
        locator={`asset://${assetId}`}
        alt="Selected entity reference"
        aspectRatio="1/1"
        fit="contain"
        borderRadius={BORDER_RADIUS.md}
        showErrorFallback
        sx={{ width: SETUP_MEDIA_WIDTH, maxWidth: "100%", maxHeight: "48vh" }}
      />
    ) : null}

    <EditorButton
      variant={assetId ? "outlined" : "contained"}
      startIcon={<AddPhotoAlternateOutlinedIcon />}
      onClick={onOpenPicker}
      disabled={assetsLoading || assetsError}
      sx={{ alignSelf: "flex-start" }}
    >
      {assetsError
        ? "Assets unavailable"
        : assetsLoading
          ? "Loading assets"
        : assetId
          ? "Change reference"
          : "Choose from assets"}
    </EditorButton>

    <EntityAssetPickerDialog
      open={pickerOpen}
      onClose={onClosePicker}
      onPick={onPick}
      excludedAssetIds={excludedAssetIds}
    />
  </FlexColumn>
);

export default ReferenceStep;
