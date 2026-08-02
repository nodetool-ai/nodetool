/**
 * Cases for the `app-build` suite.
 *
 * Ten cases in two kinds:
 *
 * **Eight prompt cases** — one request each, written the way a user writes one,
 * and pinned at the medium-complexity bar the PRD defines (§4): two operations
 * over two workflows, eight to fifteen widgets with one nested in a container,
 * a persisted setting, a streaming output, a second step gated on what the
 * first wrote, and a condition that actually hides something. Every case
 * declares which of those traits it exercises, and the set covers all six —
 * `uncoveredAppBuildTraits` names any trait that lost its last case.
 * The prompts stay in product language: naming widgets and bindings would
 * measure obedience, and what this suite measures is whether the harness can
 * get from "build me X" to a working X.
 *
 * **Two deterministic cases** — a pinned spec over template graphs (text
 * transforms only, no model in the app under test), an authoring script instead
 * of a model, and exact expected widget values with the judge skipped. They
 * need no credentials and no network, so they run on every PR: what they
 * regress is the harness — binding a pinned workflow, checking the wiring,
 * running it on the kernel, folding the result back into a widget, and holding
 * the expectations — not a model's judgement.
 */

import type {
  AppBuildEvalCase,
  AppBuildGraph,
  AppBuildTrait,
  ScriptedToolCall
} from "./app-build-eval.js";
import { APP_BUILD_TRAITS } from "./app-build-eval.js";
import type { BuildSpec } from "../app-build/types.js";

/** The application id every `ui_app_*` call carries (see `author.ts`). */
const APP = "app-under-build";

// ---------------------------------------------------------------------------
// Deterministic case 1 — one operation, exact output
// ---------------------------------------------------------------------------

/** StringInput → SurroundWith → Output. "Ada" becomes "Hello, Ada!". */
const GREETING_GRAPH: AppBuildGraph = {
  nodes: [
    {
      id: "name_in",
      type: "nodetool.input.StringInput",
      properties: { name: "name", value: "" }
    },
    {
      id: "wrap",
      type: "nodetool.text.SurroundWith",
      properties: {
        text: "",
        prefix: "Hello, ",
        suffix: "!",
        skip_if_wrapped: false
      }
    },
    {
      id: "greeting_out",
      type: "nodetool.output.Output",
      properties: { name: "greeting" }
    }
  ],
  edges: [
    {
      id: "e1",
      source: "name_in",
      sourceHandle: "output",
      target: "wrap",
      targetHandle: "text"
    },
    {
      id: "e2",
      source: "wrap",
      sourceHandle: "output",
      target: "greeting_out",
      targetHandle: "value"
    }
  ]
};

const GREETING_SPEC: BuildSpec = {
  title: "Greeting Card",
  operations: [
    {
      id: "greet",
      objective: "",
      workflowId: "wf-greet",
      inputs: [{ name: "name", type: "string", example: "Ada" }],
      outputs: [{ name: "greeting", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "name-input",
      type: "TextInput",
      binding: "op:greet/in:name",
      label: "Your name"
    },
    {
      role: "greet-button",
      type: "Button",
      binding: "",
      label: "Make the card"
    },
    {
      role: "greeting-output",
      type: "Markdown",
      binding: "op:greet/out:greeting",
      label: "Greeting"
    }
  ],
  interactions: [
    {
      name: "greet-once",
      steps: [
        { set: { key: "name", value: "Ada", operationId: "greet" } },
        { click: "greet-button" }
      ],
      expect: [
        { widget: "greeting-output", check: "equals", value: "Hello, Ada!" }
      ]
    }
  ]
};

/**
 * The authoring round for the greeting app. Bindings name **node ids**, the way
 * the author's briefing spells them out, and every label matches its spec
 * widget verbatim — that label is how Check links a placed widget back to the
 * role the spec asked for.
 */
const GREETING_SCRIPT: ScriptedToolCall[] = [
  {
    name: "ui_app_add_operation",
    args: {
      application_id: APP,
      id: "greet",
      name: "Greet",
      target_workflow_id: "wf-greet"
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "TextInput",
      props: { label: "Your name", binding: "op:greet/in:name_in" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Markdown",
      props: { label: "Greeting", binding: "op:greet/out:greeting_out" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Button",
      props: {
        label: "Make the card",
        events: [{ trigger: "click", kind: "run", operationId: "greet" }]
      }
    }
  },
  {
    name: "ui_app_finish",
    args: { application_id: APP, summary: "a greeting card app" }
  }
];

// ---------------------------------------------------------------------------
// Deterministic case 2 — two operations, a gate, and a condition
// ---------------------------------------------------------------------------

/** StringInput → ToUppercase → Output. "ship it" becomes "SHIP IT". */
const DRAFT_GRAPH: AppBuildGraph = {
  nodes: [
    {
      id: "note_in",
      type: "nodetool.input.StringInput",
      properties: { name: "note", value: "" }
    },
    {
      id: "upper",
      type: "nodetool.text.ToUppercase",
      properties: { text: "" }
    },
    {
      id: "draft_out",
      type: "nodetool.output.Output",
      properties: { name: "draft" }
    }
  ],
  edges: [
    {
      id: "e1",
      source: "note_in",
      sourceHandle: "output",
      target: "upper",
      targetHandle: "text"
    },
    {
      id: "e2",
      source: "upper",
      sourceHandle: "output",
      target: "draft_out",
      targetHandle: "value"
    }
  ]
};

/** StringInput → SurroundWith → Output. "SHIP IT" becomes "PUBLISHED: SHIP IT". */
const PUBLISH_GRAPH: AppBuildGraph = {
  nodes: [
    {
      id: "draft_in",
      type: "nodetool.input.StringInput",
      properties: { name: "draft", value: "" }
    },
    {
      id: "stamp",
      type: "nodetool.text.SurroundWith",
      properties: {
        text: "",
        prefix: "PUBLISHED: ",
        suffix: "",
        skip_if_wrapped: false
      }
    },
    {
      id: "published_out",
      type: "nodetool.output.Output",
      properties: { name: "published" }
    }
  ],
  edges: [
    {
      id: "e1",
      source: "draft_in",
      sourceHandle: "output",
      target: "stamp",
      targetHandle: "text"
    },
    {
      id: "e2",
      source: "stamp",
      sourceHandle: "output",
      target: "published_out",
      targetHandle: "value"
    }
  ]
};

const REVIEW_SPEC: BuildSpec = {
  title: "Draft and Publish",
  operations: [
    {
      id: "draft",
      objective: "",
      workflowId: "wf-draft",
      inputs: [{ name: "note", type: "string", example: "ship it" }],
      outputs: [{ name: "draft", type: "string" }],
      streaming: false
    },
    {
      id: "publish",
      objective: "",
      workflowId: "wf-publish",
      inputs: [{ name: "draft", type: "string", example: "SHIP IT" }],
      outputs: [{ name: "published", type: "string" }],
      streaming: false
    }
  ],
  variables: [
    {
      id: "approved_draft",
      scope: "instance",
      persist: false,
      writtenBy: "draft",
      readBy: ["publish", "draft-output"]
    }
  ],
  widgets: [
    {
      role: "note-input",
      type: "TextInput",
      binding: "op:draft/in:note",
      label: "Note"
    },
    { role: "draft-button", type: "Button", binding: "", label: "Draft it" },
    { role: "review-panel", type: "Container", binding: "", label: "Review" },
    {
      role: "draft-output",
      type: "Markdown",
      binding: "var:approved_draft",
      label: "Draft",
      container: "review-panel"
    },
    {
      role: "publish-button",
      type: "Button",
      binding: "",
      label: "Publish it",
      container: "review-panel",
      visibleWhen: "approved_draft is not empty"
    },
    {
      role: "published-output",
      type: "Markdown",
      binding: "op:publish/out:published",
      label: "Published"
    }
  ],
  interactions: [
    {
      name: "draft-then-publish",
      steps: [
        { set: { key: "note", value: "ship it", operationId: "draft" } },
        { click: "draft-button" },
        { click: "publish-button" }
      ],
      expect: [
        { widget: "draft-output", check: "equals", value: "SHIP IT" },
        {
          widget: "published-output",
          check: "equals",
          value: "PUBLISHED: SHIP IT"
        }
      ]
    }
  ]
};

/**
 * The authoring round for the review app. The panel is placed before its
 * children so they can name it as `parent_id`: the bridge generates ids as
 * `<type>-<n>` off one counter, so `Container-3` is the third widget added.
 */
const REVIEW_SCRIPT: ScriptedToolCall[] = [
  {
    name: "ui_app_declare_variable",
    args: {
      application_id: APP,
      id: "approved_draft",
      name: "Approved draft",
      type: { type: "str" },
      scope: "instance",
      persist: false
    }
  },
  {
    name: "ui_app_add_operation",
    args: {
      application_id: APP,
      id: "draft",
      name: "Draft",
      target_workflow_id: "wf-draft",
      outputs: {
        draft_out: { to: "variable", variableId: "approved_draft" }
      }
    }
  },
  {
    name: "ui_app_add_operation",
    args: {
      application_id: APP,
      id: "publish",
      name: "Publish",
      target_workflow_id: "wf-publish",
      inputs: {
        draft_in: { from: "variable", variableId: "approved_draft" }
      }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "TextInput",
      props: { label: "Note", binding: "op:draft/in:note_in" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Button",
      props: {
        label: "Draft it",
        events: [{ trigger: "click", kind: "run", operationId: "draft" }]
      }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Container",
      props: { title: "Review" }
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Markdown",
      props: { label: "Draft", binding: "var:approved_draft" },
      parent_id: "Container-3",
      slot: "content"
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Button",
      props: {
        label: "Publish it",
        events: [{ trigger: "click", kind: "run", operationId: "publish" }],
        visibleWhen: { binding: "var:approved_draft", op: "notEmpty" }
      },
      parent_id: "Container-3",
      slot: "content"
    }
  },
  {
    name: "ui_app_add_component",
    args: {
      application_id: APP,
      type: "Markdown",
      props: { label: "Published", binding: "op:publish/out:published_out" }
    }
  },
  {
    name: "ui_app_finish",
    args: { application_id: APP, summary: "a draft-then-publish app" }
  }
];

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

/** What every prompt case must produce, before its own traits are checked. */
const MEDIUM_SHAPE = {
  minOperations: 2,
  minWorkflows: 2,
  minWidgets: 8,
  maxWidgets: 15,
  requireContainer: true
} as const;

export const APP_BUILD_EVAL_CASES: readonly AppBuildEvalCase[] = [
  {
    id: "greeting-card",
    description:
      "Deterministic: one pinned template workflow, exact widget value, no model",
    traits: ["multi-operation"],
    deterministic: {
      spec: GREETING_SPEC,
      workflows: { "wf-greet": GREETING_GRAPH },
      authorScript: GREETING_SCRIPT
    },
    expect: {
      minOperations: 1,
      minWorkflows: 1,
      widgetValues: [{ widget: "greeting-output", equals: "Hello, Ada!" }]
    }
  },
  {
    id: "draft-then-publish",
    description:
      "Deterministic: two pinned workflows, a variable gate, a condition that hides the second step",
    traits: ["multi-operation", "gated-flow", "conditional", "container-depth"],
    deterministic: {
      spec: REVIEW_SPEC,
      workflows: { "wf-draft": DRAFT_GRAPH, "wf-publish": PUBLISH_GRAPH },
      authorScript: REVIEW_SCRIPT
    },
    expect: {
      minOperations: 2,
      minWorkflows: 2,
      requireContainer: true,
      requireGatedFlow: true,
      requireConditional: true,
      widgetValues: [
        { widget: "draft-output", equals: "SHIP IT" },
        { widget: "published-output", equals: "PUBLISHED: SHIP IT" }
      ]
    }
  },
  {
    id: "caption-review",
    description:
      "Product photo to captions, approved before a polish pass — review-before-publish over an image input",
    traits: [
      "multi-operation",
      "gated-flow",
      "conditional",
      "container-depth",
      "streaming-output"
    ],
    prompt:
      "Build an app for writing product captions. I upload a product photo and a short " +
      "note about the product, and the app writes three caption options, streaming them " +
      "into the page as they come. I pick the one I like and press Approve; only then " +
      "does a Polish step appear, which rewrites the approved caption to the house style " +
      "and shows the final text. Keep the approved caption and the polished result " +
      "visible side by side in a review panel.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requireConditional: true,
      requireStreamingOperation: true
    }
  },
  {
    id: "release-notes",
    description:
      "Commit list to draft release notes, approved, then a published summary; the tone setting persists",
    traits: [
      "multi-operation",
      "gated-flow",
      "persisted-setting",
      "container-depth",
      "streaming-output"
    ],
    prompt:
      "I paste a list of merged commits and the app drafts release notes from them, " +
      "streaming the draft as it writes. There is a Tone setting (plain, playful, " +
      "formal) that should stick between sessions — I set it once and never again. " +
      "When I approve the draft, a second step turns it into a one-paragraph " +
      "announcement for the changelog page. Show the draft and the announcement in a " +
      "panel together.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requirePersistedVariable: true,
      requireStreamingOperation: true
    }
  },
  {
    id: "support-triage",
    description:
      "Classify an inbound message, then draft a reply in a persisted house tone",
    traits: [
      "multi-operation",
      "gated-flow",
      "persisted-setting",
      "conditional",
      "container-depth"
    ],
    prompt:
      "Build a support triage app. I paste a customer message; the app classifies it " +
      "(bug, billing, or feature request) and shows the category with a short reason. " +
      "If it is a bug, a Draft reply button appears that writes a reply using the " +
      "category and my saved signature — the signature is a setting that persists " +
      "between sessions. Show the classification and the drafted reply grouped in one " +
      "panel.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requirePersistedVariable: true,
      requireConditional: true
    }
  },
  {
    id: "recipe-scaler",
    description:
      "Parse a pasted recipe, then rescale it for a chosen serving count",
    traits: [
      "multi-operation",
      "gated-flow",
      "persisted-setting",
      "container-depth"
    ],
    prompt:
      "I paste a recipe from a website and the app pulls out the ingredient list and " +
      "the steps. Then I choose how many people I am cooking for with a slider and " +
      "press Rescale, and it rewrites the ingredient quantities for that number. My " +
      "preferred unit system (metric or imperial) is a setting that should stick. Put " +
      "the parsed ingredients and the rescaled ones next to each other.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requirePersistedVariable: true
    }
  },
  {
    id: "listing-writer",
    description:
      "Marketplace listing from a photo, then a translation of the approved text",
    traits: [
      "multi-operation",
      "gated-flow",
      "conditional",
      "container-depth",
      "streaming-output"
    ],
    prompt:
      "Build an app that writes a marketplace listing. I upload a photo of the item and " +
      "type an asking price, and it writes a title and a description, streaming the " +
      "description as it goes. Once I accept the description, a translation step " +
      "becomes available that renders it in a language I choose from a dropdown. Hide " +
      "the translation controls until there is an accepted description.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requireConditional: true,
      requireStreamingOperation: true
    }
  },
  {
    id: "study-cards",
    description: "Notes to flashcards, then a quiz over the accepted deck",
    traits: [
      "multi-operation",
      "gated-flow",
      "conditional",
      "container-depth",
      "persisted-setting"
    ],
    prompt:
      "I paste my lecture notes and the app turns them into flashcards — question on " +
      "one side, answer on the other — shown as a table. When I accept the deck, a Quiz " +
      "me button appears that asks me five questions drawn from the accepted cards and " +
      "grades my answers. How many cards to generate is a setting that should be " +
      "remembered between sessions. Group the deck and the quiz results in panels.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requireConditional: true,
      requirePersistedVariable: true
    }
  },
  {
    id: "podcast-shownotes",
    description:
      "Transcript to chapters, then show notes built from the approved chapters",
    traits: [
      "multi-operation",
      "gated-flow",
      "container-depth",
      "streaming-output"
    ],
    prompt:
      "Build a show-notes app. I paste an episode transcript and it proposes chapter " +
      "titles with timestamps, streaming them as they are found. I edit the chapter " +
      "list and press Confirm, and a second step writes the episode description and the " +
      "social post from the confirmed chapters. Show the chapters and the written notes " +
      "in separate panels, and show a progress indicator while either step runs.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requireStreamingOperation: true
    }
  },
  {
    id: "changelog-translator",
    description:
      "Summarize a changelog, then translate the approved summary; the target language persists",
    traits: [
      "multi-operation",
      "gated-flow",
      "persisted-setting",
      "conditional",
      "container-depth"
    ],
    prompt:
      "I paste a raw changelog and the app summarizes it for customers. My default " +
      "target language is a setting that should survive a restart. After I mark the " +
      "summary as approved, a Translate button appears and produces the summary in that " +
      "language; before approval it should not be there at all. Show the English " +
      "summary and the translation together in one panel, with the approval state " +
      "visible.",
    needsModelProviders: true,
    expect: {
      ...MEDIUM_SHAPE,
      requireGatedFlow: true,
      requirePersistedVariable: true,
      requireConditional: true
    }
  }
];

/** Case ids that need neither credentials nor network — the CI gate's set. */
export const APP_BUILD_DETERMINISTIC_CASE_IDS: readonly string[] =
  APP_BUILD_EVAL_CASES.filter((c) => c.deterministic !== undefined).map(
    (c) => c.id
  );

/**
 * Traits no case exercises. The suite's claim is that it covers the PRD's
 * medium-complexity bar, so a trait dropping to zero cases is a suite bug, not
 * a scoring result.
 */
export const uncoveredAppBuildTraits = (
  cases: readonly AppBuildEvalCase[] = APP_BUILD_EVAL_CASES
): AppBuildTrait[] =>
  APP_BUILD_TRAITS.filter(
    (trait) => !cases.some((c) => c.traits.includes(trait))
  );
