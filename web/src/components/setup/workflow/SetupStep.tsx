/**
 * Step 3 of the Workflow flow — models and how it runs (PRD § 11.3).
 *
 * One model tile row per role the plan needs, drawn only from the providers
 * this install has configured; three run-mode cards; and the plan's inputs with
 * the samples the planner prefilled, editable, which is what the test run
 * sends.
 *
 * The shell's primary button is `Build your workflow` — the first thing in the
 * whole flow that places a node or spends anything (D4). It also runs the
 * workflow once with those sample inputs, which PRD § 11.3 makes part of the
 * action, so this step says so before the click rather than leaving it to the
 * landing checklist afterwards (F1): the disclosure at the foot names the run,
 * the models it will use, and the inputs it will send.
 */

import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { WorkflowSetupRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import ImageModelSelect from "../../properties/ImageModelSelect";
import VideoModelSelect from "../../properties/VideoModelSelect";
import TTSModelSelect from "../../properties/TTSModelSelect";
import type {
  ImageModelValue,
  LanguageModelValue,
  TTSModelValue,
  VideoModelValue
} from "../../../stores/ApiTypes";

import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  FormSection,
  GAP,
  LoadingSpinner,
  SPACING,
  Text,
  TextInput
} from "../../ui_primitives";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import ReportBugButton from "../../support/ReportBugButton";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import { MODEL_ROLE_LABEL, MODEL_ROLE_ONBOARDING } from "./modelRoles";

/**
 * The three run modes, as cards (PRD § 11.3).
 *
 * Each description says what happens *after* this build, because the build
 * itself always ends the same way: nodes placed, graph checked, one run with
 * the sample inputs. "Open it and press run" read as "nothing runs until you
 * do", which is the one thing the button does not promise (F1).
 */
export const RUN_MODE_CARDS = [
  {
    id: "manual",
    titleKey: "runModes.manual.title",
    descriptionKey: "runModes.manual.description"
  },
  {
    id: "app",
    titleKey: "runModes.app.title",
    descriptionKey: "runModes.app.description"
  },
  {
    id: "trigger",
    titleKey: "runModes.trigger.title",
    descriptionKey: "runModes.trigger.description"
  }
] as const;

/** Whether a role's tiles are there yet, and why not when they are not. */
export type ModelRoleStatus = "loading" | "error" | "empty" | "ready";

/**
 * What one role's models are, as the host reads them off the configured
 * providers. The host answers availability; which one is picked belongs to the
 * document, so the flow adds that (F17).
 */
export interface ModelRoleAvailability {
  role: string;
  /** One card per model the configured providers offer for this role. */
  tiles: readonly OptionCardItem[];
  /** Loading, failed, no provider, or usable (F14). */
  status: ModelRoleStatus;
  /** What the model query said when `status` is "error". */
  errorMessage?: string | null;
  /** Re-runs the model query behind this row. */
  onRetry: () => void;
}

/** One role's tile row: what is on offer, plus what the workflow remembers. */
export interface ModelRoleChoices extends ModelRoleAvailability {
  /** The tile id currently chosen, or null. */
  selectedId: string | null;
  /** The voice chosen for a voice model, or null for its first voice. */
  selectedVoice?: string | null;
  /** Picks a tile, and for a voice model the voice that goes with it. */
  onSelect: (id: string, voice?: string) => void;
  /**
   * A remembered pick this install no longer offers — a provider that was
   * disconnected, a model that was retired. The row falls back to the first
   * tile and says so, rather than building on a model nobody chose.
   */
  unavailableSelection?: string | null;
}

export interface WorkflowSetupStepProps {
  plan: WorkflowSetupPlan;
  roles: readonly ModelRoleChoices[];
  runMode: WorkflowSetupRunMode;
  onRunModeChange: (mode: WorkflowSetupRunMode) => void;
  /** Writes a sample value back onto the plan input the test run uses. */
  onSampleChange: (inputName: string, value: string) => void;
}

/** Plan input types the creator types a sample for. */
const SAMPLE_INPUT_TYPES = new Set(["string", "number", "integer"]);

const SetupStepInternal: React.FC<WorkflowSetupStepProps> = ({
  plan,
  roles,
  runMode,
  onRunModeChange,
  onSampleChange
}) => {
  const { t } = useTranslation();
  const runModeOptions = useMemo(
    () =>
      RUN_MODE_CARDS.map((mode) => ({
        id: mode.id,
        title: t(`pass3_15.setupStep.${mode.titleKey}`),
        description: t(`pass3_15.setupStep.${mode.descriptionKey}`)
      })),
    [t]
  );
  // A media input takes an upload, so only typed values get a sample field.
  const sampleInputs = useMemo(
    () => plan.inputs.filter((input) => SAMPLE_INPUT_TYPES.has(input.type)),
    [plan.inputs]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_15.setupStep.title")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_15.setupStep.description")}
        </Text>
      </FlexColumn>

      {roles.map((role) => (
        <ModelRoleRow key={role.role} role={role} />
      ))}

      <FormField
        label={t("pass3_15.setupStep.runMode.label")}
        helperText={t("pass3_15.setupStep.runMode.helper")}
      >
        <OptionCardGrid
          label={t("pass3_15.setupStep.runMode.accessibleLabel")}
          options={runModeOptions}
          selectedId={runMode}
          onSelect={(id) => onRunModeChange(id as WorkflowSetupRunMode)}
        />
      </FormField>

      {sampleInputs.length > 0 ? (
        <FormSection label={t("pass3_15.setupStep.sampleInputs.title")}>
          <Caption color="secondary" component="p">
            {t("pass3_15.setupStep.sampleInputs.description")}
          </Caption>
          {sampleInputs.map((input) => (
            <TextInput
              key={input.name}
              label={`${input.name} (${input.type})`}
              type={input.type === "string" ? undefined : "number"}
              value={String(input.sample ?? "")}
              onChange={(event) =>
                onSampleChange(input.name, event.target.value)
              }
            />
          ))}
        </FormSection>
      ) : null}

      <BuildDisclosure hasSamples={sampleInputs.length > 0} roles={roles} />
    </FlexColumn>
  );
};

/**
 * What `Build your workflow` does, said before the click (F1).
 *
 * The button builds *and* runs: PRD § 11.3 makes the test run part of the
 * action, and § 11.4 puts `Test run` on the landing checklist. The defect was
 * that the run was only ever disclosed afterwards, on that checklist. This
 * block sits with the run-mode cards and the sample inputs it will send, and
 * names the models it will spend on.
 */
const BuildDisclosure: React.FC<{
  hasSamples: boolean;
  roles: readonly ModelRoleChoices[];
}> = ({ hasSamples, roles }) => {
  const { t } = useTranslation();
  const chosen = roles
    .map((role) => {
      const tile = role.tiles.find((option) => option.id === role.selectedId);
      return tile
        ? `${t(`pass3_15.setupStep.modelRoles.${role.role}`, { defaultValue: MODEL_ROLE_LABEL[role.role] ?? role.role })}: ${tile.title}`
        : null;
    })
    .filter((entry): entry is string => entry !== null);

  return (
    <FlexColumn
      gap={GAP.tight}
      role="region"
      aria-label={t("pass3_15.setupStep.buildDisclosure.regionLabel")}
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        paddingTop: SPACING.lg
      }}
    >
      <Text size="normal" weight={500}>
        {t("pass3_15.setupStep.buildDisclosure.title")}
      </Text>
      <Text size="small" color="secondary">
        {hasSamples
          ? t("pass3_15.setupStep.buildDisclosure.withSamples")
          : t("pass3_15.setupStep.buildDisclosure.withoutSamples")}
      </Text>
      <Text size="small">
        {chosen.length > 0
          ? t("pass3_15.setupStep.buildDisclosure.runsOn", {
              models: chosen.join(" · ")
            })
          : t("pass3_15.setupStep.buildDisclosure.noModel")}
      </Text>
      <Caption color="secondary">
        {t("pass3_15.setupStep.buildDisclosure.costNote")}
      </Caption>
    </FlexColumn>
  );
};

/** One role's tile row, with the four states a model query can be in (F14). */
const ModelRoleRow: React.FC<{ role: ModelRoleChoices }> = ({ role }) => {
  const { t } = useTranslation();
  const label = t(`pass3_15.setupStep.modelRoles.${role.role}`, {
    defaultValue: MODEL_ROLE_LABEL[role.role] ?? role.role
  });
  const selection = role.selectedId?.split(":") ?? [];
  const selectedProvider = selection.length > 1 ? selection[0] : undefined;
  const selectedModel =
    selection.length > 1 ? selection.slice(1).join(":") : "";
  const handleLanguageChange = (model: LanguageModelValue) =>
    role.onSelect(`${model.provider}:${model.id}`);
  const handleImageChange = (model: ImageModelValue) =>
    role.onSelect(`${model.provider}:${model.id}`);
  const handleVideoChange = (model: VideoModelValue) =>
    role.onSelect(`${model.provider}:${model.id}`);
  // The voice rides along with the model, so a voice picked here is the one
  // the select shows and the one the built node speaks with.
  const handleAudioChange = (model: TTSModelValue) =>
    role.onSelect(`${model.provider}:${model.id}`, model.selected_voice);
  const audioValue: TTSModelValue | string = selectedModel
    ? {
        type: "tts_model",
        provider: (selectedProvider ?? "") as TTSModelValue["provider"],
        id: selectedModel,
        name: "",
        voices: [],
        selected_voice: role.selectedVoice ?? ""
      }
    : "";

  return (
    <FlexColumn gap={GAP.normal}>
      <Text size="normal" component="h3">
        {label}
      </Text>
      {role.status === "loading" ? (
        <FlexRow gap={GAP.normal} align="center">
          <LoadingSpinner size="small" />
          <Caption color="secondary" component="span">
            {t("pass3_15.setupStep.modelStatus.loading", { role: label })}
          </Caption>
        </FlexRow>
      ) : role.status === "error" ? (
        <AlertBanner
          severity="error"
          action={
            <FlexRow gap={GAP.tight} align="center">
              <EditorButton variant="text" onClick={role.onRetry}>
                {t("pass3_15.setupStep.actions.retry")}
              </EditorButton>
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: t("pass3_15.setupStep.modelStatus.reportSummary", {
                    role: label
                  }),
                  errorText:
                    role.errorMessage ??
                    t("pass3_15.setupStep.modelStatus.readError", {
                      role: label
                    })
                }}
              />
            </FlexRow>
          }
        >
          <Caption component="span">
            {role.errorMessage
              ? t("pass3_15.setupStep.modelStatus.readErrorWithDetail", {
                  role: label,
                  detail: role.errorMessage
                })
              : t("pass3_15.setupStep.modelStatus.readError", { role: label })}
          </Caption>
        </AlertBanner>
      ) : role.status === "empty" ? (
        <AlertBanner
          severity="warning"
          action={
            <EditorButton
              variant="text"
              onClick={() =>
                openProviderOnboarding({
                  capability: MODEL_ROLE_ONBOARDING[role.role],
                  reason: t("pass3_15.setupStep.modelStatus.providerReason", {
                    role: label
                  })
                })
              }
            >
              {t("pass3_15.setupStep.actions.connect")}
            </EditorButton>
          }
        >
          <Caption component="span">
            {t("pass3_15.setupStep.modelStatus.noProvider", { role: label })}
          </Caption>
        </AlertBanner>
      ) : (
        <>
          {role.unavailableSelection ? (
            <AlertBanner severity="warning">
              <Caption component="span">
                {t("pass3_15.setupStep.modelStatus.unavailable", {
                  model: role.unavailableSelection,
                  role: label
                })}
              </Caption>
            </AlertBanner>
          ) : null}
          {role.role === "language" ? (
            <LanguageModelSelect
              value={selectedModel}
              provider={selectedProvider}
              placeholder={t(
                "pass3_15.setupStep.modelStatus.selectPlaceholder",
                { role: label.toLowerCase() }
              )}
              onChange={handleLanguageChange}
            />
          ) : role.role === "image" ? (
            <ImageModelSelect
              value={selectedModel}
              provider={selectedProvider}
              onChange={handleImageChange}
            />
          ) : role.role === "video" ? (
            <VideoModelSelect
              value={selectedModel}
              provider={selectedProvider}
              onChange={handleVideoChange}
            />
          ) : role.role === "audio" ? (
            <TTSModelSelect value={audioValue} onChange={handleAudioChange} />
          ) : (
            <OptionCardGrid
              label={label}
              options={role.tiles}
              selectedId={role.selectedId}
              onSelect={role.onSelect}
              minColumnWidth={220}
            />
          )}
        </>
      )}
    </FlexColumn>
  );
};

export const WorkflowSetupStep = memo(SetupStepInternal);
WorkflowSetupStep.displayName = "WorkflowSetupStep";

export default WorkflowSetupStep;
