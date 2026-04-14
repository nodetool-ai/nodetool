/** @jsxImportSource @emotion/react */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import AppsIcon from "@mui/icons-material/Apps";
import DisplaySettingsIcon from "@mui/icons-material/Tv";
import RefreshIcon from "@mui/icons-material/Refresh";
import ImageIcon from "@mui/icons-material/Image";
import MovieIcon from "@mui/icons-material/Movie";
import VideocamIcon from "@mui/icons-material/Videocam";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SettingsIcon from "@mui/icons-material/Settings";

import { FlexRow, Text, Tooltip } from "../../ui_primitives";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import useMediaGenerationStore, {
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  IMAGE_VARIATIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
  resolveImageSize
} from "../../../stores/MediaGenerationStore";
import type {
  MediaMode,
  ImageResolution,
  VideoResolution
} from "../../../stores/MediaGenerationStore";
import MediaControlChip from "./MediaControlChip";
import MediaModeMenu from "./MediaModeMenu";
import MediaOptionMenu, { MediaOption } from "./MediaOptionMenu";
import MediaAspectRatioMenu from "./MediaAspectRatioMenu";
import ImageModelMenuDialog from "../../model_menu/ImageModelMenuDialog";
import VideoModelMenuDialog from "../../model_menu/VideoModelMenuDialog";
import LanguageModelMenuDialog from "../../model_menu/LanguageModelMenuDialog";
import type {
  ImageModel,
  LanguageModel,
  MessageContent,
  VideoModel
} from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../types/media.types";
import { FilePreview } from "./FilePreview";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { useKeyPressed } from "../../../stores/KeyPressedStore";
import { useMessageQueue } from "../../../hooks/useMessageQueue";
import { createMediaComposerStyles } from "./MediaChatComposer.styles";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { AgentModeSelector } from "./AgentModeSelector";
import log from "loglevel";

export interface MediaChatComposerProps {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    agentMode: boolean,
    mediaGeneration?: MediaGenerationRequest
  ) => void;
  onStop?: () => void;
  onNewChat?: () => void;
  disabled?: boolean;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  allowedProviders?: string[];
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
 *       • video → model, duration, resolution (1080p/1440p/4K), aspect ratio
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
  agentMode = false,
  onAgentModeToggle,
  selectedModel,
  onModelChange,
  allowedProviders
}) => {
  const theme = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");

  // Mode + media params from persistent store
  const mode = useMediaGenerationStore((s) => s.mode);
  const setMode = useMediaGenerationStore((s) => s.setMode);
  const imageParams = useMediaGenerationStore((s) => s.image);
  const setImageParams = useMediaGenerationStore((s) => s.setImageParams);
  const videoParams = useMediaGenerationStore((s) => s.video);
  const setVideoParams = useMediaGenerationStore((s) => s.setVideoParams);

  // Language-model selection from chat store (used in chat mode & forwarded
  // as provider/model for media calls when a media model is not picked).
  const languageModel = useGlobalChatStore((s) => s.selectedModel);

  const addRecentModel = useModelPreferencesStore((s) => s.addRecent);

  // Popover anchors
  const [modeAnchor, setModeAnchor] = useState<HTMLButtonElement | null>(null);
  const [durationAnchor, setDurationAnchor] = useState<HTMLButtonElement | null>(null);
  const [resolutionAnchor, setResolutionAnchor] = useState<HTMLButtonElement | null>(null);
  const [aspectAnchor, setAspectAnchor] = useState<HTMLButtonElement | null>(null);
  const [variationsAnchor, setVariationsAnchor] = useState<HTMLButtonElement | null>(null);
  const [imageModelOpen, setImageModelOpen] = useState(false);
  const [videoModelOpen, setVideoModelOpen] = useState(false);
  const [languageModelOpen, setLanguageModelOpen] = useState(false);
  const imageModelAnchorRef = useRef<HTMLButtonElement | null>(null);
  const languageModelAnchorRef = useRef<HTMLButtonElement | null>(null);
  const videoModelAnchorRef = useRef<HTMLButtonElement | null>(null);

  // File handling (input images for image-to-image / motion-control later)
  const { droppedFiles, addFiles, removeFile, clearFiles, getFileContents, addDroppedFiles } =
    useFileHandling();
  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(addFiles, addDroppedFiles);

  const { shiftKeyPressed, metaKeyPressed, altKeyPressed } = useKeyPressed(
    (state) => ({
      shiftKeyPressed: state.isKeyPressed("shift"),
      metaKeyPressed: state.isKeyPressed("meta"),
      altKeyPressed: state.isKeyPressed("alt")
    })
  );

  // Adjust textarea height based on content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 220);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 220 ? "auto" : "hidden";
  }, [prompt]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

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
    return { mode };
  }, [
    mode,
    imageParams.resolution,
    imageParams.aspectRatio,
    imageParams.model,
    imageParams.variations,
    videoParams.aspectRatio,
    videoParams.resolution,
    videoParams.duration,
    videoParams.model
  ]);

  const { queuedMessage, sendMessage, cancelQueued } = useMessageQueue({
    isLoading,
    isStreaming,
    onSendMessage: (content, promptText, agent) => {
      onSendMessage(content, promptText, agent, buildMediaGeneration());
    },
    onStop,
    textareaRef
  });

  const placeholder = useMemo(() => {
    if (mode === "image") {
      return "Describe the image you want to generate…";
    }
    if (mode === "video") {
      return "Describe your video… like a man drinking a cup of coffee…";
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
    return "Type a message… (Shift+Enter for new line)";
  }, [mode]);

  const isMediaMode = mode === "image" || mode === "video";

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
    sendMessage(fullContent, prompt, agentMode);
    setPrompt("");
    clearFiles();
  }, [
    prompt,
    canGenerate,
    getFileContents,
    sendMessage,
    clearFiles,
    agentMode
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter") {
        if (shiftKeyPressed) {
          return;
        }
        if (!metaKeyPressed && !altKeyPressed) {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [shiftKeyPressed, metaKeyPressed, altKeyPressed, handleSend]
  );

  // Mode icon for the mode chip
  const modeIcon = useMemo(() => {
    if (mode === "image") return <ImageIcon fontSize="small" />;
    if (mode === "video") return <VideocamIcon fontSize="small" />;
    if (mode === "chat") return <ChatBubbleOutlineIcon fontSize="small" />;
    return <AutoAwesomeIcon fontSize="small" />;
  }, [mode]);

  const modeLabel = useMemo(() => {
    if (mode === "image") return "Image";
    if (mode === "video") return "Video";
    if (mode === "chat") return "Chat";
    if (mode === "audio_to_video") return "Audio→Video";
    if (mode === "retake") return "Retake";
    if (mode === "extend") return "Extend";
    return "Motion";
  }, [mode]);

  // Model dialog selection callbacks
  const handlePickImageModel = useCallback(
    (model: ImageModel) => {
      setImageParams({
        model: {
          type: "image_model",
          id: model.id,
          provider: model.provider,
          name: model.name || "",
          path: model.path || ""
        }
      });
      addRecentModel({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setImageModelOpen(false);
    },
    [setImageParams, addRecentModel]
  );

  const handlePickVideoModel = useCallback(
    (model: VideoModel) => {
      setVideoParams({
        model: {
          type: "video_model",
          id: model.id,
          provider: model.provider,
          name: model.name || ""
        }
      });
      addRecentModel({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setVideoModelOpen(false);
    },
    [setVideoParams, addRecentModel]
  );

  // Option lists
  const durationOptions = useMemo<MediaOption<number>[]>(
    () =>
      VIDEO_DURATIONS.map((d) => ({
        id: d,
        label: `${d} Sec`,
        icon: <AccessTimeIcon fontSize="small" />
      })),
    []
  );

  const videoResolutionOptions = useMemo<MediaOption<VideoResolution>[]>(
    () =>
      VIDEO_RESOLUTIONS.map((r) => ({
        id: r,
        label: r,
        icon: <DisplaySettingsIcon fontSize="small" />
      })),
    []
  );

  const imageResolutionOptions = useMemo<MediaOption<ImageResolution>[]>(
    () =>
      IMAGE_RESOLUTIONS.map((r) => ({
        id: r,
        label: r,
        icon: <DisplaySettingsIcon fontSize="small" />
      })),
    []
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

  const chatProviderLabel = useMemo(() => {
    const m = selectedModel ?? languageModel;
    if (!m?.id) return "Select model";
    return m.name || m.id;
  }, [selectedModel, languageModel]);

  const handleRetake = useCallback(() => {
    setPrompt("");
    clearFiles();
    log.debug("Media composer reset");
  }, [clearFiles]);

  const handleMoreClick = useCallback(() => {
    // Placeholder for "More" menu — additional options (seed, negative
    // prompt, guidance scale, etc.) will live here in a follow-up.
    log.info("Media composer: More options (coming soon)");
  }, []);

  const isDisabled = disabled || isLoading || isStreaming;

  return (
    <div css={createMediaComposerStyles(theme)} className="media-chat-composer">
      <div
        className={`media-compose-card${isDragging ? " dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {droppedFiles.length > 0 && (
          <div className="media-file-preview-row">
            {droppedFiles.map((file, index) => (
              <FilePreview
                key={file.id}
                file={file}
                onRemove={() => removeFile(index)}
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="media-compose-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          spellCheck={false}
          autoComplete="off"
        />

        {queuedMessage && (
          <FlexRow
            gap={0.5}
            align="center"
            sx={{ px: 1, color: "text.secondary" }}
          >
            <Text size="small" color="secondary">
              Message queued — {queuedMessage.prompt.slice(0, 60)}
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

        <div className="media-chip-row">
          {/* Mode selector chip */}
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
            onChange={(m: MediaMode) => setMode(m)}
          />

          {/* Model chip — changes based on mode */}
          {mode === "chat" && (
            <>
              <MediaControlChip
                ref={languageModelAnchorRef}
                icon={<AutoAwesomeIcon fontSize="small" />}
                label={chatProviderLabel}
                active={languageModelOpen}
                onClick={() => setLanguageModelOpen(true)}
                showChevron={false}
              />
              <LanguageModelMenuDialog
                open={languageModelOpen}
                anchorEl={languageModelAnchorRef.current}
                onClose={() => setLanguageModelOpen(false)}
                onModelChange={(model) => {
                  onModelChange?.(model);
                  setLanguageModelOpen(false);
                }}
                allowedProviders={allowedProviders}
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
                options={IMAGE_ASPECT_RATIOS}
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
                options={VIDEO_ASPECT_RATIOS}
                onChange={(v) => setVideoParams({ aspectRatio: v })}
              />

              <MediaControlChip
                icon={<SettingsIcon fontSize="small" />}
                label="More"
                onClick={handleMoreClick}
                showChevron={false}
              />
            </>
          )}

          {/* Chat-specific: agent mode toggle is surfaced here so the
              composer still exposes it in chat mode. */}
          {mode === "chat" && onAgentModeToggle && (
            <AgentModeSelector
              agentMode={agentMode}
              onToggle={onAgentModeToggle}
            />
          )}

          <div className="media-chip-spacer" />

          {/* Retake (refresh) button */}
          <Tooltip title="Clear prompt" delay={TOOLTIP_ENTER_DELAY}>
            <button
              type="button"
              className="media-retake-btn"
              onClick={handleRetake}
              disabled={!canGenerate}
              aria-label="Clear prompt"
            >
              <RefreshIcon />
            </button>
          </Tooltip>

          {/* Primary Generate button */}
          <button
            type="button"
            className={`media-generate-btn${isMediaMode ? "" : " chat-send"}`}
            onClick={handleSend}
            disabled={isDisabled || !canGenerate}
            aria-label={isMediaMode ? "Generate" : "Send"}
          >
            {isMediaMode ? "Generate" : "Send"}
          </button>
        </div>
      </div>

    </div>
  );
};

export default memo(MediaChatComposer);
