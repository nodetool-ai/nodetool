/**
 * The Workflow flow for a host that is not already the node editor — the New
 * Project tab, which swaps itself for the flow once the Workflow entry card
 * creates the workflow (PRD § 6.1, D24: the card is on the workspace surface,
 * not in Studio).
 *
 * This host supplies the three things the flow cannot read off the document:
 * which models the configured providers offer per role, which one the creator
 * picked, and what the examples and import alternatives do. Everything else is
 * on `settings.setup`, so a reload resumes at the same step.
 */

import React, { useCallback, useMemo, useState } from "react";

import {
  useImageModelsByProvider,
  useLanguageModelsByProvider,
  useTTSModelsByProvider,
  useVideoModelsByProvider
} from "../../../hooks/useModelsByProvider";
import { useWorkflowManagerStore } from "../../../contexts/WorkflowManagerContext";
import { readWorkflowFile } from "../../../hooks/workflow/importWorkflowFile";
import type { BuildFromPlanResult } from "../../../hooks/workflow/useBuildFromPlan";
import { SetupFlow } from "../SetupFlow";
import type { OptionCardItem } from "../OptionCardGrid";
import { useWorkflowSetupFlow } from "./useWorkflowSetupFlow";
import type { ModelRoleChoices } from "./SetupStep";

/** A model as the setup step's tile row shows it. */
interface RoleModel {
  id: string;
  provider: string;
  name: string;
  /** The value the build assigns to the step's typed model property. */
  ref: Record<string, unknown>;
}

const toRoleModels = (
  models: readonly { id: string; provider: string; name?: string | null }[],
  propertyType: string
): RoleModel[] =>
  models.map((model) => ({
    id: `${model.provider}:${model.id}`,
    provider: model.provider,
    name: model.name ?? model.id,
    ref: {
      type: propertyType,
      provider: model.provider,
      id: model.id,
      name: model.name ?? model.id,
      path: null,
      supported_tasks: []
    }
  }));

export interface WorkflowSetupHostProps {
  workflowId: string;
  /** Opens the examples browser (step 1's first alternative). */
  onOpenExamples: () => void;
  /** Runs when the flow reaches stage `done` — the host opens the canvas. */
  onFinish: (result: BuildFromPlanResult | null) => void;
}

const WorkflowSetupHost: React.FC<WorkflowSetupHostProps> = ({
  workflowId,
  onOpenExamples,
  onFinish
}) => {
  const store = useWorkflowManagerStore();
  const language = useLanguageModelsByProvider();
  const image = useImageModelsByProvider();
  const video = useVideoModelsByProvider();
  const tts = useTTSModelsByProvider();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const byRole = useMemo<Record<string, RoleModel[]>>(
    () => ({
      language: toRoleModels(language.models, "language_model"),
      image: toRoleModels(image.models, "image_model"),
      video: toRoleModels(video.models, "video_model"),
      audio: toRoleModels(tts.models, "tts_model")
    }),
    [image.models, language.models, tts.models, video.models]
  );

  // D23's amber marker: a role is covered when a configured provider offers a
  // model for it, which is the same list the setup step's tiles come from.
  const providerConfigured = useCallback(
    (role: string) => (byRole[role]?.length ?? 0) > 0,
    [byRole]
  );

  const modelChoices = useCallback(
    (role: string): ModelRoleChoices => ({
      role,
      tiles: (byRole[role] ?? []).map(
        (model): OptionCardItem => ({
          id: model.id,
          title: model.name,
          description: model.provider
        })
      ),
      selectedId: picked[role] ?? byRole[role]?.[0]?.id ?? null,
      onSelect: (id: string) =>
        setPicked((current) => ({ ...current, [role]: id }))
    }),
    [byRole, picked]
  );

  const chosenModel = useCallback(
    (role: string): unknown => {
      const models = byRole[role] ?? [];
      const id = picked[role] ?? models[0]?.id;
      return models.find((model) => model.id === id)?.ref;
    },
    [byRole, picked]
  );

  // The planner runs on whatever language model is available; the creator picks
  // the models the *workflow* runs on in step 3, not the one that writes the
  // plan.
  const plannerModel = useMemo(() => {
    const first = byRole["language"]?.[0];
    return first ? { provider: first.provider, id: first.ref["id"] as string } : null;
  }, [byRole]);

  const handleImport = useCallback(
    async (file: File) => {
      const imported = await readWorkflowFile(file);
      const state = store.getState();
      const workflow = state.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} is not open.`);
      }
      const next = {
        ...workflow,
        graph: imported as NonNullable<typeof workflow.graph>
      };
      state.updateWorkflow(next);
      await state.saveWorkflow(next);
    },
    [store, workflowId]
  );

  const config = useWorkflowSetupFlow({
    workflowId,
    plannerModel,
    providerConfigured,
    modelChoices,
    chosenModel,
    onStartFromExample: onOpenExamples,
    onImport: handleImport,
    onFinish
  });

  return <SetupFlow config={config} />;
};

export default WorkflowSetupHost;
