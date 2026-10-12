/**
 * Quick search over a board's shots.
 *
 * A query matches a shot when every whitespace-separated word appears,
 * case-insensitively, somewhere in the shot's text: its caption
 * (`Scene 2 | Shot 3`), title, description, dialogue, narration, motion, end
 * picture, sound, notes, the script text it covers, and its scene's slugline.
 */
import type { Shot } from "@nodetool-ai/protocol";
import type { SceneGroup } from "../../lib/storyboard/sceneOrder";

/** A scene group left after a search, with the number it has on the full board. */
export interface SearchedSceneGroup extends SceneGroup {
  number: number;
}

const queryWords = (query: string): string[] =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

const shotText = (
  shot: Shot,
  caption: string | undefined,
  slugline: string | undefined
): string =>
  [
    caption,
    shot.slug,
    shot.action,
    shot.dialogue,
    shot.narration,
    shot.motion,
    shot.end_state,
    shot.sound,
    shot.notes,
    shot.script_text_snapshot,
    slugline
  ]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join("\n")
    .toLowerCase();

/** Whether a shot matches the query. An empty query matches every shot. */
export const matchesShotQuery = (
  shot: Shot,
  query: string,
  caption?: string,
  slugline?: string
): boolean => {
  const words = queryWords(query);
  if (words.length === 0) {
    return true;
  }
  const text = shotText(shot, caption, slugline);
  return words.every((word) => text.includes(word));
};

/**
 * The scene groups with only their matching shots. A scene with no match is
 * dropped. Each kept scene keeps its number from the full board.
 */
export const searchSceneGroups = (
  groups: readonly SceneGroup[],
  query: string,
  captions: ReadonlyMap<string, string>
): SearchedSceneGroup[] => {
  const result: SearchedSceneGroup[] = [];
  groups.forEach((group, index) => {
    const slugline = group.scene?.slugline || undefined;
    const shots = group.shots.filter((shot) =>
      matchesShotQuery(shot, query, captions.get(shot.id), slugline)
    );
    if (shots.length > 0) {
      result.push({ ...group, shots, number: index + 1 });
    }
  });
  return result;
};
