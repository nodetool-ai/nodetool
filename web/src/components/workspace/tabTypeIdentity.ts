/**
 * The glyph and color a tab type is drawn with — in the tab bar, in mobile's
 * document selector, and on the cards of the projects list. One table, so the
 * same document reads the same wherever it is listed.
 */

import { colorForType } from "../../config/data_types";
import { PROJECT_COLOR, PROJECT_GLYPH } from "../projects/projectIdentity";
import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";

export const TYPE_GLYPH = {
  workflow: "⬡",
  image: "▦",
  sketch: "✎",
  timeline: "▤",
  storyboard: "▥",
  script: "🎙",
  jsscript: "{ }",
  skill: "✦",
  model3d: "◈",
  audio: "♪",
  text: "¶",
  "workspace-file": "🗎",
  chat: "❝",
  application: "◧",
  page: "☰",
  "project-list": PROJECT_GLYPH,
  project: PROJECT_GLYPH
} satisfies Record<WorkspaceTabType, string>;

/** Pin color per tab type, reusing the app's canonical data-type palette. */
export const TYPE_COLOR = {
  workflow: colorForType("any"),
  image: colorForType("image"),
  sketch: colorForType("image"),
  timeline: colorForType("video"),
  storyboard: colorForType("video"),
  script: colorForType("audio"),
  jsscript: colorForType("str"),
  skill: colorForType("str"),
  model3d: colorForType("model_3d"),
  audio: colorForType("audio"),
  text: colorForType("text"),
  "workspace-file": colorForType("file"),
  chat: colorForType("str"),
  application: colorForType("any"),
  page: colorForType("any"),
  "project-list": PROJECT_COLOR,
  project: PROJECT_COLOR
} satisfies Record<WorkspaceTabType, string>;
