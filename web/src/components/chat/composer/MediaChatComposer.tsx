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
import useMediaQuery from "@mui/material/useMediaQuery";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import { FlexRow, LoadingSpinner, Text } from "../../ui_primitives";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import useMediaGenerationStore, {
  resolveImageSize
} from "../../../stores/MediaGenerationStore";
import MediaControlChip from "./MediaControlChip";
import WorkspaceChip from "../../workspaces/WorkspaceChip";
import ModeChips from "./ModeChips";
import ModeSelectChip from "./ModeSelectChip";
import ModelChip, { type ModelPickerHandle } from "./ModelChip";
import ModeProviderSetupBanner from "./ModeProviderSetupBanner";
import SelectModelBanner from "./SelectModelBanner";
import { useModeProviderSetup } from "./useModeProviderSetup";
import type {
  Asset,
  LanguageModel,
  MessageContent
} from "../../../stores/ApiTypes";
import { isModelSelected, type ModelSelection } from "@nodetool-ai/protocol";
import type { MediaGenerationRequest } from "../types/media.types";
import { assetToUri } from "../../node_types/editing/promptComposer/promptTokens";
import { useTextareaAssetMention } from "./useTextareaAssetMention";
import { useTextareaSkillMention } from "./useTextareaSkillMention";
import { MentionedEntities } from "./MentionedEntities";
import { VoiceInputControl } from "./voice/VoiceInputControl";
import { FilePreview } from "./FilePreview";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { useComposerAssetUpload } from "../hooks/useComposerAssetUpload";
import { usePromptHistory } from "../hooks/usePromptHistory";
import { useMessageQueue } from "../../../hooks/useMessageQueue";
import { createMediaComposerStyles } from "./MediaChatComposer.styles";
import { useChatDraftStore } from "../../../stores/ChatDraftStore";
import { StopGenerationButton } from "./StopGenerationButton";
import MediaCostEstimate from "./MediaCostEstimate";
import PermissionSelector from "./PermissionSelector";
import { useAutoFocusEnabled } from "../../../hooks/useAutoFocusEnabled";
import { useFirstRunLanguageModel } from "../../../hooks/useFirstRunLanguageModel";

/** Textarea growth caps. The mobile one matches the composer stylesheet — on a
 *  phone the keyboard already owns most of the screen. */
const TEXTAREA_MAX_HEIGHT = 220;
const MOBILE_TEXTAREA_MAX_HEIGHT = 140;

/** Below this card width the chip row goes icon-first and stops wrapping, so
 *  the chips stay on one line in a narrow column (the project agent) as well
 *  as on a phone. */
const NARROW_CARD_WIDTH = 520;

interface MediaChatComposerProps {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (
    content: MessageContent[],
    prompt: string,
    mediaGeneration?: MediaGenerationRequest
  ) => void;
  onStop?: () => void;
  disabled?: boolean;
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
  /**
   * Hide the language-model chip. The Studio beginner shell pins the assistant
   * to a curated model, so there is nothing to pick.
   */
  hideModelPicker?: boolean;
  /** Thread this composer writes to. A surface that has a prompt in mind — the
   *  new-project quick starters, an "edit and resend" on a sent message — seeds
   *  it through ChatDraftStore; the seed lands in the textarea, unsent. */
  threadId?: string | null;
}

/**
 * Media-generation chat composer.
 *
 * Renders a slick rounded glass card with:
 *   - A large prompt textarea
 *   - A footer chip row whose content adapts to the selected mode:
 *       • chat  → language model + permission mode
 *       • image → model, resolution (1K/2K/4K), aspect ratio, # variations
 *       • video → model, duration, resolution (720p/1080p/1440p/4K), aspect ratio
 *     Each mode's cluster lives in {@link ModeChips} and owns the menus it
 *     opens, so switching mode unmounts them.
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
  selectedModel,
  onModelChange,
  allowedProviders,
  requireToolSupport,
  autoFocus = true,
  trailingActions,
  leadingActions,
  placeholder: placeholderOverride,
  hideModePicker = false,
  hideModelPicker = false,
  threadId
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const styles = useMemo(() => createMediaComposerStyles(theme), [theme]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composeCardRef = useRef<HTMLDivElement>(null);
  const autoFocusEnabled = useAutoFocusEnabled();
  const [prompt, setPrompt] = useState("");
  const [cardWidth, setCardWidth] = useState(0);
  const isBusy = isLoading || isStreaming;

  // The composer is hosted in columns of very different widths, so the chip
  // layout follows the card rather than the viewport.
  useLayoutEffect(() => {
    const el = composeCardRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setCardWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Icon-first chips on one non-wrapping line. */
  const isCompact = isMobile || (cardWidth > 0 && cardWidth < NARROW_CARD_WIDTH);

  // Mode + media params from persistent store. The params are read here for
  // the outgoing `media_generation` payload; the chips that edit them read
  // their own slice.
  const storeMode = useMediaGenerationStore((s) => s.mode);
  const setMode = useMediaGenerationStore((s) => s.setMode);
  const imageParams = useMediaGenerationStore((s) => s.image);
  const imageEditParams = useMediaGenerationStore((s) => s.imageEdit);
  const videoParams = useMediaGenerationStore((s) => s.video);
  const imageToVideoParams = useMediaGenerationStore((s) => s.imageToVideo);
  const audioParams = useMediaGenerationStore((s) => s.audio);

  // Language-model selection from chat store (used in chat mode & forwarded
  // as provider/model for media calls when a media model is not picked).
  const languageModel = useGlobalChatStore((s) => s.selectedModel);
  // A new account has an unsendable placeholder here. Fill it once from the
  // recommended models rather than let the menu's first row decide.
  useFirstRunLanguageModel();
  const permissionMode = useGlobalChatStore((s) =>
    s.getPermissionMode(threadId ?? s.currentThreadId)
  );

  // Pure-chat panels force chat mode and ignore the global media mode.
  const mode = hideModePicker ? "chat" : storeMode;

  // When the selected mode's capability has no configured provider, surface a
  // setup banner and route the send into the provider-onboarding dialog
  // instead of letting the request fail server-side.
  const providerSetup = useModeProviderSetup(mode);

  // The mounted model chip for this mode — chat's, or the one `ModeChips`
  // renders. Exactly one exists at a time, and a refused send opens it.
  const modelPickerRef = useRef<ModelPickerHandle>(null);
  const openModelPicker = useCallback(() => {
    modelPickerRef.current?.open();
  }, []);

  // File handling (input images for image-to-image / motion-control later)
  const { droppedFiles, removeFile, clearFiles, getFileContents, addDroppedFiles } =
    useFileHandling();

  // Every local file — picked, dropped, or pasted — goes to the asset library
  // first and rides as an `asset://` reference, so the bytes never enter the
  // message. Inlining them base64-encodes the file into the thread, which the
  // client then resends with every following turn.
  const attachInputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles, isUploading } = useComposerAssetUpload(addDroppedFiles);

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(uploadFiles, addDroppedFiles);

  const openAttachPicker = useCallback(() => {
    attachInputRef.current?.click();
  }, []);

  const handleAttachPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      uploadFiles(Array.from(e.target.files ?? []));
      // Reset so picking the same file twice fires change again.
      e.target.value = "";
    },
    [uploadFiles]
  );

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

  const { mentionMenu, handleKeyDown: handleMentionKeyDown } =
    useTextareaAssetMention({
      textareaRef,
      value: prompt,
      setValue: setPrompt,
      onSelectAsset: handleSelectAsset,
      includeEntities: true
    });
  const {
    skillMenu,
    handleKeyDown: handleSkillKeyDown,
    isOpen: isSkillMenuOpen,
    menuId: skillMenuId
  } = useTextareaSkillMention({
    textareaRef,
    value: prompt,
    setValue: setPrompt
  });

  const {
    record: recordHistory,
    handleKeyDown: handleHistoryKeyDown,
    resetNavigation: resetHistoryNavigation
  } = usePromptHistory({ value: prompt, setValue: setPrompt, textareaRef });

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    const max = isMobile
      ? MOBILE_TEXTAREA_MAX_HEIGHT
      : TEXTAREA_MAX_HEIGHT;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [isMobile]);

  /** Set when a seed lands, so the caret follows it once React has rendered
   *  the new text — reading `el.value` any earlier gives the old prompt. */
  const seedCaretPending = useRef(false);

  useLayoutEffect(() => {
    adjustHeight();
    if (!seedCaretPending.current) {
      return;
    }
    seedCaretPending.current = false;
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    // The user just tapped something that means "type this", so focus here
    // regardless of `autoFocusEnabled`.
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [prompt, adjustHeight]);

  // Skipped on touch, where the virtual keyboard would cover the composer.
  useEffect(() => {
    if (autoFocus && autoFocusEnabled) {
      textareaRef.current?.focus();
    }
  }, [autoFocus, autoFocusEnabled]);

  // A seed parked for this thread lands in the box, whether it was parked
  // before the composer mounted or while it sits open. An empty box takes the
  // seed as-is; a half-written prompt keeps what the user typed and gets the
  // seed on the next line.
  const takeDraft = useChatDraftStore((s) => s.takeDraft);
  const pendingDraft = useChatDraftStore((s) =>
    threadId ? s.drafts[threadId] : undefined
  );
  useEffect(() => {
    if (!threadId || pendingDraft === undefined) {
      return;
    }
    const draft = takeDraft(threadId);
    if (draft === undefined) {
      return;
    }
    setPrompt((current) => (current ? `${current}\n${draft}` : draft));
    seedCaretPending.current = true;
  }, [pendingDraft, threadId, takeDraft]);

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
    imageParams,
    imageEditParams,
    videoParams,
    imageToVideoParams,
    audioParams
  ]);

  const { queuedMessage, sendMessage, cancelQueued, sendQueuedNow } =
    useMessageQueue({
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
    if (mode === "image") {
      return isMobile
        ? "Describe an image…"
        : "Describe the image you want to generate…";
    }
    if (mode === "image_edit") {
      return isMobile
        ? "Describe the edits…"
        : "Describe the edits to apply to the dropped image…";
    }
    if (mode === "video") {
      return isMobile
        ? "Describe a video…"
        : "Describe your video… like a man drinking a cup of coffee…";
    }
    if (mode === "image_to_video") {
      return isMobile
        ? "Describe the animation…"
        : "Describe how the dropped image should animate…";
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
    if (mode === "chat" && permissionMode === "plan") {
      return isMobile
        ? "Describe the work to plan…"
        : "Describe the work. The agent will propose a plan, not run it.";
    }
    return isMobile
      ? "Message… or @ to add an asset"
      : "Continue the thread — or type @ to add an asset…";
  }, [mode, isMobile, placeholderOverride, permissionMode]);

  const isMediaMode =
    mode === "image" ||
    mode === "image_edit" ||
    mode === "video" ||
    mode === "image_to_video" ||
    mode === "audio";

  const chatModel = selectedModel ?? languageModel;

  const modelGate = useMemo((): {
    model: ModelSelection | null | undefined;
    label: string;
  } | null => {
    if (mode === "chat") {
      return { model: chatModel, label: "language" };
    }
    if (mode === "image") {
      return { model: imageParams.model, label: "image" };
    }
    if (mode === "image_edit") {
      return { model: imageEditParams.model, label: "image edit" };
    }
    if (mode === "video") {
      return { model: videoParams.model, label: "video" };
    }
    if (mode === "image_to_video") {
      return { model: imageToVideoParams.model, label: "image to video" };
    }
    if (mode === "audio") {
      return { model: audioParams.model, label: "speech" };
    }
    return null;
  }, [
    mode,
    chatModel,
    imageParams.model,
    imageEditParams.model,
    videoParams.model,
    imageToVideoParams.model,
    audioParams.model
  ]);

  // A send with no model picked can only fail on the server, so the composer
  // refuses it and opens the picker instead.
  const needsModel = !!modelGate && !isModelSelected(modelGate.model);

  const canGenerate = prompt.trim().length > 0 || droppedFiles.length > 0;

  const submitPrompt = useCallback(
    (text: string) => {
      if (text.trim().length === 0 && droppedFiles.length === 0) {
        return;
      }
      // No configured provider can serve this mode — sending would only fail on
      // the server. Keep the prompt and guide the user through provider setup.
      if (providerSetup.needsSetup) {
        providerSetup.openSetup();
        return;
      }
      // Nothing is picked for this mode. The server rejects such a turn, so keep
      // the prompt and open the picker instead of sending.
      if (needsModel) {
        openModelPicker();
        return;
      }
      const content: MessageContent[] = [];
      if (text.trim().length > 0) {
        content.push({ type: "text", text });
      }
      const fileContents = getFileContents();
      const fullContent = [...content, ...fileContents];
      // Only clear the input when the message was actually sent or queued; a
      // dropped message (one already queued) keeps its text and attachments.
      if (sendMessage(fullContent, text)) {
        recordHistory(text);
        setPrompt("");
        clearFiles();
      }
    },
    [
      droppedFiles,
      getFileContents,
      sendMessage,
      clearFiles,
      recordHistory,
      providerSetup,
      needsModel,
      openModelPicker
    ]
  );

  const handleSend = useCallback(() => {
    submitPrompt(prompt);
  }, [prompt, submitPrompt]);

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      const typed = prompt.trim();
      const text = typed.length > 0 ? `${typed} ${transcript}` : transcript;
      // A chat turn sends straight away. A media mode bills for the run it
      // would start, so a dictated prompt lands in the box for review instead.
      if (isMediaMode) {
        setPrompt(text);
        textareaRef.current?.focus();
        return;
      }
      submitPrompt(text);
    },
    [prompt, submitPrompt, isMediaMode]
  );

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
        uploadFiles(imageFiles);
      }
    },
    [uploadFiles]
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
      // Then let the skill picker consume its navigation and selection keys.
      if (handleSkillKeyDown(e)) {
        return;
      }
      // With no menu open to dismiss, Escape stops the reply in flight — the
      // keyboard path to the Stop button the composer is already showing.
      if (e.key === "Escape" && isBusy && onStop) {
        e.preventDefault();
        onStop();
        return;
      }
      // Then history navigation (ArrowUp/ArrowDown) when the picker is closed.
      if (handleHistoryKeyDown(e)) {
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
    [
      handleMentionKeyDown,
      handleSkillKeyDown,
      handleHistoryKeyDown,
      handleSend,
      isBusy,
      onStop
    ]
  );

  const chatProviderLabel = useMemo(() => {
    if (!isModelSelected(chatModel)) return "Select model";
    return chatModel.name || chatModel.id;
  }, [chatModel]);

  const isDisabled = disabled || isBusy;

  const removeCallbacks = useMemo(
    () => new Map(droppedFiles.map((f) => [f.id, () => removeFile(f.id)])),
    [droppedFiles, removeFile]
  );

  return (
    <div css={styles} className="media-chat-composer">
      <div
        ref={composeCardRef}
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

        <MentionedEntities value={prompt} setValue={setPrompt} />

        <textarea
          ref={textareaRef}
          className="media-compose-input"
          aria-label="Message prompt"
          aria-expanded={isSkillMenuOpen}
          aria-controls={isSkillMenuOpen ? skillMenuId : undefined}
          value={prompt}
          onChange={(e) => {
            resetHistoryNavigation();
            setPrompt(e.target.value);
          }}
          onInput={adjustHeight}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          spellCheck={false}
          autoComplete="off"
        />
        {mentionMenu}
        {skillMenu}

        {providerSetup.needsSetup && providerSetup.reason && (
          <ModeProviderSetupBanner
            reason={providerSetup.reason}
            onConnect={providerSetup.openSetup}
          />
        )}

        {!providerSetup.needsSetup && needsModel && modelGate && (
          <SelectModelBanner
            reason={`Pick a ${modelGate.label} model to ${
              isMediaMode ? "generate" : "send"
            }.`}
            onSelect={openModelPicker}
          />
        )}

        {queuedMessage && (
          <FlexRow
            gap={0.5}
            align="center"
            sx={{ px: 1, color: "text.secondary" }}
          >
            <Text size="small" color="secondary">
              Message queued - {queuedMessage.prompt.slice(0, 60)}
            </Text>
            {onStop && (
              <Text
                size="small"
                component="button"
                type="button"
                sx={{
                  ml: "auto",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "primary.main"
                }}
                onClick={sendQueuedNow}
              >
                Send now
              </Text>
            )}
            <Text
              size="small"
              component="button"
              type="button"
              sx={{
                ml: onStop ? 0 : "auto",
                background: "none",
                border: "none",
                padding: 0,
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
          className={`media-chip-row${trailingActions ? " has-trailing" : ""}${
            isCompact ? " narrow" : ""
          }`}
        >
          {/* Leading actions (e.g. the canvas dock drag handle). */}
          {leadingActions}
          {/* Chip cluster: mode/model chips. */}
          <div className="media-chip-main">
            {/* Attach: uploads to the asset library and attaches the asset. */}
            <input
              ref={attachInputRef}
              type="file"
              hidden
              multiple
              onChange={handleAttachPicked}
            />
            <MediaControlChip
              icon={
                isUploading ? (
                  <LoadingSpinner inline size={16} color="inherit" />
                ) : (
                  <AddIcon fontSize="small" />
                )
              }
              title={isUploading ? "Uploading…" : "Attach files"}
              onClick={openAttachPicker}
              disabled={disabled}
              showChevron={false}
            />

            {!hideModePicker && (
              <ModeSelectChip
                mode={mode}
                onChange={setMode}
                compact={isCompact}
              />
            )}

            {mode === "chat" && !hideModelPicker && (
              <>
                <ModelChip
                  openRef={modelPickerRef}
                  icon={<AutoAwesomeIcon fontSize="small" />}
                  label={chatProviderLabel}
                  title={chatProviderLabel}
                  picker={{
                    kind: "language",
                    allowedProviders,
                    requireToolSupport,
                    onPick: (model) => onModelChange?.(model)
                  }}
                />
                <PermissionSelector threadId={threadId} compact={isCompact} />
              </>
            )}

            <ModeChips mode={mode} openModelPickerRef={modelPickerRef} />

            {/* The workspace every turn reads and writes in. Shown for chat as
                well as the canvas — a chat turn writes files too, and the user
                needs to know where they land before they send. */}
            <WorkspaceChip compact={isCompact} />
          </div>

          {/* The Generate button for media modes, or Stop while a run is in
              flight. Chat mode has no button of its own — Enter sends. Sits
              between the chip cluster and the host actions rather than inside
              the chips, so it joins the workflow action buttons on one line
              when the row wraps. */}
          <div className="media-primary-action">
            {/* What the next Generate would cost, next to the button that
                spends it. Silent in chat mode and whenever no price can be
                reached. */}
            {isMediaMode && !isBusy && <MediaCostEstimate mode={mode} />}
            <VoiceInputControl
              onTranscript={handleVoiceTranscript}
              overlayHost={composeCardRef}
              disabled={disabled}
            />
            {isBusy ? (
              onStop && <StopGenerationButton onClick={onStop} />
            ) : isMediaMode ? (
              <button
                type="button"
                className="media-generate-btn"
                onClick={handleSend}
                disabled={isDisabled || !canGenerate}
                aria-label="Generate"
              >
                Generate
              </button>
            ) : null}
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
