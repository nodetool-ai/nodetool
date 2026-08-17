import { memo, useCallback, useRef, useState } from "react";
import TuneIcon from "@mui/icons-material/Tune";
import { isModelSelected } from "@nodetool-ai/protocol";
import type {
  ImageModel,
  LanguageModel,
  TTSModel,
  VideoModel
} from "../../stores/ApiTypes";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import MediaControlChip from "../chat/composer/MediaControlChip";
import {
  audioModelPatch,
  imageModelPatch,
  recentModelEntry,
  videoModelPatch
} from "../chat/composer/modelSelection";
import ImageModelMenuDialog from "../model_menu/ImageModelMenuDialog";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import TTSModelMenuDialog from "../model_menu/TTSModelMenuDialog";
import VideoModelMenuDialog from "../model_menu/VideoModelMenuDialog";
import type { WelcomeTrackId } from "./welcomeTracks";

const UNSET_LABEL = "Select model";

interface CommandBarModelChipProps {
  /** Which track's model this chip selects. */
  track: WelcomeTrackId;
}

/**
 * The model for the track the command bar is set to.
 *
 * Each track's model lives in the store its composer reads — chat in
 * GlobalChatStore, the rest in MediaGenerationStore — so a model chosen here
 * is already chosen when the chat opens, with no handoff of its own.
 */
const CommandBarModelChip: React.FC<CommandBarModelChipProps> = ({ track }) => {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const languageModel = useGlobalChatStore((s) => s.selectedModel);
  const setLanguageModel = useGlobalChatStore((s) => s.setSelectedModel);

  const imageParams = useMediaGenerationStore((s) => s.image);
  const videoParams = useMediaGenerationStore((s) => s.video);
  const audioParams = useMediaGenerationStore((s) => s.audio);
  const setImageParams = useMediaGenerationStore((s) => s.setImageParams);
  const setVideoParams = useMediaGenerationStore((s) => s.setVideoParams);
  const setAudioParams = useMediaGenerationStore((s) => s.setAudioParams);

  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);

  const selected =
    track === "agent"
      ? languageModel
      : track === "image"
        ? imageParams.model
        : track === "video"
          ? videoParams.model
          : audioParams.model;

  const label =
    selected && isModelSelected(selected)
      ? selected.name || selected.id || UNSET_LABEL
      : UNSET_LABEL;

  const close = useCallback(() => setOpen(false), []);

  const pickLanguage = useCallback(
    (model: LanguageModel) => {
      setLanguageModel(model);
      addRecentModel(recentModelEntry(model));
      close();
    },
    [setLanguageModel, addRecentModel, close]
  );

  const pickImage = useCallback(
    (model: ImageModel) => {
      setImageParams(imageModelPatch(model, imageParams));
      addRecentModel(recentModelEntry(model));
      close();
    },
    [setImageParams, imageParams, addRecentModel, close]
  );

  const pickVideo = useCallback(
    (model: VideoModel) => {
      setVideoParams(videoModelPatch(model, videoParams));
      addRecentModel(recentModelEntry(model));
      close();
    },
    [setVideoParams, videoParams, addRecentModel, close]
  );

  const pickAudio = useCallback(
    (model: TTSModel) => {
      setAudioParams(audioModelPatch(model, audioParams.voice));
      addRecentModel(recentModelEntry(model));
      close();
    },
    [setAudioParams, audioParams.voice, addRecentModel, close]
  );

  return (
    <>
      <MediaControlChip
        ref={anchorRef}
        icon={<TuneIcon fontSize="small" />}
        label={label}
        title={`Model for ${track}`}
        active={open}
        size="sm"
        showChevron
        onClick={() => setOpen(true)}
      />
      {open && track === "agent" && (
        <LanguageModelMenuDialog
          open={open}
          anchorEl={anchorRef.current}
          onClose={close}
          onModelChange={pickLanguage}
        />
      )}
      {open && track === "image" && (
        <ImageModelMenuDialog
          open={open}
          anchorEl={anchorRef.current}
          onClose={close}
          onModelChange={pickImage}
          task="text_to_image"
        />
      )}
      {open && track === "video" && (
        <VideoModelMenuDialog
          open={open}
          anchorEl={anchorRef.current}
          onClose={close}
          onModelChange={pickVideo}
          task="text_to_video"
        />
      )}
      {open && track === "audio" && (
        <TTSModelMenuDialog
          open={open}
          anchorEl={anchorRef.current}
          onClose={close}
          onModelChange={pickAudio}
        />
      )}
    </>
  );
};

export default memo(CommandBarModelChip);
