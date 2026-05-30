import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import AudioViewer from "../asset_viewer/AudioViewer";
import { FlexColumn, LoadingSpinner } from "../ui_primitives";

interface AudioSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * The surface for an audio tab. Audio is a view-only type (there is no audio
 * editor yet), so the waveform AudioViewer renders for both "view" and "edit"
 * modes. The asset is loaded by id here and passed down, so the viewer stays
 * untouched. `active` is accepted to match the surface contract; the player
 * does not autoplay, so there is nothing to gate on foreground state.
 */
const AudioSurface = ({ refId }: AudioSurfaceProps) => {
  const { data: asset } = useAssetById(refId);

  if (!asset) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  return <AudioViewer asset={asset} />;
};

export default AudioSurface;
