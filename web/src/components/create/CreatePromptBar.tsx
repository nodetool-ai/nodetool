/**
 * The Create view's prompt bar: a prompt box over the composer's own chips.
 *
 * Mode, model, preset, size and duration are `ModeChips` and the cost is
 * `MediaCostEstimate`, both reading MediaGenerationStore, so the bar offers
 * exactly what the chat composer offers for the same mode. Only the number of
 * takes is new.
 */
import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AppsIcon from "@mui/icons-material/Apps";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import {
  CREATE_BATCH_OPTIONS,
  CREATE_MODES,
  useCreateViewStore,
  type CreateMode
} from "../../stores/CreateViewStore";
import ModeChips from "../chat/composer/ModeChips";
import ModeSelectChip from "../chat/composer/ModeSelectChip";
import OptionChip from "../chat/composer/OptionChip";
import MediaCostEstimate from "../chat/composer/MediaCostEstimate";
import ModeProviderSetupBanner from "../chat/composer/ModeProviderSetupBanner";
import SelectModelBanner from "../chat/composer/SelectModelBanner";
import { useModeProviderSetup } from "../chat/composer/useModeProviderSetup";
import type { ModelPickerHandle } from "../chat/composer/ModelChip";
import type { MediaOption } from "../chat/composer/MediaOptionMenu";
import ErrorBanner from "../support/ErrorBanner";
import {
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  TextInput
} from "../ui_primitives";
import { buildCreateBatch, createBlocker, type CreateBlocker } from "./createRequest";
import { submitCreateBatch } from "./submitCreateBatch";
import { useCreateModelDefaults } from "./useCreateModelDefaults";


interface CreatePromptBarProps {
  promptRef: React.Ref<HTMLTextAreaElement>;
}

const CreatePromptBar = ({ promptRef }: CreatePromptBarProps) => {
  const { t } = useTranslation();
  const mode = useCreateViewStore((s) => s.mode);
  const prompt = useCreateViewStore((s) => s.prompt);
  const batch = useCreateViewStore((s) => s.batch);
  const setMode = useCreateViewStore((s) => s.setMode);
  const setPrompt = useCreateViewStore((s) => s.setPrompt);
  const setBatch = useCreateViewStore((s) => s.setBatch);
  const hasModel = useMediaGenerationStore((s) =>
    mode === "image" ? s.image.model !== null : s.video.model !== null
  );
  const modelPickerRef = useRef<ModelPickerHandle>(null);
  const setup = useModeProviderSetup(mode);
  const [submitting, setSubmitting] = useState(false);
  const [blocker, setBlocker] = useState<CreateBlocker | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useCreateModelDefaults(mode);

  const batchOptions: MediaOption<number>[] = CREATE_BATCH_OPTIONS.map((count) => ({
    id: count,
    label: `${count}`,
    description: t("create_view.takes", { count }),
    icon: <AppsIcon fontSize="small" />
  }));

  const handleMode = useCallback(
    (next: string) => {
      setMode(next as CreateMode);
      setBlocker(null);
      setSendError(null);
    },
    [setMode]
  );

  const handlePrompt = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setPrompt(event.target.value);
      // A blocker names what was missing, so it clears with the next edit.
      setBlocker(null);
      setSendError(null);
    },
    [setPrompt]
  );

  const handleGenerate = useCallback(async () => {
    const settings = useMediaGenerationStore.getState();
    const missing = createBlocker(mode, settings, prompt);
    setBlocker(missing);
    if (missing === "no-model") {
      modelPickerRef.current?.open();
    }
    if (missing) {
      return;
    }
    setSubmitting(true);
    setSendError(null);
    const requests = buildCreateBatch(mode, settings, prompt.trim(), batch);
    const result = await submitCreateBatch(requests);
    setSubmitting(false);
    if (result.error) {
      setSendError(
        t("create_view.sendFailed", {
          sent: result.sent.length,
          count: requests.length
        })
      );
    }
  }, [mode, prompt, batch, t]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleGenerate();
      }
    },
    [handleGenerate]
  );


  return (
    <FlexColumn
      gap={SPACING.sm}
      className="create-prompt-bar"
      sx={{ px: SPACING.lg, pt: SPACING.lg, pb: SPACING.sm }}
    >
      {setup.needsSetup && setup.reason && (
        <ModeProviderSetupBanner reason={setup.reason} onConnect={setup.openSetup} />
      )}
      {!setup.needsSetup && !hasModel && (
        <SelectModelBanner
          reason={t(`create_view.blocker.noModel.${mode}`)}
          onSelect={() => modelPickerRef.current?.open()}
        />
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
        <ModeSelectChip mode={mode} onChange={handleMode} modes={CREATE_MODES} />
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
    </FlexColumn>
  );
};

export default memo(CreatePromptBar);
