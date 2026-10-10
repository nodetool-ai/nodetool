/**
 * The Game flow's config: the one place that maps a workflow's
 * `settings.game.stage` onto a step.
 *
 * Everything the flow needs is on the workflow, so any host — the guided-flow
 * tab, or a workflow tab reopened after a refresh — builds the same steps from
 * a workflow id and resumes where the creator left off. `done` maps to no
 * step: from there the game belongs to the game editor.
 *
 * Idea → Design (template, then the review) → Look and build. Nothing is spent
 * before the last step except the one designer call, and the design it writes
 * is text the creator can edit. The build draws one image per visual slot.
 */

import { createElement, useCallback, useMemo, useState } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import {
  DEFAULT_NATIVE_GAME_TEMPLATE,
  STILL_RESOLUTION,
  designSourceOf,
  findNativeGameTemplate,
  pinnedGameInspirationChip
} from "@nodetool-ai/protocol";
import type {
  GameDesign,
  GameSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  useGameSetupDocument,
  useGameSetupStage,
  useGameSetupWriter
} from "../../../hooks/game/useGameSetup";
import {
  GAME_DESIGNER_MAX_OUTPUT_TOKENS,
  useDesignGame
} from "../../../hooks/game/useDesignGame";
import {
  gameImageSlots,
  useBuildGame,
  type BuildGameResult
} from "../../../hooks/game/useBuildGame";
import { priceRenderStep } from "../../../hooks/storyboard/shotCostPricing";
import type { StylePresetEntity } from "../../../serverState/useStylePresets";
import type { SetupFlowConfig, SetupStep } from "../types";
import { GameIdeaStep, type GameStartAlternative } from "./IdeaStep";
import { DesignerModelFooterField, GameTemplateStep } from "./TemplateStep";
import { GameReviewStep } from "./ReviewStep";
import { GameLookStep, ImageModelFooterField } from "./LookStep";
import {
  NO_GAME_STYLE_ID,
  describeGameSlot,
  gameDesignGaps,
  gameStyleChoice,
  imageModelTileId,
  parseImageModelTileId
} from "./gameSetupModel";

const FLOW_LABELS = { title: "Game" } as const;

export interface GameSetupFlowOptions {
  workflowId: string;
  /** The project the game is created in. */
  projectId: string;
  /** The designer until the creator picks one; null when none is offered. */
  defaultDesignerModel: { provider: string; id: string } | null;
  /** The image model until the creator picks one: the saved default. */
  defaultImageModel: { provider: string; id: string } | null;
  stylePresets: readonly StylePresetEntity[];
  stylePresetsLoading: boolean;
  /** Makes a game without the design and leaves the flow. */
  onStartAlternative: (kind: GameStartAlternative) => Promise<void>;
  /** Runs when the build made the game — the host opens it. */
  onFinish: (result: BuildGameResult) => void;
}

export interface GameSetupFlowResult extends SetupFlowConfig<GameSetupStage> {
  building: boolean;
  cancelBuild: () => void;
}

export const useGameSetupFlow = ({
  workflowId,
  projectId,
  defaultDesignerModel,
  defaultImageModel,
  stylePresets,
  stylePresetsLoading,
  onStartAlternative,
  onFinish
}: GameSetupFlowOptions): GameSetupFlowResult => {
  const stage = useGameSetupStage(workflowId);
  const game = useGameSetupDocument(workflowId);
  const { setGame, setGameQuietly, editGame } = useGameSetupWriter(workflowId);
  const { designGame, cancelDesign, designing, filled, error: designError } =
    useDesignGame(workflowId);
  const { buildGame, cancelBuild, building, progress } =
    useBuildGame(workflowId);
  const [startingAlternative, setStartingAlternative] =
    useState<GameStartAlternative | null>(null);
  const [alternativeError, setAlternativeError] = useState<string | null>(null);

  const brief = game?.brief ?? "";
  const templateId = game?.template ?? DEFAULT_NATIVE_GAME_TEMPLATE;
  const template = findNativeGameTemplate(templateId);
  const slots = useMemo(() => template?.manifest.slots ?? [], [template]);
  const imageSlots = useMemo(() => gameImageSlots(slots), [slots]);
  const design: GameDesign | null = game?.design ?? null;
  const designerModel = game?.designer_model ?? defaultDesignerModel;
  const hasPinnedDesign =
    pinnedGameInspirationChip(templateId, brief) !== null;
  // Whether the stored design still answers the brief and template on screen,
  // so stepping back to read the template does not throw the design away.
  const designIsCurrent =
    design !== null &&
    game?.design_source === designSourceOf(templateId, brief.trim());

  const imageModel = parseImageModelTileId(game?.image_model) ?? defaultImageModel;
  const styleEntityId =
    game?.style_entity_id ?? stylePresets[0]?.entityId ?? null;
  const name = game?.project_name ?? design?.title ?? "";

  const onStageChange = useCallback(
    (next: GameSetupStage) => {
      setGameQuietly({ stage: next });
    },
    [setGameQuietly]
  );

  const handleAlternative = useCallback(
    async (kind: GameStartAlternative) => {
      setAlternativeError(null);
      setStartingAlternative(kind);
      try {
        await onStartAlternative(kind);
      } catch (cause) {
        setAlternativeError(
          cause instanceof Error ? cause.message : String(cause)
        );
      } finally {
        setStartingAlternative(null);
      }
    },
    [onStartAlternative]
  );

  // What the build is about to spend, priced the way the storyboard prices a
  // still: one image per visual slot on the chosen model.
  const estimate = useMemo(() => {
    if (!imageModel || imageSlots.length === 0) {
      return null;
    }
    const step = priceRenderStep(
      "Image",
      { id: imageModel.id, provider: imageModel.provider },
      "image model",
      STILL_RESOLUTION,
      undefined,
      []
    );
    return step.cost === null ? null : step.cost * imageSlots.length;
  }, [imageModel, imageSlots]);

  const designGaps = useMemo(
    () => (design ? gameDesignGaps(design, slots) : ["a design"]),
    [design, slots]
  );

  const steps = useMemo<SetupStep<GameSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: startingAlternative === null && brief.trim().length > 0,
        // A blank game lands by leaving this flow, so Back and Change flow
        // wait until it has.
        holdNavigation: startingAlternative !== null,
        blockedReason:
          startingAlternative !== null
            ? "Creating your game"
            : "Describe your game",
        render: (context) =>
          createElement(GameIdeaStep, {
            workflowId,
            brief,
            onBriefChange: (next: string) => editGame({ brief: next }),
            onStartAlternative: (kind: GameStartAlternative) => {
              void handleAlternative(kind);
            },
            startingAlternative,
            alternativeError,
            onDismissAlternativeError: () => setAlternativeError(null),
            readOnly: context?.readOnly ?? false
          }),
        // The template step opens on a template, so the design call always
        // has a manifest to write against.
        onAdvance: async () => {
          if (!game?.template) {
            await setGame({ template: DEFAULT_NATIVE_GAME_TEMPLATE });
          }
        }
      },
      {
        // Template and review are both step 2, so they share one stepper
        // entry.
        stage: "template",
        label: "Design",
        primaryLabel: designIsCurrent
          ? "Continue to your design"
          : design
            ? "Re-design the game"
            : "Write the design",
        canAdvance:
          template !== null &&
          (designIsCurrent || Boolean(designerModel?.id) || hasPinnedDesign),
        blockedReason:
          template === null
            ? "Pick a template"
            : "Pick a designer model, or use one of the example ideas",
        generation: designIsCurrent
          ? undefined
          : {
              result:
                "Write a design: the premise, how it plays, the characters and what each piece of art shows",
              next: "Review and edit it next. Nothing is drawn until the last step.",
              model: designerModel,
              brief,
              maxOutputTokens: GAME_DESIGNER_MAX_OUTPUT_TOKENS,
              noModelCall: !designerModel?.id && hasPinnedDesign
            },
        primaryDetail: designIsCurrent
          ? "Your design is unchanged — this keeps it."
          : undefined,
        pending: designing,
        pendingLabel: "Writing the design",
        footerControls: (context) =>
          createElement(DesignerModelFooterField, {
            designerModel,
            onDesignerModelChange: (model: { provider: string; id: string }) =>
              setGameQuietly({ designer_model: model }),
            readOnly: context.readOnly
          }),
        render: (context) =>
          createElement(GameTemplateStep, {
            selectedId: template?.id ?? null,
            onSelect: (id: string) => setGameQuietly({ template: id }),
            readOnly: context?.readOnly ?? false
          }),
        onAdvance: async () => {
          if (designIsCurrent) {
            return;
          }
          const refusal = await designGame({
            brief,
            template: templateId,
            model: designerModel
          });
          if (refusal) {
            throw new Error(refusal);
          }
        },
        onCancel: cancelDesign
      },
      {
        stage: "review",
        label: "Design",
        primaryLabel: "Continue to the look",
        // A re-design answers onto this step, so Back waits for it.
        holdNavigation: designing,
        canAdvance: !designing && designGaps.length === 0,
        blockedReason: designing
          ? "Re-designing the game"
          : `Write ${designGaps.join(", ")}`,
        render: (context) =>
          design
            ? createElement(GameReviewStep, {
                workflowId,
                design,
                slots,
                filled,
                onDesignChange: (next: GameDesign) => editGame({ design: next }),
                onRedesign: () => {
                  void designGame({
                    brief,
                    template: templateId,
                    model: designerModel
                  });
                },
                redesignPending: designing,
                onCancelRedesign: cancelDesign,
                error: designError,
                readOnly: context?.readOnly ?? false
              })
            : null
      },
      {
        stage: "look",
        label: "Build",
        primaryLabel: "Build your game",
        primaryDetail:
          estimate === null
            ? `Draws ${imageSlots.length} images`
            : `Draws ${imageSlots.length} images, about ${formatUsd(estimate)}`,
        canAdvance:
          design !== null &&
          designGaps.length === 0 &&
          imageModel !== null &&
          name.trim().length > 0,
        blockedReason:
          imageModel === null
            ? "Pick an image model"
            : name.trim().length === 0
              ? "Name your game"
              : "Finish the design first",
        pending: building,
        pendingLabel: progress
          ? `Drawing ${progress.label} (${progress.done + 1} of ${progress.total})`
          : "Creating your game",
        footerControls: (context) =>
          createElement(ImageModelFooterField, {
            model: imageModel,
            onModelChange: (model: { provider: string; id: string }) =>
              setGameQuietly({ image_model: imageModelTileId(model) }),
            readOnly: context.readOnly
          }),
        render: (context) =>
          createElement(GameLookStep, {
            presets: stylePresets,
            presetsLoading: stylePresetsLoading,
            styleEntityId,
            onStyleSelect: (entityId: string) =>
              setGameQuietly({ style_entity_id: entityId }),
            name,
            onNameChange: (next: string) => editGame({ project_name: next }),
            imageSlots: imageSlots.map(describeGameSlot),
            readOnly: context?.readOnly ?? false
          }),
        // The build writes `done` itself once the art is in.
        continueAfterUnmount: true,
        onAdvance: async (context) => {
          if (!design || !imageModel) {
            return;
          }
          const result = await buildGame(
            {
              projectId,
              name: name.trim(),
              template: templateId,
              design,
              style:
                styleEntityId === NO_GAME_STYLE_ID
                  ? null
                  : gameStyleChoice(stylePresets, styleEntityId),
              imageModel,
              ...(game?.game_id && { gameId: game.game_id }),
              setGame
            },
            context?.signal
          );
          onFinish(result);
        },
        onCancel: cancelBuild
      }
    ],
    [
      alternativeError,
      brief,
      buildGame,
      building,
      cancelBuild,
      cancelDesign,
      design,
      designError,
      designGame,
      designGaps,
      designIsCurrent,
      designerModel,
      designing,
      editGame,
      estimate,
      filled,
      game?.game_id,
      game?.template,
      handleAlternative,
      hasPinnedDesign,
      imageModel,
      imageSlots,
      name,
      onFinish,
      progress,
      projectId,
      setGame,
      setGameQuietly,
      slots,
      startingAlternative,
      styleEntityId,
      stylePresets,
      stylePresetsLoading,
      template,
      templateId,
      workflowId
    ]
  );

  return {
    labels: FLOW_LABELS,
    steps,
    stage,
    onStageChange,
    building,
    cancelBuild
  };
};

export default useGameSetupFlow;
