import type { GameEntity, GameVisualTrack } from "@nodetool-ai/protocol";

export interface EvaluatedVisual {
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  tint: string | undefined;
}

function progress(track: GameVisualTrack, age: number): number | undefined {
  const elapsed = Math.max(0, age) - track.delayTicks;
  if (elapsed < 0) return undefined;
  const span = track.durationTicks * (track.pingPong ? 2 : 1);
  const position = track.repeat ? elapsed % span : Math.min(elapsed, span);
  const fraction = Math.min(1, position / track.durationTicks);
  const direction = track.pingPong && position > track.durationTicks ? 2 - position / track.durationTicks : fraction;
  switch (track.easing) {
    case "easeIn": return direction * direction;
    case "easeOut": return 1 - (1 - direction) ** 2;
    case "easeInOut": return direction * direction * (3 - 2 * direction);
    default: return direction;
  }
}

function mixTint(from: string, to: string, fraction: number): string {
  return `#${[1, 3, 5].map((index) => Math.round(
    Number.parseInt(from.slice(index, index + 2), 16) * (1 - fraction) +
    Number.parseInt(to.slice(index, index + 2), 16) * fraction
  ).toString(16).padStart(2, "0")).join("")}`;
}

/** Evaluates authored visual tracks from an entity's scene or spawn age. */
export function evaluateVisual(entity: GameEntity, age: number, rotation: number, scaleX: number, scaleY: number): EvaluatedVisual {
  const result: EvaluatedVisual = { rotation: rotation + (entity.visualAnimation?.rotationRate ?? 0) * Math.max(0, age), scaleX, scaleY,
    opacity: entity.sprite?.opacity ?? 1, tint: entity.sprite?.tint };
  for (const track of entity.visualAnimation?.tracks ?? []) {
    const fraction = progress(track, age);
    if (fraction === undefined) continue;
    if (track.property === "tint") result.tint = mixTint(track.from, track.to, fraction);
    else result[track.property] = track.from + (track.to - track.from) * fraction;
  }
  return result;
}
