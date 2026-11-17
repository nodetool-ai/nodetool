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
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import AddIcon from "@mui/icons-material/AddOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

import {
  FlexRow,
  LoadingSpinner,
  Text,
  Tooltip,
  SPACING
} from "../../ui_primitives";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import MediaControlChip from "./MediaControlChip";
import ModelChip, { type ModelPickerHandle } from "./ModelChip";
import ModeProviderSetupBanner from "./ModeProviderSetupBanner";
import SelectModelBanner from "./SelectModelBanner";
import { useModeProviderSetup } from "./useModeProviderSetup";
import type {
  Asset,
  LanguageModel,
  MessageContent,
  PermissionMode
} from "../../../stores/ApiTypes";
import {
  isModelSelected,
  type Entity
} from "@nodetool-ai/protocol";
import type { ChatCommand } from "../types/chat.types";
import {
  assetToUri,
  entityToUri
} from "../../node_types/editing/promptComposer/promptTokens";
import { useTextareaAssetMention } from "./useTextareaAssetMention";
import { useTextareaSkillMention } from "./useTextareaSkillMention";
import { MentionedEntities } from "./MentionedEntities";
import { VoiceInputControl } from "./voice/VoiceInputControl";
import { FilePreview } from "./FilePreview";
import {
  ComposerAttachDialog,
  type AttachedDocument
} from "./ComposerAttachDialog";
import { insertPromptReference } from "./insertPromptReference";
import { useFileHandling } from "../hooks/useFileHandling";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { useComposerAssetUpload } from "../hooks/useComposerAssetUpload";
import { usePromptHistory } from "../hooks/usePromptHistory";
import { useMessageQueue } from "../../../hooks/useMessageQueue";
import { createMediaComposerStyles } from "./MediaChatComposer.styles";
import { useChatDraftStore } from "../../../stores/ChatDraftStore";
import { StopGenerationButton } from "./StopGenerationButton";
import PermissionSelector from "./PermissionSelector";
import ReasoningSelector from "./ReasoningSelector";
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
/** From here up to this width the chip row shrinks its chips instead of wrapping. */
const SHRINK_CARD_WIDTH = 900;
/** Below this width a wrapped row serves better than shrunken chips. */
const WRAP_CARD_WIDTH = 720;

const NO_COMMANDS: readonly ChatCommand[] = [];

const PERMISSION_MODES: readonly PermissionMode[] = ["plan", "default", "auto"];

/** Split `/name argument` into its parts, or null for an ordinary prompt. */
const parseCommand = (
  text: string
): { name: string; argument: string } | null => {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match
    ? { name: match[1].toLowerCase(), argument: (match[2] ?? "").trim() }
    : null;
};

interface MediaChatComposerProps {
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (
    content: MessageContent[],
    prompt: string
  ) => void | boolean | Promise<void | boolean>;
  /** Thread commands the `/` menu offers next to `/model` and `/mode`. */
  commands?: readonly ChatCommand[];
  onStop?: () => void;
  disabled?: boolean;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  allowedProviders?: string[];
  /** Hide non-tool-capable models in the language model picker. */
  requireToolSupport?: boolean;
  /** Focus the prompt textarea on mount. Defaults to true (chat panel). */
  autoFocus?: boolean;
  /** Override the auto-generated textarea placeholder. */
  placeholder?: string;
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
 * Chat composer: a prompt textarea over a chip row with attachments, the
 * permission mode, the reasoning level and the language model, plus Send.
 */
const MediaChatComposer: React.FC<MediaChatComposerProps> = ({
  isLoading,
  isStreaming,
  onSendMessage,
  commands = NO_COMMANDS,
  onStop,
  disabled = false,
  selectedModel,
  onModelChange,
  allowedProviders,
  requireToolSupport,
  autoFocus = true,
  placeholder: placeholderOverride,
  hideModelPicker = false,
  threadId
}) => {
  const { t } = useTranslation();
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
  const shrinksChips =
    !isMobile && cardWidth >= WRAP_CARD_WIDTH && cardWidth < SHRINK_CARD_WIDTH;

  // Language-model selection from the chat store.
  const languageModel = useGlobalChatStore((s) =>
    s.getSelectedModel(threadId ?? s.currentThreadId)
  );
  // A new account has an unsendable placeholder here. Fill it once from the
  // recommended models rather than let the menu's first row decide.
  useFirstRunLanguageModel();
  const permissionMode = useGlobalChatStore((s) =>
    s.getPermissionMode(threadId ?? s.currentThreadId)
  );

  // With no language-model provider configured, surface a setup banner and
  // route the send into the provider-onboarding dialog instead of letting the
  // request fail server-side.
  const providerSetup = useModeProviderSetup("chat");

  // The language model chip. A refused send opens it.
  const modelPickerRef = useRef<ModelPickerHandle>(null);
  const openModelPicker = useCallback(() => {
    modelPickerRef.current?.open();
  }, []);

  // File handling (input images for image-to-image / motion-control later)
  const { droppedFiles, removeFile, getFileContents, addDroppedFiles } =
    useFileHandling();

  // Every local file — picked, dropped, or pasted — goes to the asset library
  // first and rides as an `asset://` reference, so the bytes never enter the
  // message. Inlining them base64-encodes the file into the thread, which the
  // client then resends with every following turn.
  const { uploadFiles, isUploading } = useComposerAssetUpload(addDroppedFiles);

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(uploadFiles, addDroppedFiles);

  // The plus button opens one dialog for every kind of reference: library
  // assets, entities, project documents, and local uploads.
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const openAttachDialog = useCallback(() => setAttachDialogOpen(true), []);
  // The dialog does not hand focus back to the plus button: closing it, with
  // or without a pick, returns the user to the prompt they were writing.
  const attachFocusPending = useRef(false);
  const closeAttachDialog = useCallback(() => {
    setAttachDialogOpen(false);
    attachFocusPending.current = true;
  }, []);
  useEffect(() => {
    if (!attachDialogOpen && attachFocusPending.current) {
      attachFocusPending.current = false;
      textareaRef.current?.focus();
    }
  }, [attachDialogOpen]);

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

  /** Caret to restore once an inserted reference has rendered. */
  const insertCaretPending = useRef<number | null>(null);

  // Entities and documents are part of the sentence, so they go into the text
  // at the caret: an entity as its `entity://<id>` token (as the `@` picker
  // writes it), a document as a `[Name](<kind>://<id>)` resource link.
  const insertReference = useCallback(
    (reference: string) => {
      const caret = textareaRef.current?.selectionStart ?? prompt.length;
      const next = insertPromptReference(prompt, caret, reference);
      insertCaretPending.current = next.caret;
      setPrompt(next.value);
    },
    [prompt]
  );

  const handleSelectEntity = useCallback(
    (entity: Entity) => insertReference(entityToUri(entity)),
    [insertReference]
  );

  const handleSelectDocument = useCallback(
    (document: AttachedDocument) =>
      insertReference(`[${document.name.replace(/[[\]]/g, "")}](${document.uri})`),
    [insertReference]
  );

  const { mentionMenu, handleKeyDown: handleMentionKeyDown } =
    useTextareaAssetMention({
      textareaRef,
      value: prompt,
      setValue: setPrompt,
      onSelectAsset: handleSelectAsset,
      includeEntities: true
    });
  const currentThreadId = useGlobalChatStore((s) => s.currentThreadId);
  const setPermissionMode = useGlobalChatStore(
    (state) => state.setPermissionMode
  );
  // The model chip and the permission chip are hidden together, and a command
  // must not reach a control the surface does not show.
  const slashCommands = useMemo((): ChatCommand[] => {
    const own: ChatCommand[] = [];
    if (!hideModelPicker) {
      own.push({
        name: "model",
        description: t("i18n-next54.composer.commands.model"),
        run: openModelPicker,
        whileBusy: true
      });
      own.push({
        name: "mode",
        description: t("i18n-next54.composer.commands.mode"),
        run: (argument) => {
          const next = argument
            ? PERMISSION_MODES.find((item) => item === argument.toLowerCase())
            : PERMISSION_MODES[
                (PERMISSION_MODES.indexOf(permissionMode) + 1) %
                  PERMISSION_MODES.length
              ];
          if (!next) {
            return `/mode ${argument}`;
          }
          setPermissionMode(threadId ?? currentThreadId, next);
        },
        whileBusy: true
      });
    }
    return [...own, ...commands];
  }, [
    hideModelPicker,
    commands,
    openModelPicker,
    permissionMode,
    setPermissionMode,
    threadId,
    currentThreadId,
    t
  ]);
  const {
    skillMenu,
    handleKeyDown: handleSkillKeyDown,
    isOpen: isSkillMenuOpen,
    menuId: skillMenuId
  } = useTextareaSkillMention({
    textareaRef,
    value: prompt,
    setValue: setPrompt,
    commands: slashCommands
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
    const insertCaret = insertCaretPending.current;
    if (insertCaret !== null) {
      insertCaretPending.current = null;
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(insertCaret, insertCaret);
    }
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

  const takeAttachments = useChatDraftStore((s) => s.takeAttachments);
  const pendingAttachments = useChatDraftStore((s) =>
    threadId ? s.attachments[threadId] : undefined
  );
  useEffect(() => {
    if (!threadId || pendingAttachments === undefined) {
      return;
    }
    const files = takeAttachments(threadId);
    if (!files || files.length === 0) {
      return;
    }
    addDroppedFiles(files);
  }, [addDroppedFiles, pendingAttachments, takeAttachments, threadId]);

  const { queuedMessage, sendMessage, cancelQueued, sendQueuedNow } =
    useMessageQueue({
      isLoading,
      isStreaming,
      onSendMessage: (content, promptText) => onSendMessage(content, promptText),
      onStop,
      textareaRef
    });

  const placeholder = useMemo(() => {
    if (placeholderOverride) {
      return placeholderOverride;
    }
    if (permissionMode === "plan") {
      return isMobile
        ? t("i18n-next54.composer.placeholder.planShort")
        : t("i18n-next54.composer.placeholder.plan");
    }
    return isMobile
      ? t("i18n-next54.composer.placeholder.messageShort")
      : t("i18n-next54.composer.placeholder.message");
  }, [isMobile, placeholderOverride, permissionMode, t]);

  const chatModel = selectedModel ?? languageModel;

  // A send with no model picked can only fail on the server, so the composer
  // refuses it and opens the picker instead.
  const needsModel = !isModelSelected(chatModel);

  // A file still uploading is not in `droppedFiles` yet, so sending now would
  // leave it out of this message and attach it to the next one.
  const canGenerate =
    !isUploading && (prompt.trim().length > 0 || droppedFiles.length > 0);

  // `draft` is the composer text the send replaces. It differs from `text`
  // when dictation appends a transcript to what was typed.
  const submitPrompt = useCallback(
    async (text: string, draft: string = text) => {
      if (
        isUploading ||
        (text.trim().length === 0 && droppedFiles.length === 0)
      ) {
        return;
      }
      // A command runs instead of being sent. One that changes the thread
      // waits for the running turn rather than being queued behind it.
      const parsed = droppedFiles.length === 0 ? parseCommand(text) : null;
      const command = parsed
        ? slashCommands.find((item) => item.name === parsed.name)
        : undefined;
      if (parsed && command) {
        if (!command.whileBusy && (isLoading || isStreaming)) {
          return;
        }
        recordHistory(text);
        setPrompt((current) => (current === draft ? "" : current));
        const replacement = await command.run(parsed.argument);
        if (typeof replacement === "string") {
          setPrompt(replacement);
          textareaRef.current?.focus();
        }
        return;
      }
      // No configured provider can serve chat — sending would only fail on
      // the server. Keep the prompt and guide the user through provider setup.
      if (providerSetup.needsSetup) {
        providerSetup.openSetup();
        return;
      }
      // No language model is picked. The server rejects such a turn, so keep
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
      if (await sendMessage(fullContent, text)) {
        recordHistory(text);
        setPrompt((current) => current === draft ? "" : current);
        droppedFiles.forEach((file) => removeFile(file.id));
      }
    },
    [
      isUploading,
      droppedFiles,
      getFileContents,
      sendMessage,
      removeFile,
      recordHistory,
      providerSetup,
      needsModel,
      openModelPicker,
      slashCommands,
      isLoading,
      isStreaming
    ]
  );

  const handleSend = useCallback(() => {
    submitPrompt(prompt);
  }, [prompt, submitPrompt]);

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      const typed = prompt.trim();
      const text = typed.length > 0 ? `${typed} ${transcript}` : transcript;
      // A dictated prompt sends straight away, unless a file is still
      // uploading: then it lands in the box for review.
      if (isUploading) {
        setPrompt(text);
        textareaRef.current?.focus();
        return;
      }
      submitPrompt(text, prompt);
    },
    [prompt, submitPrompt, isUploading]
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
    if (!isModelSelected(chatModel)) return t("i18n-next54.composer.selectModel");
    return chatModel.name || chatModel.id;
  }, [chatModel, t]);

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
          aria-label={t("i18n-next54.composer.messagePrompt")}
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
        <ComposerAttachDialog
          open={attachDialogOpen}
          onClose={closeAttachDialog}
          onSelectAsset={handleSelectAsset}
          onSelectEntity={handleSelectEntity}
          onSelectDocument={handleSelectDocument}
          onUploadFiles={uploadFiles}
        />
        {skillMenu}

        {providerSetup.needsSetup && providerSetup.reason && (
          <ModeProviderSetupBanner
            reason={providerSetup.reason}
            onConnect={providerSetup.openSetup}
          />
        )}

        {!providerSetup.needsSetup && needsModel && (
          <SelectModelBanner
              reason={t("i18n-next54.composer.pickModel", {
                kind: "language",
                // The button label is capitalized; mid-sentence it is not.
                action: t("i18n-next54.composer.send").toLocaleLowerCase()
              })}
            onSelect={openModelPicker}
          />
        )}

        {queuedMessage && (
          <FlexRow
            gap={SPACING.micro}
            align="center"
            sx={{ px: SPACING.xs, color: "text.secondary" }}
          >
            <Text size="small" color="secondary">
              {t("i18n-next54.composer.messageQueued", { prompt: queuedMessage.prompt.slice(0, 60) })}
            </Text>
            {(onStop || (!isLoading && !isStreaming)) && (
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
                {t("i18n-next54.composer.sendNow")}
              </Text>
            )}
            <Text
              size="small"
              component="button"
              type="button"
              sx={{
                ml: 0,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "error.main"
              }}
              onClick={cancelQueued}
            >
              {t("common.cancel")}
            </Text>
          </FlexRow>
        )}

        <div
          className={`media-chip-row${isCompact ? " narrow" : ""}${shrinksChips ? " shrink" : ""}`}
        >
          {/* Chip cluster: attach and permission chips. */}
          <div className="media-chip-main">
            <MediaControlChip
              icon={
                isUploading ? (
                  <LoadingSpinner inline size={16} color="inherit" />
                ) : (
                  <AddIcon fontSize="small" />
                )
              }
              title={isUploading ? t("i18n-next54.composer.uploading") : t("i18n-next54.composer.addToMessage")}
              onClick={openAttachDialog}
              disabled={disabled}
              showChevron={false}
            />

            {!hideModelPicker && (
              <PermissionSelector threadId={threadId} compact={isCompact} />
            )}
          </div>

          {/* Send, or Stop while a run is in flight. Send stays visible while
              the prompt is empty so the composer always shows where the
              message goes. */}
          <div className="media-primary-action">
            {/* As in Claude, the chat model sits beside Send, the button
                that uses it. */}
            {!hideModelPicker && (
              <>
                <ReasoningSelector
                  provider={chatModel?.provider}
                  model={chatModel?.id}
                  compact={isCompact}
                />
                <ModelChip
                  openRef={modelPickerRef}
                  icon={null}
                  label={chatProviderLabel}
                  title={chatProviderLabel}
                  picker={{
                    kind: "language",
                    selected: chatModel,
                    allowedProviders,
                    requireToolSupport,
                    onPick: (model) => onModelChange?.(model)
                  }}
                />
              </>
            )}
            <VoiceInputControl
              onTranscript={handleVoiceTranscript}
              overlayHost={composeCardRef}
              disabled={disabled}
            />
            {isBusy ? (
              onStop && <StopGenerationButton onClick={onStop} />
            ) : (
              <Tooltip title={t("i18n-next54.composer.send")}>
                <span>
                  <button
                    type="button"
                    className="media-send-btn"
                    onClick={handleSend}
                    disabled={isDisabled || !canGenerate}
                    aria-label={t("i18n-next54.composer.send")}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </button>
                </span>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(MediaChatComposer);
