/**
 * Final Draft (.fdx) import — typed paragraphs to scenes, shots and dialogue.
 *
 * FDX is XML whose paragraphs carry their own type, so the structure is read
 * rather than guessed: one scene per `Scene Heading`, one shot per `Action`
 * paragraph or dialogue block, and `dialogue` copied verbatim from the
 * `Character`, `Parenthetical` and `Dialogue` paragraphs (PRD § 7.2, D10).
 * Nothing here asks a model anything — that is the point. The Director is
 * asked only for camera, motion and duration, and `verifyImportedText`
 * restores these values if the answer drifts.
 *
 * Pure but for `DOMParser`, which is the browser's own XML parser and the one
 * DOM global this file touches.
 */

import type { Scene, Shot } from "@nodetool-ai/protocol";

/** What one FDX file yields. Scene order is the order of the shots' indexes. */
export interface FdxImport {
  scenes: Scene[];
  /** Contiguous `index` from 0, each shot carrying its `scene_id`. */
  shots: Shot[];
  /** The screenplay as plain text — what lands in the idea textarea. */
  text: string;
}

/**
 * The paragraph types this reads. A `Transition` ("CUT TO:") or a `General`
 * note is neither a shot nor a line, so it is dropped rather than turned into
 * a shot nobody asked to render.
 */
const SCENE_HEADING = "Scene Heading";
const ACTION = "Action";
const CHARACTER = "Character";
const PARENTHETICAL = "Parenthetical";
const DIALOGUE = "Dialogue";

/** The scene an FDX with no `Scene Heading` imports as (PRD § 7.6). */
const IMPLICIT_SCENE_SLUGLINE = "Scene 1";

interface DialogueBlock {
  character: string;
  parenthetical: string;
  lines: string[];
}

/** Every `<Text>` run inside a paragraph, joined — FDX splits styled runs. */
function paragraphText(paragraph: Element): string {
  const runs = paragraph.getElementsByTagName("Text");
  let text = "";
  for (let i = 0; i < runs.length; i++) {
    text += runs[i].textContent ?? "";
  }
  return text.trim();
}

/** The block's text as the review shows it: speaker, parenthetical, lines. */
function blockText(block: DialogueBlock): string {
  return [block.character, block.parenthetical, ...block.lines]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Parse an FDX document. Throws when the bytes are not a Final Draft file —
 * the upload card writes nothing and shows the § 7.6 notice.
 */
export function parseFdx(xml: string): FdxImport {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("This FDX could not be read.");
  }
  const paragraphs = doc.getElementsByTagName("Paragraph");
  if (paragraphs.length === 0) {
    throw new Error("This FDX holds no screenplay paragraphs.");
  }

  const scenes: Scene[] = [];
  const shots: Shot[] = [];
  let block: DialogueBlock | null = null;

  const currentScene = (): Scene => {
    const last = scenes[scenes.length - 1];
    if (last) {
      return last;
    }
    // Paragraphs before the first heading belong to one implicit scene, which
    // is also the whole of an FDX that carries no heading at all.
    const scene: Scene = {
      type: "scene",
      id: "fdx-scene-1",
      slugline: IMPLICIT_SCENE_SLUGLINE
    };
    scenes.push(scene);
    return scene;
  };

  const addShot = (action: string, dialogue?: string): void => {
    const scene = currentScene();
    const shot: Shot = {
      type: "shot",
      id: `fdx-shot-${shots.length + 1}`,
      index: shots.length,
      action,
      status: "planned",
      scene_id: scene.id
    };
    if (dialogue !== undefined && dialogue !== "") {
      shot.dialogue = dialogue;
    }
    shots.push(shot);
  };

  const flushBlock = (): void => {
    if (!block) {
      return;
    }
    const text = blockText(block);
    if (text !== "") {
      // A dialogue shot's action names who is speaking and how, taken from the
      // source's own words: the shot still has to render a picture.
      const action =
        block.character !== ""
          ? [block.character, block.parenthetical].filter((p) => p !== "").join(" ")
          : (block.lines[0] ?? "");
      addShot(action, text);
    }
    block = null;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const type = paragraph.getAttribute("Type") ?? "";
    const text = paragraphText(paragraph);

    if (type === CHARACTER) {
      flushBlock();
      if (text !== "") {
        block = { character: text, parenthetical: "", lines: [] };
      }
      continue;
    }
    if (type === PARENTHETICAL && block) {
      block.parenthetical = text;
      continue;
    }
    if (type === DIALOGUE) {
      if (block) {
        if (text !== "") {
          block.lines.push(text);
        }
      } else if (text !== "") {
        block = { character: "", parenthetical: "", lines: [text] };
      }
      continue;
    }

    flushBlock();
    if (type === SCENE_HEADING && text !== "") {
      scenes.push({
        type: "scene",
        id: `fdx-scene-${scenes.length + 1}`,
        slugline: text
      });
      continue;
    }
    if (type === ACTION && text !== "") {
      addShot(text);
    }
  }
  flushBlock();

  return { scenes, shots, text: screenplayText(scenes, shots) };
}

/** The parse read back as plain text, scene by scene. */
function screenplayText(scenes: readonly Scene[], shots: readonly Shot[]): string {
  const blocks: string[] = [];
  for (const scene of scenes) {
    blocks.push(scene.slugline);
    for (const shot of shots) {
      if (shot.scene_id === scene.id) {
        blocks.push(shot.dialogue ?? shot.action);
      }
    }
  }
  return blocks.join("\n\n");
}

export default parseFdx;
