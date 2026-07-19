/** @jsxImportSource @emotion/react */
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import AppsIcon from "@mui/icons-material/Apps";
import DisplaySettingsIcon from "@mui/icons-material/Tv";
import ImageIcon from "@mui/icons-material/Image";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import MovieIcon from "@mui/icons-material/Movie";
import MovieFilterIcon from "@mui/icons-material/MovieFilter";
import VideocamIcon from "@mui/icons-material/Videocam";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import SpeedIcon from "@mui/icons-material/Speed";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import TuneIcon from "@mui/icons-material/Tune";
import LayersIcon from "@mui/icons-material/Layers";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

import { FlexRow, Text } from "../../ui_primitives";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import useMediaGenerationStore, {
  IMAGE_VARIATIONS,
  AUDIO_FORMATS,
  AUDIO_SPEEDS,
  DEFAULT_TTS_VOICES,
  resolveImageSize
} from "../../../stores/MediaGenerationStore";
import type {
  MediaMode,
  AudioFormat
} from "../../../stores/MediaGenerationStore";
import MediaControlChip from "./MediaControlChip";
import MediaModeMenu from "./MediaModeMenu";
import PiComposerControls, { piModeAvailable } from "./PiComposerControls";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import MediaOptionMenu, { MediaOption } from "./MediaOptionMenu";
import MediaAspectRatioMenu from "./MediaAspectRatioMenu";
import {
  buildVideoModelOptions,
  clampToAllowed,
  videoModelConstraints
} from "./videoModelOptions";
import {
  buildImageEditOptions,
  buildImageModelOptions,
  imageModelConstraints
} from "./imageModelOptions";
import ImageModelMenuDialog from "../../model_menu/ImageModelMenuDialog";
import VideoModelMenuDialog from "../../model_menu/VideoModelMenuDialog";
import LanguageModelMenuDialog from "../../model_menu/LanguageModelMenuDialog";
import TTSModelMenuDialog from "../../model_menu/TTSModelMenuDialog";
import type {
  Asset,
  ImageModel,
  LanguageModel,
  MessageContent,
  TTSModel,
  VideoModel
} from "../../../stores/ApiTypes";
import type { Entity } from "@nodetool-ai/protocol";
import type { MediaGenerationRequest } from "../types/media.types";
import { assetToUri } from "../../node_types/editing/promptComposer/promptTokens";
import { useTextareaAssetMention } from "./useTextareaAssetMention";
import { FilePreview } from "./FilePreview";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { useMessageQueue } from "../../../hooks/useMessageQueue";
import { createMediaComposerStyles } from "./MediaChatComposer.styles";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { StopGenerationButton } from "./StopGenerationButton";
import PermissionSelector from "./PermissionSelector";
import { useElapsedTime } from "../../../hooks/useElapsedTime";

function formatElapsed(seconds: number): string {
  if (seconds < 5) return "Starting…";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}


export interface MediaChatComposerProps {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    mediaGeneration?: MediaGenerationRequest
  ) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  disabled?: boolean;
  memoryEnabled?: boolean;
  onMemoryToggle?: (enabled: boolean) => void;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  allowedProviders?: string[];
  /** Hide non-tool-capable models in the language model picker. */
  requireToolSupport?: boolean;
  /** Focus the prompt textarea on mount. Defaults to true (chat panel). */
  autoFocus?: boolean;
  /** Extra actions rendered at the end of the footer chip row (e.g. the
   *  canvas Run button + workflow menu). Empty in the chat panel. */
  trailingActions?: React.ReactNode;
  /** Extra actions rendered at the start of the footer chip row (e.g. the
   *  canvas dock drag handle). Empty in the chat panel. Stays visible even
   *  while the composer is minimized. */
  leadingActions?: React.ReactNode;
  /** Override the auto-generated, mode-aware textarea placeholder. */
  placeholder?: string;
  /** Pure chat panel: hide the mode picker and force "chat" mode. Used by the
   *  app builder / video / 3d editor agent panels which are hardcoded to chat. */
  hideModePicker?: boolean;
}

/**
 * Media-generation chat composer.
 *
 * Renders a slick rounded glass card with:
 *   - A large prompt textarea
 *   - A footer chip row whose content adapts to the selected mode:
 *       • chat  → model (via left slot, handled by parent toolbar) +
 *                 agent mode toggle
 *       • image → model, resolution (1K/2K/4K), aspect ratio, # variations
 *       • video → model, duration, resolution (720p/1080p/1440p/4K), aspect ratio
 *   - A Retake refresh icon
 *   - A primary "Generate" button (or plain Send for chat mode)
 *
 * The selected mode + params are attached to the outgoing chat_message via the
 * `media_generation` field so the server can route to provider.textToImage /
 * provider.textToVideo instead of a regular LLM round.
 */
const MediaChatComposer: React.FC<MediaChatComposerProps> = ({
  isLoading,
  isStreaming,
  onSendMessage,
  onStop,
  disabled = false,
  memoryEnabled,
  onMemoryToggle,
  selectedModel,
  onModelChange,
  allowedProviders,
  requireToolSupport,
  autoFocus = true,
  trailingActions,
  leadingActions,
  placeholder: placeholderOverride,
  hideModePicker = false
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createMediaComposerStyles(theme), [theme]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");

  // Mode + media params from persistent store
  const storeMode = useMediaGenerationStore((s) => s.mode);
  const setMode = useMediaGenerationStore((s) => s.setMode);
  const imageParams = useMediaGenerationStore((s) => s.image);
  const setImageParams = useMediaGenerationStore((s) => s.setImageParams);
  const imageEditParams = useMediaGenerationStore((s) => s.imageEdit);
  const setImageEditParams = useMediaGenerationStore(
    (s) => s.setImageEditParams
  );
  const videoParams = useMediaGenerationStore((s) => s.video);
  const setVideoParams = useMediaGenerationStore((s) => s.setVideoParams);
  const imageToVideoParams = useMediaGenerationStore((s) => s.imageToVideo);
  const setImageToVideoParams = useMediaGenerationStore(
    (s) => s.setImageToVideoParams
  );
  const audioParams = useMediaGenerationStore((s) => s.audio);
  const setAudioParams = useMediaGenerationStore((s) => s.setAudioParams);

  // Language-model selection from chat store (used in chat mode & forwarded
  // as provider/model for media calls when a media model is not picked).
  const languageModel = useGlobalChatStore((s) => s.selectedModel);

  // Unified routing mode: "pi" swaps the chat-model controls for the
  // workspace-aware Pi agent and routes sends through the agent socket.
  const globalMode = useGlobalChatStore((s) => s.mode);
  const setGlobalMode = useGlobalChatStore((s) => s.setMode);

  // Pure-chat panels force chat mode and ignore the global media/pi mode.
  const mode = hideModePicker ? "chat" : storeMode;
  const isPi = hideModePicker ? false : globalMode === "pi";

  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);

  const [modeAnchor, setModeAnchor] = useState<HTMLButtonElement | null>(null);
  const [durationAnchor, setDurationAnchor] = useState<HTMLButtonElement | null>(null);
  const [resolutionAnchor, setResolutionAnchor] = useState<HTMLButtonElement | null>(null);
  const [aspectAnchor, setAspectAnchor] = useState<HTMLButtonElement | null>(null);
  const [variationsAnchor, setVariationsAnchor] = useState<HTMLButtonElement | null>(null);
  const [voiceAnchor, setVoiceAnchor] = useState<HTMLButtonElement | null>(null);
  const [speedAnchor, setSpeedAnchor] = useState<HTMLButtonElement | null>(null);
  const [audioFormatAnchor, setAudioFormatAnchor] =
    useState<HTMLButtonElement | null>(null);
  const [strengthAnchor, setStrengthAnchor] =
    useState<HTMLButtonElement | null>(null);
  const [stepsAnchor, setStepsAnchor] = useState<HTMLButtonElement | null>(
    null
  );
  const [imageModelOpen, setImageModelOpen] = useState(false);
  const [videoModelOpen, setVideoModelOpen] = useState(false);
  const [languageModelOpen, setLanguageModelOpen] = useState(false);
  const [ttsModelOpen, setTtsModelOpen] = useState(false);
  const imageModelAnchorRef = useRef<HTMLButtonElement | null>(null);
  const languageModelAnchorRef = useRef<HTMLButtonElement | null>(null);
  const videoModelAnchorRef = useRef<HTMLButtonElement | null>(null);
  const ttsModelAnchorRef = useRef<HTMLButtonElement | null>(null);

  // File handling (input images for image-to-image / motion-control later)
  const { droppedFiles, addFiles, removeFile, clearFiles, getFileContents, addDroppedFiles } =
    useFileHandling();
  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(addFiles, addDroppedFiles);

  // Typing `@` opens the asset picker; a picked asset is attached as an
  // `asset://` reference (like a drag from the asset library) rather than
  // inlined into the prompt text.
  const handleSelectAsset = useCallback(
    (asset: Asset) => {
      addDroppedFiles([
        {
          id: "",
          dataUri: asset.thumb_url || asset.get_url || "",
          type: asset.content_type || "application/octet-stream",
          name: asset.name || asset.id,
          assetUri: assetToUri(asset)
        }
      ]);
    },
    [addDroppedFiles]
  );

  // A picked entity reads as part of the message: the hook inlines its name
  // into the text; here its reference image is attached for consistency.
  const handleSelectEntity = useCallback(
    (entity: Entity) => {
      const refUri = entity.reference_images?.[0]?.uri ?? "";
      if (!refUri) {
        return;
      }
      // Entity reference images are stored as `<id>.<ext>` keys, so the URL
      // path carries the extension the asset URI needs.
      const extMatch = refUri.split(/[?#]/)[0].match(/\.([A-Za-z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : "";
      addDroppedFiles([
        {
          id: "",
          dataUri: refUri,
          type: ext ? `image/${ext === "jpg" ? "jpeg" : ext}` : "image/png",
          name: entity.name || entity.id,
          assetUri: ext
            ? `asset://${entity.id}.${ext}`
            : `asset://${entity.id}`
        }
      ]);
    },
    [addDroppedFiles]
  );

  const { mentionMenu, handleKeyDown: handleMentionKeyDown } =
    useTextareaAssetMention({
      textareaRef,
      value: prompt,
      setValue: setPrompt,
      onSelectAsset: handleSelectAsset,
      onSelectEntity: handleSelectEntity
    });

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 220);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 220 ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    adjustHeight();
  }, [prompt, adjustHeight]);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // Close any open model / option dialogs whenever the mode changes. The
  // image- and video-model dialogs are intentionally shared between the
  // `image`/`image_edit` and `video`/`image_to_video` chip clusters
  // respectively (their JSX is mutually exclusive), but switching modes
  // programmatically while a dialog is open would otherwise leave it in an
  // orphaned open state pointing at a now-unmounted anchor button.
  useEffect(() => {
    setModeAnchor(null);
    setDurationAnchor(null);
    setResolutionAnchor(null);
    setAspectAnchor(null);
    setVariationsAnchor(null);
    setVoiceAnchor(null);
    setSpeedAnchor(null);
    setAudioFormatAnchor(null);
    setStrengthAnchor(null);
    setStepsAnchor(null);
    setImageModelOpen(false);
    setVideoModelOpen(false);
    setLanguageModelOpen(false);
    setTtsModelOpen(false);
  }, [mode]);

  // Build media_generation payload from current state
  const buildMediaGeneration = useCallback((): MediaGenerationRequest => {
    if (mode === "chat") {
      return { mode: "chat" };
    }
    if (mode === "image") {
      const { width, height } = resolveImageSize(
        imageParams.resolution,
        imageParams.aspectRatio
      );
      return {
        mode: "image",
        provider: imageParams.model?.provider ?? null,
        model: imageParams.model?.id ?? null,
        width,
        height,
        aspect_ratio: imageParams.aspectRatio,
        resolution: imageParams.resolution,
        variations: imageParams.variations
      };
    }
    if (mode === "image_edit") {
      const { width, height } = resolveImageSize(
        imageEditParams.resolution,
        imageEditParams.aspectRatio
      );
      return {
        mode: "image_edit",
        provider: imageEditParams.model?.provider ?? null,
        model: imageEditParams.model?.id ?? null,
        width,
        height,
        aspect_ratio: imageEditParams.aspectRatio,
        resolution: imageEditParams.resolution,
        variations: imageEditParams.variations,
        strength: imageEditParams.strength,
        num_inference_steps: imageEditParams.numInferenceSteps
      };
    }
    if (mode === "video") {
      return {
        mode: "video",
        provider: videoParams.model?.provider ?? null,
        model: videoParams.model?.id ?? null,
        aspect_ratio: videoParams.aspectRatio,
        resolution: videoParams.resolution,
        duration: videoParams.duration
      };
    }
    if (mode === "image_to_video") {
      return {
        mode: "image_to_video",
        provider: imageToVideoParams.model?.provider ?? null,
        model: imageToVideoParams.model?.id ?? null,
        aspect_ratio: imageToVideoParams.aspectRatio,
        resolution: imageToVideoParams.resolution,
        duration: imageToVideoParams.duration,
        num_inference_steps: imageToVideoParams.numInferenceSteps
      };
    }
    if (mode === "audio") {
      return {
        mode: "audio",
        provider: audioParams.model?.provider ?? null,
        model: audioParams.model?.id ?? null,
        voice: audioParams.voice,
        speed: audioParams.speed,
        audio_format: audioParams.format
      };
    }
    return { mode };
  }, [
    mode,
    imageParams.resolution,
    imageParams.aspectRatio,
    imageParams.model,
    imageParams.variations,
    imageEditParams.resolution,
    imageEditParams.aspectRatio,
    imageEditParams.model,
    imageEditParams.variations,
    imageEditParams.strength,
    imageEditParams.numInferenceSteps,
    videoParams.aspectRatio,
    videoParams.resolution,
    videoParams.duration,
    videoParams.model,
    imageToVideoParams.aspectRatio,
    imageToVideoParams.resolution,
    imageToVideoParams.duration,
    imageToVideoParams.numInferenceSteps,
    imageToVideoParams.model,
    audioParams.model,
    audioParams.voice,
    audioParams.speed,
    audioParams.format
  ]);

  const { queuedMessage, sendMessage, cancelQueued } = useMessageQueue({
    isLoading,
    isStreaming,
    onSendMessage: (content, promptText) => {
      onSendMessage(content, promptText, buildMediaGeneration());
    },
    onStop,
    textareaRef
  });

  const placeholder = useMemo(() => {
    if (placeholderOverride) {
      return placeholderOverride;
    }
    if (isPi) {
      return "Message the Pi agent — it works in your workspace…";
    }
    if (mode === "image") {
      return "Describe the image you want to generate…";
    }
    if (mode === "image_edit") {
      return "Describe the edits to apply to the dropped image…";
    }
    if (mode === "video") {
      return "Describe your video… like a man drinking a cup of coffee…";
    }
    if (mode === "image_to_video") {
      return "Describe how the dropped image should animate…";
    }
    if (mode === "audio") {
      return "Type the text you want spoken…";
    }
    if (mode === "audio_to_video") {
      return "Describe a scene synced to audio…";
    }
    if (mode === "retake") {
      return "Refine the last generation…";
    }
    if (mode === "extend") {
      return "Describe how to extend…";
    }
    if (mode === "motion_control") {
      return "Describe the motion…";
    }
    return "Continue the thread — or type @ to add an asset…";
  }, [mode, isPi, placeholderOverride]);

  const isMediaMode =
    mode === "image" ||
    mode === "image_edit" ||
    mode === "video" ||
    mode === "image_to_video" ||
    mode === "audio";

  const canGenerate = prompt.trim().length > 0 || droppedFiles.length > 0;

  const handleSend = useCallback(() => {
    if (!canGenerate) {
      return;
    }
    const content: MessageContent[] = [];
    if (prompt.trim().length > 0) {
      content.push({ type: "text", text: prompt });
    }
    const fileContents = getFileContents();
    const fullContent = [...content, ...fileContents];
    // Only clear the input when the message was actually sent or queued; a
    // dropped message (one already queued) keeps its text and attachments.
    if (sendMessage(fullContent, prompt)) {
      setPrompt("");
      clearFiles();
    }
  }, [
    prompt,
    canGenerate,
    getFileContents,
    sendMessage,
    clearFiles
  ]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ignore the Enter that confirms an IME composition candidate — it fires
      // keydown with isComposing/keyCode 229 and must neither send nor select a
      // mention. Guard before the mention handler and the send logic.
      if (
        e.key === "Enter" &&
        (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)
      ) {
        return;
      }
      // Let the asset-mention picker consume nav / select / dismiss keys first.
      if (handleMentionKeyDown(e)) {
        return;
      }
      if (e.key === "Enter") {
        // Read modifiers from the event, not the global KeyPressedStore, which
        // is stale when the textarea was click-focused with a modifier held.
        if (e.shiftKey) {
          return;
        }
        if (!e.metaKey && !e.altKey) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [handleMentionKeyDown, handleSend]
  );

  const modeIcon = useMemo(() => {
    if (isPi) return <SmartToyOutlinedIcon fontSize="small" />;
    if (mode === "image") return <ImageIcon fontSize="small" />;
    if (mode === "image_edit") return <AutoFixHighIcon fontSize="small" />;
    if (mode === "video") return <VideocamIcon fontSize="small" />;
    if (mode === "image_to_video") return <MovieFilterIcon fontSize="small" />;
    if (mode === "audio") return <RecordVoiceOverIcon fontSize="small" />;
    if (mode === "chat") return <ChatBubbleOutlineIcon fontSize="small" />;
    return <AutoAwesomeIcon fontSize="small" />;
  }, [mode, isPi]);

  const modeLabel = useMemo(() => {
    if (isPi) return "Pi";
    if (mode === "image") return "Image";
    if (mode === "image_edit") return "Image Edit";
    if (mode === "video") return "Video";
    if (mode === "image_to_video") return "Image→Video";
    if (mode === "audio") return "Speech";
    if (mode === "chat") return "Chat";
    if (mode === "audio_to_video") return "Audio→Video";
    if (mode === "retake") return "Retake";
    if (mode === "extend") return "Extend";
    return "Motion";
  }, [mode, isPi]);

  const handlePickImageModel = useCallback(
    (model: ImageModel) => {
      const constraints = imageModelConstraints(model);
      setImageParams({
        model: {
          type: "image_model",
          id: model.id,
          provider: model.provider,
          name: model.name || "",
          path: model.path || "",
          ...constraints
        },
        resolution: clampToAllowed(
          imageParams.resolution,
          constraints.resolutions
        ),
        aspectRatio: clampToAllowed(
          imageParams.aspectRatio,
          constraints.aspectRatios
        )
      });
      addRecentModel({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setImageModelOpen(false);
    },
    [setImageParams, addRecentModel, imageParams.resolution, imageParams.aspectRatio]
  );

  const handlePickVideoModel = useCallback(
    (model: VideoModel) => {
      const constraints = videoModelConstraints(model);
      setVideoParams({
        model: {
          type: "video_model",
          id: model.id,
          provider: model.provider,
          name: model.name || "",
          ...constraints
        },
        duration: clampToAllowed(videoParams.duration, constraints.durations),
        resolution: clampToAllowed(
          videoParams.resolution,
          constraints.resolutions
        ),
        aspectRatio: clampToAllowed(
          videoParams.aspectRatio,
          constraints.aspectRatios
        )
      });
      addRecentModel({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setVideoModelOpen(false);
    },
    [setVideoParams, addRecentModel, videoParams.duration, videoParams.resolution, videoParams.aspectRatio]
  );

  const handlePickImageEditModel = useCallback(
    (model: ImageModel) => {
      const constraints = imageModelConstraints(model);
      setImageEditParams({
        model: {
          type: "image_model",
          id: model.id,
          provider: model.provider,
          name: model.name || "",
          path: model.path || "",
          ...constraints
        },
        resolution: clampToAllowed(
          imageEditParams.resolution,
          constraints.resolutions
        ),
        aspectRatio: clampToAllowed(
          imageEditParams.aspectRatio,
          constraints.aspectRatios
        )
      });
      addRecentModel({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setImageModelOpen(false);
    },
    [setImageEditParams, addRecentModel, imageEditParams.resolution, imageEditParams.aspectRatio]
  );

  const handlePickImageToVideoModel = useCallback(
    (model: VideoModel) => {
      const constraints = videoModelConstraints(model);
      setImageToVideoParams({
        model: {
          type: "video_model",
          id: model.id,
          provider: model.provider,
          name: model.name || "",
          ...constraints
        },
        duration: clampToAllowed(
          imageToVideoParams.duration,
          constraints.durations
        ),
        resolution: clampToAllowed(
          imageToVideoParams.resolution,
          constraints.resolutions
        ),
        aspectRatio: clampToAllowed(
          imageToVideoParams.aspectRatio,
          constraints.aspectRatios
        )
      });
      addRecentModel({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setVideoModelOpen(false);
    },
    [setImageToVideoParams, addRecentModel, imageToVideoParams.duration, imageToVideoParams.resolution, imageToVideoParams.aspectRatio]
  );

  const handlePickTtsModel = useCallback(
    (model: TTSModel) => {
      const voices = Array.isArray(model.voices) ? model.voices : [];
      setAudioParams({
        model: {
          type: "tts_model",
          id: model.id,
          provider: model.provider,
          name: model.name || "",
          voices,
          selected_voice: voices[0] ?? audioParams.voice
        },
        voice: voices[0] ?? audioParams.voice
      });
      addRecentModel({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setTtsModelOpen(false);
    },
    [setAudioParams, addRecentModel, audioParams.voice]
  );

  // The active video model for the current mode drives which duration /
  // resolution / aspect options are offered (falling back to the full set when
  // the model declares no constraints).
  const activeVideoModel =
    mode === "video"
      ? videoParams.model
      : mode === "image_to_video"
        ? imageToVideoParams.model
        : null;

  // Option lists — derived from the active model's manifest (shared with the
  // timeline quick-gen header via buildVideoModelOptions).
  const {
    durationOptions,
    resolutionOptions: videoResolutionOptions,
    aspectOptions: videoAspectOptions
  } = useMemo(() => buildVideoModelOptions(activeVideoModel), [activeVideoModel]);

  // Image option lists — derived from the selected model's manifest (shared
  // with the sketch connected-mode prompt bar via buildImageModelOptions),
  // falling back to the full sets when the model declares no constraints. The
  // image-edit chip cluster has its own model, so it gets a parallel set.
  const {
    aspectOptions: imageAspectOptions,
    resolutionOptions: imageResolutionOptions
  } = useMemo(
    () => buildImageModelOptions(imageParams.model),
    [imageParams.model]
  );

  const {
    aspectOptions: imageEditAspectOptions,
    resolutionOptions: imageEditResolutionOptions
  } = useMemo(
    () => buildImageModelOptions(imageEditParams.model),
    [imageEditParams.model]
  );

  const variationsOptions = useMemo<MediaOption<number>[]>(
    () =>
      IMAGE_VARIATIONS.map((n) => ({
        id: n,
        label: `${n}`,
        description: n === 1 ? "variation" : "variations",
        icon: <AppsIcon fontSize="small" />
      })),
    []
  );

  const voiceOptions = useMemo<MediaOption<string>[]>(() => {
    const fromModel = audioParams.model?.voices ?? [];
    const merged = Array.from(
      new Set([...(fromModel.length > 0 ? fromModel : DEFAULT_TTS_VOICES)])
    );
    return merged.map((id) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      icon: <RecordVoiceOverIcon fontSize="small" />
    }));
  }, [audioParams.model]);

  const speedOptions = useMemo<MediaOption<number>[]>(
    () =>
      AUDIO_SPEEDS.map((s) => ({
        id: s,
        label: `${s}x`,
        icon: <SpeedIcon fontSize="small" />
      })),
    []
  );

  const audioFormatOptions = useMemo<MediaOption<AudioFormat>[]>(
    () =>
      AUDIO_FORMATS.map((f) => ({
        id: f,
        label: f.toUpperCase(),
        icon: <AudiotrackIcon fontSize="small" />
      })),
    []
  );

  const { strengthOptions, stepsOptions } = useMemo(buildImageEditOptions, []);

  const chatProviderLabel = useMemo(() => {
    const m = selectedModel ?? languageModel;
    if (!m?.id) return "Select model";
    return m.name || m.id;
  }, [selectedModel, languageModel]);

  const isBusy = isLoading || isStreaming;
  const isDisabled = disabled || isBusy;
  const elapsed = useElapsedTime(isBusy);

  const removeCallbacks = useMemo(
    () => new Map(droppedFiles.map((f) => [f.id, () => removeFile(f.id)])),
    [droppedFiles, removeFile]
  );

  return (
    <div css={styles} className="media-chat-composer">
      <div
        className={`media-compose-card${isDragging ? " dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {droppedFiles.length > 0 && (
          <div className="media-file-preview-row">
            {droppedFiles.map((file) => (
              <FilePreview
                key={file.id}
                file={file}
                onRemove={removeCallbacks.get(file.id)!}
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="media-compose-input"
          aria-label="Message prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onInput={adjustHeight}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          spellCheck={false}
          autoComplete="off"
        />
        {mentionMenu}

        {queuedMessage && (
          <FlexRow
            gap={0.5}
            align="center"
            sx={{ px: 1, color: "text.secondary" }}
          >
            <Text size="small" color="secondary">
              Message queued - {queuedMessage.prompt.slice(0, 60)}
            </Text>
            <Text
              size="small"
              sx={{
                ml: "auto",
                cursor: "pointer",
                color: "error.main"
              }}
              onClick={cancelQueued}
            >
              Cancel
            </Text>
          </FlexRow>
        )}

        <div
          className={`media-chip-row${trailingActions ? " has-trailing" : ""}`}
        >
          {/* Leading actions (e.g. the canvas dock drag handle). */}
          {leadingActions}
          {/* Chip cluster: mode/model chips. */}
          <div className="media-chip-main">
          {/* Mode selector chip */}
          {!hideModePicker && (
            <>
              <MediaControlChip
                icon={modeIcon}
                label={modeLabel}
                active={!!modeAnchor}
                onClick={(e) => setModeAnchor(e.currentTarget)}
                showChevron
              />
              <MediaModeMenu
                anchorEl={modeAnchor}
                open={!!modeAnchor}
                onClose={() => setModeAnchor(null)}
                value={mode}
                onChange={(m: MediaMode) => {
                  setMode(m);
                  setGlobalMode("chat");
                }}
                showPi={piModeAvailable}
                piSelected={isPi}
                onSelectPi={() => {
                  setMode("chat");
                  setGlobalMode("pi");
                }}
              />
            </>
          )}

          {/* Pi mode: workspace + model pickers instead of the chat model. */}
          {isPi && <PiComposerControls disabled={isBusy} />}

          {/* Model chip — changes based on mode */}
          {!isPi && mode === "chat" && (
            <>
              <MediaControlChip
                ref={languageModelAnchorRef}
                icon={<AutoAwesomeIcon fontSize="small" />}
                label={chatProviderLabel}
                active={languageModelOpen}
                onClick={() => setLanguageModelOpen(true)}
                showChevron={false}
                truncate
                maxWidth={140}
              />
              <PermissionSelector />
              {onMemoryToggle && (
                <MediaControlChip
                  icon={<PsychologyOutlinedIcon fontSize="small" />}
                  title={memoryEnabled ? "Memory: on" : "Memory: off"}
                  active={!!memoryEnabled}
                  showChevron={false}
                  onClick={() => onMemoryToggle(!memoryEnabled)}
                  emphasis={memoryEnabled ? "primary" : "default"}
                />
              )}
              <LanguageModelMenuDialog
                open={languageModelOpen}
                anchorEl={languageModelAnchorRef.current}
                onClose={() => setLanguageModelOpen(false)}
                onModelChange={(model) => {
                  onModelChange?.(model);
                  setLanguageModelOpen(false);
                }}
                allowedProviders={allowedProviders}
                requireToolSupport={requireToolSupport}
              />
            </>
          )}

          {mode === "image" && (
            <>
              <MediaControlChip
                ref={imageModelAnchorRef}
                icon={<AutoAwesomeIcon fontSize="small" />}
                label={imageParams.model?.name || "Select Model"}
                active={imageModelOpen}
                onClick={() => setImageModelOpen(true)}
                showChevron={false}
                truncate
              />
              <ImageModelMenuDialog
                open={imageModelOpen}
                anchorEl={imageModelAnchorRef.current}
                onClose={() => setImageModelOpen(false)}
                onModelChange={handlePickImageModel}
                task="text_to_image"
              />

              <MediaControlChip
                icon={<DisplaySettingsIcon fontSize="small" />}
                label={imageParams.resolution}
                active={!!resolutionAnchor}
                onClick={(e) => setResolutionAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={resolutionAnchor}
                open={!!resolutionAnchor}
                onClose={() => setResolutionAnchor(null)}
                header="Image Resolution"
                value={imageParams.resolution}
                options={imageResolutionOptions}
                onChange={(r) => setImageParams({ resolution: r })}
              />

              <MediaControlChip
                icon={<AspectRatioIcon fontSize="small" />}
                label={imageParams.aspectRatio}
                active={!!aspectAnchor}
                onClick={(e) => setAspectAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaAspectRatioMenu
                anchorEl={aspectAnchor}
                open={!!aspectAnchor}
                onClose={() => setAspectAnchor(null)}
                value={imageParams.aspectRatio}
                options={imageAspectOptions}
                onChange={(v) => setImageParams({ aspectRatio: v })}
              />

              <MediaControlChip
                icon={<AppsIcon fontSize="small" />}
                label={`${imageParams.variations}`}
                active={!!variationsAnchor}
                onClick={(e) => setVariationsAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={variationsAnchor}
                open={!!variationsAnchor}
                onClose={() => setVariationsAnchor(null)}
                header="Number of Variations"
                value={imageParams.variations}
                options={variationsOptions}
                onChange={(n) => setImageParams({ variations: n })}
              />
            </>
          )}

          {mode === "video" && (
            <>
              <MediaControlChip
                ref={videoModelAnchorRef}
                icon={<MovieIcon fontSize="small" />}
                label={videoParams.model?.name || "Select Video Model"}
                active={videoModelOpen}
                onClick={() => setVideoModelOpen(true)}
                truncate
                showChevron={false}
              />
              <VideoModelMenuDialog
                open={videoModelOpen}
                anchorEl={videoModelAnchorRef.current}
                onClose={() => setVideoModelOpen(false)}
                onModelChange={handlePickVideoModel}
                task="text_to_video"
              />

              <MediaControlChip
                icon={<AccessTimeIcon fontSize="small" />}
                label={`${videoParams.duration} Sec`}
                active={!!durationAnchor}
                onClick={(e) => setDurationAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={durationAnchor}
                open={!!durationAnchor}
                onClose={() => setDurationAnchor(null)}
                value={videoParams.duration}
                options={durationOptions}
                onChange={(d) => setVideoParams({ duration: d })}
              />

              <MediaControlChip
                icon={<DisplaySettingsIcon fontSize="small" />}
                label={videoParams.resolution}
                active={!!resolutionAnchor}
                onClick={(e) => setResolutionAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={resolutionAnchor}
                open={!!resolutionAnchor}
                onClose={() => setResolutionAnchor(null)}
                header="Video Resolution"
                value={videoParams.resolution}
                options={videoResolutionOptions}
                onChange={(r) => setVideoParams({ resolution: r })}
              />

              <MediaControlChip
                icon={<AspectRatioIcon fontSize="small" />}
                label={videoParams.aspectRatio}
                active={!!aspectAnchor}
                onClick={(e) => setAspectAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaAspectRatioMenu
                anchorEl={aspectAnchor}
                open={!!aspectAnchor}
                onClose={() => setAspectAnchor(null)}
                value={videoParams.aspectRatio}
                options={videoAspectOptions}
                onChange={(v) => setVideoParams({ aspectRatio: v })}
              />
            </>
          )}

          {mode === "image_edit" && (
            <>
              <MediaControlChip
                ref={imageModelAnchorRef}
                icon={<AutoFixHighIcon fontSize="small" />}
                label={imageEditParams.model?.name || "Select Edit Model"}
                active={imageModelOpen}
                truncate
                onClick={() => setImageModelOpen(true)}
                showChevron={false}
              />
              <ImageModelMenuDialog
                open={imageModelOpen}
                anchorEl={imageModelAnchorRef.current}
                onClose={() => setImageModelOpen(false)}
                onModelChange={handlePickImageEditModel}
                task="image_to_image"
              />

              <MediaControlChip
                icon={<DisplaySettingsIcon fontSize="small" />}
                label={imageEditParams.resolution}
                active={!!resolutionAnchor}
                onClick={(e) => setResolutionAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={resolutionAnchor}
                open={!!resolutionAnchor}
                onClose={() => setResolutionAnchor(null)}
                header="Image Resolution"
                value={imageEditParams.resolution}
                options={imageEditResolutionOptions}
                onChange={(r) => setImageEditParams({ resolution: r })}
              />

              <MediaControlChip
                icon={<AspectRatioIcon fontSize="small" />}
                label={imageEditParams.aspectRatio}
                active={!!aspectAnchor}
                onClick={(e) => setAspectAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaAspectRatioMenu
                anchorEl={aspectAnchor}
                open={!!aspectAnchor}
                onClose={() => setAspectAnchor(null)}
                value={imageEditParams.aspectRatio}
                options={imageEditAspectOptions}
                onChange={(v) => setImageEditParams({ aspectRatio: v })}
              />

              <MediaControlChip
                icon={<TuneIcon fontSize="small" />}
                label={`Strength ${imageEditParams.strength.toFixed(2)}`}
                active={!!strengthAnchor}
                onClick={(e) => setStrengthAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={strengthAnchor}
                open={!!strengthAnchor}
                onClose={() => setStrengthAnchor(null)}
                header="Edit Strength"
                value={imageEditParams.strength}
                options={strengthOptions}
                onChange={(s) => setImageEditParams({ strength: s })}
              />

              <MediaControlChip
                icon={<LayersIcon fontSize="small" />}
                label={`${imageEditParams.numInferenceSteps} steps`}
                active={!!stepsAnchor}
                onClick={(e) => setStepsAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={stepsAnchor}
                open={!!stepsAnchor}
                onClose={() => setStepsAnchor(null)}
                header="Inference Steps"
                value={imageEditParams.numInferenceSteps}
                options={stepsOptions}
                onChange={(n) =>
                  setImageEditParams({ numInferenceSteps: n })
                }
              />

              <MediaControlChip
                icon={<AppsIcon fontSize="small" />}
                label={`${imageEditParams.variations}`}
                active={!!variationsAnchor}
                onClick={(e) => setVariationsAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={variationsAnchor}
                open={!!variationsAnchor}
                onClose={() => setVariationsAnchor(null)}
                header="Number of Variations"
                value={imageEditParams.variations}
                options={variationsOptions}
                onChange={(n) => setImageEditParams({ variations: n })}
              />
            </>
          )}

          {mode === "image_to_video" && (
            <>
              <MediaControlChip
                ref={videoModelAnchorRef}
                icon={<MovieFilterIcon fontSize="small" />}
                label={
                  imageToVideoParams.model?.name || "Select I2V Model"
                }
                active={videoModelOpen}
                onClick={() => setVideoModelOpen(true)}
                showChevron={false}
                truncate
              />
              <VideoModelMenuDialog
                open={videoModelOpen}
                anchorEl={videoModelAnchorRef.current}
                onClose={() => setVideoModelOpen(false)}
                onModelChange={handlePickImageToVideoModel}
                task="image_to_video"
              />

              <MediaControlChip
                icon={<AccessTimeIcon fontSize="small" />}
                label={`${imageToVideoParams.duration} Sec`}
                active={!!durationAnchor}
                onClick={(e) => setDurationAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={durationAnchor}
                open={!!durationAnchor}
                onClose={() => setDurationAnchor(null)}
                header="Clip Duration"
                value={imageToVideoParams.duration}
                options={durationOptions}
                onChange={(d) => setImageToVideoParams({ duration: d })}
              />

              <MediaControlChip
                icon={<DisplaySettingsIcon fontSize="small" />}
                label={imageToVideoParams.resolution}
                active={!!resolutionAnchor}
                onClick={(e) => setResolutionAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={resolutionAnchor}
                open={!!resolutionAnchor}
                onClose={() => setResolutionAnchor(null)}
                header="Video Resolution"
                value={imageToVideoParams.resolution}
                options={videoResolutionOptions}
                onChange={(r) => setImageToVideoParams({ resolution: r })}
              />

              <MediaControlChip
                icon={<AspectRatioIcon fontSize="small" />}
                label={imageToVideoParams.aspectRatio}
                active={!!aspectAnchor}
                onClick={(e) => setAspectAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaAspectRatioMenu
                anchorEl={aspectAnchor}
                open={!!aspectAnchor}
                onClose={() => setAspectAnchor(null)}
                value={imageToVideoParams.aspectRatio}
                options={videoAspectOptions}
                onChange={(v) => setImageToVideoParams({ aspectRatio: v })}
              />

              <MediaControlChip
                icon={<LayersIcon fontSize="small" />}
                label={`${imageToVideoParams.numInferenceSteps} steps`}
                active={!!stepsAnchor}
                onClick={(e) => setStepsAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={stepsAnchor}
                open={!!stepsAnchor}
                onClose={() => setStepsAnchor(null)}
                header="Inference Steps"
                value={imageToVideoParams.numInferenceSteps}
                options={stepsOptions}
                onChange={(n) =>
                  setImageToVideoParams({ numInferenceSteps: n })
                }
              />
            </>
          )}

          {mode === "audio" && (
            <>
              <MediaControlChip
                ref={ttsModelAnchorRef}
                icon={<GraphicEqIcon fontSize="small" />}
                label={audioParams.model?.name || "Select TTS Model"}
                active={ttsModelOpen}
                onClick={() => setTtsModelOpen(true)}
                showChevron={false}
                truncate
              />
              <TTSModelMenuDialog
                open={ttsModelOpen}
                anchorEl={ttsModelAnchorRef.current}
                onClose={() => setTtsModelOpen(false)}
                onModelChange={handlePickTtsModel}
              />

              <MediaControlChip
                icon={<RecordVoiceOverIcon fontSize="small" />}
                label={
                  audioParams.voice
                    ? audioParams.voice.charAt(0).toUpperCase() +
                      audioParams.voice.slice(1)
                    : "Voice"
                }
                active={!!voiceAnchor}
                onClick={(e) => setVoiceAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={voiceAnchor}
                open={!!voiceAnchor}
                onClose={() => setVoiceAnchor(null)}
                header="Voice"
                value={audioParams.voice}
                options={voiceOptions}
                onChange={(v) => setAudioParams({ voice: v })}
              />

              <MediaControlChip
                icon={<SpeedIcon fontSize="small" />}
                label={`${audioParams.speed}x`}
                active={!!speedAnchor}
                onClick={(e) => setSpeedAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={speedAnchor}
                open={!!speedAnchor}
                onClose={() => setSpeedAnchor(null)}
                header="Speech Rate"
                value={audioParams.speed}
                options={speedOptions}
                onChange={(s) => setAudioParams({ speed: s })}
              />

              <MediaControlChip
                icon={<AudiotrackIcon fontSize="small" />}
                label={audioParams.format.toUpperCase()}
                active={!!audioFormatAnchor}
                onClick={(e) => setAudioFormatAnchor(e.currentTarget)}
                showChevron={false}
              />
              <MediaOptionMenu
                anchorEl={audioFormatAnchor}
                open={!!audioFormatAnchor}
                onClose={() => setAudioFormatAnchor(null)}
                header="Audio Format"
                value={audioParams.format}
                options={audioFormatOptions}
                onChange={(f) => setAudioParams({ format: f })}
              />
            </>
          )}

          </div>

          {/* Primary Generate/Send button, or timer + stop when busy. Sits
              between the chip cluster and the host actions rather than inside
              the chips: on mobile the row wraps, and this lets the send button
              join the workflow action buttons on one line instead of being
              stranded on the chip line. */}
          <div className="media-primary-action">
            {isBusy ? (
              <FlexRow gap={1} alignItems="center">
                <Text
                  size="small"
                  sx={{
                    color: theme.vars.palette.grey[400],
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 48,
                    textAlign: "right"
                  }}
                >
                  {formatElapsed(elapsed)}
                </Text>
                {onStop && <StopGenerationButton onClick={onStop} />}
              </FlexRow>
            ) : (
              <button
                type="button"
                className={`media-generate-btn${isMediaMode ? "" : " chat-send"}`}
                onClick={handleSend}
                disabled={isDisabled || !canGenerate}
                aria-label={isMediaMode ? "Generate" : "Send"}
              >
                {isMediaMode ? "Generate" : <ArrowUpwardIcon fontSize="small" />}
              </button>
            )}
          </div>

          {/* Host-supplied actions at the end of the footer (e.g. the canvas
              Run button + workflow menu). Empty in the chat panel. */}
          {trailingActions}
        </div>
      </div>

    </div>
  );
};

export default memo(MediaChatComposer);
