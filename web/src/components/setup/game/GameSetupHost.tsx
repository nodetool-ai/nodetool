/**
 * The Game flow for a host that is not already the node editor — the New
 * Project tab, which swaps itself for the flow once the Game entry card
 * creates the workflow (game-prd § 4, D30: the card is on the workspace
 * surface, not in Studio).
 *
 * This host supplies the one thing the flow cannot read off the document or
 * the shipped manifests: what the configured providers offer for each of the
 * Look step's three rows, and the model property value the build assigns for a
 * chosen tile. Everything else is on `settings.game`, so a reload resumes at
 * the same step.
 */

import React, { useCallback, useMemo } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";

import {
  useImageModelsByProvider,
  useLanguageModelsByProvider,
  useMusicModelsByProvider
} from "../../../hooks/useModelsByProvider";
import {
  recommendedModelKey,
  useRecommendedModelKeys
} from "../../../hooks/useRecommendedModelKeys";
import { useProviders } from "../../../hooks/useProviders";
import useMetadataStore from "../../../stores/MetadataStore";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useGameSetupDocument } from "../../../hooks/game/useGameSetup";
import type { BuildGameResult } from "../../../hooks/game/useBuildGame";
import { openPageTab } from "../../workspace/openPageTab";
import { SetupFlow } from "../SetupFlow";
import type { OptionCardItem } from "../OptionCardGrid";
import { useGameSetupFlow, type GameRowAvailability } from "./useGameSetupFlow";
import type { GameRowStatus } from "./LookStep";

/** A model as a Look step tile row shows it. */
interface RowModel {
  id: string;
  provider: string;
  name: string;
  /** The value the build assigns to the node's typed model property. */
  ref: Record<string, unknown>;
}

const toRowModels = (
  models: readonly { id: string; provider: string; name?: string | null }[],
  propertyType: string
): RowModel[] =>
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

/**
 * The provider whose text-to-audio nodes the sound-effect row is drawn from.
 * A node whose provider is not configured cannot run, and a tile for it would
 * fail the build rather than the row (R9).
 */
const SFX_NODE_PREFIX = "fal.text_to_audio.";
const SFX_PROVIDER = "fal_ai";

/** Titles that mark a text-to-audio node as a sound-effect generator (R9). */
const SFX_TITLE_MARKER = "sound effect";

export interface GameSetupHostProps {
  workflowId: string;
  /** Runs when the flow reaches stage `done` — the host opens the canvas. */
  onFinish: (result: BuildGameResult | null) => void;
  /**
   * Leaves for a different entry card, from step 1 only. The caller owns what
   * happens to the workflow this flow already created; the flow only offers
   * the way out. The brief handed over comes from the manager store, so it is
   * what the creator typed rather than what the last save landed.
   */
  onChangeFlow?: (brief: string) => void | Promise<void>;
}

const GameSetupHost: React.FC<GameSetupHostProps> = ({
  workflowId,
  onFinish,
  onChangeFlow
}) => {
  const language = useLanguageModelsByProvider();
  const image = useImageModelsByProvider({ task: "text_to_image" });
  const music = useMusicModelsByProvider();
  const recommendedKeys = useRecommendedModelKeys();
  const selectedChatModel = useGlobalChatStore((state) => state.selectedModel);
  const metadata = useMetadataStore((state) => state.metadata);
  const { providers, isLoading: providersLoading } = useProviders();

  const imageModels = useMemo(
    () => toRowModels(image.models, "image_model"),
    [image.models]
  );
  const musicModels = useMemo(
    () => toRowModels(music.models, "music_model"),
    [music.models]
  );
  const languageModels = useMemo(
    () => toRowModels(language.models, "language_model"),
    [language.models]
  );

  /** Loading, failed, no provider, or usable — the four states of a row. */
  const statusOf = (
    count: number,
    query: { isLoading: boolean; error: Error | null | undefined }
  ): GameRowStatus =>
    count > 0
      ? "ready"
      : query.isLoading
        ? "loading"
        : query.error
          ? "error"
          : "empty";

  const imageRow = useMemo<GameRowAvailability>(
    () => ({
      label: "Image model",
      tiles: imageModels.map(
        (model): OptionCardItem => ({
          id: model.id,
          title: model.name,
          description: model.provider
        })
      ),
      status: statusOf(imageModels.length, image),
      errorMessage: image.error?.message ?? null,
      onRetry: () => {
        void image.refetch();
      },
      capability: "text_to_image",
      emptyMessage:
        "No connected provider offers a text-to-image model, and every sprite, tile and background needs one."
    }),
    [image, imageModels]
  );

  /**
   * The sound-effect nodes this install can actually run: the text-to-audio
   * nodes whose title says they make sound effects, and only while the
   * provider behind them is configured (R9). The chain sets `prompt` and
   * `duration` only, which every listed node has.
   */
  const sfxNodeTypes = useMemo(() => {
    if (!providers.some((entry) => entry.provider === SFX_PROVIDER)) {
      return [];
    }
    return Object.values(metadata)
      .filter(
        (node) =>
          node.node_type.startsWith(SFX_NODE_PREFIX) &&
          node.title.toLowerCase().includes(SFX_TITLE_MARKER)
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [metadata, providers]);

  const sfxRow = useMemo<GameRowAvailability>(
    () => ({
      label: "Sound effects",
      tiles: sfxNodeTypes.map(
        (node): OptionCardItem => ({
          id: node.node_type,
          title: node.title,
          description: (node.description ?? "").split("\n")[0]
        })
      ),
      status: sfxNodeTypes.length > 0 ? "ready" : providersLoading ? "loading" : "empty",
      onRetry: () => undefined,
      capability: "text_to_speech",
      emptyMessage:
        "No connected provider offers a sound-effect node. The template's own sounds are kept.",
      placeholderLabel: "Keep the placeholder sounds",
      placeholderDescription: "The template's own sound files, no generation"
    }),
    [providersLoading, sfxNodeTypes]
  );

  const musicRow = useMemo<GameRowAvailability>(
    () => ({
      label: "Music",
      tiles: musicModels.map(
        (model): OptionCardItem => ({
          id: model.id,
          title: model.name,
          description: model.provider
        })
      ),
      status: statusOf(musicModels.length, music),
      errorMessage: music.error?.message ?? null,
      onRetry: () => {
        void music.refetch();
      },
      capability: "text_to_music",
      emptyMessage:
        "No connected provider offers a music model. The template's own loop is kept.",
      placeholderLabel: "Keep the placeholder music",
      placeholderDescription: "The template's own music loop, no generation"
    }),
    [music, musicModels]
  );

  // The tile id the flow read off the workflow, resolved against what is on
  // offer now. An id no provider answers for falls back to the first model
  // rather than reaching the build as `undefined`.
  const chosenModel = useCallback(
    (row: "image" | "music", tileId: string | null) => {
      const models = row === "image" ? imageModels : musicModels;
      return (
        models.find((model) => model.id === tileId)?.ref ??
        models[0]?.ref ??
        null
      );
    },
    [imageModels, musicModels]
  );

  // Where the designer starts before the template step's picker chooses. In
  // order: the model the creator already chats with, then the first
  // recommended model the install offers, then anything.
  const defaultDesignerModel = useMemo(() => {
    if (languageModels.length === 0) {
      return null;
    }
    const asChoice = (model: RowModel) => ({
      provider: model.provider,
      id: model.ref["id"] as string
    });
    const chatModel = languageModels.find(
      (model) =>
        isModelSelected(selectedChatModel) &&
        model.provider === selectedChatModel.provider &&
        model.ref["id"] === selectedChatModel.id
    );
    if (chatModel) {
      return asChoice(chatModel);
    }
    for (const key of recommendedKeys) {
      const match = languageModels.find(
        (model) =>
          recommendedModelKey(model.provider, model.ref["id"] as string) === key
      );
      if (match) {
        return asChoice(match);
      }
    }
    return asChoice(languageModels[0]);
  }, [languageModels, recommendedKeys, selectedChatModel]);

  const openTutorial = useCallback(() => openPageTab("tutorials"), []);

  const config = useGameSetupFlow({
    workflowId,
    defaultDesignerModel,
    imageRow,
    sfxRow,
    musicRow,
    chosenModel,
    onOpenTutorial: openTutorial,
    onFinish
  });

  const brief = useGameSetupDocument(workflowId)?.brief ?? "";
  const handleChangeFlow = useCallback(
    () => onChangeFlow?.(brief),
    [brief, onChangeFlow]
  );

  return (
    <SetupFlow
      config={config}
      onChangeFlow={onChangeFlow ? handleChangeFlow : undefined}
    />
  );
};

export default GameSetupHost;
