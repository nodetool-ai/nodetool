/**
 * The Game flow for any host: the guided-flow tab the Game entry card opens,
 * or a workflow tab reopened on a game still in setup.
 *
 * This host supplies what the flow cannot read off the document — which
 * designer and image model to start on, the shipped game styles, and what the
 * blank-game alternatives do. Everything else is on `settings.game`, so a
 * reload resumes at the same step.
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { findNativeGameTemplate, isModelSelected } from "@nodetool-ai/protocol";

import {
  useImageModelsByProvider,
  useLanguageModelsByProvider
} from "../../../hooks/useModelsByProvider";
import {
  recommendedModelKey,
  useRecommendedModelKeys
} from "../../../hooks/useRecommendedModelKeys";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import {
  useWorkflowManager,
  useWorkflowManagerStore
} from "../../../contexts/WorkflowManagerContext";
import {
  useGameSetupDocument,
  useGameWorkflowLoaded
} from "../../../hooks/game/useGameSetup";
import type { BuildGameResult } from "../../../hooks/game/useBuildGame";
import { useGameStylePresets } from "../../../serverState/useStylePresets";
import {
  Caption,
  EditorButton,
  FlexColumn,
  GAP,
  PADDING,
  Text,
  ThinkingIndicator
} from "../../ui_primitives";
import { SetupFlow } from "../SetupFlow";
import type { GameStartAlternative } from "./IdeaStep";
import { useGameSetupFlow } from "./useGameSetupFlow";

export interface GameSetupHostProps {
  workflowId: string;
  /** The project the game is created in; the workflow's own when absent. */
  projectId?: string;
  /** Makes a game without the design, opens it, and leaves the flow. */
  onStartAlternative: (kind: GameStartAlternative) => Promise<void>;
  /** Runs once the game exists and the flow reached `done`. */
  onFinish: (result: BuildGameResult) => void;
  /** Leaves for a different entry card, from step 1 only. */
  onChangeFlow?: (brief: string) => void | Promise<void>;
}

const GameSetupHost: React.FC<GameSetupHostProps> = ({
  workflowId,
  projectId: projectIdProp,
  onStartAlternative,
  onFinish,
  onChangeFlow
}) => {
  const store = useWorkflowManagerStore();
  const loaded = useGameWorkflowLoaded(workflowId);
  const workflowProjectId = useWorkflowManager(
    (state) => state.getWorkflow(workflowId)?.project_id ?? null
  );
  const game = useGameSetupDocument(workflowId);

  // A guided-flow tab restored after a reload holds the workflow id but not
  // the row, which the manager only has once something fetched it.
  useEffect(() => {
    if (!loaded) {
      void store
        .getState()
        .fetchWorkflow(workflowId, { makeCurrent: false });
    }
  }, [loaded, store, workflowId]);

  const language = useLanguageModelsByProvider();
  const image = useImageModelsByProvider({ task: "text_to_image" });
  const recommendedKeys = useRecommendedModelKeys();
  const selectedChatModel = useGlobalChatStore((state) => state.selectedModel);
  const imageDefault = useModelPreferencesStore(
    (state) => state.defaults["image_model"]
  );
  const presets = useGameStylePresets();

  // The designer starts on the model the creator chats with, then the first
  // recommended model the install offers, then anything, as the Workflow
  // flow's planner does.
  const defaultDesignerModel = useMemo(() => {
    const models = language.models;
    if (models.length === 0) {
      return null;
    }
    const chat = models.find(
      (model) =>
        isModelSelected(selectedChatModel) &&
        model.provider === selectedChatModel.provider &&
        model.id === selectedChatModel.id
    );
    const recommended = recommendedKeys
      .map((key) =>
        models.find(
          (model) => recommendedModelKey(model.provider, model.id) === key
        )
      )
      .find((model) => model !== undefined);
    const picked = chat ?? recommended ?? models[0];
    return picked ? { provider: picked.provider, id: picked.id } : null;
  }, [language.models, recommendedKeys, selectedChatModel]);

  // The art is the spend, so the image model is not picked by catalog order:
  // the saved default when this install still serves it, else the creator
  // picks one.
  const defaultImageModel = useMemo(() => {
    if (!imageDefault?.id) {
      return null;
    }
    const listed = image.models.find(
      (model) =>
        model.id === imageDefault.id &&
        (!imageDefault.provider ||
          (model.provider ?? "").toLowerCase() ===
            imageDefault.provider.toLowerCase())
    );
    return listed ? { provider: listed.provider ?? "", id: listed.id } : null;
  }, [image.models, imageDefault]);

  const finishedRef = useRef(false);
  const handleFinish = useCallback(
    (result: BuildGameResult) => {
      if (finishedRef.current) {
        return;
      }
      finishedRef.current = true;
      onFinish(result);
    },
    [onFinish]
  );

  const projectId = projectIdProp ?? workflowProjectId ?? "";
  const config = useGameSetupFlow({
    workflowId,
    projectId,
    defaultDesignerModel,
    defaultImageModel,
    stylePresets: presets.data ?? [],
    stylePresetsLoading: presets.isLoading,
    onStartAlternative,
    onFinish: handleFinish
  });

  const brief = game?.brief ?? "";
  const handleChangeFlow = useCallback(
    () => onChangeFlow?.(brief),
    [brief, onChangeFlow]
  );

  // A `done` no step of this mount handed off: the document loaded that way
  // (a reload after the build), or the headless `build_game` wrote it while
  // this tab was open. The shell has no step for `done`, so the game opens.
  const gameId = game?.game_id;
  const settledDone =
    game !== null && config.stage === "done" && !config.building;
  useEffect(() => {
    if (settledDone && gameId) {
      handleFinish({
        gameId,
        name: game?.project_name ?? game?.design?.title ?? "Untitled game",
        projectId,
        failures: []
      });
    }
  }, [game, gameId, handleFinish, projectId, settledDone]);

  if (!loaded) {
    return (
      <FlexColumn align="center" justify="center" sx={{ padding: PADDING.section }}>
        <ThinkingIndicator label="Opening your game setup" announce />
      </FlexColumn>
    );
  }

  // A setup the removed Godot workflow started names a template the built-in
  // engine does not have. Its files stay; the gameplay is rebuilt natively.
  if (game?.template && findNativeGameTemplate(game.template) === null) {
    return (
      <FlexColumn gap={GAP.comfortable} sx={{ padding: PADDING.section }}>
        <Text size="big" component="h2">
          Legacy game setup
        </Text>
        <Caption>
          This setup used the removed Godot workflow. Its source files and
          generated assets remain available. Create a native game to rebuild
          its gameplay.
        </Caption>
        <EditorButton
          variant="contained"
          sx={{ alignSelf: "flex-start" }}
          onClick={() => void onStartAlternative("blank-2d")}
        >
          Create native game
        </EditorButton>
      </FlexColumn>
    );
  }

  if (settledDone) {
    return (
      <FlexColumn align="center" justify="center" sx={{ padding: PADDING.section }}>
        <ThinkingIndicator label="Opening your game" announce />
      </FlexColumn>
    );
  }

  return (
    <SetupFlow
      config={config}
      onChangeFlow={onChangeFlow ? handleChangeFlow : undefined}
    />
  );
};

export default GameSetupHost;
