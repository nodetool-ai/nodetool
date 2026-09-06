/**
 * The four next steps under the Game flow's landing checklist
 * (game-prd § 4.4), as the pure pieces each one needs.
 *
 * They are separate from the checklist so the checklist stays a rendering of
 * the run, and so the ref formats — a `workspace-file` tab's `${id}::${path}`,
 * the workspace download endpoint — are asserted where they are built rather
 * than through a rendered button.
 *
 * `Play-test with the agent` is the hand-over the flow ends on (D29): the agent
 * gets the design and the exported directory and takes the project from there,
 * with the `godot-game` skill's play-test loop. The flow does not grow a second
 * editor.
 */

import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  buildWorkspaceFileRef,
  workspaceFileDownloadPath
} from "../../workspace/workspaceFileRef";
import type { MessageContent } from "../../../stores/ApiTypes";

/** The Godot project file inside an exported directory. */
export const GAME_PROJECT_FILE = "project.godot";

/** The `workspace-file` tab ref for `<directory>/project.godot`. */
export const gameProjectFileRef = (
  workspaceId: string,
  directory: string
): string =>
  buildWorkspaceFileRef(workspaceId, `${directory}/${GAME_PROJECT_FILE}`);

/** The download URL of the zip the export node wrote beside the directory. */
export const gameArchiveDownloadPath = (
  workspaceId: string,
  archive: string
): string => workspaceFileDownloadPath(workspaceId, archive);

/**
 * The agent's opening turn for a play-test: what the game is, where it was
 * written, and what it is being asked to do. The agent reads the project's own
 * files from the directory, so the turn names it rather than pasting it.
 */
export const gamePlayTestTurn = (
  design: GameDesign,
  directory: string
): MessageContent[] => [
  {
    type: "text",
    text: [
      `I built "${design.title}" and exported it to \`${directory}\` in this workspace.`,
      "",
      `Premise: ${design.premise}`,
      `Core loop: ${design.core_loop}`,
      `Win: ${design.win}`,
      `Lose: ${design.lose}`,
      "",
      "Play-test it: run the project headlessly, read the gameplay hooks, and tell me",
      "what to change before you change anything. If an asset is wrong for its slot,",
      "say which slot and what you would generate instead."
    ].join("\n")
  }
];
