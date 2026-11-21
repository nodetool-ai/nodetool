/**
 * The glyph, color, and label a tab type is drawn with — in the tab bar, in
 * mobile's document selector, and on the cards of the projects list. One
 * table, so the same document reads the same wherever it is listed.
 */

import { colorForType } from "../../config/data_types";
import { PROJECT_COLOR, PROJECT_GLYPH } from "../projects/projectIdentity";
import type { WorkspaceTabType } from "../../stores/WorkspaceTabsStore";
import { isPageTabKey, PAGE_TAB_TITLES } from "./pageTabs";

/** The title a chat thread gets before its first message names it. */
const NEW_CONVERSATION_TITLE = "New conversation";

/**
 * The overview tab shows its project name. The new-project landing surface
 * keeps the Home label until a project exists.
 */
export const PROJECT_HOME_TAB_TITLE = "Home";
export const PROJECT_HOME_GLYPH = "⌂";

/** Reads a catalog string, as i18next's `t` does. */
type Translate = (key: string) => string;

/**
 * The title a tab shows. Page tabs, the Home tab and a new conversation store
 * their English default title, so with `translate` the default is shown in
 * the interface language. A title the user typed is shown as stored.
 */
export const tabDisplayTitle = (
  tab: { type: WorkspaceTabType; title: string; ref?: string },
  translate?: Translate
): string => {
  if (tab.type === "project-new") {
    return translate
      ? translate("pass3_32.projects.home.homeTab")
      : PROJECT_HOME_TAB_TITLE;
  }
  if (!translate) {
    return tab.title;
  }
  if (
    tab.type === "page" &&
    tab.ref !== undefined &&
    isPageTabKey(tab.ref) &&
    tab.title === PAGE_TAB_TITLES[tab.ref]
  ) {
    return translate(`i18n-next51.page.titles.${tab.ref}`);
  }
  if (tab.type === "chat" && tab.title === NEW_CONVERSATION_TITLE) {
    return translate("i18n-next5.conversation.newConversation");
  }
  return tab.title;
};

export const TYPE_GLYPH = {
  workflow: "⬡",
  image: "▦",
  svg: "◇",
  sketch: "✎",
  timeline: "▤",
  storyboard: "▥",
  script: "🎙",
  jsscript: "{ }",
  skill: "✦",
  model3d: "◈",
  audio: "♪",
  text: "¶",
  document: "🗎",
  "workspace-file": "🗎",
  chat: "❝",
  application: "◧",
  "example-app": "◧",
  game: "▣",
  page: "☰",
  "project-list": PROJECT_GLYPH,
  project: PROJECT_HOME_GLYPH,
  "guided-flow": "✦",
  "project-new": PROJECT_GLYPH,
  create: "✧"
} satisfies Record<WorkspaceTabType, string>;

/** Pin color per tab type, reusing the app's canonical data-type palette. */
export const TYPE_COLOR = {
  workflow: colorForType("any"),
  image: colorForType("image"),
  svg: colorForType("image"),
  sketch: colorForType("image"),
  timeline: colorForType("video"),
  storyboard: colorForType("video"),
  script: colorForType("audio"),
  jsscript: colorForType("str"),
  skill: colorForType("str"),
  model3d: colorForType("model_3d"),
  audio: colorForType("audio"),
  text: colorForType("text"),
  document: colorForType("document"),
  "workspace-file": colorForType("file"),
  chat: colorForType("str"),
  application: colorForType("any"),
  "example-app": colorForType("any"),
  game: colorForType("any"),
  page: colorForType("any"),
  "project-list": PROJECT_COLOR,
  project: PROJECT_COLOR,
  "guided-flow": PROJECT_COLOR,
  "project-new": PROJECT_COLOR,
  create: colorForType("image")
} satisfies Record<WorkspaceTabType, string>;
