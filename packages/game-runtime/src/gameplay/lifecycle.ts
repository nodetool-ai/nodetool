import { GAME_AUDIO_SPATIAL_DEFAULTS, type GameAudioCone, type GameAudioEmitter, type GameEvent, type GameHudLabel, type GameParticleEmission } from "@nodetool-ai/protocol";

export const MAX_GAME_EVENTS_PER_TICK = 512;
export const MAX_GAME_SPAWNED_INSTANCES = 1024;

export interface GameplayBehavior {
  readonly kind: string;
  readonly score?: number;
  readonly maximum?: number;
  readonly ticks?: number;
  readonly prefabId?: string;
  readonly onEvent?: string;
  readonly sceneId?: string;
  readonly event?: string;
  readonly count?: number;
}

export interface GameplayDefinition {
  readonly id: string;
  readonly behaviors: readonly GameplayBehavior[];
  readonly templateOnly?: boolean;
  readonly audioSource?: {
    readonly assetId: string; readonly onEvent: string; readonly volume: number;
    readonly spatial?: boolean; readonly minDistance?: number; readonly maxDistance?: number; readonly rolloff?: number;
    readonly distanceModel?: GameAudioEmitter["distanceModel"]; readonly cone?: GameAudioCone; readonly doppler?: number;
  };
}

export interface GameplayEntityState {
  readonly definition: GameplayDefinition;
  spawnTick: number;
  active: boolean;
  health?: number;
}

export interface GameplaySpawn {
  readonly prefabId: string;
}

export interface GameplayQueues<S extends GameplaySpawn = GameplaySpawn> {
  readonly despawns: Set<string>;
  readonly spawns: S[];
  transitionTo?: string;
  /** Presentation-only particle requests from this tick's scripts. Never snapshotted. */
  particles?: GameParticleEmission[];
}

export interface GameplayScore {
  score: number;
  won: boolean;
}

export type GameplayEvent = Exclude<GameEvent, { kind: "contact" }>;
export type GameplayEmit = (event: GameplayEvent) => void;

export function initialGameplayState(definition: GameplayDefinition, spawnTick: number): Pick<GameplayEntityState, "spawnTick" | "active" | "health"> {
  const health = definition.behaviors.find((behavior) => behavior.kind === "health");
  const state: Pick<GameplayEntityState, "spawnTick" | "active" | "health"> = { spawnTick, active: !definition.templateOnly };
  if (health?.maximum !== undefined) state.health = health.maximum;
  return state;
}

export function queueGameplayBehavior(behavior: GameplayBehavior, entityId: string, spawnTick: number, tick: number,
  previousEvents: readonly GameEvent[], queues: GameplayQueues): void {
  if (behavior.kind === "sceneTransition" && behavior.sceneId !== undefined &&
      previousEvents.some((event) => event.kind === "trigger" && event.event === behavior.onEvent)) {
    queues.transitionTo = behavior.sceneId;
  } else if (behavior.kind === "spawn" && behavior.prefabId !== undefined &&
      previousEvents.some((event) => event.kind === "trigger" && event.event === behavior.onEvent)) {
    queues.spawns.push({ prefabId: behavior.prefabId });
  } else if (behavior.kind === "lifetime" && behavior.ticks !== undefined && tick - spawnTick >= behavior.ticks) {
    queues.despawns.add(entityId);
  }
}

export function claimGameplayContact(actor: GameplayEntityState, target: GameplayEntityState,
  roles: { readonly collects: boolean; readonly activatesTriggers: boolean }, queues: GameplayQueues,
  score: number, emit: GameplayEmit): number {
  for (const behavior of target.definition.behaviors) {
    if (behavior.kind === "collectible" && behavior.score !== undefined && roles.collects && !queues.despawns.has(target.definition.id)) {
      queues.despawns.add(target.definition.id);
      score += behavior.score;
      emit({ kind: "collected", entityId: target.definition.id, byId: actor.definition.id, score: behavior.score });
    } else if (behavior.kind === "trigger" && behavior.event !== undefined && roles.activatesTriggers) {
      emit({ kind: "trigger", event: behavior.event, entityId: target.definition.id });
    }
  }
  return score;
}

/** The emitter an audio event carries for a spatial audio source: its settings with defaults applied, and where it played. */
function audioEmitter(definition: GameplayDefinition, audio: NonNullable<GameplayDefinition["audioSource"]>,
  position: GameAudioEmitter["position"]): GameAudioEmitter {
  const defaults = GAME_AUDIO_SPATIAL_DEFAULTS;
  return {
    entityId: definition.id, position: { x: position.x, y: position.y, z: position.z },
    minDistance: audio.minDistance ?? defaults.minDistance, maxDistance: audio.maxDistance ?? defaults.maxDistance,
    rolloff: audio.rolloff ?? defaults.rolloff, distanceModel: audio.distanceModel ?? defaults.distanceModel,
    ...(audio.cone ? { cone: audio.cone } : {}), doppler: audio.doppler ?? defaults.doppler
  };
}

/** `positionOf` gives an entity's world position for spatial audio sources. 2D positions use z = 0. */
export function finalizeGameplayEntities<S extends GameplayEntityState>(states: readonly S[], queues: GameplayQueues,
  score: number, won: boolean, sceneId: string, tick: number, events: readonly GameEvent[], emit: GameplayEmit,
  positionOf: (state: S) => GameAudioEmitter["position"]): boolean {
  for (const state of states) {
    if (queues.despawns.has(state.definition.id)) {
      state.active = false;
    }
    for (const behavior of state.definition.behaviors) {
      if (behavior.kind === "winWhenCollected" && behavior.count !== undefined && !won && score >= behavior.count) {
        won = true;
        emit({ kind: "win", score });
      }
    }
    const audio = state.definition.audioSource;
    if (audio && events.some((event) => (event.kind === audio.onEvent && (event.kind !== "collected" || event.entityId === state.definition.id)) ||
        (event.kind === "trigger" && event.event === audio.onEvent))) {
      const event: GameEvent = { kind: "audio", action: "start", assetId: audio.assetId,
        voiceId: `effect:${sceneId}:${state.definition.id}:${tick + 1}:${events.length}`,
        loop: false, volume: audio.volume, fadeInTicks: 0, fadeOutTicks: 0 };
      emit(audio.spatial ? { ...event, emitter: audioEmitter(state.definition, audio, positionOf(state)) } : event);
    }
  }
  return won;
}

export function projectGameplayHud(usesCollectibles: boolean, score: number, won: boolean, hud: ReadonlyMap<string, GameHudLabel>): GameHudLabel[] {
  return [
    ...(usesCollectibles && !hud.has("score") ? [{ id: "score", text: `Score: ${score}`, x: 16, y: 16 }] : []),
    ...(won && !hud.has("win") ? [{ id: "win", text: "You win!", x: 16, y: 48 }] : []),
    ...[...hud.values()].map((label) => ({ ...label }))
  ];
}

export function advanceGameplayRandom(rngState: number): number {
  return (Math.imul(1664525, rngState) + 1013904223) >>> 0;
}

export interface GameplayTick<E extends GameEvent = GameEvent> {
  readonly events: E[];
  readonly emit: (event: E) => void;
}

export function runGameplayTick<T, E extends GameEvent = GameEvent>(run: (tick: GameplayTick<E>) => T, onFailure: () => void, eventSink?: (event: E) => void): T {
  const events: E[] = [];
  const emit: (event: E) => void = (event) => {
    if (events.length >= MAX_GAME_EVENTS_PER_TICK) {
      throw new Error(`Game event limit exceeded (${MAX_GAME_EVENTS_PER_TICK} per tick)`);
    }
    events.push(event);
    eventSink?.(structuredClone(event));
  };
  try {
    return run({ events, emit });
  } catch (error) {
    onFailure();
    throw error;
  }
}

export type GameplayCommand<S extends GameplaySpawn = GameplaySpawn> =
  | ({ readonly kind: "hud" } & GameHudLabel)
  | { readonly kind: "emit"; readonly event: string }
  | ({ readonly kind: "spawn" } & S)
  | { readonly kind: "despawn"; readonly entityId: string }
  | { readonly kind: "sceneTransition"; readonly sceneId: string };

export function applyGameplayCommand<S extends GameplaySpawn>(command: GameplayCommand<S>, entityId: string,
  queues: GameplayQueues<S>, hud: Map<string, GameHudLabel>, emit: GameplayEmit): void {
  if (command.kind === "hud") {
    const { kind: _kind, ...label } = command;
    if (label.text === "") {
      hud.delete(label.id);
    } else {
      hud.set(label.id, label);
    }
  } else if (command.kind === "emit") {
    emit({ kind: "trigger", event: command.event, entityId });
  } else if (command.kind === "spawn") {
    queues.spawns.push(command);
  } else if (command.kind === "despawn") {
    queues.despawns.add(command.entityId);
  } else if (command.kind === "sceneTransition") {
    queues.transitionTo = command.sceneId;
  }
}

export interface GameplayPhases<Observations, Result> {
  prepare(): void;
  advanceSpatial(): Observations;
  reduceContacts(observations: Observations): void;
  commit(): Result;
}

export function runGameplayPhases<Observations, Result>(phases: GameplayPhases<Observations, Result>): Result {
  phases.prepare();
  const observations = phases.advanceSpatial();
  phases.reduceContacts(observations);
  return phases.commit();
}
