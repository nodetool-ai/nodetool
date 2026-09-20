const variableBinding = (id) => `var:${id}`;
const executionBinding = (operationId, field) =>
  `op:${operationId}/exec#${field}`;

const condition = (binding, op, value) => ({
  binding,
  op,
  ...(value === undefined ? {} : { value })
});

const phaseIs = (phase) => condition(variableBinding("phase"), "eq", phase);
const phaseIsNot = (phase) => condition(variableBinding("phase"), "neq", phase);
const isRunning = (operationId) =>
  condition(executionBinding(operationId, "running"), "notEmpty");
const hasError = (operationId) =>
  condition(executionBinding(operationId, "error"), "notEmpty");
const hasActivity = (operationId) =>
  condition(executionBinding(operationId, "activity"), "notEmpty");
const hasValue = (variableId) =>
  condition(variableBinding(variableId), "notEmpty");
const restoreIs = (value) =>
  condition(variableBinding("restoreGate"), "eq", value);

const widget = (type, id, props = {}) => ({
  type,
  props: { id, ...props }
});

const heading = (id, text, level = "2", visibleWhen) =>
  widget("Heading", id, {
    text,
    level,
    ...(visibleWhen ? { visibleWhen } : {})
  });

const text = (id, value, visibleWhen) =>
  widget("Text", id, {
    text: value,
    ...(visibleWhen ? { visibleWhen } : {})
  });

const boundText = (id, binding, format, visibleWhen) =>
  widget("Text", id, { binding, format, visibleWhen });

const input = (type, id, binding, label, visibleWhen, extra = {}) =>
  widget(type, id, {
    binding,
    label,
    events: [],
    visibleWhen,
    ...extra
  });

const runEvent = (operationId) => ({
  trigger: "click",
  kind: "run",
  operationId
});

const changeRunEvent = (operationId) => ({
  trigger: "change",
  kind: "run",
  operationId,
  pace: "release"
});

const cancelEvent = (operationId) => ({
  trigger: "click",
  kind: "cancel",
  operationId
});

const setVariableEvent = (variableId, value) => ({
  trigger: "click",
  kind: "setVariable",
  key: variableBinding(variableId),
  value
});

const changeSetVariableEvent = (variableId, value) => ({
  trigger: "change",
  kind: "setVariable",
  key: variableBinding(variableId),
  value
});

const runAndEnter = (operationId, phase, extras = []) => [
  runEvent(operationId),
  setVariableEvent("phase", phase),
  ...extras
];

const button = (
  id,
  label,
  events,
  visibleWhen,
  disabledWhen,
  variant = "contained",
  color = "primary"
) =>
  widget("Button", id, {
    label,
    variant,
    color,
    events,
    visibleWhen,
    ...(disabledWhen ? { disabledWhen } : {})
  });

const operationFeedback = ({
  operationId,
  busyPhase,
  stageLabel,
  cancelLabel,
  retryLabel,
  returnLabel,
  returnPhase,
  returnEvents = []
}) => [
  widget("Progress", `${operationId}-progress`, {
    binding: executionBinding(operationId, "progress"),
    label: stageLabel,
    visibleWhen: isRunning(operationId)
  }),
  text(`${operationId}-stage`, stageLabel, isRunning(operationId)),
  boundText(
    `${operationId}-activity`,
    executionBinding(operationId, "activity"),
    `Activity: {${executionBinding(operationId, "activity")}}`,
    hasActivity(operationId)
  ),
  widget("Alert", `${operationId}-error`, {
    binding: executionBinding(operationId, "error"),
    title: `${stageLabel} failed`,
    text: "",
    severity: "error",
    visibleWhen: hasError(operationId)
  }),
  button(
    `${operationId}-cancel`,
    cancelLabel,
    [cancelEvent(operationId)],
    isRunning(operationId),
    undefined,
    "outlined",
    "warning"
  ),
  button(
    `${operationId}-retry`,
    retryLabel,
    [runEvent(operationId)],
    phaseIs(busyPhase),
    isRunning(operationId),
    "outlined"
  ),
  button(
    `${operationId}-return`,
    returnLabel,
    [...returnEvents, setVariableEvent("phase", returnPhase)],
    phaseIs(busyPhase),
    isRunning(operationId),
    "text",
    "secondary"
  )
];

const phaseMessages = [
  [
    "brief",
    "Stage: Ready. Add one product image and the agent will write the brief and three directions."
  ],
  ["autofilling", "Stage: Reading the product and writing the campaign brief."],
  ["directions_ready", "Stage: Directions ready. Choose A, B, or C."],
  ["rendering_hero", "Stage: Rendering the selected hero."],
  ["hero_ready", "Stage: Hero ready. Compare it with the product reference."],
  ["composing_original", "Stage: Building the accepted campaign formats."],
  [
    "campaign_ready",
    "Stage: Campaign ready. Direct one revision or keep the original."
  ],
  ["revising_hero", "Stage: Rendering Revision 1."],
  ["revision_review", "Stage: Revision 1 ready. Compare it with the original."],
  ["composing_revision", "Stage: Building formats for Revision 1."],
  ["restoring", "Stage: Reopening the campaign record."],
  [
    "complete",
    "Stage: Campaign complete. The accepted files are ready to download."
  ]
].map(([phase, message]) =>
  text(`phase-${phase.replaceAll("_", "-")}`, message, phaseIs(phase))
);

const briefVisibility = phaseIs("brief");

const referenceAndModels = widget("Accordion", "reference-and-models", {
  title: "Optional steering and models",
  defaultOpen: false,
  content: [
    input(
      "ImageInput",
      "reference-image",
      variableBinding("referenceImage"),
      "Optional visual reference",
      briefVisibility
    ),
    input(
      "Select",
      "reference-role",
      variableBinding("referenceRole"),
      "Reference role",
      briefVisibility,
      {
        options: ["none", "composition", "palette", "material", "lighting"].map(
          (value) => ({ value })
        )
      }
    ),
    input(
      "TextInput",
      "reference-use",
      variableBinding("referenceUse"),
      "What this reference contributes",
      briefVisibility,
      { multiline: true }
    ),
    input(
      "TextInput",
      "reference-ignore",
      variableBinding("referenceIgnore"),
      "What to ignore",
      briefVisibility,
      { multiline: true }
    ),
    input(
      "ModelSelect",
      "autofill-model",
      variableBinding("autofillModel"),
      "Writing model",
      briefVisibility,
      { modelKind: "language_model" }
    ),
    input(
      "ModelSelect",
      "hero-model",
      "op:renderHero/prop:hero-edit#model",
      "Hero model",
      briefVisibility,
      { modelKind: "image_model", task: "image_to_image" }
    ),
    input(
      "ModelSelect",
      "revision-model",
      "op:reviseHero/prop:revision-edit#model",
      "Revision model",
      briefVisibility,
      { modelKind: "image_model", task: "image_to_image" }
    )
  ]
});

const reopenCampaign = widget("Accordion", "reopen-campaign", {
  title: "Reopen a campaign",
  defaultOpen: false,
  content: [
    input(
      "DocumentInput",
      "campaign-record-input",
      "op:restore/in:in-record_file",
      "Campaign record",
      restoreIs("open")
    ),
    button(
      "restore-run",
      "Reopen campaign",
      runAndEnter("restore", "restoring", [
        setVariableEvent("restoreGate", "running")
      ]),
      restoreIs("open"),
      isRunning("restore")
    ),
    ...operationFeedback({
      operationId: "restore",
      busyPhase: "restoring",
      stageLabel: "Checking and reopening the campaign record…",
      cancelLabel: "Cancel campaign reopening",
      retryLabel: "Retry reopening",
      returnLabel: "Return to campaign upload",
      returnPhase: "brief",
      returnEvents: [setVariableEvent("restoreGate", "open")]
    })
  ]
});

const briefColumn = [
  heading("brief-heading", "Brief", "2", briefVisibility),
  text(
    "brief-automation-note",
    "The product image is the only required input. Add an optional steer first, then upload the image to start automatically.",
    briefVisibility
  ),
  input(
    "TextInput",
    "campaign-prompt",
    variableBinding("campaignPrompt"),
    "Campaign prompt (optional)",
    briefVisibility,
    {
      multiline: true,
      placeholder:
        "For example: premium but outdoorsy, aimed at design-conscious commuters"
    }
  ),
  input(
    "ImageInput",
    "product-image",
    variableBinding("productImage"),
    "Product image (required)",
    briefVisibility,
    {
      events: [
        changeRunEvent("autofill"),
        changeSetVariableEvent("phase", "autofilling"),
        changeSetVariableEvent("restoreGate", "closed")
      ]
    }
  ),
  widget("Accordion", "manual-brief", {
    title: "Optional brief overrides",
    defaultOpen: false,
    content: [
      input(
        "TextInput",
        "product-name",
        variableBinding("productName"),
        "Product name",
        briefVisibility
      ),
      input(
        "TextInput",
        "campaign-message",
        variableBinding("campaignMessage"),
        "Campaign message",
        briefVisibility,
        { multiline: true }
      ),
      input(
        "TextInput",
        "audience",
        variableBinding("audience"),
        "Audience",
        briefVisibility,
        { multiline: true }
      ),
      input(
        "TextInput",
        "headline",
        variableBinding("headline"),
        "Exact headline",
        briefVisibility
      ),
      input(
        "TextInput",
        "cta",
        variableBinding("cta"),
        "Exact CTA",
        briefVisibility
      )
    ]
  }),
  referenceAndModels,
  button(
    "autofill-run",
    "Analyze image and write campaign",
    runAndEnter("autofill", "autofilling", [
      setVariableEvent("restoreGate", "closed")
    ]),
    briefVisibility,
    condition(variableBinding("productImage"), "empty")
  ),
  ...operationFeedback({
    operationId: "autofill",
    busyPhase: "autofilling",
    stageLabel: "Reading the product and writing the campaign…",
    cancelLabel: "Cancel campaign analysis",
    retryLabel: "Retry campaign analysis",
    returnLabel: "Return to brief",
    returnPhase: "brief"
  }),
  reopenCampaign
];

const directionColumn = [
  heading("direction-placeholder-heading", "Direction", "2", briefVisibility),
  text(
    "direction-placeholder",
    "The AI-written brief and three directions will appear here before any image is generated.",
    briefVisibility
  ),
  heading("direction-heading", "Direction", "2", hasValue("directions")),
  widget("Markdown", "directions", {
    binding: variableBinding("directions"),
    text: "",
    visibleWhen: hasValue("directions")
  }),
  input(
    "Select",
    "direction-choice",
    variableBinding("choice"),
    "Direction",
    phaseIs("directions_ready"),
    { options: ["A", "B", "C"].map((value) => ({ value })) }
  ),
  boundText(
    "selected-direction",
    variableBinding("choice"),
    "Selected direction: {var:choice}",
    hasValue("directions")
  ),
  button(
    "render-hero-run",
    "Generate this hero",
    runAndEnter("renderHero", "rendering_hero"),
    phaseIs("directions_ready"),
    isRunning("renderHero")
  ),
  button(
    "edit-brief",
    "Edit brief",
    [
      setVariableEvent("plan", ""),
      setVariableEvent("directions", ""),
      setVariableEvent("phase", "brief")
    ],
    phaseIs("directions_ready"),
    undefined,
    "text",
    "secondary"
  ),
  widget("Markdown", "captured-brief", {
    text: "",
    format:
      "**Captured brief**\n\n**Product:** {var:productName}\n\n**Campaign message:** {var:campaignMessage}\n\n**Audience:** {var:audience}\n\n**Headline:** {var:headline}\n\n**CTA:** {var:cta}",
    visibleWhen: phaseIsNot("brief")
  })
];

const originalFormats = widget("Columns", "original-formats", {
  gap: 24,
  left: [
    heading(
      "original-portrait-heading",
      "Original 4:5",
      "3",
      hasValue("originalPortrait")
    ),
    widget("Image", "original-portrait", {
      binding: variableBinding("originalPortrait"),
      fit: "contain",
      height: 480,
      placeholder: "The accepted 4:5 composition appears here",
      visibleWhen: hasValue("originalPortrait")
    }),
    widget("Download", "original-portrait-png", {
      binding: variableBinding("originalPortrait"),
      label: "Download original 4:5 PNG",
      filename: "directed-campaign-original-4x5.png",
      placeholder: "Build the original formats first",
      visibleWhen: hasValue("originalPortrait")
    }),
    widget("Download", "original-portrait-svg", {
      binding: variableBinding("originalPortraitSvg"),
      label: "Download editable original 4:5 SVG",
      filename: "directed-campaign-original-4x5.svg",
      placeholder: "Build the original formats first",
      visibleWhen: hasValue("originalPortraitSvg")
    })
  ],
  right: [
    heading(
      "original-story-heading",
      "Original 9:16",
      "3",
      hasValue("originalStory")
    ),
    widget("Image", "original-story", {
      binding: variableBinding("originalStory"),
      fit: "contain",
      height: 480,
      placeholder: "The accepted 9:16 composition appears here",
      visibleWhen: hasValue("originalStory")
    }),
    widget("Download", "original-story-png", {
      binding: variableBinding("originalStory"),
      label: "Download original 9:16 PNG",
      filename: "directed-campaign-original-9x16.png",
      placeholder: "Build the original formats first",
      visibleWhen: hasValue("originalStory")
    }),
    widget("Download", "original-story-svg", {
      binding: variableBinding("originalStorySvg"),
      label: "Download editable original 9:16 SVG",
      filename: "directed-campaign-original-9x16.svg",
      placeholder: "Build the original formats first",
      visibleWhen: hasValue("originalStorySvg")
    })
  ]
});

const revisedFormats = widget("Columns", "revised-formats", {
  gap: 24,
  left: [
    heading(
      "revised-portrait-heading",
      "Revision 1 · 4:5",
      "3",
      hasValue("revisedPortrait")
    ),
    widget("Image", "revised-portrait", {
      binding: variableBinding("revisedPortrait"),
      fit: "contain",
      height: 480,
      placeholder: "The revised 4:5 composition appears here",
      visibleWhen: hasValue("revisedPortrait")
    }),
    widget("Download", "revised-portrait-png", {
      binding: variableBinding("revisedPortrait"),
      label: "Download Revision 1 · 4:5 PNG",
      filename: "directed-campaign-revision-1-4x5.png",
      placeholder: "Accept Revision 1 to build this file",
      visibleWhen: hasValue("revisedPortrait")
    }),
    widget("Download", "revised-portrait-svg", {
      binding: variableBinding("revisedPortraitSvg"),
      label: "Download editable Revision 1 · 4:5 SVG",
      filename: "directed-campaign-revision-1-4x5.svg",
      placeholder: "Accept Revision 1 to build this file",
      visibleWhen: hasValue("revisedPortraitSvg")
    })
  ],
  right: [
    heading(
      "revised-story-heading",
      "Revision 1 · 9:16",
      "3",
      hasValue("revisedStory")
    ),
    widget("Image", "revised-story", {
      binding: variableBinding("revisedStory"),
      fit: "contain",
      height: 480,
      placeholder: "The revised 9:16 composition appears here",
      visibleWhen: hasValue("revisedStory")
    }),
    widget("Download", "revised-story-png", {
      binding: variableBinding("revisedStory"),
      label: "Download Revision 1 · 9:16 PNG",
      filename: "directed-campaign-revision-1-9x16.png",
      placeholder: "Accept Revision 1 to build this file",
      visibleWhen: hasValue("revisedStory")
    }),
    widget("Download", "revised-story-svg", {
      binding: variableBinding("revisedStorySvg"),
      label: "Download editable Revision 1 · 9:16 SVG",
      filename: "directed-campaign-revision-1-9x16.svg",
      placeholder: "Accept Revision 1 to build this file",
      visibleWhen: hasValue("revisedStorySvg")
    })
  ]
});

const content = [
  heading("title", "Directed Campaign Kit", "1"),
  text("tagline", "One product. One direction. A campaign you can revise."),
  ...phaseMessages,
  widget("Columns", "brief-and-direction", {
    gap: 24,
    left: briefColumn,
    right: directionColumn
  }),
  ...operationFeedback({
    operationId: "renderHero",
    busyPhase: "rendering_hero",
    stageLabel: "Rendering the selected hero…",
    cancelLabel: "Cancel hero render",
    retryLabel: "Retry hero",
    returnLabel: "Return to directions",
    returnPhase: "directions_ready"
  }),
  heading(
    "hero-review-heading",
    "Review the hero",
    "2",
    hasValue("candidateHero")
  ),
  widget("Image", "candidate-hero", {
    binding: variableBinding("candidateHero"),
    fit: "contain",
    height: 520,
    placeholder: "The candidate hero appears here",
    visibleWhen: hasValue("candidateHero")
  }),
  text(
    "candidate-review-note",
    "Compare shape, lid, logo, color, camera, and surface with the product reference.",
    hasValue("candidateHero")
  ),
  boundText(
    "candidate-contract",
    variableBinding("candidateContract"),
    "Selected direction and preservation instructions: {var:candidateContract}",
    hasValue("candidateContract")
  ),
  button(
    "render-hero-retry",
    "Try the hero again",
    runAndEnter("renderHero", "rendering_hero"),
    phaseIs("hero_ready"),
    isRunning("renderHero"),
    "outlined"
  ),
  button(
    "accept-hero-run",
    "Approve hero and build formats",
    runAndEnter("acceptHero", "composing_original"),
    phaseIs("hero_ready"),
    isRunning("acceptHero")
  ),
  ...operationFeedback({
    operationId: "acceptHero",
    busyPhase: "composing_original",
    stageLabel: "Building the original campaign formats…",
    cancelLabel: "Cancel original format build",
    retryLabel: "Retry original formats",
    returnLabel: "Return to hero review",
    returnPhase: "hero_ready"
  }),
  heading(
    "accepted-campaign-heading",
    "Accepted campaign",
    "2",
    hasValue("acceptedHero")
  ),
  heading(
    "accepted-original-heading",
    "Original",
    "3",
    hasValue("acceptedHero")
  ),
  widget("Image", "accepted-original", {
    binding: variableBinding("acceptedHero"),
    fit: "contain",
    height: 560,
    placeholder: "The accepted original hero appears here",
    visibleWhen: hasValue("acceptedHero")
  }),
  widget("Download", "accepted-original-download", {
    binding: variableBinding("acceptedHero"),
    label: "Download accepted original hero",
    filename: "directed-campaign-original-hero.png",
    placeholder: "Approve a hero first",
    visibleWhen: hasValue("acceptedHero")
  }),
  originalFormats,
  heading(
    "revision-heading",
    "Direct one revision",
    "2",
    hasValue("acceptedHero")
  ),
  input(
    "TextInput",
    "revision-change",
    variableBinding("revisionChange"),
    "Change",
    phaseIs("campaign_ready"),
    { multiline: true }
  ),
  input(
    "TextInput",
    "revision-preserve",
    variableBinding("revisionPreserve"),
    "Preserve",
    phaseIs("campaign_ready"),
    { multiline: true }
  ),
  input(
    "TextInput",
    "revision-allow",
    variableBinding("revisionAllow"),
    "Allow to respond",
    phaseIs("campaign_ready"),
    { multiline: true }
  ),
  button(
    "revise-hero-run",
    "Make this revision",
    runAndEnter("reviseHero", "revising_hero"),
    phaseIs("campaign_ready"),
    isRunning("reviseHero")
  ),
  ...operationFeedback({
    operationId: "reviseHero",
    busyPhase: "revising_hero",
    stageLabel: "Rendering Revision 1…",
    cancelLabel: "Cancel Revision 1 render",
    retryLabel: "Retry Revision 1",
    returnLabel: "Return to accepted campaign",
    returnPhase: "campaign_ready"
  }),
  widget("ImageCompare", "revision-comparison", {
    binding: variableBinding("acceptedHero"),
    compareBinding: variableBinding("revisedHero"),
    label: "Original and Revision 1",
    height: 560,
    placeholder: "Revision 1 appears here for comparison",
    visibleWhen: hasValue("revisedHero")
  }),
  boundText(
    "revision-request",
    variableBinding("revisionChange"),
    "Original and Revision 1. Requested change: {var:revisionChange}",
    hasValue("revisedHero")
  ),
  widget("Columns", "revision-fallback", {
    gap: 24,
    left: [
      heading(
        "comparison-original-heading",
        "Original",
        "3",
        hasValue("revisedHero")
      ),
      widget("Image", "comparison-original", {
        binding: variableBinding("acceptedHero"),
        fit: "contain",
        height: 400,
        placeholder: "Accepted original",
        visibleWhen: hasValue("revisedHero")
      }),
      widget("Download", "comparison-original-download", {
        binding: variableBinding("acceptedHero"),
        label: "Download Original",
        filename: "directed-campaign-original-hero.png",
        placeholder: "Approve a hero first",
        visibleWhen: hasValue("revisedHero")
      })
    ],
    right: [
      heading(
        "comparison-revision-heading",
        "Revision 1",
        "3",
        hasValue("revisedHero")
      ),
      widget("Image", "comparison-revision", {
        binding: variableBinding("revisedHero"),
        fit: "contain",
        height: 400,
        placeholder: "Revision 1",
        visibleWhen: hasValue("revisedHero")
      }),
      widget("Download", "comparison-revision-download", {
        binding: variableBinding("revisedHero"),
        label: "Download Revision 1",
        filename: "directed-campaign-revision-1-hero.png",
        placeholder: "Make a revision first",
        visibleWhen: hasValue("revisedHero")
      })
    ]
  }),
  button(
    "accept-revision-run",
    "Accept revision and build formats",
    runAndEnter("acceptRevision", "composing_revision", [
      setVariableEvent("chosenVersion", "revision")
    ]),
    phaseIs("revision_review"),
    isRunning("acceptRevision")
  ),
  button(
    "keep-original",
    "Keep original",
    [
      setVariableEvent("chosenVersion", "original"),
      setVariableEvent("phase", "complete")
    ],
    phaseIs("revision_review"),
    undefined,
    "outlined",
    "secondary"
  ),
  ...operationFeedback({
    operationId: "acceptRevision",
    busyPhase: "composing_revision",
    stageLabel: "Building formats for Revision 1…",
    cancelLabel: "Cancel Revision 1 format build",
    retryLabel: "Retry Revision 1 formats",
    returnLabel: "Return to revision review",
    returnPhase: "revision_review",
    returnEvents: [setVariableEvent("chosenVersion", "original")]
  }),
  heading(
    "revision-formats-heading",
    "Revision formats",
    "2",
    hasValue("revisedPortrait")
  ),
  revisedFormats,
  widget("Download", "campaign-record-download", {
    binding: variableBinding("recordFile"),
    label: "Download campaign record",
    filename: "directed-campaign.json",
    placeholder: "Approve the original campaign first",
    visibleWhen: hasValue("recordFile")
  }),
  text(
    "studio-note",
    "App and linked workflows remain editable in Studio.",
    hasValue("recordFile")
  )
];

const variable = (id, name, type, defaultValue) => ({
  id,
  name,
  scope: "instance",
  persist: false,
  type,
  ...(defaultValue === undefined ? {} : { default: defaultValue })
});

const AUTOFILL_CAMPAIGN_CODE = String.raw`
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function imageUri(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.uri === "string") {
    return value.uri.trim();
  }
  return "";
}

function parseJson(value) {
  const raw = text(value);
  const fenced = raw.match(/\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model returned no JSON object.");
  return JSON.parse(body.slice(start, end + 1));
}

function stringField(value, fallback) {
  const normalized = text(value);
  return normalized || fallback;
}

function direction(value, id, fallbackTitle) {
  const source = value && typeof value === "object" ? value : {};
  return {
    id,
    title: stringField(source.title, fallbackTitle),
    setting: stringField(source.setting, "A restrained product environment"),
    composition: stringField(source.composition, "Product-led composition with generous copy space"),
    lighting: stringField(source.lighting, "Soft directional light with controlled highlights"),
    palette: stringField(source.palette, "Product-led neutrals with one supporting accent"),
    preservationInstructions: stringField(
      source.preservationInstructions,
      "Preserve the product silhouette, materials, finish, logo, proportions, and exact campaign copy."
    )
  };
}

const productImage = imageUri(inputs.product_image);
if (!productImage) throw new Error("Add a product image before starting campaign analysis.");

const current = {
  campaignPrompt: text(inputs.campaign_prompt),
  productName: text(inputs.product_name),
  campaignMessage: text(inputs.campaign_message),
  audience: text(inputs.audience),
  headline: text(inputs.headline),
  cta: text(inputs.cta),
  referenceRole: text(inputs.reference_role),
  referenceUse: text(inputs.reference_use),
  referenceIgnore: text(inputs.reference_ignore)
};

let draft;
if (text(inputs.draft_json)) {
  draft = parseJson(inputs.draft_json);
} else {
  progress(0.1, "Reading product image");
  const model = inputs.model || (await nodetool.models.pick("generate_message"));
  const referenceImage = imageUri(inputs.reference_image);
  const images = [productImage, ...(referenceImage ? [referenceImage] : [])];
  const instruction = [
    "Analyze the first image as the product that must remain recognizable.",
    referenceImage
      ? "The second image is optional visual steering. Use it only according to the reference fields."
      : "There is no separate visual reference.",
    "Infer a concise product name, campaign message, audience, exact headline, exact CTA, and three materially different campaign directions.",
    "Treat non-empty current values as explicit user overrides. Improve or fill blank values, but do not overwrite a clear override.",
    "Direction A should be direct and iconic, B atmospheric and editorial, and C graphic or unexpected.",
    "Return JSON only with keys productName, campaignMessage, audience, headline, cta, referenceRole, referenceUse, referenceIgnore, directions.",
    "directions must be an array of exactly three objects with title, setting, composition, lighting, palette, preservationInstructions.",
    "Keep headline under 9 words and CTA under 5 words.",
    "Current form state:",
    JSON.stringify(current)
  ].join("\n");
  const generated = await nodetool.models.generate(instruction, model, {
    system:
      "You are a senior campaign creative director and product-image analyst. Ground every claim in the supplied image. Never invent certifications, specifications, ingredients, or performance claims.",
    images,
    max_tokens: 3000,
    temperature: 1
  });
  if (!generated || generated.error) {
    throw new Error(generated && generated.error ? generated.error : "Campaign analysis failed.");
  }
  draft = parseJson(generated.text);
}

progress(0.8, "Structuring campaign directions");
const productName = stringField(current.productName, stringField(draft.productName, "Featured Product"));
const campaignMessage = stringField(
  current.campaignMessage,
  stringField(draft.campaignMessage, "A distinctive product made for everyday rituals.")
);
const audience = stringField(current.audience, stringField(draft.audience, "Design-conscious everyday buyers"));
const headline = stringField(current.headline, stringField(draft.headline, "Made to be noticed."));
const cta = stringField(current.cta, stringField(draft.cta, "Discover more"));
const allowedRoles = ["none", "composition", "palette", "material", "lighting"];
const proposedRole = stringField(current.referenceRole, stringField(draft.referenceRole, "none"));
const referenceRole = allowedRoles.includes(proposedRole) ? proposedRole : "none";
const referenceUse = stringField(current.referenceUse, text(draft.referenceUse));
const referenceIgnore = stringField(current.referenceIgnore, text(draft.referenceIgnore));
const rawDirections = Array.isArray(draft.directions) ? draft.directions : [];
const directions = [
  direction(rawDirections[0], "A", "The Icon"),
  direction(rawDirections[1], "B", "The World"),
  direction(rawDirections[2], "C", "The Twist")
];
const brief = {
  schemaVersion: 1,
  productName,
  campaignMessage,
  audience,
  headline,
  cta,
  productImage: inputs.product_image,
  referenceImage: inputs.reference_image,
  referenceRole,
  referenceUse,
  referenceIgnore
};
const plan = { schemaVersion: 1, brief, directions };
const markdown = directions
  .map((item) =>
    "### " + item.id + " — " + item.title + "\n\n" +
    "**Setting:** " + item.setting + "\n\n" +
    "**Composition:** " + item.composition + "\n\n" +
    "**Lighting:** " + item.lighting + "\n\n" +
    "**Palette:** " + item.palette + "\n\n" +
    "**Preserve:** " + item.preservationInstructions
  )
  .join("\n\n---\n\n");

await output("product_name", productName);
await output("campaign_message", campaignMessage);
await output("audience", audience);
await output("headline", headline);
await output("cta", cta);
await output("reference_role", referenceRole);
await output("reference_use", referenceUse);
await output("reference_ignore", referenceIgnore);
await output("directions", markdown);
await output("plan", JSON.stringify(plan));
await output("choice", "A");
await output("phase", "directions_ready");
progress(1, "Campaign directions ready");
`;

const AUTOFILL_CAMPAIGN_SCRIPT = {
  name: "Autofill Directed Campaign",
  document: {
    schemaVersion: 1,
    description:
      "Uses a multimodal language model to analyze one product image, fill the campaign brief, and propose three directed concepts.",
    code: AUTOFILL_CAMPAIGN_CODE,
    inputs: [
      { name: "product_image", type: "image" },
      { name: "campaign_prompt", type: "str" },
      { name: "product_name", type: "str" },
      { name: "campaign_message", type: "str" },
      { name: "audience", type: "str" },
      { name: "headline", type: "str" },
      { name: "cta", type: "str" },
      { name: "reference_image", type: "image" },
      { name: "reference_role", type: "str" },
      { name: "reference_use", type: "str" },
      { name: "reference_ignore", type: "str" },
      { name: "draft_json", type: "str" },
      { name: "model", type: "language_model" }
    ],
    outputs: [
      { name: "product_name", type: "str" },
      { name: "campaign_message", type: "str" },
      { name: "audience", type: "str" },
      { name: "headline", type: "str" },
      { name: "cta", type: "str" },
      { name: "reference_role", type: "str" },
      { name: "reference_use", type: "str" },
      { name: "reference_ignore", type: "str" },
      { name: "directions", type: "str" },
      { name: "plan", type: "str" },
      { name: "choice", type: "str" },
      { name: "phase", type: "str" }
    ],
    secrets: [],
    timeoutSeconds: 120,
    tests: [
      {
        name: "structures a supplied model draft",
        inputs: {
          product_image: { type: "image", uri: "asset://test-product.png" },
          draft_json: JSON.stringify({
            productName: "Field Flask",
            campaignMessage: "A flask for unhurried detours.",
            audience: "Design-conscious walkers",
            headline: "Take the scenic route.",
            cta: "Meet Field",
            referenceRole: "none",
            directions: [
              { title: "The Icon", setting: "Stone plinth" },
              { title: "The World", setting: "Rainy trail" },
              { title: "The Twist", setting: "Graphic contour map" }
            ]
          })
        },
        expect: {
          product_name: "Field Flask",
          headline: "Take the scenic route.",
          choice: "A",
          phase: "directions_ready"
        }
      }
    ]
  }
};

export const DIRECTED_CAMPAIGN_KIT_APP = {
  slug: "directed-campaign-kit",
  name: "Directed Campaign Kit",
  emoji: "🎯",
  showEmoji: false,
  tagline: "One product. One direction. A campaign you can revise.",
  description:
    "Upload one product image. A multimodal language model fills the brief and proposes three directions before you approve a hero, build two formats, and direct one revision.",
  scripts: {
    autofill: AUTOFILL_CAMPAIGN_SCRIPT
  },
  debugInteractions: [
    {
      set: {
        key: "productImage",
        value: { type: "image", uri: "asset://debug-product.png" }
      }
    },
    ...[
      "autofilling",
      "directions_ready",
      "rendering_hero",
      "hero_ready",
      "composing_original",
      "campaign_ready",
      "revising_hero",
      "revision_review",
      "composing_revision",
      "restoring"
    ].map((value) => ({ set: { key: "phase", value } }))
  ],
  workflows: {
    hero: "Render a Directed Campaign Hero",
    layouts: "Compose Directed Campaign Formats",
    revision: "Revise an Accepted Campaign Hero",
    restore: "Reopen a Directed Campaign"
  },
  variables: [
    variable("phase", "Stage", "str", "brief"),
    variable("restoreGate", "Restore availability", "str", "open"),
    variable("autofillModel", "Writing model", "language_model"),
    variable("campaignPrompt", "Campaign prompt", "str", ""),
    variable("productImage", "Product reference", "image"),
    variable("referenceImage", "Optional visual reference", "image"),
    variable("productName", "Product name", "str", ""),
    variable("campaignMessage", "Campaign message", "str", ""),
    variable("audience", "Audience", "str", ""),
    variable("headline", "Exact headline", "str", ""),
    variable("cta", "Exact CTA", "str", ""),
    variable("referenceRole", "Reference role", "str", "none"),
    variable("referenceUse", "Reference contribution", "str", ""),
    variable("referenceIgnore", "Reference exclusions", "str", ""),
    variable("directions", "Directions", "str", ""),
    variable("plan", "Captured direction plan", "str", ""),
    variable("choice", "Selected direction", "str", "A"),
    variable("candidateHero", "Candidate hero", "image"),
    variable("candidateContract", "Candidate contract", "str", ""),
    variable("acceptedHero", "Accepted original hero", "image"),
    variable("acceptedContract", "Accepted original contract", "str", ""),
    variable("originalPortrait", "Original 4:5", "image"),
    variable("originalStory", "Original 9:16", "image"),
    variable("originalPortraitSvg", "Original 4:5 SVG", "document"),
    variable("originalStorySvg", "Original 9:16 SVG", "document"),
    variable("originalRecord", "Original campaign record", "str", ""),
    variable(
      "revisionChange",
      "Revision change",
      "str",
      "Move the scene from late afternoon to blue hour."
    ),
    variable(
      "revisionPreserve",
      "Revision preservation instructions",
      "str",
      "Keep the cup, camera position, composition, stone surface, headline, CTA, and spacing."
    ),
    variable(
      "revisionAllow",
      "Allowed response",
      "str",
      "Let reflections, shadows, and the sky respond to the light."
    ),
    variable("revisedHero", "Revision 1 hero", "image"),
    variable("revisedContract", "Revision 1 contract", "str", ""),
    variable("revisedPortrait", "Revision 1 · 4:5", "image"),
    variable("revisedStory", "Revision 1 · 9:16", "image"),
    variable("revisedPortraitSvg", "Revision 1 · 4:5 SVG", "document"),
    variable("revisedStorySvg", "Revision 1 · 9:16 SVG", "document"),
    variable("recordFile", "Campaign record file", "document"),
    variable("chosenVersion", "Accepted version", "str", "original")
  ],
  operations: [
    {
      id: "autofill",
      name: "Analyze product and write campaign",
      script: "autofill",
      timeoutMs: 120000,
      inputs: {
        product_image: { from: "variable", variableId: "productImage" },
        campaign_prompt: { from: "variable", variableId: "campaignPrompt" },
        product_name: { from: "variable", variableId: "productName" },
        campaign_message: { from: "variable", variableId: "campaignMessage" },
        audience: { from: "variable", variableId: "audience" },
        headline: { from: "variable", variableId: "headline" },
        cta: { from: "variable", variableId: "cta" },
        reference_image: { from: "variable", variableId: "referenceImage" },
        reference_role: { from: "variable", variableId: "referenceRole" },
        reference_use: { from: "variable", variableId: "referenceUse" },
        reference_ignore: { from: "variable", variableId: "referenceIgnore" },
        model: { from: "variable", variableId: "autofillModel" }
      },
      outputs: {
        product_name: { to: "variable", variableId: "productName" },
        campaign_message: { to: "variable", variableId: "campaignMessage" },
        audience: { to: "variable", variableId: "audience" },
        headline: { to: "variable", variableId: "headline" },
        cta: { to: "variable", variableId: "cta" },
        reference_role: { to: "variable", variableId: "referenceRole" },
        reference_use: { to: "variable", variableId: "referenceUse" },
        reference_ignore: { to: "variable", variableId: "referenceIgnore" },
        directions: { to: "variable", variableId: "directions" },
        plan: { to: "variable", variableId: "plan" },
        choice: { to: "variable", variableId: "choice" },
        phase: { to: "variable", variableId: "phase" }
      }
    },
    {
      id: "renderHero",
      name: "Render hero",
      workflow: "hero",
      timeoutMs: 600000,
      inputs: {
        plan: { from: "variable", variableId: "plan" },
        choice: { from: "variable", variableId: "choice" }
      },
      outputs: {
        hero: { to: "variable", variableId: "candidateHero" },
        contract: { to: "variable", variableId: "candidateContract" },
        phase: { to: "variable", variableId: "phase" }
      }
    },
    {
      id: "acceptHero",
      name: "Accept hero and build formats",
      workflow: "layouts",
      timeoutMs: 120000,
      inputs: {
        hero: { from: "variable", variableId: "candidateHero" },
        contract: { from: "variable", variableId: "candidateContract" },
        version: { from: "constant", value: "original" },
        original_record: { from: "constant", value: "" }
      },
      outputs: {
        hero: { to: "variable", variableId: "acceptedHero" },
        portrait: { to: "variable", variableId: "originalPortrait" },
        story: { to: "variable", variableId: "originalStory" },
        portrait_svg: { to: "variable", variableId: "originalPortraitSvg" },
        story_svg: { to: "variable", variableId: "originalStorySvg" },
        contract: { to: "variable", variableId: "acceptedContract" },
        record: { to: "variable", variableId: "originalRecord" },
        record_file: { to: "variable", variableId: "recordFile" },
        phase: { to: "variable", variableId: "phase" }
      }
    },
    {
      id: "reviseHero",
      name: "Render Revision 1",
      workflow: "revision",
      timeoutMs: 600000,
      inputs: {
        hero: { from: "variable", variableId: "acceptedHero" },
        contract: { from: "variable", variableId: "acceptedContract" },
        change: { from: "variable", variableId: "revisionChange" },
        preserve: { from: "variable", variableId: "revisionPreserve" },
        allow: { from: "variable", variableId: "revisionAllow" }
      },
      outputs: {
        hero: { to: "variable", variableId: "revisedHero" },
        contract: { to: "variable", variableId: "revisedContract" },
        phase: { to: "variable", variableId: "phase" }
      }
    },
    {
      id: "acceptRevision",
      name: "Accept Revision 1 and build formats",
      workflow: "layouts",
      timeoutMs: 120000,
      inputs: {
        hero: { from: "variable", variableId: "revisedHero" },
        contract: { from: "variable", variableId: "revisedContract" },
        version: { from: "constant", value: "revision" },
        original_record: { from: "variable", variableId: "recordFile" }
      },
      outputs: {
        portrait: { to: "variable", variableId: "revisedPortrait" },
        story: { to: "variable", variableId: "revisedStory" },
        portrait_svg: { to: "variable", variableId: "revisedPortraitSvg" },
        story_svg: { to: "variable", variableId: "revisedStorySvg" },
        contract: { to: "variable", variableId: "revisedContract" },
        record_file: { to: "variable", variableId: "recordFile" },
        phase: { to: "variable", variableId: "phase" }
      }
    },
    {
      id: "restore",
      name: "Reopen campaign",
      workflow: "restore",
      timeoutMs: 120000,
      outputs: {
        accepted_hero: { to: "variable", variableId: "acceptedHero" },
        accepted_contract: { to: "variable", variableId: "acceptedContract" },
        original_portrait: { to: "variable", variableId: "originalPortrait" },
        original_story: { to: "variable", variableId: "originalStory" },
        original_portrait_svg: {
          to: "variable",
          variableId: "originalPortraitSvg"
        },
        original_story_svg: { to: "variable", variableId: "originalStorySvg" },
        original_record: { to: "variable", variableId: "originalRecord" },
        revised_hero: { to: "variable", variableId: "revisedHero" },
        revised_contract: { to: "variable", variableId: "revisedContract" },
        revised_portrait: { to: "variable", variableId: "revisedPortrait" },
        revised_story: { to: "variable", variableId: "revisedStory" },
        revised_portrait_svg: {
          to: "variable",
          variableId: "revisedPortraitSvg"
        },
        revised_story_svg: { to: "variable", variableId: "revisedStorySvg" },
        record_file: { to: "variable", variableId: "recordFile" },
        phase: { to: "variable", variableId: "phase" }
      }
    }
  ],
  sections: [],
  content
};
