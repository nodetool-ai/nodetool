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

import React, { useCallback, useMemo } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";

import {
  useImageModelsByProvider,
  useLanguageModelsByProvider,
  useTTSModelsByProvider,
  useVideoModelsByProvider
} from "../../../hooks/useModelsByProvider";
import {
  recommendedModelKey,
  useRecommendedModelKeys
} from "../../../hooks/useRecommendedModelKeys";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useWorkflowManagerStore } from "../../../contexts/WorkflowManagerContext";
import { readWorkflowFile } from "../../../hooks/workflow/importWorkflowFile";
import type { BuildFromPlanResult } from "../../../hooks/workflow/useBuildFromPlan";
import type { Workflow } from "../../../stores/ApiTypes";
import { SetupFlow } from "../SetupFlow";
import type { OptionCardItem } from "../OptionCardGrid";
import { useWorkflowSetupFlow } from "./useWorkflowSetupFlow";
import type { ModelRoleAvailability, ModelRoleStatus } from "./SetupStep";

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
  /**
   * Copies the example the creator picked in step 1's inline browser and
   * resolves the id of the workflow it landed in, or null when nothing was
   * copied. The browser itself is part of the step (PRD § 11.1); this only
   * says where the copy goes and what opens afterwards.
   */
  onStartFromExample: (example: Workflow) => Promise<string | null>;
  /** Runs when the flow reaches stage `done` — the host opens the canvas. */
  onFinish: (result: BuildFromPlanResult | null) => void;
  /**
   * Leaves for a different entry card, from step 1 only. The caller owns what
   * happens to the workflow this flow already created; the flow only offers
   * the way out (F31).
   */
  onChangeFlow?: () => void | Promise<void>;
}

const WorkflowSetupHost: React.FC<WorkflowSetupHostProps> = ({
  workflowId,
  onStartFromExample,
  onFinish,
  onChangeFlow
}) => {
  const store = useWorkflowManagerStore();
  const language = useLanguageModelsByProvider();
  const image = useImageModelsByProvider();
  const video = useVideoModelsByProvider();
  const tts = useTTSModelsByProvider();
  const recommendedKeys = useRecommendedModelKeys();
  const selectedChatModel = useGlobalChatStore((state) => state.selectedModel);

  const byRole = useMemo<Record<string, RoleModel[]>>(
    () => ({
      language: toRoleModels(language.models, "language_model"),
      image: toRoleModels(image.models, "image_model"),
      video: toRoleModels(video.models, "video_model"),
      audio: toRoleModels(tts.models, "tts_model")
    }),
    [image.models, language.models, tts.models, video.models]
  );

  // The query behind each role, so a row can say whether it is still reading,
  // failed, or genuinely has nothing to offer — three states one empty list
  // used to collapse into "connect a provider" (F14).
  const queryByRole = useMemo<
    Record<
      string,
      {
        isLoading: boolean;
        error: Error | null | undefined;
        refetch: () => Promise<void>;
      }
    >
  >(
    () => ({ language, image, video, audio: tts }),
    [image, language, tts, video]
  );

  // D23's amber marker: a role is covered when a configured provider offers a
  // model for it, which is the same list the setup step's tiles come from. A
  // role whose query is still reading counts as uncovered, so the gate errs
  // towards holding step 3 — the flow says the wait out loud rather than
  // letting a plan through and finding no model on the next step.
  const providerConfigured = useCallback(
    (role: string) => (byRole[role]?.length ?? 0) > 0,
    [byRole]
  );

  const modelChoices = useCallback(
    (role: string): ModelRoleAvailability => {
      const models = byRole[role] ?? [];
      const query = queryByRole[role];
      const status: ModelRoleStatus =
        models.length > 0
          ? "ready"
          : query?.isLoading
            ? "loading"
            : query?.error
              ? "error"
              : "empty";
      return {
        role,
        tiles: models.map(
          (model): OptionCardItem => ({
            id: model.id,
            title: model.name,
            description: model.provider
          })
        ),
        status,
        errorMessage: query?.error?.message ?? null,
        onRetry: () => {
          void query?.refetch();
        }
      };
    },
    [byRole, queryByRole]
  );

  // The tile id the flow read off the workflow, resolved against what is on
  // offer now. An id no provider answers for falls back to the first model
  // rather than reaching the build as `undefined`.
  const chosenModel = useCallback(
    (role: string, tileId: string | null): unknown => {
      const models = byRole[role] ?? [];
      return (
        models.find((model) => model.id === tileId)?.ref ?? models[0]?.ref
      );
    },
    [byRole]
  );

  // Where the planner starts before the plan step's picker chooses. In order:
  // the model the creator already chats with, then the first recommended model
  // the install offers, then anything. The first entry of the provider list is
  // the last resort, not the default — it is whatever sorts first, and an
  // account that cannot call it only finds out after a round trip.
  const defaultPlannerModel = useMemo(() => {
    const models = byRole["language"] ?? [];
    if (models.length === 0) {
      return null;
    }
    const asChoice = (model: RoleModel) => ({
      provider: model.provider,
      id: model.ref["id"] as string
    });
    const chatModel = models.find(
      (model) =>
        isModelSelected(selectedChatModel) &&
        model.provider === selectedChatModel.provider &&
        model.ref["id"] === selectedChatModel.id
    );
    if (chatModel) {
      return asChoice(chatModel);
    }
    for (const key of recommendedKeys) {
      const match = models.find(
        (model) =>
          recommendedModelKey(model.provider, model.ref["id"] as string) === key
      );
      if (match) {
        return asChoice(match);
      }
    }
    return asChoice(models[0]);
  }, [byRole, recommendedKeys, selectedChatModel]);

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
    defaultPlannerModel,
    providerConfigured,
    modelChoices,
    chosenModel,
    onStartFromExample,
    onImport: handleImport,
    onFinish
  });

  return <SetupFlow config={config} onChangeFlow={onChangeFlow} />;
};

export default WorkflowSetupHost;
