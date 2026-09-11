import { TUTORIALS } from "./tutorials";
import { CHAT_TUTORIALS } from "./chatTutorials";
import { TIMELINE_TUTORIALS } from "./timelineTutorials";
import { DOC_TUTORIALS } from "./docTutorials";

export const TUTORIAL_CATALOG = [
  ...TUTORIALS,
  ...CHAT_TUTORIALS.map((entry) => ({ ...entry, slug: `chat-${entry.slug}` })),
  ...TIMELINE_TUTORIALS.map((entry) => ({ ...entry, slug: `timeline-${entry.slug}` })),
  ...DOC_TUTORIALS,
];

export type CatalogEntry = (typeof TUTORIAL_CATALOG)[number];

export function posterFrame(entry: CatalogEntry): number {
  const shots = entry.props.shots;
  const result = shots ? [...shots].reverse().find((shot) => shot.target.kind !== "overview") ?? shots.at(-1) : undefined;
  const timeMs = result
    ? Math.max(result.fromMs + (result.moveMs ?? 650), result.toMs - 500)
    : entry.props.replayWindowMs - 1000;
  return Math.round((entry.props.introSeconds + timeMs / 1000) * entry.fps);
}

export function inspectionFrames(entry: CatalogEntry): { label: string; frame: number }[] {
  return (entry.props.shots ?? []).flatMap((shot) => {
    const move = shot.moveMs ?? 650;
    const points: [string, number][] = [
      ["start", shot.fromMs],
      ["midpoint", shot.fromMs + move / 2],
      ["settled", shot.fromMs + move + 250],
      ["result", shot.toMs - 1000 / entry.fps],
    ];
    if (shot.actionAtMs !== undefined) {
      points.push(["action", shot.actionAtMs]);
    }
    return points.map(([phase, timeMs]) => ({
      label: `${shot.id}-${phase}`,
      frame: Math.round((entry.props.introSeconds + Math.min(timeMs, shot.toMs - 1000 / entry.fps) / 1000) * entry.fps),
    }));
  });
}
