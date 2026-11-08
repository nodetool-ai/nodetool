/**
 * The Create view's composer: what to make (kind, then mode), what to work
 * from (references), what to say (prompt), and how (the chat composer's own
 * chips, the number of takes and the cost).
 *
 * Model, preset, size and duration are `ModeChips` and the cost is
 * `MediaCostEstimate`, both reading MediaGenerationStore, so the bar offers
 * exactly what the chat composer offers for the same mode. Only the takes and
 * the references tray are the bar's own.
 */
import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AppsIcon from "@mui/icons-material/Apps";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import type { Asset } from "../../stores/ApiTypes";
import {
  CREATE_BATCH_OPTIONS,
  CREATE_KIND_MODES,
  CREATE_KINDS,
  createDraftOf,
  createKindOf,
  useCreateViewStore,
  type CreateKind,
  type CreateMode,
  type CreateReference
} from "../../stores/CreateViewStore";
import useAssetUpload from "../../serverState/useAssetUpload";
import { useNotificationStore } from "../../stores/NotificationStore";
import ModeChips from "../chat/composer/ModeChips";
import { MEDIA_MODES } from "../chat/composer/mediaModes";
import OptionChip from "../chat/composer/OptionChip";
import MediaCostEstimate from "../chat/composer/MediaCostEstimate";
import ModeProviderSetupBanner from "../chat/composer/ModeProviderSetupBanner";
import SelectModelBanner from "../chat/composer/SelectModelBanner";
import { ComposerAttachDialog } from "../chat/composer/ComposerAttachDialog";
import { useModeProviderSetup } from "../chat/composer/useModeProviderSetup";
import { useDragAndDrop } from "../chat/hooks/useDragAndDrop";
import { parseAssetUri } from "../node_types/editing/promptComposer/promptTokens";
import type { ModelPickerHandle } from "../chat/composer/ModelChip";
import type { MediaOption } from "../chat/composer/MediaOptionMenu";
import type { DroppedFile } from "../chat/types/chat.types";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  TextInput,
  ToggleGroup,
  ToggleOption
} from "../ui_primitives";
import {
  buildCreateBatch,
  createBlocker,
  createModelFor,
  type CreateBlocker
} from "./createRequest";
import CreateReferences from "./CreateReferences";
import { submitCreateBatch } from "./submitCreateBatch";
import { useCreateModelDefaults } from "./useCreateModelDefaults";

const KIND_ICON_MODE: Record<CreateKind, CreateMode> = {
  image: "image",
  video: "video",
  audio: "audio"
};

const kindIcon = (kind: CreateKind): React.ReactNode =>
  MEDIA_MODES.find((item) => item.id === KIND_ICON_MODE[kind])?.icon;

const assetReference = (asset: Asset): CreateReference => ({
  assetId: asset.id,
  contentType: asset.content_type || "application/octet-stream",
  name: asset.name || asset.id
});

const droppedReference = (file: DroppedFile): CreateReference | null => {
  if (!file.assetUri) {
    return null;
  }
  return {
    assetId: parseAssetUri(file.assetUri).assetId,
    contentType: file.type,
    name: file.name
  };
};

/**
 * The mode an attachment moves a prompt-only mode to: a picture added to
 * Generate image makes an edit, one added to a text video animates it.
 */
const modeForAttachment = (
  mode: CreateMode,
  added: readonly CreateReference[]
): CreateMode | null => {
  if (!added.some((item) => item.contentType.startsWith("image/"))) {
    return null;
  }
  if (mode === "image") {
    return "image_edit";
  }
  if (mode === "video") {
    return "image_to_video";
  }
  return null;
};

interface CreatePromptBarProps {
  promptRef: React.Ref<HTMLTextAreaElement>;
  /** The tab's draft key in CreateViewStore. */
  sessionId: string;
  /** Fields every take of this tab carries: its thread and project. */
  requestTags?: Readonly<Record<string, string>>;
  /** Called with the prompt once a press has sent at least one take. */
  onSent?: (prompt: string) => void;
}

const CreatePromptBar = ({ promptRef, sessionId, requestTags, onSent }: CreatePromptBarProps) => {
  const { t } = useTranslation();
  const mode = useCreateViewStore((s) => createDraftOf(s, sessionId).mode);
  const prompt = useCreateViewStore((s) => createDraftOf(s, sessionId).prompt);
  const batch = useCreateViewStore((s) => createDraftOf(s, sessionId).batch);
  const references = useCreateViewStore((s) => createDraftOf(s, sessionId).references);
  const setModeAction = useCreateViewStore((s) => s.setMode);
  const setMode = useCallback(
    (next: CreateMode) => setModeAction(sessionId, next),
    [setModeAction, sessionId]
  );
  const setKindAction = useCreateViewStore((s) => s.setKind);
  const setKind = useCallback(
    (next: CreateKind) => setKindAction(sessionId, next),
    [setKindAction, sessionId]
  );
  const setPromptAction = useCreateViewStore((s) => s.setPrompt);
  const setPrompt = useCallback(
    (next: string) => setPromptAction(sessionId, next),
    [setPromptAction, sessionId]
  );
  const setBatchAction = useCreateViewStore((s) => s.setBatch);
  const setBatch = useCallback(
    (next: number) => setBatchAction(sessionId, next),
    [setBatchAction, sessionId]
  );
  const addReferencesAction = useCreateViewStore((s) => s.addReferences);
  const addReferences = useCallback(
    (added: readonly CreateReference[]) => addReferencesAction(sessionId, added),
    [addReferencesAction, sessionId]
  );
  const removeReferenceAction = useCreateViewStore((s) => s.removeReference);
  const removeReference = useCallback(
    (assetId: string) => removeReferenceAction(sessionId, assetId),
    [removeReferenceAction, sessionId]
  );
  const hasModel = useMediaGenerationStore((s) => {
    const model = createModelFor(mode, s);
    return Boolean(model?.id && model.provider);
  });
  const modelPickerRef = useRef<ModelPickerHandle>(null);
  const setup = useModeProviderSetup(mode);
  const uploadAsset = useAssetUpload((s) => s.uploadAsset);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [submitting, setSubmitting] = useState(false);
  const [uploads, setUploads] = useState(0);
  const [blocker, setBlocker] = useState<CreateBlocker | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  /** The mode an attachment switched away from, so the switch can be undone. */
  const [switchedFrom, setSwitchedFrom] = useState<CreateMode | null>(null);
  const kind = createKindOf(mode);

  useCreateModelDefaults(mode);

  const batchOptions: MediaOption<number>[] = CREATE_BATCH_OPTIONS.map((count) => ({
    id: count,
    label: `${count}`,
    description: t("create_view.takes", { count }),
    icon: <AppsIcon fontSize="small" />
  }));

  const clearMessages = useCallback(() => {
    setBlocker(null);
    setSendError(null);
  }, []);

  const handleKind = useCallback(
    (_event: React.MouseEvent<HTMLElement>, next: CreateKind | null) => {
      if (next) {
        setKind(next);
        setSwitchedFrom(null);
        clearMessages();
      }
    },
    [setKind, clearMessages]
  );

  const handleMode = useCallback(
    (_event: React.MouseEvent<HTMLElement>, next: CreateMode | null) => {
      if (next) {
        setMode(next);
        setSwitchedFrom(null);
        clearMessages();
      }
    },
    [setMode, clearMessages]
  );

  const attach = useCallback(
    (added: readonly CreateReference[]) => {
      if (added.length === 0) {
        return;
      }
      const { mode: current } = createDraftOf(useCreateViewStore.getState(), sessionId);
      addReferences(added);
      clearMessages();
      const next = modeForAttachment(current, added);
      if (next) {
        setMode(next);
        setSwitchedFrom(current);
      }
    },
    [addReferences, clearMessages, sessionId, setMode]
  );

  const undoSwitch = useCallback(() => {
    if (switchedFrom) {
      setMode(switchedFrom);
      setSwitchedFrom(null);
    }
  }, [setMode, switchedFrom]);

  const uploadFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        setUploads((count) => count + 1);
        uploadAsset({
          file,
          onCompleted: (asset) => {
            setUploads((count) => Math.max(0, count - 1));
            attach([assetReference(asset)]);
          },
          onFailed: (error) => {
            setUploads((count) => Math.max(0, count - 1));
            addNotification({
              type: "error",
              alert: true,
              content: t("create_view.references.uploadFailed", { name: file.name, reason: error })
            });
          }
        });
      }
    },
    [addNotification, attach, t, uploadAsset]
  );

  const handleDroppedAssets = useCallback(
    (files: DroppedFile[]) => {
      attach(files.map(droppedReference).filter((item): item is CreateReference => item !== null));
    },
    [attach]
  );

  const { isDragging, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop(uploadFiles, handleDroppedAssets);

  const handleSelectAsset = useCallback(
    (asset: Asset) => attach([assetReference(asset)]),
    [attach]
  );

  const handlePrompt = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
      // A blocker names what was missing, so it clears with the next edit.
      clearMessages();
    },
    [setPrompt, clearMessages]
  );

  const handleGenerate = useCallback(async () => {
    const settings = useMediaGenerationStore.getState();
    const missing = createBlocker(mode, settings, prompt, references);
    setBlocker(missing);
    if (missing === "no-model") {
      modelPickerRef.current?.open();
    }
    if (missing) {
      return;
    }
    setSubmitting(true);
    setSendError(null);
    const text = prompt.trim();
    const requests = buildCreateBatch(mode, settings, text, batch, references).map(
      (request) => ({ ...request, ...requestTags })
    );
    const result = await submitCreateBatch(requests);
    setSubmitting(false);
    if (result.sent.length > 0) {
      onSent?.(text);
    }
    if (result.error) {
      setSendError(
        t("create_view.sendFailed", {
          sent: result.sent.length,
          count: requests.length
        })
      );
    }
  }, [mode, prompt, batch, references, requestTags, onSent, t]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleGenerate();
      }
    },
    [handleGenerate]
  );

  const subModes = CREATE_KIND_MODES[kind];
  const inputBlocker =
    blocker === "no-image" || blocker === "no-video" || blocker === "no-reference"
      ? blocker
      : null;

  return (
    <FlexColumn
      gap={SPACING.sm}
      className="create-prompt-bar"
      data-dragging={isDragging || undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        px: SPACING.lg,
        pt: SPACING.lg,
        pb: SPACING.sm,
        // A file held over the bar lands in the references tray.
        bgcolor: isDragging ? "action.hover" : undefined
      }}
    >
      <FlexRow gap={SPACING.sm} align="center" wrap sx={{ rowGap: SPACING.xs }}>
        <ToggleGroup
          segmented
          exclusive
          size="small"
          value={kind}
          onChange={handleKind}
          aria-label={t("create_view.kindLabel")}
        >
          {CREATE_KINDS.map((item) => (
            <ToggleOption key={item} value={item} icon={kindIcon(item)}>
              {t(`create_view.kinds.${item}`)}
            </ToggleOption>
          ))}
        </ToggleGroup>
        {subModes.length > 1 && (
          <ToggleGroup
            segmented
            exclusive
            size="small"
            value={mode}
            onChange={handleMode}
            aria-label={t("create_view.modeLabel")}
          >
            {subModes.map((item) => (
              <ToggleOption key={item} value={item}>
                {t(`create_view.modes.${item}`)}
              </ToggleOption>
            ))}
          </ToggleGroup>
        )}
      </FlexRow>
      {setup.needsSetup && setup.reason && (
        <ModeProviderSetupBanner reason={setup.reason} onConnect={setup.openSetup} />
      )}
      {!setup.needsSetup && !hasModel && (
        <SelectModelBanner
          reason={t(`create_view.blocker.noModel.${mode}`)}
          onSelect={() => modelPickerRef.current?.open()}
        />
      )}
      <CreateReferences
        mode={mode}
        references={references}
        uploading={uploads > 0}
        onAdd={() => setAttachOpen(true)}
        onRemove={removeReference}
      />
      {inputBlocker && (
        <Caption color="error">{t(`create_view.blocker.needsInput.${mode}`)}</Caption>
      )}
      {switchedFrom && (
        <FlexRow gap={SPACING.xs} align="center">
          <Caption color="secondary">
            {t("create_view.switched", { mode: t(`create_view.modes.${mode}`) })}
          </Caption>
          <EditorButton variant="text" density="compact" onClick={undoSwitch}>
            {t("create_view.undoSwitch", { from: t(`create_view.modes.${switchedFrom}`) })}
          </EditorButton>
        </FlexRow>
      )}
      <TextInput
        label={t("create_view.promptLabel")}
        hideLabel
        multiline
        minRows={2}
        maxRows={6}
        value={prompt}
        onChange={handlePrompt}
        onKeyDown={handleKeyDown}
        inputRef={promptRef}
        placeholder={t(`create_view.placeholder.${mode}`)}
        error={blocker === "no-prompt"}
        helperText={blocker === "no-prompt" ? t("create_view.blocker.noPrompt") : undefined}
      />
      <FlexRow gap={SPACING.xs} align="center" wrap sx={{ rowGap: SPACING.xs }}>
        <ModeChips mode={mode} openModelPickerRef={modelPickerRef} hideVariations />
        <OptionChip
          menu="option"
          icon={<AppsIcon fontSize="small" />}
          label={t("create_view.takes", { count: batch })}
          header={t("create_view.takesHeader")}
          title={t("create_view.takesHeader")}
          value={batch}
          options={batchOptions}
          onChange={setBatch}
        />
        <FlexRow gap={SPACING.sm} align="center" sx={{ ml: "auto" }}>
          <MediaCostEstimate mode={mode} requests={batch} variations={1} />
          <EditorButton
            variant="contained"
            color="primary"
            startIcon={<AutoAwesomeIcon fontSize="small" />}
            disabled={submitting}
            shortcut={["Ctrl", "Enter"]}
            onClick={() => void handleGenerate()}
          >
            {t("create_view.generate")}
          </EditorButton>
        </FlexRow>
      </FlexRow>
      {sendError && (
        <ErrorBanner
          report={{ source: "operation-failure", summary: "Create view could not start a generation", errorText: sendError }}
          onDismiss={() => setSendError(null)}
        >
          {sendError}
        </ErrorBanner>
      )}
      <ComposerAttachDialog
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onSelectAsset={handleSelectAsset}
        onUploadFiles={uploadFiles}
      />
    </FlexColumn>
  );
};

export default memo(CreatePromptBar);
