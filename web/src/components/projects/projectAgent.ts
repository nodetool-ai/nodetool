/**
 * What the project's agent is told, and how a prompt written on the
 * new-project surface reaches the thread the overview owns.
 *
 * The two surfaces are separate tabs, and only the overview's panel knows when
 * the thread is bound and its history loaded — so the prompt is staged here
 * and sent from there, rather than raced against the panel's own first load.
 */

import type { MessageContent } from "../../stores/ApiTypes";

/**
 * Tells the agent which project it is working in. The tab context already
 * lists the open documents; this names the group they belong to, so a request
 * to "add a shot" lands in this project's board rather than the last one
 * touched.
 */
export const projectSystemPrompt = (name: string, id: string): string =>
  `You are working inside the project "${name}" (project id ${id}). ` +
  `Documents you create belong to it, and the documents open in this ` +
  `workspace are its own.`;

/** Prompts waiting for their project's agent panel to mount, by project id. */
const staged = new Map<string, MessageContent[]>();

/** Hand the project's opening turn to whichever panel binds its thread next. */
export const stageProjectFirstTurn = (
  projectId: string,
  content: MessageContent[]
): void => {
  staged.set(projectId, content);
};

/**
 * Take the staged opening turn, if there is one. Taking clears it: a turn is
 * sent once, and a panel that remounts must not send it again.
 */
export const takeProjectFirstTurn = (
  projectId: string
): MessageContent[] | null => {
  const content = staged.get(projectId);
  if (!content) {
    return null;
  }
  staged.delete(projectId);
  return content;
};
