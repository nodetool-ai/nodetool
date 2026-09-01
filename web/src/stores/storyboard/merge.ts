/**
 * Storyboard merge adapter
 *
 * Teaches the generic per-unit merge engine about a storyboard board:
 * `shots[]` by shot id are the merge units; the board's scalar fields
 * (brief, style, aspect ratio, entity selection, model refs, screenplay,
 * timeline link) are last-write-wins. `activeShotId` is live UI state and is
 * never merged.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import type { DocumentMergeAdapter } from "../documentMerge";
import type { StoryboardBoard } from "./StoryboardStore";

const scalar =
  <K extends keyof StoryboardBoard>(name: string, field: K) =>
  ({
    name,
    read: (board: StoryboardBoard) => board[field],
    write: (board: StoryboardBoard, value: unknown): StoryboardBoard => ({
      ...board,
      [field]: value
    })
  }) as const;

/**
 * Which shots one external op touched. Only `update_shot` names a unit the
 * engine must attribute; additions and removals resolve through existence,
 * and a reorder changes no content. The render path emits the shot id as
 * `input.id`, the editor ops as `input.target` — read both.
 */
const storyboardUnitsTouchedByOp = (
  op: DocumentOp
): { kind: string; unitId?: string }[] => {
  // set_board rewrites the board's own fields; set_link only its timeline.
  if (op.tool === "set_board") return [{ kind: "field" }];
  if (op.tool === "set_link") return [{ kind: "field", unitId: "timelineId" }];
  if (op.tool !== "update_shot") return [];
  const input = (op.input ?? {}) as Record<string, unknown>;
  const target = [input["id"], input["target"]].find(
    (v) => typeof v === "string" && v.length > 0
  );
  return typeof target === "string"
    ? [{ kind: "shot", unitId: target }]
    : [];
};

export const storyboardMergeAdapter: DocumentMergeAdapter<StoryboardBoard> = {
  collections: [
    {
      kind: "shot",
      read: (board) => board.shots,
      write: (board, shots) => ({
        ...board,
        shots: shots as StoryboardBoard["shots"]
      }),
      unitId: (unit) => (unit as StoryboardBoard["shots"][number]).id,
      unitLabel: (unit) => {
        const shot = unit as StoryboardBoard["shots"][number];
        return (
          shot.slug ||
          (shot.action ? shot.action.slice(0, 60) : `Shot ${shot.index + 1}`)
        );
      }
    }
  ],
  scalars: [
    scalar("title", "title"),
    scalar("screenplay", "screenplay"),
    scalar("brief", "brief"),
    scalar("style", "style"),
    scalar("entityIds", "entityIds"),
    scalar("aspectRatio", "aspectRatio"),
    scalar("directorModel", "directorModel"),
    scalar("imageModel", "imageModel"),
    scalar("videoModel", "videoModel"),
    scalar("timelineId", "timelineId")
  ],
  unitsTouchedByOp: storyboardUnitsTouchedByOp
};

