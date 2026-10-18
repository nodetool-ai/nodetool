/**
 * The App flow's small rules and its draft, kept apart from the step
 * components so they can be read and tested without the model pickers.
 *
 * Nothing exists on the server until the build is green, so the draft — the
 * stage, the brief, the spec under review, the model and the name — lives in
 * local storage under the guided tab's key. A reload resumes at the same step.
 */

import { WIDGET_CATALOG } from "@nodetool-ai/app-runtime";

import {
  isAppSpec,
  type AppBuildProgress,
  type AppSpec
} from "../../../utils/applicationBuild";

export type AppSetupStage = "idea" | "review" | "build";

export interface AppSetupModel {
  provider: string;
  id: string;
}

export interface AppSetupDraft {
  readonly version: 1;
  readonly stage: AppSetupStage;
  readonly brief: string;
  /** The spec under review, as the creator last edited it. */
  readonly spec: AppSpec | null;
  /** The brief the spec was written for, so a changed brief re-designs. */
  readonly specBrief: string | null;
  /** Null until the creator picks one; the host's default applies. */
  readonly model: AppSetupModel | null;
  /** The app's name. Null until edited, which means the spec's title. */
  readonly name: string | null;
}

/** Three briefs that each exercise a different shape of app. */
export const APP_EXAMPLE_BRIEFS: readonly string[] = [
  "A page where I paste a customer message, press Triage, and see whether it is a bug, billing or a feature request, with a one-line reason",
  "I paste a recipe and pick how many people I am cooking for, and the app rewrites the ingredient quantities for that number",
  "I paste my lecture notes and get ten flashcards back as a table, question on one side and answer on the other"
];

const STORAGE_PREFIX = "nodetool-app-setup-draft:";

const storageKey = (key: string): string => `${STORAGE_PREFIX}${key}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStage = (value: unknown): value is AppSetupStage =>
  value === "idea" || value === "review" || value === "build";

const parseModel = (value: unknown): AppSetupModel | null =>
  isRecord(value) &&
  typeof value["provider"] === "string" &&
  typeof value["id"] === "string" &&
  value["id"].length > 0
    ? { provider: value["provider"], id: value["id"] }
    : null;

export const emptyAppSetupDraft = (brief: string): AppSetupDraft => ({
  version: 1,
  stage: "idea",
  brief,
  spec: null,
  specBrief: null,
  model: null,
  name: null
});

export const readAppSetupDraft = (key: string): AppSetupDraft | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value["version"] !== 1) {
      return null;
    }
    const { stage, brief, spec, specBrief, name } = value;
    if (!isStage(stage) || typeof brief !== "string") {
      return null;
    }
    const validSpec = isAppSpec(spec) ? spec : null;
    return {
      version: 1,
      // A review or build with no spec behind it has nothing to show.
      stage: validSpec ? stage : "idea",
      brief,
      spec: validSpec,
      specBrief: typeof specBrief === "string" ? specBrief : null,
      model: parseModel(value["model"]),
      name: typeof name === "string" ? name : null
    };
  } catch {
    return null;
  }
};

export const writeAppSetupDraft = (key: string, draft: AppSetupDraft): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(draft));
  } catch {
    // Storage can be unavailable in private browsing. The mounted draft stays usable.
  }
};

export const clearAppSetupDraft = (key: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // A failed cleanup must not block building or leaving the flow.
  }
};

// Guided tabs key their drafts by `crypto.randomUUID()`. A draft kept under a
// project id (no guided tab) never takes this shape, so the sweep leaves it.
const GUIDED_REF =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Remove drafts whose guided tab is no longer open. */
export const sweepClosedAppDrafts = (openKeys: ReadonlySet<string>): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const stale: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) {
        continue;
      }
      const ref = key.slice(STORAGE_PREFIX.length);
      if (GUIDED_REF.test(ref) && !openKeys.has(ref)) {
        stale.push(key);
      }
    }
    for (const key of stale) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // A failed sweep leaves the drafts for the next one.
  }
};

/** A widget's type in the editor's own words: "Text input". */
export const widgetTypeLabel = (type: string): string =>
  WIDGET_CATALOG[type]?.label ?? type;

/** Layout widgets frame the screen; the review lists what a user sees. */
export const isLayoutWidget = (type: string): boolean =>
  WIDGET_CATALOG[type]?.mode === "layout";

/** "draft-reply", "draft_reply" and "draftReply" → "Draft reply". */
export const humanizeSlug = (slug: string): string => {
  const words = slug
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
};

/**
 * Rename a widget. An interaction may name a widget by its label, and the
 * build matches a placed widget back to its role by label, so a rename would
 * leave such a reference pointing at nothing. Those references move to the
 * widget's role, which no edit here changes and which resolves first.
 */
export const renameWidget = (
  spec: AppSpec,
  role: string,
  label: string
): AppSpec => {
  const widget = spec.widgets.find((entry) => entry.role === role);
  if (!widget) {
    return spec;
  }
  const previous = widget.label;
  const repoint = (ref: unknown): unknown =>
    previous !== "" && ref === previous ? role : ref;
  return {
    ...spec,
    widgets: spec.widgets.map((entry) =>
      entry.role === role ? { ...entry, label } : entry
    ),
    interactions: spec.interactions.map((interaction) => ({
      ...interaction,
      steps: interaction.steps.map((step) => {
        if (!isRecord(step)) {
          return step;
        }
        if ("click" in step) {
          return { ...step, click: repoint(step["click"]) };
        }
        if ("change" in step) {
          return { ...step, change: repoint(step["change"]) };
        }
        return step;
      }),
      expect: interaction.expect.map((check) => ({
        ...check,
        widget: repoint(check.widget) as string
      }))
    }))
  };
};

/** The spec text a build cannot go without, in the creator's words. */
export const appSpecGaps = (spec: AppSpec): string[] => {
  const gaps: string[] = [];
  if (spec.title.trim().length === 0) {
    gaps.push("a title");
  }
  for (const operation of spec.operations) {
    if (!operation.workflowId && operation.objective.trim().length === 0) {
      gaps.push(`what ${humanizeSlug(operation.id)} does`);
    }
  }
  const seen = new Set<string>();
  for (const widget of spec.widgets) {
    if (isLayoutWidget(widget.type)) {
      continue;
    }
    const label = widget.label.trim();
    if (label.length === 0) {
      gaps.push(`a label for the ${widgetTypeLabel(widget.type)}`);
    } else if (seen.has(label)) {
      gaps.push(`a different label for the second "${label}"`);
    }
    seen.add(label);
  }
  return gaps;
};

/** One interaction as a sentence: what is done, then what is checked. */
export const describeInteraction = (
  spec: AppSpec,
  interaction: AppSpec["interactions"][number]
): string => {
  const name = (ref: unknown): string => {
    const widget = spec.widgets.find(
      (entry) => entry.role === ref || entry.label === ref
    );
    return widget?.label || (typeof ref === "string" ? humanizeSlug(ref) : "");
  };
  const actions = interaction.steps.flatMap((step) => {
    if (!isRecord(step)) {
      return [];
    }
    if ("click" in step) {
      return [`press ${name(step["click"])}`];
    }
    if ("change" in step) {
      return [`change ${name(step["change"])}`];
    }
    if ("set" in step && isRecord(step["set"])) {
      return [`fill in ${humanizeSlug(String(step["set"]["key"] ?? ""))}`];
    }
    if ("run" in step) {
      return [`run ${humanizeSlug(String(step["run"]))}`];
    }
    return [];
  });
  const checks = interaction.expect.map((check) => name(check.widget));
  const did = actions.length > 0 ? actions.join(", then ") : "open the app";
  return checks.length > 0
    ? `${did[0].toUpperCase()}${did.slice(1)}; ${checks.join(" and ")} must show a result.`
    : `${did[0].toUpperCase()}${did.slice(1)}.`;
};

/**
 * The three parts of a build the Build step lists: making the workflows,
 * placing the screen, and the test run. The server's stages map onto them.
 */
export type AppBuildPhase = "workflows" | "screen" | "test";

export const APP_BUILD_PHASES: readonly AppBuildPhase[] = [
  "workflows",
  "screen",
  "test"
];

export const appBuildPhase = (progress: AppBuildProgress): AppBuildPhase => {
  switch (progress.stage) {
    case "spec":
    case "plan":
      return "workflows";
    case "author":
    case "check":
      return "screen";
    case "run":
    case "judge":
      return "test";
  }
};

/**
 * What the build is doing, for the line beside the spinner. A repair round
 * says so, because the same phases run again.
 */
export const appBuildPendingLabel = (
  progress: AppBuildProgress | null,
  plansWorkflows: boolean
): string => {
  if (!progress) {
    return "Starting the build";
  }
  if (progress.round > 0 && appBuildPhase(progress) !== "test") {
    return "Fixing what the test run found";
  }
  switch (appBuildPhase(progress)) {
    case "workflows":
      return plansWorkflows ? "Planning the workflows" : "Connecting your workflows";
    case "screen":
      return "Placing the screen and connecting it";
    case "test":
      return progress.round > 0 ? "Running the tests again" : "Running the tests";
  }
};
