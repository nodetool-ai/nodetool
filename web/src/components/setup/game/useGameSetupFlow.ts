/**
 * The Game flow's config: the one place that maps a workflow's
 * `settings.game.stage` onto a step (game-prd § 4, D25).
 *
 * Everything the flow needs is on the workflow plus the shipped manifests, so
 * any host builds the same four steps from a workflow id and resumes where the
 * creator left off (criterion 2). `done` maps to no step: the workflow belongs
 * to the node editor from there on.
 *
 * Two gates carry the phase's criteria:
 *
 * - criterion 4 — `Continue to look` stays disabled while any cast entry is
 *   missing a name or a descriptor, or any slot has an empty prompt, and the
 *   blocked reason names the first one that is missing;
 * - the shell's rule — nothing spends before `Build your game`, which is the
 *   only step whose action places a node or starts a run.
 */

import { createElement, useCallback, useMemo, useState } from "react";
import {
  designSourceOf,
  gameProjectDirectory,
  type Entity,
  type GameGraphChoices
} from "@nodetool-ai/protocol";
import type {
  GameDesign,
  GameSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { useEntities } from "../../../serverState/useEntities";
import {
  useGameSetupDocument,
  useGameSetupStage,
  useGameSetupWriter
} from "../../../hooks/game/useGameSetup";
import {
  hasPinnedDesign,
  useDesignGame
} from "../../../hooks/game/useDesignGame";
import {
  useBuildGame,
  type BuildGameResult
} from "../../../hooks/game/useBuildGame";
import {
  templateManifest,
  useGameTemplates,
  type GameTemplate
} from "../../../hooks/game/useGameTemplates";
import { useGameStylePresets } from "../../../hooks/game/useGameStylePresets";
import type { SetupFlowConfig, SetupStep } from "../types";
import { GameIdeaStep } from "./IdeaStep";
import { GameTemplateStep } from "./TemplateStep";
import { GameReviewStep } from "./ReviewStep";
import {
  GAME_PLACEHOLDER_TILE_ID,
  GameLookStep,
  gameCostEstimate,
  gameCostLine,
  type GameModelRow
} from "./LookStep";

const FLOW_LABELS = { title: "Game" } as const;

/** What a row of model tiles is, before the flow adds the stored selection. */
export type GameRowAvailability = Omit<
  GameModelRow,
  "selectedId" | "onSelect"
>;

/** The design a blank export carries: a title, and nothing to generate. */
export const blankDesign = (title: string): GameDesign => ({
  title,
  premise: "",
  core_loop: "",
  player_verbs: [],
  enemies: [],
  level: "",
  win: "",
  lose: "",
  cast: [],
  slot_prompts: []
});

/**
 * The first thing the design is missing, in reading order, or null when it is
 * complete (criterion 4). The order matches the review's own: cast first, then
 * the slot prompts, so the reason names what the creator will scroll to first.
 */
export const firstMissingDesignField = (
  design: GameDesign,
  slots: readonly { id: string }[]
): string | null => {
  for (const member of design.cast) {
    if (member.name.trim().length === 0) {
      return `a name for ${member.slot_id}`;
    }
    if (member.descriptor.trim().length === 0) {
      return `a descriptor for ${member.name || member.slot_id}`;
    }
  }
  for (const slot of slots) {
    const prompt = design.slot_prompts.find(
      (entry) => entry.slot_id === slot.id
    );
    if ((prompt?.prompt ?? "").trim().length === 0) {
      return `a prompt for ${slot.id}`;
    }
  }
  return null;
};

export interface GameSetupFlowOptions {
  workflowId: string;
  /**
   * The designer's model until the creator picks one — the first language
   * model a configured provider offers. Null means no provider offers one, and
   * the flow falls back to a chip's pinned design.
   */
  defaultDesignerModel: { provider: string; id: string } | null;
  /** What the configured providers offer for each of the Look step's rows. */
  imageRow: GameRowAvailability;
  sfxRow: GameRowAvailability;
  musicRow: GameRowAvailability;
  /**
   * The model property value the build assigns for a row's chosen tile — the
   * same `ref` shape the node's typed model property takes.
   */
  chosenModel: (
    row: "image" | "music",
    tileId: string | null
  ) => Record<string, unknown> | null;
  /** Opens the existing tutorials entry. */
  onOpenTutorial: () => void;
  /** Runs after the flow reaches stage `done` — the host opens the canvas. */
  onFinish?: (result: BuildGameResult | null) => void;
}

export interface GameSetupFlowResult extends SetupFlowConfig<GameSetupStage> {
  /** The build's outcome, for the landing checklist (game-prd § 4.4). */
  buildResult: BuildGameResult | null;
  /** The template the flow is on, so a host can name it. */
  template: GameTemplate | null;
}

export const useGameSetupFlow = ({
  workflowId,
  defaultDesignerModel,
  imageRow,
  sfxRow,
  musicRow,
  chosenModel,
  onOpenTutorial,
  onFinish
}: GameSetupFlowOptions): GameSetupFlowResult => {
  const stage = useGameSetupStage(workflowId);
  const setup = useGameSetupDocument(workflowId);
  const { setGame } = useGameSetupWriter(workflowId);
  const { data: templates, isLoading: templatesLoading } = useGameTemplates();
  const { data: presets } = useGameStylePresets();
  const { data: entities } = useEntities();
  const {
    designGame,
    designing,
    error: designError,
    filled
  } = useDesignGame(workflowId);
  const { buildGame, building, result: buildResult } = useBuildGame(workflowId);
  const [exportingBlank, setExportingBlank] = useState(false);

  const brief = setup?.brief ?? "";
  const templateId = setup?.template;
  const design = setup?.design ?? null;
  const template = useMemo(
    () => (templates ?? []).find((entry) => entry.id === templateId) ?? null,
    [templateId, templates]
  );
  const slots = useMemo(() => template?.slots ?? [], [template]);
  // The picked model lives on the workflow, so a reload designs with it.
  const designerModel = setup?.designer_model ?? defaultDesignerModel;
  const styleEntityId = setup?.style_entity_id ?? null;
  const projectName = setup?.project_name ?? design?.title ?? "";
  const pinned = hasPinnedDesign(brief, templateId);

  // Whether the stored design still answers the brief and template on screen.
  // It decides what the template step's button does, so a creator who steps
  // back to read their template does not lose the design by pressing the only
  // button there.
  const designIsCurrent =
    design !== null &&
    templateId !== undefined &&
    setup?.design_source === designSourceOf(templateId, brief.trim());

  const onStageChange = useCallback(
    (next: GameSetupStage) => {
      void setGame({ stage: next });
    },
    [setGame]
  );

  /** The style entity the flow is on, whether shipped or the creator's own. */
  const styleEntity = useMemo<Entity | null>(
    () =>
      styleEntityId === null
        ? null
        : ((entities ?? []).find((entity) => entity.id === styleEntityId) ??
          null),
    [entities, styleEntityId]
  );

  /** The style the graph builder pastes into every prompt, verbatim. */
  const styleChoice = useMemo(() => {
    const preset = (presets ?? []).find(
      (entry) => entry.entityId === styleEntityId
    );
    if (preset) {
      return { name: preset.name, descriptor: preset.descriptor };
    }
    return styleEntity
      ? { name: styleEntity.name, descriptor: styleEntity.descriptor }
      : null;
  }, [presets, styleEntity, styleEntityId]);

  const sfxNodeType =
    setup?.sfx_node_type === undefined ||
    setup.sfx_node_type === GAME_PLACEHOLDER_TILE_ID
      ? null
      : setup.sfx_node_type;
  const musicTileId =
    setup?.music_model === undefined ||
    setup.music_model === GAME_PLACEHOLDER_TILE_ID
      ? null
      : setup.music_model;

  /** Everything the graph builder is given beyond the manifest and design. */
  const buildChoices = useCallback(
    (name: string): GameGraphChoices => ({
      imageModel: chosenModel("image", setup?.image_model ?? null) ?? {},
      sfxNodeType,
      musicModel: musicTileId === null ? null : chosenModel("music", musicTileId),
      style: styleChoice,
      projectName: name,
      directory: gameProjectDirectory(name),
      // The node reports what it found; a server with no Godot says so on the
      // checklist rather than being asked not to look (D28).
      verify: true
    }),
    [chosenModel, musicTileId, setup?.image_model, sfxNodeType, styleChoice]
  );

  /**
   * `Export a blank template` (§ 4.1): the same build path with no slots, so
   * the graph is the export node alone and the project comes out with the
   * template's placeholder art. Nothing is generated, so the Look step has
   * nothing to ask and is skipped.
   */
  const exportBlank = useCallback(
    async (id: string) => {
      const picked = (templates ?? []).find((entry) => entry.id === id);
      if (!picked) {
        return;
      }
      setExportingBlank(true);
      try {
        const name = projectName.trim().length > 0 ? projectName : picked.id;
        await setGame({ template: id, project_name: name });
        const built = await buildGame({
          manifest: { ...templateManifest(picked), slots: [] },
          design: blankDesign(name),
          choices: {
            imageModel: {},
            sfxNodeType: null,
            musicModel: null,
            style: null,
            projectName: name,
            directory: gameProjectDirectory(name),
            verify: true
          }
        });
        onFinish?.(built);
      } finally {
        setExportingBlank(false);
      }
    },
    [buildGame, onFinish, projectName, setGame, templates]
  );

  const missingDesignField = useMemo(
    () => (design === null ? null : firstMissingDesignField(design, slots)),
    [design, slots]
  );

  const costEstimate = useMemo(
    () =>
      gameCostEstimate(slots, {
        imageModel: setup?.image_model ?? null,
        sfxChosen: sfxNodeType !== null,
        musicModel: musicTileId
      }),
    [musicTileId, setup?.image_model, sfxNodeType, slots]
  );

  const imageChoices = useMemo<GameModelRow>(
    () => ({
      ...imageRow,
      selectedId: setup?.image_model ?? imageRow.tiles[0]?.id ?? null,
      onSelect: (id: string) => {
        void setGame({ image_model: id });
      }
    }),
    [imageRow, setGame, setup?.image_model]
  );

  const sfxChoices = useMemo<GameModelRow>(
    () => ({
      ...sfxRow,
      // The placeholder is the default: an install with no sound-effect node it
      // can run still builds a game (D27).
      selectedId: setup?.sfx_node_type ?? GAME_PLACEHOLDER_TILE_ID,
      onSelect: (id: string) => {
        void setGame({ sfx_node_type: id });
      }
    }),
    [setGame, setup?.sfx_node_type, sfxRow]
  );

  const musicChoices = useMemo<GameModelRow>(
    () => ({
      ...musicRow,
      selectedId: setup?.music_model ?? GAME_PLACEHOLDER_TILE_ID,
      onSelect: (id: string) => {
        void setGame({ music_model: id });
      }
    }),
    [musicRow, setGame, setup?.music_model]
  );

  const steps = useMemo<SetupStep<GameSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: brief.trim().length > 0,
        blockedReason: "Describe your game",
        pending: exportingBlank,
        pendingLabel: "Exporting the template",
        render: () =>
          createElement(GameIdeaStep, {
            brief,
            onBriefChange: (next: string) => {
              void setGame({ brief: next });
            },
            templates: templates ?? [],
            onStartFromTemplate: (id: string) => {
              void setGame({ template: id, stage: "template" });
            },
            onExportBlank: (id: string) => {
              void exportBlank(id);
            },
            exportingBlank,
            onOpenTutorial
          })
      },
      {
        // Template and review are both step 2, so they collapse into one
        // stepper entry (PRD § 6.2).
        stage: "template",
        label: "Design",
        // Coming back to this step with the design it produced still answering
        // the brief and template on screen, the button continues to that design
        // instead of throwing it away and calling the model again.
        primaryLabel: designIsCurrent
          ? "Continue to your design"
          : design !== null
            ? "Re-design"
            : "Write the design",
        canAdvance:
          templateId !== undefined &&
          (designIsCurrent || Boolean(designerModel?.id) || pinned),
        blockedReason:
          templateId === undefined
            ? "Pick a template"
            : "Pick a designer model, or start from one of the examples",
        generation: designIsCurrent
          ? undefined
          : {
              result: "Write the design: premise, loop, cast and one prompt per asset slot",
              next: "Read and edit every line next. Nothing is generated and nothing is placed by this click.",
              model: designerModel,
              brief,
              maxOutputTokens: 4096,
              noModelCall: !designerModel?.id && pinned
            },
        primaryDetail: designIsCurrent
          ? "Your design is unchanged — this keeps it."
          : undefined,
        pending: designing,
        pendingLabel: "Writing the design",
        render: () =>
          createElement(GameTemplateStep, {
            templates: templates ?? [],
            loading: templatesLoading,
            selectedId: templateId ?? null,
            onSelect: (id: string) => {
              void setGame({ template: id });
            },
            designerModel,
            onDesignerModelChange: (model: {
              provider: string;
              id: string;
            }) => {
              void setGame({ designer_model: model });
            }
          }),
        // The designer runs here and places nothing (criterion 3). A refused
        // run leaves the creator on the template with the reason on the button.
        onAdvance: async () => {
          if (designIsCurrent) {
            return;
          }
          if (!template) {
            throw new Error("Pick a template before writing the design.");
          }
          const refusal = await designGame({
            brief,
            manifest: templateManifest(template),
            model: designerModel,
            previous: design
          });
          if (refusal) {
            throw new Error(refusal);
          }
        }
      },
      {
        stage: "review",
        label: "Design",
        primaryLabel: "Continue to look",
        // Criterion 4: every cast entry named and described, every slot with a
        // prompt. The reason names the first one that is missing.
        canAdvance: design !== null && missingDesignField === null,
        blockedReason:
          design === null
            ? "Write the design first"
            : `Your design still needs ${missingDesignField ?? "a field"}`,
        // `Re-design` runs outside the shell's primary button, so the shell has
        // to read its wait: the creator cannot continue while the design they
        // are reading is being replaced.
        pending: designing,
        pendingLabel: "Re-designing",
        render: () =>
          createElement(GameReviewStep, {
            design: design ?? blankDesign(""),
            slots,
            onDesignChange: (next: GameDesign) => {
              void setGame({ design: next });
            },
            onRedesign: () => {
              if (!template) {
                return;
              }
              void designGame({
                brief,
                manifest: templateManifest(template),
                model: designerModel,
                previous: design
              });
            },
            redesignPending: designing,
            filled,
            error: designError
          })
      },
      {
        stage: "look",
        label: "Build",
        primaryLabel: "Build your game",
        canAdvance:
          styleChoice !== null &&
          imageChoices.selectedId !== null &&
          projectName.trim().length > 0,
        blockedReason:
          styleChoice === null
            ? "Pick a style"
            : imageChoices.selectedId === null
              ? "Pick an image model"
              : "Name your project",
        primaryDetail: gameCostLine(costEstimate),
        pending: building,
        pendingLabel: "Placing the graph, then running it once",
        render: () =>
          createElement(GameLookStep, {
            slots,
            presets: presets ?? [],
            customStyle: styleEntity,
            styleEntityId,
            onStyleChange: (entityId: string) => {
              void setGame({ style_entity_id: entityId });
            },
            designerModel,
            image: imageChoices,
            sfx: sfxChoices,
            music: musicChoices,
            projectName,
            onProjectNameChange: (name: string) => {
              void setGame({ project_name: name });
            }
          }),
        // `buildGame` writes the terminal stage itself, as soon as the nodes
        // are placed (game-prd § 4.3, D3).
        onAdvance: async () => {
          if (!template || design === null) {
            throw new Error("Write the design before building.");
          }
          const built = await buildGame({
            manifest: templateManifest(template),
            design,
            choices: buildChoices(projectName)
          });
          onFinish?.(built);
        }
      }
    ],
    [
      brief,
      buildChoices,
      buildGame,
      building,
      costEstimate,
      design,
      designError,
      designGame,
      designIsCurrent,
      designerModel,
      designing,
      exportBlank,
      exportingBlank,
      filled,
      imageChoices,
      missingDesignField,
      musicChoices,
      onFinish,
      onOpenTutorial,
      pinned,
      presets,
      projectName,
      setGame,
      sfxChoices,
      slots,
      styleChoice,
      styleEntity,
      styleEntityId,
      template,
      templateId,
      templates,
      templatesLoading
    ]
  );

  return {
    labels: FLOW_LABELS,
    steps,
    stage,
    onStageChange,
    buildResult,
    template
  };
};

export default useGameSetupFlow;
