/**
 * The Game flow's build: make a playable game from the reviewed design.
 *
 * It creates the template's game in the workflow's project, records the game
 * id on `settings.game` before anything is generated (so a reload or a retry
 * reuses that game instead of making a second one), then generates each image
 * slot through `games.generateAsset` — the same path the game editor's asset
 * panel uses, which stages the image, records its prompt and binds it on the
 * current draft. Every slot's prompt is `gameSlotPrompt` over the reviewed
 * subject, the chosen style's descriptor and the slot's cast member, the
 * builder the headless `build_game` graph uses.
 *
 * The game it creates is already the designed game: `createAdventureGame`
 * lays out rooms and corridors from the design's layout and seeds them with
 * gems, enemies, hazards and a sealed exit, with health, a win and a loss.
 * The wall slot is prepared as an edge-shaded tileset so every wall tile
 * shows its exposed sides.
 *
 * Slots are generated one at a time so a cancel stops spending at the next
 * slot. A slot that fails keeps the template's placeholder and is reported;
 * the build fails only when no image slot succeeded. The music slot is
 * generated after the art when a music model answers, and the level plays
 * silent otherwise. Sound effects keep the template's built-in sounds.
 *
 * Once the art is in, `bindAdventureArt` points every sprite, animation clip
 * and wall tile at the generated frames, and the build parks a prompt for the
 * game editor's assistant to playtest the game and tune it to the design.
 *
 * One build runs per workflow. The registry is module level because the step
 * that starts a build can unmount while it runs (the tab is closed, or the
 * host swaps), and a second click from a remounted step must not pay twice.
 */

import { useCallback, useEffect, useState } from "react";
import { bindAdventureArt, createAdventureGame } from "@nodetool-ai/game-runtime";
import {
  findNativeGameTemplate,
  gameSlotGenerationRequest,
  gameSlotPrompt,
  type GameSlotSpec,
  type GameStyleChoice
} from "@nodetool-ai/protocol";
import type {
  GameDesign,
  GameSetup
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { useGameAssistantKickoffStore } from "../../stores/game/GameAssistantKickoffStore";
import { gameFinishPrompt } from "../../components/game/gameAssistantPrompt";
import { newDocumentId } from "../../lib/newDocumentId";
import { trpcClient } from "../../trpc/client";

/** The game document each native template starts from, built from the design. */
const TEMPLATE_DOCUMENTS: Record<
  string,
  (id: string, design: GameDesign) => ReturnType<typeof createAdventureGame>
> = {
  topdown: (id, design) =>
    createAdventureGame(id, {
      title: design.title.trim() || undefined,
      size: design.layout?.size,
      difficulty: design.layout?.difficulty
    })
};

/** Preparation that replaces a slot's default one in the build. */
const SLOT_PREPARATION: Record<string, Record<string, unknown>> = {
  // Sixteen edge-shaded variants, one per combination of exposed sides.
  wall: { tileset: { tileWidth: 32, tileHeight: 32, edges: 3 } }
};

/** The slots the build generates: every visual one. Sounds keep the template's. */
export const gameImageSlots = (
  slots: readonly GameSlotSpec[]
): GameSlotSpec[] =>
  slots.filter((slot) => slot.kind !== "sfx" && slot.kind !== "music");

/** The music slots the build generates after the art, when a music model answers. */
export const gameMusicSlots = (
  slots: readonly GameSlotSpec[]
): GameSlotSpec[] => slots.filter((slot) => slot.kind === "music");

export interface BuildGameInput {
  projectId: string;
  /** The game's name, also its tab title. */
  name: string;
  template: string;
  design: GameDesign;
  style: GameStyleChoice | null;
  imageModel: { provider: string; id: string };
  /** A game an earlier build of this workflow already made. */
  gameId?: string;
  /** Writes onto `settings.game`; the build records the game id with it. */
  setGame: (patch: Partial<GameSetup>) => Promise<void>;
}

export interface BuildGameSlotFailure {
  slot: string;
  reason: string;
}

export interface BuildGameResult {
  gameId: string;
  name: string;
  projectId: string;
  /** Image slots that kept the template's placeholder, with why. */
  failures: BuildGameSlotFailure[];
  /** Music slots left silent because no music model answered, with why. */
  skipped: BuildGameSlotFailure[];
}

export interface BuildGameProgress {
  /** The slot being generated, as the creator reads it. */
  label: string;
  done: number;
  total: number;
}

interface BuildState {
  controller: AbortController;
  progress: BuildGameProgress | null;
  listeners: Set<() => void>;
}

interface ActiveBuild extends BuildState {
  promise: Promise<BuildGameResult>;
}

const activeBuilds = new Map<string, ActiveBuild>();

/** True while a build of this workflow is running, from any mount. */
export const isGameBuildLive = (workflowId: string): boolean =>
  activeBuilds.has(workflowId);

const notify = (build: BuildState): void => {
  for (const listener of build.listeners) {
    listener();
  }
};

/** How a slot reads in the progress line. */
const slotLabel = (slot: GameSlotSpec, design: GameDesign): string => {
  const member = design.cast.find((entry) => entry.slot_id === slot.id);
  return member?.name.trim() || slot.id;
};

const abortError = (): DOMException =>
  new DOMException("The build was canceled.", "AbortError");

const runBuild = async (
  input: BuildGameInput,
  build: BuildState
): Promise<BuildGameResult> => {
  const { signal } = build.controller;
  const template = findNativeGameTemplate(input.template);
  const createDocument = template ? TEMPLATE_DOCUMENTS[template.id] : undefined;
  if (!template || !createDocument) {
    throw new Error(
      `The built-in engine cannot build the ${input.template} template.`
    );
  }

  let gameId = input.gameId;
  if (!gameId) {
    const created = await trpcClient.games.create.mutate(
      {
        projectId: input.projectId,
        name: input.name,
        dimension: "2d",
        document: createDocument(newDocumentId(), input.design)
      },
      { signal }
    );
    gameId = created.game.id;
  }
  // Recorded before the first paid call, so a reload resumes on this game.
  await input.setGame({ game_id: gameId, project_name: input.name });

  const slots = gameImageSlots(template.manifest.slots);
  const musicSlots = gameMusicSlots(template.manifest.slots);
  const failures: BuildGameSlotFailure[] = [];
  for (const [index, slot] of slots.entries()) {
    if (signal.aborted) {
      throw abortError();
    }
    build.progress = {
      label: slotLabel(slot, input.design),
      done: index,
      total: slots.length + musicSlots.length
    };
    notify(build);
    const subject =
      input.design.slot_prompts.find((entry) => entry.slot_id === slot.id)
        ?.prompt ?? "";
    const { prompt } = gameSlotPrompt(
      slot,
      subject,
      input.style,
      input.design.cast
    );
    const request = gameSlotGenerationRequest(slot);
    const preparation = SLOT_PREPARATION[slot.id] ?? request.preparation;
    try {
      await trpcClient.games.generateAsset.mutate(
        {
          id: gameId,
          slot: slot.id,
          kind: "image",
          prompt,
          ...(preparation && { preparation }),
          provider: input.imageModel.provider,
          model: input.imageModel.id
        },
        { signal }
      );
    } catch (cause) {
      if (signal.aborted) {
        throw abortError();
      }
      failures.push({
        slot: slot.id,
        reason: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }
  if (slots.length > 0 && failures.length === slots.length) {
    throw new Error(
      `No art was generated: ${failures[0]?.reason ?? "every slot failed"}`
    );
  }
  // Music is a bonus: without a music model the level plays silent, and the
  // creator is not warned about art that never was.
  const skipped: BuildGameSlotFailure[] = [];
  for (const slot of musicSlots) {
    if (signal.aborted) {
      throw abortError();
    }
    build.progress = {
      label: slot.id,
      done: slots.length,
      total: slots.length + musicSlots.length
    };
    notify(build);
    const subject =
      input.design.slot_prompts.find((entry) => entry.slot_id === slot.id)
        ?.prompt ?? "";
    try {
      await trpcClient.games.generateAsset.mutate(
        {
          id: gameId,
          slot: slot.id,
          kind: "music",
          prompt: gameSlotPrompt(slot, subject, null, []).prompt
        },
        { signal }
      );
    } catch (cause) {
      if (signal.aborted) {
        throw abortError();
      }
      skipped.push({
        slot: slot.id,
        reason: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }
  // Point the sprites, clips and wall tiles at the frames the art was cut into.
  const draft = await trpcClient.games.getDraft.query({ id: gameId }, { signal });
  if (draft.document.schemaVersion !== 3) {
    await trpcClient.games.saveDraftDocument.mutate(
      {
        id: gameId,
        baseUpdatedAt: draft.game.draftUpdatedAt,
        document: bindAdventureArt(draft.document)
      },
      { signal }
    );
  }
  await input.setGame({ stage: "done" });
  // The room and its art are in; the editor's assistant builds the rest.
  useGameAssistantKickoffStore
    .getState()
    .queue(gameId, gameFinishPrompt(input.design, failures));
  return { gameId, name: input.name, projectId: input.projectId, failures, skipped };
};

/** Start a build for a workflow, or join the one already running. */
export const startGameBuild = (
  workflowId: string,
  input: BuildGameInput
): Promise<BuildGameResult> => {
  const running = activeBuilds.get(workflowId);
  if (running) {
    return running.promise;
  }
  const state: BuildState = {
    controller: new AbortController(),
    progress: null,
    listeners: new Set()
  };
  const build: ActiveBuild = Object.assign(state, {
    promise: runBuild(input, state).finally(() => {
      if (activeBuilds.get(workflowId) === build) {
        activeBuilds.delete(workflowId);
      }
      state.progress = null;
      notify(state);
    })
  });
  activeBuilds.set(workflowId, build);
  notify(build);
  return build.promise;
};

/** Stop the running build at its next slot. */
export const cancelGameBuild = (workflowId: string): void => {
  activeBuilds.get(workflowId)?.controller.abort();
};

export interface UseBuildGameResult {
  buildGame: (
    input: BuildGameInput,
    signal?: AbortSignal
  ) => Promise<BuildGameResult>;
  cancelBuild: () => void;
  building: boolean;
  progress: BuildGameProgress | null;
}

export const useBuildGame = (workflowId: string): UseBuildGameResult => {
  const [, setVersion] = useState(0);
  const [subscribed, setSubscribed] = useState<ActiveBuild | null>(
    () => activeBuilds.get(workflowId) ?? null
  );

  // Follow the build that is running for this workflow, including one a
  // previous mount started.
  useEffect(() => {
    const build = subscribed ?? activeBuilds.get(workflowId) ?? null;
    if (!build) {
      return undefined;
    }
    const listener = () => setVersion((value) => value + 1);
    build.listeners.add(listener);
    if (build !== subscribed) {
      setSubscribed(build);
    }
    return () => {
      build.listeners.delete(listener);
    };
  }, [subscribed, workflowId]);

  const buildGame = useCallback(
    (input: BuildGameInput, signal?: AbortSignal) => {
      const promise = startGameBuild(workflowId, input);
      const build = activeBuilds.get(workflowId) ?? null;
      setSubscribed(build);
      // The shell's Cancel aborts its own signal; that stops this build.
      signal?.addEventListener("abort", () => cancelGameBuild(workflowId), {
        once: true
      });
      return promise;
    },
    [workflowId]
  );

  const cancelBuild = useCallback(() => {
    cancelGameBuild(workflowId);
  }, [workflowId]);

  const live = subscribed !== null && activeBuilds.get(workflowId) === subscribed;
  return {
    buildGame,
    cancelBuild,
    building: live,
    progress: live ? subscribed.progress : null
  };
};

export default useBuildGame;
