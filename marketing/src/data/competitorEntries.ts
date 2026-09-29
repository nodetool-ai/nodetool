import type { PageEntry } from "./types";
import { yearToken } from "./types";
import type { OgAccent } from "../lib/og";
import type { SearchStarter } from "./searchStarters";
import type { LandingPage } from "../lib/analytics";

/**
 * Comparison page-data contract, consumed by the `/alternatives/*` route. One
 * competitor record drives one page: a limitation intro, a short tool list, the
 * head-to-head at-a-glance cards, the feature table, the explainer, and a
 * visible FAQ. It drove two near-identical templates until 2026-08-10, when the
 * `/vs/<slug>` twin was folded in (see `alternativesEntries` below).
 *
 * The six original competitors (comfyui, weavy, langflow, n8n, flowise, dify)
 * started as verbatim transcriptions of the hand-built pages they replaced;
 * the prose has since been rewritten for narrative flow and the agent-first
 * positioning (an agent builds, runs, and repairs workflows on the same
 * editors you use). The first-wave additions (`isNew`) follow the same
 * pattern and carry at least one honest concession row.
 */

/** Page accent — full literal Tailwind fragments so the JIT compiler keeps them. */
export type CompetitorTheme =
  | "blue"
  | "violet"
  | "amber"
  | "cyan"
  | "emerald"
  | "rose";

type ThemeSpec = {
  /** Eyebrow chip color classes (border/bg/text). */
  chip: string;
  /** Background glow blobs. */
  glowA: string;
  glowB: string;
  /** CTA button color classes. */
  button: string;
};

export const THEMES: Record<CompetitorTheme, ThemeSpec> = {
  blue: {
    chip: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    glowA: "bg-blue-500/15",
    glowB: "bg-fuchsia-500/10",
    button: "bg-blue-600 hover:bg-blue-500 shadow-blue-900/40",
  },
  violet: {
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    glowA: "bg-violet-500/15",
    glowB: "bg-cyan-500/10",
    button: "bg-violet-600 hover:bg-violet-500 shadow-violet-900/40",
  },
  amber: {
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    glowA: "bg-amber-500/15",
    glowB: "bg-rose-500/10",
    button: "bg-amber-600 hover:bg-amber-500 shadow-amber-900/40",
  },
  cyan: {
    chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    glowA: "bg-cyan-500/15",
    glowB: "bg-blue-500/10",
    button: "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/40",
  },
  emerald: {
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    glowA: "bg-emerald-500/15",
    glowB: "bg-cyan-500/10",
    button: "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40",
  },
  rose: {
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    glowA: "bg-rose-500/15",
    glowB: "bg-fuchsia-500/10",
    button: "bg-rose-600 hover:bg-rose-500 shadow-rose-900/40",
  },
};

/** A single feature-table row. String cells render as text; booleans as ✓ / –. */
export type FeatureRow = {
  label: string;
  competitor: string | boolean;
  nodetool: string | boolean;
};

export type FaqItem = { question: string; answer: string };

export type Competitor = {
  slug: string;
  /** Display name, e.g. "ComfyUI". */
  name: string;
  theme: CompetitorTheme;
  /** Grouping label used by the alternatives template, e.g. "Node editor". */
  category: string;

  // --- OG card (the /alternatives opengraph-image route reads this) ---
  og: { image: string; accent: OgAccent; subtitle: string };

  /**
   * Lead paragraph for the at-a-glance section: why this comparison comes up.
   * Was the /vs hero paragraph before that page was folded in.
   */
  heroParagraph: string;

  // --- at-a-glance cards ---
  competitorTagline: string;
  competitorBullets: string[];
  /** "negative" renders the competitor bullets with a minus icon (lock-in framing). */
  competitorBulletTone?: "neutral" | "negative";
  nodetoolTagline: string;
  nodetoolBullets: string[];

  // --- feature table ---
  rows: FeatureRow[];

  // --- explainer ---
  explainerHeading: string;
  explainerParagraph: string;

  // --- closing CTA ---
  ctaHeading: string;
  ctaParagraph: string;

  // --- FAQ (JSON-LD on /vs, rendered on /alternatives) ---
  faq: FaqItem[];

  // --- /alternatives template ---
  /** One-line reason people go looking for an alternative. */
  limitation: string;

  /** First-wave addition (drives footer curation and index gating). */
  isNew?: boolean;
  /** Footer link label override, e.g. to note a product rename. */
  footerName?: string;

  /** Optional search snippet for pages with a distinct, high-volume query intent. */
  seo?: { title: string; description: string };
  starter?: { id: SearchStarter; source: LandingPage; heading: string };
  sources?: { title: string; href: string }[];
};

export const competitors: Competitor[] = [
  {
    slug: "higgsfield",
    name: "Higgsfield",
    theme: "violet",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Higgsfield Alternative for Editable AI Video Workflows | NodeTool",
      description: "Compare Higgsfield with NodeTool for AI video production. Cinema Studio and hosted credits, or editable workflows with your own provider accounts.",
    },
    og: { image: "screen_storyboard.png", accent: "violet", subtitle: "Hosted shot direction or a workflow you can run yourself." },
    starter: { id: "movie-trailer-generator", source: "higgsfield", heading: "Try a trailer workflow you can inspect" },
    sources: [
      { title: "Higgsfield production and integrations", href: "https://higgsfield.ai/blog/how-studios-scale-ai-video-production" },
      { title: "Higgsfield plans", href: "https://higgsfield.ai/pricing" },
    ],
    heroParagraph: "Higgsfield combines Cinema Studio camera controls with character tools and hosted generation. It also offers API, MCP, CLI, and editor integrations. NodeTool puts shot planning, generation graphs, and timeline editing in a workspace you can run on your own machine. Choose between a managed creative suite and control over the workflow and provider accounts.",
    competitorTagline: "Hosted creative suite for AI video and image production",
    competitorBullets: ["Cinema Studio shot and camera controls", "Soul ID character tools", "Editor integrations, API, MCP, and CLI", "Hosted plans and generation credits"],
    nodetoolTagline: "Editable workflows on your own infrastructure",
    nodetoolBullets: ["Storyboard and timeline beside the workflow canvas", "Agents edit the same project surfaces you use", "Connect your own provider accounts", "Open-source Studio or self-hosting"],
    rows: [
      { label: "Shot direction", competitor: "Cinema Studio camera and lens controls", nodetool: "Storyboard direction and model-specific settings" },
      { label: "Automation", competitor: "API, MCP, CLI, and editor integrations", nodetool: "API, MCP, CLI, and workflow execution" },
      { label: "Model billing", competitor: "Plan credits, with model-specific offers", nodetool: "Providers bill your connected accounts" },
      { label: "Workspace deployment", competitor: "Higgsfield hosted workspace", nodetool: "Free Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Choose how the production pipeline runs",
    explainerParagraph: "Higgsfield is a practical choice when its camera controls and managed team workspace fit the job. NodeTool fits when you want to inspect each step, change provider accounts, or run the workspace yourself. Provider availability and model capabilities still determine what a NodeTool workflow can produce.",
    ctaHeading: "Inspect the workflow before you run it.",
    ctaParagraph: "Open a trailer starter in Studio and review its models and shot count before generating.",
    faq: [
      { question: "Is NodeTool a Higgsfield alternative?", answer: "Yes, for assembling AI media workflows and editing the resulting project. Higgsfield's Cinema Studio has dedicated shot controls. NodeTool adds open-source deployment and your own provider accounts." },
      { question: "Does Higgsfield support automation?", answer: "Yes. Higgsfield documents API, MCP, CLI, and editor integrations. Compare their model coverage and billing terms with the workflow you need." },
      { question: "Is NodeTool cheaper than Higgsfield?", answer: "Studio is free. Hosted model calls are billed by your providers. Total cost depends on the models, clip lengths, and takes, so compare the actual workflow with the current Higgsfield plan." },
    ],
    limitation: "Higgsfield manages the hosted creative workspace and its plan allowances. NodeTool is an alternative when you want to run the workspace yourself and connect your own providers.",
  },
  {
    slug: "openart",
    name: "OpenArt",
    theme: "rose",
    category: "Video studio",
    isNew: true,
    seo: { title: "OpenArt Alternative for AI Images and Video Workflows | NodeTool", description: "Compare OpenArt Director and character tools with NodeTool's editable workflows, local models, and your own provider accounts." },
    og: { image: "screen_canvas.png", accent: "rose", subtitle: "A hosted creative suite or editable workflows on your own machine." },
    starter: { id: "write-the-prompt-then-make-the-image", source: "openart", heading: "Try an image workflow with inspectable outputs" },
    sources: [
      { title: "OpenArt creative tools", href: "https://openart.ai/" },
      { title: "OpenArt plans", href: "https://openart.ai/pricing" },
    ],
    heroParagraph: "OpenArt combines image editing, character creation, and video generation with Director for conversational shot planning. Its plans include generation credits and MCP access. NodeTool keeps agents, media workflows, and editing surfaces in an open-source workspace, with models called through accounts you connect.",
    competitorTagline: "Hosted image, video, and audio creation studio",
    competitorBullets: ["Director for conversational video creation", "Reusable characters and image editing", "Image, video, and audio models", "Credit-based plans with MCP access"],
    nodetoolTagline: "A saved workflow you can inspect and rerun",
    nodetoolBullets: ["Agents, canvas, storyboard, and timeline", "Separate prompts and generated outputs", "Your provider accounts and local models", "Free open-source Studio or self-hosting"],
    rows: [
      { label: "Video direction", competitor: "OpenArt Director", nodetool: "Agents and editable storyboards" },
      { label: "Media", competitor: "Image, video, voice, and audio tools", nodetool: "Image, video, audio, and text workflows" },
      { label: "Agent access", competitor: "OpenArt MCP", nodetool: "MCP tools across project editors" },
      { label: "Model billing", competitor: "Subscription allowances and credits", nodetool: "Your connected provider accounts" },
      { label: "Workspace deployment", competitor: "OpenArt hosted studio", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Managed creation or control of the graph",
    explainerParagraph: "OpenArt fits creators who want its character library, editing tools, and Director in a managed service. NodeTool fits projects that need inspectable steps, local execution, or provider accounts controlled by the creator. Both offer agent integrations. The distinction is how the project and generation costs are managed.",
    ctaHeading: "Keep the prompt beside the image.",
    ctaParagraph: "Try a starter that exposes the written prompt and generated image as separate outputs.",
    faq: [
      { question: "Does OpenArt only generate still images?", answer: "No. OpenArt offers video, voice, audio, character tools, and Director. This comparison concerns project control and deployment, not a lack of video support." },
      { question: "Can I use agents with OpenArt?", answer: "Yes. OpenArt lists MCP access in its plans. NodeTool exposes its workflow and editing surfaces through MCP too." },
      { question: "Do I need provider keys for NodeTool?", answer: "The image starter uses OpenAI and FAL keys. Other workflows can use local models supported by Studio. OpenArt instead provides its hosted model access through its plans." },
    ],
    limitation: "OpenArt bundles hosted creation tools and model access into its plans. NodeTool is an alternative when you want editable graphs, local models, and direct provider accounts.",
  },
  {
    slug: "ltx-studio",
    name: "LTX Studio",
    theme: "cyan",
    category: "AI filmmaking",
    isNew: true,
    seo: { title: "LTX Studio Alternative for Editable AI Video Projects | NodeTool", description: "Compare LTX Studio storyboards, timeline editing, and Flows with NodeTool's open-source creative workspace and your own provider accounts." },
    og: { image: "screen_storyboard.png", accent: "cyan", subtitle: "Compare the storyboard, the workflow, and where they run." },
    starter: { id: "movie-trailer-generator", source: "ltx-studio", heading: "Build a trailer from a visible workflow" },
    sources: [
      { title: "LTX Studio production tools", href: "https://ltx.io/studio" },
      { title: "LTX Studio plans and Flows", href: "https://ltx.io/studio/pricing" },
    ],
    heroParagraph: "LTX Studio combines storyboards, reusable Elements, timeline editing, and sound design. Its plans also list Flows for node-based automation. NodeTool brings a workflow canvas, storyboard, script, and timeline into an open-source workspace. The choice is between LTX's managed production tools and a workspace you run with your own provider accounts.",
    competitorTagline: "Hosted AI video production workspace",
    competitorBullets: ["Dynamic storyboards and timeline editing", "Reusable characters, objects, and locations", "Sound design and node-based Flows", "Credit-based generation plans"],
    nodetoolTagline: "An open-source workspace for the production graph",
    nodetoolBullets: ["Workflow canvas with storyboard and timeline", "Agent-authored plans remain editable", "Connect your own generation providers", "Studio and self-hosted deployment"],
    rows: [
      { label: "Production planning", competitor: "Dynamic Storyboard and Elements", nodetool: "Scripts, entities, and storyboards" },
      { label: "Editing", competitor: "Timeline Editor and Sound Design", nodetool: "Timeline, audio, and sketch editors" },
      { label: "Node-based workflows", competitor: "Flows, subject to plan", nodetool: "Workflow canvas in Studio" },
      { label: "Model billing", competitor: "Generation credits", nodetool: "Your connected provider accounts" },
      { label: "Workspace deployment", competitor: "Hosted LTX Studio", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Compare the whole project, including the workflow",
    explainerParagraph: "LTX Studio already offers planning, editing, and node-based automation. Choose it when that managed production environment suits the team. NodeTool fits when deployment, direct provider accounts, or mixing media and data in the same workflow matters. Model settings and generation quality remain specific to the provider you select.",
    ctaHeading: "Follow the brief through every step.",
    ctaParagraph: "Inspect a trailer graph and begin with one shot before increasing generation spend.",
    faq: [
      { question: "Does LTX Studio have node-based workflows?", answer: "Yes. Its plan comparison lists Flows for node-based automation. Check the current plan for access and limits." },
      { question: "How is LTX Studio different from the LTX video model?", answer: "This page compares the hosted Studio product and its production tools. Choosing a video model is a separate decision from choosing the workspace that runs it." },
      { question: "Does NodeTool include free video generation?", answer: "Studio is free, but hosted video models charge your provider account. The trailer starter uses Gemini and KIE. Local inference depends on compatible models and your hardware." },
    ],
    limitation: "LTX Studio packages production tools and generation allowances in a hosted workspace. NodeTool is an alternative for running the workspace yourself and controlling provider accounts.",
  },
  {
    slug: "google-flow",
    name: "Google Flow",
    theme: "blue",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Google Flow Alternative for AI Filmmaking Workflows | NodeTool",
      description: "Compare Google Flow's scene tools and creative agent with NodeTool's scripts, storyboards, editable workflows, and your own provider accounts.",
    },
    og: { image: "screen_storyboard.png", accent: "blue", subtitle: "Plan the scenes and choose how the production runs." },
    starter: { id: "movie-trailer-generator", source: "google-flow", heading: "Plan a trailer with providers you choose" },
    sources: [
      { title: "Google Flow creative tools", href: "https://labs.google/fx/tools/flow" },
      { title: "Google Flow models and supported features", href: "https://support.google.com/flow/answer/16352836?hl=en" },
      { title: "Google Flow credits", href: "https://support.google.com/flow/answer/16526234?hl=en" },
    ],
    heroParagraph: "Google Flow brings Google's image and video models into a creative workspace with an agent, reference-driven generation, and scene tools. NodeTool combines scripts, entities, storyboards, and a timeline with an editable workflow canvas. Compare the production controls you need and whether you want a Google-managed workspace or a workspace running on your own infrastructure.",
    competitorTagline: "Creative studio for connected film scenes",
    competitorBullets: ["Google image and video models", "Creative agent and custom tools", "Reference frames, ingredients, and clip extension", "Hosted generation using Google Flow credits"],
    nodetoolTagline: "A production workspace with an inspectable graph",
    nodetoolBullets: ["Scripts, entities, storyboards, and timeline", "Agents operate editable project surfaces", "Mix supported generation providers", "Free Studio or self-hosted deployment"],
    rows: [
      { label: "Film planning", competitor: "Creative agent and scene-building tools", nodetool: "Scripts, entities, and editable storyboards" },
      { label: "Shot references", competitor: "Frames and ingredients, depending on model", nodetool: "Reference inputs supported by the selected node" },
      { label: "Workflow customization", competitor: "Google Flow Tools and conversational edits", nodetool: "Editable node graphs and project tools" },
      { label: "Generation billing", competitor: "Google Flow or AI credits", nodetool: "Your connected provider accounts" },
      { label: "Workspace deployment", competitor: "Google-hosted service", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Choose the workspace as well as the model",
    explainerParagraph: "Google Flow fits filmmakers who want Google's generation and scene controls together. NodeTool fits productions that need a saved graph, direct provider accounts, or self-hosting. A model accessed through NodeTool does not bring the Google Flow interface with it. Review reference support, audio, and extension controls for each model before committing to a sequence.",
    ctaHeading: "Make the first shot a visible workflow.",
    ctaParagraph: "Inspect the trailer starter's direction, keyframe, and video stages before running a one-shot test.",
    faq: [
      { question: "Is NodeTool a Google Flow alternative for filmmaking?", answer: "Yes, for planning and generating AI media in an editable project. Google Flow has its own scene tools. NodeTool adds an open-source workspace, a workflow canvas, and direct provider accounts." },
      { question: "Does Google Flow have an AI agent?", answer: "Yes. Google Flow includes an agent and tools for conversational creation and editing. NodeTool agents also work on editable project surfaces." },
      { question: "Can I use Google Flow credits in NodeTool?", answer: "No. The NodeTool trailer starter calls Gemini and KIE through your connected accounts. Google Flow credits belong to Google's service." },
    ],
    limitation: "Google Flow packages its models and production tools in Google's hosted service. NodeTool is an alternative when you want to inspect the graph, mix providers, or run the workspace yourself.",
  },
  {
    slug: "artlist",
    name: "Artlist Studio",
    theme: "amber",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Artlist Alternative for AI Film Production | NodeTool",
      description: "Compare Artlist Studio's casting and shot controls with NodeTool's editable production workflows, storyboards, and direct provider accounts.",
    },
    og: { image: "screen_storyboard.png", accent: "amber", subtitle: "Compare casting, shot direction, and the production workflow." },
    starter: { id: "movie-trailer-generator", source: "artlist", heading: "Inspect a trailer production graph" },
    sources: [
      { title: "Artlist Studio production features", href: "https://artlist.io/studio" },
      { title: "Artlist AI Toolkit agent", href: "https://help.artlist.io/hc/en-us/articles/35805602922269-AI-Toolkit-AI-Agent" },
    ],
    heroParagraph: "Artlist Studio organizes AI production around casting, locations, composition, and shot direction. Its prompt tags reuse characters and locations across scenes, while the AI Toolkit adds conversational generation. NodeTool brings reusable entities, storyboards, and a timeline beside the workflow graph, with generation billed through the provider accounts you connect.",
    competitorTagline: "Hosted production studio with casting and shot direction",
    competitorBullets: ["Character and location capture", "Reusable prompt tags across scenes", "Composition, lensing, and shot controls", "AI Toolkit with conversational generation"],
    nodetoolTagline: "Production steps you can edit and run yourself",
    nodetoolBullets: ["Reusable entities and shot storyboards", "Workflow canvas and timeline editing", "Inspect prompts and intermediate outputs", "Own provider accounts and self-hosting"],
    rows: [
      { label: "Cast and locations", competitor: "Capture elements and reuse prompt tags", nodetool: "Entity library and storyboard casting" },
      { label: "Shot direction", competitor: "Dedicated composition and cinematic controls", nodetool: "Storyboard direction and model-specific node inputs" },
      { label: "Agent assistance", competitor: "AI Toolkit conversational generation", nodetool: "Agents across workflow and project editors" },
      { label: "Model billing", competitor: "Artlist AI plan credits", nodetool: "Your connected provider accounts" },
      { label: "Workspace deployment", competitor: "Hosted Artlist Studio", nodetool: "Free Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Compare the shot controls with the pipeline controls",
    explainerParagraph: "Artlist Studio is a focused option when its casting and framing controls suit your film. NodeTool fits when you want to change the production graph or run the workspace yourself. The tools can also serve different stages of a project. Review outputs and licensing for the actual models and assets you use.",
    ctaHeading: "Keep the production graph beside the footage.",
    ctaParagraph: "Open the trailer starter and inspect each generation stage before increasing the shot count.",
    faq: [
      { question: "What does this Artlist comparison cover?", answer: "It compares Artlist Studio's AI production tools and the connected AI Toolkit. It does not treat NodeTool as a replacement for Artlist's licensed music or stock catalog." },
      { question: "Does Artlist offer an AI agent?", answer: "Yes. Its AI Toolkit agent generates and refines images and videos conversationally. NodeTool also offers agents, with editable workflows and self-hosted deployment." },
      { question: "Can NodeTool reproduce Artlist's shot controls?", answer: "Model-specific controls vary. NodeTool exposes supported inputs through nodes and storyboards, but its interface does not duplicate Artlist Studio's casting and framing tools." },
    ],
    limitation: "Artlist Studio provides dedicated film controls within its hosted AI plans. NodeTool is an alternative for owning the production graph and connecting your own provider accounts.",
  },
  {
    slug: "invideo",
    name: "Invideo",
    theme: "violet",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Invideo Alternative for Editable AI Filmmaking | NodeTool",
      description: "Compare Invideo's filmmaking agents and timeline editor with NodeTool's open-source creative workspace, editable graphs, and direct provider accounts.",
    },
    og: { image: "screen_storyboard.png", accent: "violet", subtitle: "Compare filmmaking agents and where the project runs." },
    starter: { id: "movie-trailer-generator", source: "invideo", heading: "Follow a film brief through a saved graph" },
    sources: [
      { title: "Invideo filmmaking agents", href: "https://invideo.io/make/ai-filmmaking/" },
      { title: "Invideo agentic timeline editor and exports", href: "https://invideo.io/make/agentic-video-editor/" },
    ],
    heroParagraph: "Invideo's filmmaking agents break down scripts, develop characters and locations, and generate shots using shared project context. Its browser editor keeps agent edits on an editable timeline and supports handoff to other editing tools. NodeTool also combines agents and editing, with an open-source workspace and a workflow canvas you can run on your own infrastructure.",
    competitorTagline: "Browser filmmaking platform with production agents",
    competitorBullets: ["Script breakdown, casting, and storyboards", "Shared production context and specialist agents", "Editable timeline with color and audio tools", "Editable project exports to other editors"],
    nodetoolTagline: "Agents and production graphs in an open-source workspace",
    nodetoolBullets: ["Scripts, entities, storyboards, and timeline", "Inspect and change the generation graph", "Use supported local or remote models", "Studio and self-hosted deployment"],
    rows: [
      { label: "Film planning", competitor: "Production agents with persistent project context", nodetool: "Agents, scripts, entities, and storyboards" },
      { label: "Manual editing", competitor: "Browser timeline with color and audio tools", nodetool: "Timeline, audio, and sketch editors" },
      { label: "Editing handoff", competitor: "Documents exports to Premiere, Final Cut, and Resolve", nodetool: "Review and export through NodeTool's project tools" },
      { label: "Workflow visibility", competitor: "Agent tasks and editable timeline", nodetool: "Agent tools, editable node graphs, and project editors" },
      { label: "Workspace deployment", competitor: "Invideo-hosted browser workspace", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Both platforms let you direct and revise",
    explainerParagraph: "Invideo is a strong fit when you want its managed production agents and browser editing environment. NodeTool fits when the saved workflow graph, direct provider accounts, or deployment control matters. Invideo's documented editor handoff is a separate consideration from NodeTool's workflow export. Check the deliverables your finishing process needs.",
    ctaHeading: "Make the brief and generation stages inspectable.",
    ctaParagraph: "Try a short trailer graph and review its outputs before expanding the production.",
    faq: [
      { question: "Is Invideo only a social-video generator?", answer: "No. Its current filmmaking tools include script breakdown, casting, storyboards, production agents, and timeline editing. This comparison covers those film-production capabilities." },
      { question: "Can I edit Invideo's agent output manually?", answer: "Yes. Invideo documents an editable timeline and project export to other editors. NodeTool also keeps agent work editable, with an additional workflow canvas and open-source deployment." },
      { question: "Is the NodeTool trailer starter a complete feature-film pipeline?", answer: "No. It demonstrates a short trailer workflow using Gemini and KIE. A larger film needs shot review, continuity work, editing, and sound decisions." },
    ],
    limitation: "Invideo runs its production agents and editor in a managed browser workspace. NodeTool is an alternative when you want a visible generation graph and control over workspace deployment.",
  },
  {
    slug: "katalist",
    name: "Katalist",
    theme: "rose",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Katalist Alternative for AI Storyboards and Film Workflows | NodeTool",
      description: "Compare Katalist's script-to-storyboard and product-swap tools with NodeTool's entities, storyboards, editable workflows, and self-hosting.",
    },
    og: { image: "screen_storyboard.png", accent: "rose", subtitle: "From a script and cast to a production workflow." },
    starter: { id: "movie-trailer-generator", source: "katalist", heading: "Build a short trailer from an editable logline" },
    sources: [
      { title: "Katalist script, storyboard, and production tools", href: "https://www.katalist.ai/" },
      { title: "Katalist short-film storyboarding guide", href: "https://www.katalist.ai/how-to-storyboard/short-film" },
    ],
    heroParagraph: "Katalist turns a script into shots and storyboards, with character references and framing controls before video generation. Its current focus also includes product swaps, voice changes, and advertising variations. NodeTool fits filmmakers who want scripts, reusable entities, storyboards, and generation steps in a workspace they can inspect and run themselves.",
    competitorTagline: "Script-to-video creative studio for storyboards and ads",
    competitorBullets: ["Script breakdown into shots and storyboards", "Character references and shot refinement", "Product swaps and localized ad variations", "Hosted canvas for creation and export"],
    nodetoolTagline: "A film project with editable generation steps",
    nodetoolBullets: ["Script editor and reusable entity library", "Storyboard, workflow canvas, and timeline", "Choose supported models per stage", "Own provider accounts and open-source deployment"],
    rows: [
      { label: "Script planning", competitor: "Script-to-shot and storyboard workflow", nodetool: "Scripts and agent-authored storyboards" },
      { label: "Cast continuity", competitor: "Character references across shots", nodetool: "Reusable entities and reference assets" },
      { label: "Advertising variations", competitor: "Dedicated product-swap and localization tools", nodetool: "Custom workflows using supported models" },
      { label: "Generation control", competitor: "Refine shots in Katalist's hosted canvas", nodetool: "Inspect prompts, nodes, and intermediate outputs" },
      { label: "Workspace deployment", competitor: "Katalist-hosted studio", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Choose for the production you actually make",
    explainerParagraph: "Katalist's dedicated product-swap tools can suit agencies producing many ad variations. Its storyboarding also serves film planning. NodeTool fits when you need to build a broader media pipeline or retain control of the graph and provider accounts. Reference assets help guide both workflows, but review generated shots for continuity.",
    ctaHeading: "Take a logline through the generation graph.",
    ctaParagraph: "Inspect the trailer starter's prompts and models, then start with one shot.",
    faq: [
      { question: "Can Katalist make storyboards for films?", answer: "Yes. It breaks scripts into shots and storyboards, with character references and shot refinement. Its current studio also emphasizes performance advertising and product swaps." },
      { question: "Does NodeTool have Katalist's product-swap interface?", answer: "No. NodeTool uses editable workflows and supported model inputs for asset changes. Katalist offers a dedicated product-swap workflow." },
      { question: "Can I keep a cast in NodeTool?", answer: "Yes. The entity library holds reusable characters, objects, locations, and reference assets. Consistency in generated footage still depends on the selected model and shot review." },
    ],
    limitation: "Katalist combines storyboarding with dedicated ad-production tools in a hosted studio. NodeTool is an alternative for a customizable film pipeline and self-hosted workspace.",
  },
  {
    slug: "storyboarder-ai",
    name: "Storyboarder.ai",
    theme: "cyan",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Storyboarder.ai Alternative for AI Film Pre-production | NodeTool",
      description: "Compare Storyboarder.ai's shot lists, animatics, and pitch decks with NodeTool's editable storyboards, generation graphs, and timeline.",
    },
    og: { image: "screen_storyboard.png", accent: "cyan", subtitle: "Compare pre-production deliverables and the generation pipeline." },
    starter: { id: "movie-trailer-generator", source: "storyboarder-ai", heading: "Inspect the steps from shot plan to trailer" },
    sources: [
      { title: "Storyboarder.ai features, exports, and plan details", href: "https://www.storyboarder.ai/" },
    ],
    heroParagraph: "Storyboarder.ai focuses on pre-production: screenplay breakdown, shot lists, visual boards, animatics, and pitch decks. Its camera-angle and character tools help communicate a scene before production. NodeTool connects storyboard planning to editable generation graphs and a timeline, with agents and provider accounts inside an open-source workspace.",
    competitorTagline: "Film pre-production platform for boards and animatics",
    competitorBullets: ["Script-to-shot-list and storyboard generation", "Character, location, and style references", "Camera-angle tools and video animatics", "PDF, MP4, and pitch-deck exports"],
    nodetoolTagline: "Storyboard planning connected to editable workflows",
    nodetoolBullets: ["Scripts, reusable entities, and storyboards", "Generation graphs and intermediate outputs", "Timeline and audio editing", "Studio or self-hosting with your own keys"],
    rows: [
      { label: "Pre-production", competitor: "Shot lists, storyboards, and animatics", nodetool: "Scripts, entities, and editable storyboards" },
      { label: "Camera tools", competitor: "Dedicated 3D camera-angle tool", nodetool: "Shot direction and model-specific controls" },
      { label: "Pitch deliverables", competitor: "PDF boards and designed pitch-deck exports", nodetool: "Project assets and workflow outputs" },
      { label: "Generation billing", competitor: "Unlimited images on paid plans, separate video limits", nodetool: "Selected providers bill your accounts" },
      { label: "Workspace deployment", competitor: "Hosted Storyboarder.ai platform", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Pre-production package or a configurable production graph",
    explainerParagraph: "Storyboarder.ai is a focused choice for pitch decks, PDF boards, and animatic deliverables. NodeTool fits when you want storyboard decisions connected to a generation pipeline that you can inspect and rerun. Its trailer starter demonstrates that pipeline, rather than duplicating Storyboarder.ai's pitch-deck or camera-angle interface.",
    ctaHeading: "Inspect the steps after the shot plan.",
    ctaParagraph: "Review how the trailer starter turns a logline into direction, keyframes, and video.",
    faq: [
      { question: "Does Storyboarder.ai generate video?", answer: "Yes. It offers image-to-video animatics, including camera motion and audio. This comparison does not treat it as a still-image-only tool." },
      { question: "Does NodeTool replace Storyboarder.ai's pitch-deck exports?", answer: "NodeTool is useful for editable storyboards and generation workflows. If formatted pitch decks or PDF shot lists are the main deliverable, Storyboarder.ai's dedicated exports may fit better." },
      { question: "Are Storyboarder.ai images and videos billed the same way?", answer: "Its paid plans advertise unlimited image generation, while video has separate allowances and add-ons. NodeTool's hosted image and video calls are billed by your selected providers." },
    ],
    limitation: "Storyboarder.ai specializes in pre-production deliverables within a hosted service. NodeTool is an alternative when you want planning connected to a customizable generation workflow.",
  },
  {
    slug: "story-com",
    name: "Story.com",
    theme: "emerald",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Story.com Alternative for AI Movie Workflows | NodeTool",
      description: "Compare Story.com's script-to-movie tools and AI timeline editor with NodeTool's scripts, storyboards, editable graphs, and self-hosting.",
    },
    og: { image: "screen_storyboard.png", accent: "emerald", subtitle: "Keep the story, shots, and workflow open to revision." },
    starter: { id: "movie-trailer-generator", source: "story-com", heading: "Try a trailer with visible intermediate outputs" },
    sources: [
      { title: "Story.com movie, storyboard, and editing products", href: "https://www.story.com/" },
      { title: "Story.com script-to-movie workflow", href: "https://www.story.com/explain/ai-movie-maker" },
    ],
    heroParagraph: "Story.com brings script-to-movie generation, storyboarding, and an AI timeline editor into a hosted storytelling platform. Its Movie Agent helps with scenes and pacing, alongside voice and audio controls. NodeTool puts script, storyboard, entities, and timeline in an open-source workspace with an editable graph for the generation pipeline.",
    competitorTagline: "Hosted storytelling platform with an AI movie editor",
    competitorBullets: ["Script-to-scene movie generation", "Visual storyboarding tools", "Timeline editor and AI Movie Agent", "Narration, dialogue, and voice generation"],
    nodetoolTagline: "A story project with a workflow you can inspect",
    nodetoolBullets: ["Script editor, storyboard, and entity library", "Agents work on editable project documents", "Inspect prompts and generation outputs", "Provider accounts and workspace deployment you control"],
    rows: [
      { label: "Story planning", competitor: "Script-to-movie and storyboarding products", nodetool: "Scripts, entities, and storyboards" },
      { label: "Film editing", competitor: "Timeline-based AI Studio", nodetool: "Timeline and audio editors" },
      { label: "Agent assistance", competitor: "AI Movie Agent for scenes and pacing", nodetool: "Agents across project editors and workflow tools" },
      { label: "Generation pipeline", competitor: "Hosted movie and editing tools", nodetool: "Saved node graphs with intermediate outputs" },
      { label: "Workspace deployment", competitor: "Story.com-hosted platform", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Compare how revisions reach the final cut",
    explainerParagraph: "Story.com fits creators who want its movie generation and AI timeline editor together. NodeTool fits when you also want to inspect how a shot was generated, replace a stage in the workflow, or run the workspace yourself. Both support story planning and editing. Test a short sequence before trusting either workflow with a larger narrative.",
    ctaHeading: "Keep the intermediate outputs with the story.",
    ctaParagraph: "Try a trailer graph with visible direction and keyframe stages before video generation.",
    faq: [
      { question: "Is Story.com only for short clips?", answer: "No. It offers script-to-movie tools, storyboards, and a timeline editor designed for longer projects. The NodeTool starter on this page is deliberately a short trailer." },
      { question: "Does Story.com include an AI editing agent?", answer: "Yes. Its AI Movie Agent supports scene development and editing. NodeTool's agents operate its project editors and workflow tools too." },
      { question: "Can I change individual stages in NodeTool?", answer: "Yes. Saved workflows expose prompts, model nodes, and connections. You can revise a generation stage and review its outputs before assembling the film." },
    ],
    limitation: "Story.com packages movie generation and editing in a hosted storytelling platform. NodeTool is an alternative for an inspectable generation graph and open-source deployment.",
  },
  {
    slug: "mootion",
    name: "Mootion",
    theme: "rose",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Mootion Alternative for AI Storytelling and Film Workflows | NodeTool",
      description: "Compare Mootion's connected story scenes and Director Mode with NodeTool's scripts, entities, storyboards, and editable production graphs.",
    },
    og: { image: "screen_storyboard.png", accent: "rose", subtitle: "Plan the characters and review how every scene is made." },
    starter: { id: "movie-trailer-generator", source: "mootion", heading: "Start a trailer with one generated shot" },
    sources: [
      { title: "Mootion video and audio creation", href: "https://www.mootion.com/" },
      { title: "Mootion Director Mode and story workflow", href: "https://mootion.com/ugc/en/use-case/ai-storytelling-video-generator" },
    ],
    heroParagraph: "Mootion turns ideas, scripts, and references into connected story videos with motion and sound. Director Mode organizes characters, scenes, clips, and final assembly, while Instant Mode handles shorter ideas. NodeTool fits when you want to keep scripts and storyboards connected to an editable generation graph and use provider accounts you control.",
    competitorTagline: "Visual storytelling studio with directed multi-scene creation",
    competitorBullets: ["Script and multimodal reference inputs", "Director Mode for characters and scenes", "Instant Mode for shorter videos", "Voice, music, and sound in the creation workflow"],
    nodetoolTagline: "A configurable workflow for the story and its assets",
    nodetoolBullets: ["Scripts, reusable entities, and storyboards", "Inspect prompts, keyframes, and generated clips", "Timeline and audio editing", "Free Studio with direct provider billing"],
    rows: [
      { label: "Story planning", competitor: "Director Mode character and scene stages", nodetool: "Scripts, entities, and editable storyboards" },
      { label: "References", competitor: "Image, video, and audio Smart Reference inputs", nodetool: "Asset references supported by selected nodes" },
      { label: "Sound", competitor: "Voice, music, and effects in story creation", nodetool: "Audio generation workflows and timeline editing" },
      { label: "Generation control", competitor: "Guided Director and Instant modes", nodetool: "Editable graphs with model-specific inputs" },
      { label: "Workspace deployment", competitor: "Mootion-hosted creation platform", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "Guided story creation or control of the generation stages",
    explainerParagraph: "Mootion is a useful option when its guided character and scene workflow suits your story. NodeTool fits when you want to inspect intermediate assets, combine models with other processing, or run the workspace yourself. Character references guide generation, but continuity and performance still need review across the finished sequence.",
    ctaHeading: "Review one shot before expanding the story.",
    ctaParagraph: "Use the trailer starter to inspect the brief, keyframe, and video steps before generating more clips.",
    faq: [
      { question: "Does Mootion support multi-scene stories?", answer: "Yes. Director Mode organizes characters, scenes, generated clips, and assembly. Instant Mode provides a shorter creation path." },
      { question: "Can Mootion create audio as well as video?", answer: "Yes. Its creation tools include voice, music, and effects. NodeTool can also combine audio and video workflows with timeline editing." },
      { question: "Does the NodeTool starter duplicate Mootion Director Mode?", answer: "No. It demonstrates an editable trailer graph using Gemini and KIE. NodeTool's script, entity, storyboard, and timeline editors support broader production work." },
    ],
    limitation: "Mootion offers guided storytelling in its hosted production modes. NodeTool is an alternative when you want a saved, editable graph and direct control of provider accounts.",
  },
  {
    slug: "moonvalley",
    name: "Moonvalley Marey",
    theme: "amber",
    category: "AI filmmaking",
    isNew: true,
    seo: {
      title: "Moonvalley Marey Alternative for AI Film Workflows | NodeTool",
      description: "Compare Marey's camera, motion, and reference controls with NodeTool's film-production workspace. Learn where a video model fits in an editable workflow.",
    },
    og: { image: "screen_storyboard.png", accent: "amber", subtitle: "Choose shot controls and the workspace that connects them." },
    starter: { id: "movie-trailer-generator", source: "moonvalley", heading: "Inspect a film workflow before selecting models" },
    sources: [
      { title: "Moonvalley Marey shot controls", href: "https://www.moonvalley.com/marey" },
      { title: "Marey API access through FAL", href: "https://www.moonvalley.com/beyondtheframe/marey-launches-on-fal-ai" },
    ],
    heroParagraph: "Moonvalley's Marey focuses on filmmaking controls: camera direction, motion and pose transfer, trajectories, keyframes, and reference inputs. NodeTool is the workspace around generation, with scripts, entities, storyboards, a workflow canvas, and timeline editing. Compare both the shot model and how you plan, review, and assemble its outputs.",
    competitorTagline: "Filmmaking video model with dedicated shot controls",
    competitorBullets: ["Camera, trajectory, and keyframe controls", "Motion, pose, and subject references", "Shot extension tools", "API access, including selected FAL endpoints"],
    nodetoolTagline: "A production workspace around your selected models",
    nodetoolBullets: ["Scripts, entities, storyboards, and timeline", "Connect generation with other media processing", "Inspect the graph and intermediate assets", "Your provider accounts and open-source deployment"],
    rows: [
      { label: "Primary role", competitor: "Video model and shot-generation controls", nodetool: "Creative workspace and workflow execution" },
      { label: "Camera and motion", competitor: "Dedicated camera, trajectory, and transfer tools", nodetool: "Controls exposed by the selected provider node" },
      { label: "Production planning", competitor: "Visual references and shot inputs", nodetool: "Scripts, reusable entities, and storyboards" },
      { label: "Automation", competitor: "API and selected FAL endpoints", nodetool: "Node graphs, agents, API, MCP, and CLI" },
      { label: "Workspace deployment", competitor: "Moonvalley or provider-hosted model access", nodetool: "Studio, self-hosting, or Cloud alpha" },
    ],
    explainerHeading: "The model and the production workspace are separate choices",
    explainerParagraph: "Marey can suit shots that need its specific camera and motion tools. NodeTool organizes generation within a broader production project. API access means a model can also be part of a pipeline rather than a competing workspace. Check which Marey endpoints and controls your provider exposes before selecting the model for a shot.",
    ctaHeading: "Inspect the pipeline before choosing a shot model.",
    ctaParagraph: "The trailer starter uses Gemini and KIE, so you can review the workflow without assuming Marey feature parity.",
    faq: [
      { question: "Is NodeTool a replacement for the Marey model?", answer: "NodeTool is a workspace, not a video model. It helps plan and connect model calls, review assets, and edit a project. Marey's specific shot controls remain a model choice." },
      { question: "Does Marey have an API?", answer: "Yes. Moonvalley documents API access and selected text-to-video, image-to-video, motion-transfer, and pose-transfer endpoints on FAL." },
      { question: "Does this trailer starter use Marey?", answer: "No. It uses Gemini and KIE. Inspect its graph before adapting a stage to another supported provider or model." },
    ],
    limitation: "Marey provides specialized shot-generation controls. NodeTool is an alternative for the surrounding production workflow, and can complement model services rather than replace their capabilities.",
  },
  {
    slug: "kling-ai",
    name: "Kling AI",
    theme: "amber",
    category: "Video studio",
    isNew: true,
    seo: {
      title: "Kling AI Alternative for Editable Video Workflows | NodeTool",
      description: "Compare Kling AI's motion and shot controls with NodeTool's editable video workflows, storyboards, and direct provider accounts."
    },
    og: {
      image: "screen_storyboard.png",
      accent: "amber",
      subtitle: "Direct a shot, then keep the production workflow editable."
    },
    starter: {
      id: "movie-trailer-generator",
      source: "kling-ai",
      heading: "Try a trailer with visible shot-planning steps"
    },
    sources: [
      {
        title: "Kling video and reference controls",
        href: "https://app.klingai.com/cn/quickstart/klingai-video-3-model-user-guide"
      },
      {
        title: "Kuaishou on Kling motion control",
        href: "https://ir.kuaishou.com/news-releases/news-release-details/kuaishou-technology-announces-fourth-quarter-and-full-year-2025"
      }
    ],
    heroParagraph: "Kling AI combines video generation with native audio, reference elements, and shot controls. Motion Control can guide a character using a reference performance. NodeTool fits when the shot belongs to a larger production pipeline: plan the brief, generate assets, and edit the result while retaining the workflow.",
    competitorTagline: "Creative video platform with motion and reference controls",
    competitorBullets: [
      "Text-to-video and image-to-video generation",
      "Native audio on supported models",
      "Reference elements and shot controls",
      "Motion guided by a reference performance"
    ],
    nodetoolTagline: "Keep the shot inside an editable production project",
    nodetoolBullets: [
      "Script, storyboard, and workflow canvas",
      "Agents revise the same project you inspect",
      "Generation through your connected providers",
      "Timeline editing in open-source Studio"
    ],
    rows: [
      {
        label: "Motion direction",
        competitor: "Kling Motion Control",
        nodetool: "Settings exposed by the selected provider node"
      },
      {
        label: "Shot planning",
        competitor: "Storyboard and reference controls",
        nodetool: "Editable storyboard and generation graph"
      },
      {
        label: "Audio",
        competitor: "Native audio on supported models",
        nodetool: "Audio generation and timeline assembly"
      },
      {
        label: "Execution",
        competitor: "Kling creative platform",
        nodetool: "Desktop or self-hosted workflows"
      }
    ],
    explainerHeading: "Compare a video model with the pipeline around it",
    explainerParagraph: "Choose Kling when its movement and reference controls are the main requirement. Choose NodeTool when you need the brief, model calls, and editing steps saved as a workflow. Model-specific controls still depend on the provider integration you select.",
    ctaHeading: "Keep the brief connected to the finished clip.",
    ctaParagraph: "Inspect the trailer starter and its selected models before running a one-shot test.",
    faq: [
      {
        question: "Does this starter use Kling?",
        answer: "The shipped trailer starter uses Gemini and KIE, including Veo video. It demonstrates an editable production graph. It does not reproduce Kling Motion Control."
      },
      {
        question: "Does NodeTool replace Kling's motion controls?",
        answer: "Provider nodes expose their own supported settings. A workflow canvas does not make different models' motion controls interchangeable."
      },
      {
        question: "Can I run the workspace myself?",
        answer: "Yes. Studio runs on your desktop, and NodeTool supports self-hosting. Hosted generation still runs through the providers you connect."
      }
    ],
    limitation: "Kling's shot controls may solve the generation task. NodeTool is an alternative when you also need an editable workflow for planning, asset generation, and assembly."
  },
  {
    slug: "pika",
    name: "Pika",
    theme: "rose",
    category: "Video studio",
    isNew: true,
    seo: {
      title: "Pika Alternative for Repeatable AI Media Workflows | NodeTool",
      description: "Compare Pika's creative apps and model access with NodeTool's saved workflows, storyboard and timeline editors, and your own provider accounts."
    },
    og: {
      image: "screen_storyboard.png",
      accent: "rose",
      subtitle: "Creative apps or a production workflow you can rerun."
    },
    starter: {
      id: "movie-trailer-generator",
      source: "pika",
      heading: "Build a short trailer as a saved workflow"
    },
    sources: [
      {
        title: "Pika apps, models, and plans",
        href: "https://pika.art/pricing"
      },
      {
        title: "Pika developer platform",
        href: "https://dev.pika.art/"
      }
    ],
    heroParagraph: "Pika offers creative apps for video, images, and audio, including motion transfer and video extension. It also provides developer access. NodeTool offers an alternative for turning a brief into a saved graph that includes planning, generation, and editing, with provider accounts you control.",
    competitorTagline: "Hosted creative platform for video, images, and audio",
    competitorBullets: [
      "Video creation, extension, and motion-transfer apps",
      "Image and audio generation",
      "Pika and third-party model access",
      "Developer platform alongside the creative app"
    ],
    nodetoolTagline: "Save the production steps alongside the media",
    nodetoolBullets: [
      "Repeatable generation graphs",
      "Editable storyboard and timeline",
      "Direct provider accounts",
      "Free Studio and self-hosted deployment"
    ],
    rows: [
      {
        label: "Creative interface",
        competitor: "Task-specific apps",
        nodetool: "Agents and editable project surfaces"
      },
      {
        label: "Media types",
        competitor: "Video, image, and audio",
        nodetool: "Video, image, audio, text, and data"
      },
      {
        label: "Automation",
        competitor: "Developer platform",
        nodetool: "CLI, API, MCP, and workflow execution"
      },
      {
        label: "Billing",
        competitor: "App plans and credit packs with separate developer terms",
        nodetool: "Provider charges on connected accounts"
      }
    ],
    explainerHeading: "Choose between a creative app and a reusable production graph",
    explainerParagraph: "Pika is useful when a dedicated app gets the effect or clip you need. NodeTool fits repeated production where the brief and intermediate outputs should stay inspectable. A NodeTool workflow does not promise an equivalent for every Pika effect.",
    ctaHeading: "Save the workflow for the next brief.",
    ctaParagraph: "Start with one trailer shot, inspect the output, and retain the graph for another run.",
    faq: [
      {
        question: "Is Pika only a video generator?",
        answer: "No. Pika currently lists video, image, and audio apps and several model families."
      },
      {
        question: "Does Pika support developers?",
        answer: "Yes. Pika links a developer platform. Its app credit packs have separate usage terms from API and MCP access."
      },
      {
        question: "Will the starter recreate a Pika effect?",
        answer: "The trailer starter demonstrates planning and video assembly with Gemini and KIE. A particular effect depends on the model and integration you choose."
      }
    ],
    limitation: "Pika packages creation into hosted apps and their usage plans. NodeTool fits when you want to save and rerun the full production workflow on your own workspace."
  },
  {
    slug: "luma-dream-machine",
    name: "Luma Dream Machine",
    theme: "cyan",
    category: "Video studio",
    isNew: true,
    seo: {
      title: "Luma Dream Machine Alternative for AI Video Projects | NodeTool",
      description: "Compare Dream Machine boards, reference controls, and video tools with NodeTool's editable production graphs and your own provider accounts."
    },
    og: {
      image: "screen_storyboard.png",
      accent: "cyan",
      subtitle: "Organize ideas and keep the generation steps visible."
    },
    starter: {
      id: "movie-trailer-generator",
      source: "luma-dream-machine",
      heading: "Follow a logline through a trailer workflow"
    },
    sources: [
      {
        title: "Dream Machine boards and creation tools",
        href: "https://lumalabs.ai/changelog/welcome-to-the-all-new-dream-machine"
      },
      {
        title: "Dream Machine credits and API billing",
        href: "https://lumalabs.ai/learning-hub/dream-machine-credit-system"
      }
    ],
    heroParagraph: "Dream Machine organizes ideas into boards and offers image generation, image-to-video, reference controls, and video modification. Its subscription and API balances are separate. NodeTool connects planning, generation, and timeline editing in an open-source workspace, with model calls billed through your provider accounts.",
    competitorTagline: "Creative workspace for image and video ideas",
    competitorBullets: [
      "Boards and ideas for organizing concepts",
      "Image-to-video and keyframe extension",
      "Style and character references",
      "Modify tools and separate API access"
    ],
    nodetoolTagline: "A visible graph from brief to assembled video",
    nodetoolBullets: [
      "Editable scripts and storyboards",
      "Inspect prompts, keyframes, and clips",
      "Timeline editing beside the graph",
      "Desktop and self-hosted execution"
    ],
    rows: [
      {
        label: "Project organization",
        competitor: "Boards and Ideas",
        nodetool: "Scripts, entities, storyboards, and workflows"
      },
      {
        label: "Reference controls",
        competitor: "Style, character, and keyframe tools",
        nodetool: "Controls supported by the selected model nodes"
      },
      {
        label: "Billing",
        competitor: "Subscription credits and separate API balance",
        nodetool: "Your connected providers"
      },
      {
        label: "Workspace",
        competitor: "Hosted Dream Machine",
        nodetool: "Studio or self-hosted deployment"
      }
    ],
    explainerHeading: "Start with the project you need to keep",
    explainerParagraph: "Dream Machine suits visual exploration within its boards and generation tools. NodeTool suits work where you need to inspect the pipeline and revise individual steps. This comparison concerns the Dream Machine product, rather than every tool in Luma's broader platform.",
    ctaHeading: "Inspect each shot before expanding the trailer.",
    ctaParagraph: "Review the trailer starter's keyframes and model calls, then begin with one shot.",
    faq: [
      {
        question: "Does Dream Machine have project organization?",
        answer: "Yes. It provides Boards and Ideas, alongside generation and reference tools."
      },
      {
        question: "Can Dream Machine app credits pay for API calls?",
        answer: "Luma documents separate subscription and API balances. Credits do not transfer between them."
      },
      {
        question: "Does the NodeTool starter use Luma?",
        answer: "The shipped trailer graph uses Gemini and KIE. It provides an inspectable production example, not a claim of identical Luma output."
      }
    ],
    limitation: "Dream Machine combines visual organization with hosted generation. NodeTool is an alternative when you need the generation and editing pipeline saved as a workflow you can run yourself."
  },
  {
    slug: "pixverse",
    name: "PixVerse",
    theme: "violet",
    category: "Video studio",
    isNew: true,
    seo: {
      title: "PixVerse Alternative for Editable AI Video Pipelines | NodeTool",
      description: "Compare PixVerse video generation and API workflows with NodeTool's storyboard, timeline, and reusable generation graphs."
    },
    og: {
      image: "screen_storyboard.png",
      accent: "violet",
      subtitle: "Generation endpoints or a project around every shot."
    },
    starter: {
      id: "movie-trailer-generator",
      source: "pixverse",
      heading: "Inspect the graph behind a short trailer"
    },
    sources: [
      {
        title: "PixVerse generation and developer tools",
        href: "https://pixverse.ai/en/developers"
      },
      {
        title: "PixVerse API subscription terms",
        href: "https://docs.platform.pixverse.ai/subscribe-api-plans-882969m0"
      }
    ],
    heroParagraph: "PixVerse provides video and image generation, creative effects, and APIs for building creation into other products. Its API memberships are separate from its web memberships. NodeTool offers the project around those generation steps: agents, editable storyboards, a workflow canvas, and a timeline.",
    competitorTagline: "Generative media platform with production APIs",
    competitorBullets: [
      "Text-to-video and image-to-video",
      "Image generation and creative effects",
      "API task status and webhook integration",
      "Separate web and API memberships"
    ],
    nodetoolTagline: "Plan, inspect, and assemble the generated media",
    nodetoolBullets: [
      "Storyboard and generation graph",
      "Intermediate outputs stay inspectable",
      "Timeline assembly in the same workspace",
      "CLI, API, and MCP access"
    ],
    rows: [
      {
        label: "Generation",
        competitor: "Video, image, and effect endpoints",
        nodetool: "Selected provider nodes in a workflow"
      },
      {
        label: "Developer access",
        competitor: "API, task status, and webhooks",
        nodetool: "API, CLI, MCP, and workflow execution"
      },
      {
        label: "Billing",
        competitor: "Web and API memberships are separate",
        nodetool: "Your connected provider accounts"
      },
      {
        label: "Production project",
        competitor: "PixVerse creative and integration tools",
        nodetool: "Script, storyboard, workflow, and timeline"
      }
    ],
    explainerHeading: "Compare the generation service and the production workspace",
    explainerParagraph: "PixVerse is a direct choice for integrating its generation capabilities into a product. NodeTool fits when creators need to inspect and revise the pipeline themselves. The model service and the workspace have different roles, so compare both against the task.",
    ctaHeading: "Keep the generated shots connected to the brief.",
    ctaParagraph: "Open the trailer graph, inspect its providers, and review each output.",
    faq: [
      {
        question: "Does PixVerse have an API?",
        answer: "Yes. Its developer site documents generation requests, asynchronous task status, and webhook integration."
      },
      {
        question: "Are PixVerse web and API subscriptions interchangeable?",
        answer: "PixVerse states that API memberships are separate from web memberships. Check the subscription for the surface you intend to use."
      },
      {
        question: "Does this starter reproduce PixVerse effects?",
        answer: "No specific effect is promised. The starter uses Gemini and KIE to demonstrate an editable trailer pipeline."
      }
    ],
    limitation: "PixVerse supports generation and developer integrations. NodeTool is an alternative when the priority is an editable production workspace and control of the workflow around model calls."
  },
  {
    slug: "leonardo-ai",
    name: "Leonardo AI",
    theme: "emerald",
    category: "Creative canvas",
    isNew: true,
    seo: {
      title: "Leonardo AI Alternative for Editable Creative Workflows | NodeTool",
      description: "Compare Leonardo's image, video, Realtime Canvas, and API tools with NodeTool's open-source creative workspace and direct provider accounts."
    },
    og: {
      image: "screen_canvas.png",
      accent: "emerald",
      subtitle: "Explore visuals, then retain the production graph."
    },
    starter: {
      id: "generate-then-upscale-a-poster",
      source: "leonardo-ai",
      heading: "Generate and upscale an image in a visible graph"
    },
    sources: [
      {
        title: "Leonardo creation and editing tools",
        href: "https://leonardo.ai/"
      },
      {
        title: "Leonardo individual, team, and API plans",
        href: "https://leonardo.ai/pricing"
      }
    ],
    heroParagraph: "Leonardo combines image and video generation with editing, upscaling, Realtime Canvas, and model customization. It also offers team and API plans. NodeTool is an alternative for connecting those stages in a workflow you can inspect, with agents operating the same project and providers billed directly.",
    competitorTagline: "Hosted creation platform for images, video, and design",
    competitorBullets: [
      "Image and video generation and editing",
      "Upscaling and Realtime Canvas",
      "Custom-model training tools",
      "Individual, team, and API plans"
    ],
    nodetoolTagline: "Keep every production step in the project",
    nodetoolBullets: [
      "Connect generation and upscaling nodes",
      "Agents revise editable workflows",
      "Local models and direct provider accounts",
      "Open-source desktop and self-hosting"
    ],
    rows: [
      {
        label: "Image iteration",
        competitor: "Image editing and Realtime Canvas",
        nodetool: "Workflow canvas and sketch editing"
      },
      {
        label: "Video",
        competitor: "Generation and editing tools",
        nodetool: "Storyboard, generation nodes, and timeline"
      },
      {
        label: "Automation",
        competitor: "API plans and hosted creation tools",
        nodetool: "CLI, API, MCP, and saved workflows"
      },
      {
        label: "Billing",
        competitor: "Plan allowances and separate API offerings",
        nodetool: "Connected providers bill model calls"
      }
    ],
    explainerHeading: "A managed creation service or a graph you run yourself",
    explainerParagraph: "Leonardo fits creators who want its hosted canvas, model tools, and team offering. NodeTool fits when generation is one stage of a repeatable process with inspectable inputs and outputs. Custom-model features depend on the selected provider rather than the graph alone.",
    ctaHeading: "Inspect the draft and the upscaled poster.",
    ctaParagraph: "Try a two-stage image workflow with the model and output of each stage visible.",
    faq: [
      {
        question: "Does Leonardo support video and APIs?",
        answer: "Yes. Leonardo lists video generation and editing, plus individual, team, and API offerings."
      },
      {
        question: "Is NodeTool's canvas the same as Realtime Canvas?",
        answer: "No. NodeTool's workflow canvas connects operations. Its sketch editor handles image layers. These serve different tasks from Leonardo's Realtime Canvas."
      },
      {
        question: "What does the poster starter require?",
        answer: "It uses a FAL API key for FLUX.1 Schnell and Clarity Upscaler. Review the models and their costs before running it."
      }
    ],
    limitation: "Leonardo provides a managed creative service and its own plan structure. NodeTool fits when you want the production graph, deployment, and provider accounts under your control."
  },
  {
    slug: "midjourney",
    name: "Midjourney",
    theme: "blue",
    category: "Creative canvas",
    isNew: true,
    seo: {
      title: "Midjourney Alternative for AI Image Workflows | NodeTool",
      description: "Compare Midjourney's image editor, video generation, and subscription model with NodeTool's saved workflows and your own generation providers."
    },
    og: {
      image: "screen_canvas.png",
      accent: "blue",
      subtitle: "An image service or a workflow around the whole project."
    },
    starter: {
      id: "write-the-prompt-then-make-the-image",
      source: "midjourney",
      heading: "Keep the written prompt beside the generated image"
    },
    sources: [
      {
        title: "Midjourney editor capabilities",
        href: "https://docs.midjourney.com/hc/en-us/articles/32764383466893-Editor"
      },
      {
        title: "Midjourney plans, video, and privacy",
        href: "https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans"
      }
    ],
    heroParagraph: "Midjourney offers image creation, a web editor with layers and retexturing, and video generation. Its plans allocate GPU time and vary in privacy and generation modes. NodeTool is an alternative when you want image creation inside an editable workflow with text, video, audio, and providers you select.",
    competitorTagline: "Image and video creation service with a web editor",
    competitorBullets: [
      "Web image creation and organization",
      "Layered editing, inpainting, and retexturing",
      "Video generation",
      "Subscription GPU time and plan-specific privacy"
    ],
    nodetoolTagline: "Keep the prompt, model call, and output separate",
    nodetoolBullets: [
      "Inspect generated prompts and images",
      "Connect creation to other media steps",
      "Use your own provider accounts",
      "Run open-source Studio or self-host"
    ],
    rows: [
      {
        label: "Image editing",
        competitor: "Web Editor with layers and Retexture",
        nodetool: "Sketch layers and model-specific editing nodes"
      },
      {
        label: "Video",
        competitor: "Video generation within plan limits",
        nodetool: "Provider generation, storyboard, and timeline"
      },
      {
        label: "Usage model",
        competitor: "Subscription GPU time and generation modes",
        nodetool: "Provider billing or compatible local inference"
      },
      {
        label: "Workspace deployment",
        competitor: "Midjourney service",
        nodetool: "Desktop or self-hosted workspace"
      }
    ],
    explainerHeading: "Choose the image experience or the production workflow",
    explainerParagraph: "Midjourney fits creators who prefer its generation and editing experience. NodeTool fits projects where the prompt and output need to become reusable steps in a wider graph. Choosing NodeTool does not imply access to Midjourney's models or identical results.",
    ctaHeading: "See the prompt that made the image.",
    ctaParagraph: "Try a starter with separate prompt and image outputs, then save it for the next idea.",
    faq: [
      {
        question: "Does Midjourney have editing and video tools?",
        answer: "Yes. Its Editor includes image adjustments and layers, and its plans list video generation."
      },
      {
        question: "Does this NodeTool starter call Midjourney?",
        answer: "No. It uses OpenAI and FAL. Compare the workflow and providers you intend to use rather than assuming model equivalence."
      },
      {
        question: "Are Midjourney generations always private?",
        answer: "Midjourney documents Stealth Mode on selected plans and different editor visibility rules. Review its current documentation for your workflow."
      }
    ],
    limitation: "Midjourney centers on its hosted generation and editing experience. NodeTool is an alternative for keeping generation in a saved workflow with direct provider accounts and other media stages."
  },
  {
    slug: "adobe-firefly",
    name: "Adobe Firefly",
    theme: "amber",
    category: "Creative canvas",
    isNew: true,
    seo: {
      title: "Adobe Firefly Alternative for Editable AI Projects | NodeTool",
      description: "Compare Firefly's models, Boards, and Adobe editing tools with NodeTool's open-source workspace, workflow canvas, and direct provider accounts."
    },
    og: {
      image: "screen_canvas.png",
      accent: "amber",
      subtitle: "Compare the creative workspace, model access, and deployment."
    },
    starter: {
      id: "write-the-prompt-then-make-the-image",
      source: "adobe-firefly",
      heading: "Try an editable image workflow outside a hosted suite"
    },
    sources: [
      {
        title: "Adobe Firefly features and plans",
        href: "https://www.adobe.com/products/firefly.html"
      }
    ],
    heroParagraph: "Firefly combines image, video, and audio creation with Adobe and partner models, Boards, and an AI Assistant. Adobe editing products are part of its broader creative offering. NodeTool offers an open-source workspace for connecting media steps, with agents, project editors, and your own provider accounts.",
    competitorTagline: "Creative AI suite with Adobe and partner models",
    competitorBullets: [
      "Image, video, and audio generation and editing",
      "Firefly Boards for collaborative ideation",
      "AI Assistant and partner-model access",
      "Connections to Adobe editing products"
    ],
    nodetoolTagline: "An editable production workspace you can host",
    nodetoolBullets: [
      "Agents operate the same project editors",
      "Generation graphs with inspectable outputs",
      "Storyboard, sketch, and timeline surfaces",
      "Your provider accounts and deployment"
    ],
    rows: [
      {
        label: "Ideation",
        competitor: "Firefly Boards",
        nodetool: "Agents, scripts, entities, and storyboards"
      },
      {
        label: "Models",
        competitor: "Adobe and partner models",
        nodetool: "Connected providers and compatible local models"
      },
      {
        label: "Editing",
        competitor: "Firefly tools and Adobe products",
        nodetool: "Sketch and timeline beside the workflow graph"
      },
      {
        label: "Usage",
        competitor: "Plan features and generative allowances",
        nodetool: "Studio plus provider model charges"
      }
    ],
    explainerHeading: "Compare deployment alongside the creative tools",
    explainerParagraph: "Firefly fits teams working within Adobe's creative environment. NodeTool fits teams that want to run the workspace themselves and connect provider accounts directly. Different model licenses and commercial-use terms still apply to the assets each workflow produces.",
    ctaHeading: "Keep the idea, prompt, and image in one graph.",
    ctaParagraph: "Inspect a starter's separate outputs before adding more production steps.",
    faq: [
      {
        question: "Does Firefly only use Adobe models?",
        answer: "No. Adobe lists partner models alongside its own models."
      },
      {
        question: "Does Firefly support agents and video?",
        answer: "Yes. Adobe lists an AI Assistant, video tools, and audio tools."
      },
      {
        question: "Does NodeTool replace Photoshop or Illustrator?",
        answer: "NodeTool focuses on editable AI workflows and project surfaces. It does not promise the same toolset as Adobe's specialist editors."
      }
    ],
    limitation: "Firefly offers a managed creative suite with Adobe and partner models. NodeTool is an alternative when workspace deployment and direct provider accounts are requirements."
  },
  {
    slug: "ideogram",
    name: "Ideogram",
    theme: "rose",
    category: "Creative canvas",
    isNew: true,
    seo: {
      title: "Ideogram Alternative for Editable Image Workflows | NodeTool",
      description: "Compare Ideogram's typography, creative apps, API, and MCP tools with NodeTool's production workflows and provider accounts."
    },
    og: {
      image: "screen_canvas.png",
      accent: "rose",
      subtitle: "Compare image tools with the workflow around them."
    },
    starter: {
      id: "movie-posters",
      source: "ideogram",
      heading: "Try a poster workflow with editable art direction"
    },
    sources: [
      {
        title: "Ideogram models, apps, and agent access",
        href: "https://ideogram.ai/"
      },
      {
        title: "Ideogram plans and API billing",
        href: "https://docs.ideogram.ai/plans-and-pricing/available-plans"
      }
    ],
    heroParagraph: "Ideogram emphasizes readable type, image editing, and creative apps such as ad resizing and background removal. It also offers a unified media API, MCP access, and open-model licensing. NodeTool connects creative operations across project editors, with an open-source workspace you can run yourself.",
    competitorTagline: "Generative media platform with typography and creative apps",
    competitorBullets: [
      "Readable typography and image editing",
      "Purpose-built creative apps",
      "Media API and MCP agent access",
      "Open-model weights under applicable licensing"
    ],
    nodetoolTagline: "Connect the brief to a repeatable production workflow",
    nodetoolBullets: [
      "Inspect the art direction and generated concepts",
      "Mix text, image, video, and audio steps",
      "Agents edit saved project documents",
      "Direct provider accounts and self-hosting"
    ],
    rows: [
      {
        label: "Typography",
        competitor: "Dedicated text-rendering and editing features",
        nodetool: "Depends on the chosen model and editing workflow"
      },
      {
        label: "Creative tasks",
        competitor: "Ad resizing, background removal, and other apps",
        nodetool: "Operations connected in a saved graph"
      },
      {
        label: "Agent access",
        competitor: "MCP and media API",
        nodetool: "MCP across project editors, API, and CLI"
      },
      {
        label: "Local control",
        competitor: "Open-model licensing and hosted services",
        nodetool: "Open-source workspace and compatible local models"
      }
    ],
    explainerHeading: "Separate model openness from workspace control",
    explainerParagraph: "Ideogram fits work that needs its typography and focused creative apps. Its open-model offering means local use is a licensing and hardware question, not a blanket limitation. NodeTool fits when the whole production process needs editable steps across media.",
    ctaHeading: "Keep the art direction beside the poster.",
    ctaParagraph: "Open the poster starter, review the selected models, and revise the brief.",
    faq: [
      {
        question: "Does Ideogram support video and agents?",
        answer: "Its current platform lists image and video models through a unified API, plus MCP for agent workflows."
      },
      {
        question: "Is Ideogram entirely closed?",
        answer: "Ideogram lists open-model weights under an applicable license. Compare that model license separately from the hosted product and your workspace."
      },
      {
        question: "Will the poster starter reproduce Ideogram typography?",
        answer: "The starter uses OpenAI and FAL. Typography quality depends on the selected model. Review generated lettering and refine it before delivery."
      }
    ],
    limitation: "Ideogram provides typography-focused models and creative apps. NodeTool is an alternative for managing the production graph and combining those kinds of tasks with other media and data."
  },
  {
    slug: "recraft",
    name: "Recraft",
    theme: "violet",
    category: "Creative canvas",
    isNew: true,
    seo: {
      title: "Recraft Alternative for Repeatable AI Design Workflows | NodeTool",
      description: "Compare Recraft's image and vector design tools with NodeTool's editable media workflows, sketch editor, and direct provider accounts."
    },
    og: {
      image: "screen_canvas.png",
      accent: "violet",
      subtitle: "Specialist design tools or a workflow across media."
    },
    starter: {
      id: "generate-then-upscale-a-poster",
      source: "recraft",
      heading: "Try a repeatable image generation and upscale workflow"
    },
    sources: [
      {
        title: "Recraft image, vector, and API tools",
        href: "https://www.recraft.ai/"
      },
      {
        title: "Recraft plans",
        href: "https://www.recraft.ai/pricing"
      }
    ],
    heroParagraph: "Recraft focuses on design assets, including generated images and editable vector graphics with consistent styles. It also offers API access. NodeTool offers an alternative for the process around asset creation: inspect generation steps, work with image layers, and connect assets to video, audio, or data workflows.",
    competitorTagline: "AI design platform for images and vector graphics",
    competitorBullets: [
      "Image generation for design assets",
      "Editable vector graphics",
      "Consistent visual styles",
      "API access for integrations"
    ],
    nodetoolTagline: "Save the asset-production workflow",
    nodetoolBullets: [
      "Generation and upscaling as separate steps",
      "Sketch editing with image layers",
      "Connect assets to other media operations",
      "Open-source Studio and direct provider accounts"
    ],
    rows: [
      {
        label: "Vector design",
        competitor: "Dedicated editable vector generation",
        nodetool: "Provider-dependent generation, not a vector-editor replacement"
      },
      {
        label: "Image workflow",
        competitor: "Design-focused generation and styles",
        nodetool: "Inspect and connect individual operations"
      },
      {
        label: "Automation",
        competitor: "API access",
        nodetool: "API, CLI, MCP, and workflow execution"
      },
      {
        label: "Workspace",
        competitor: "Recraft hosted design service",
        nodetool: "Desktop or self-hosted project workspace"
      }
    ],
    explainerHeading: "Keep specialist vector work separate from orchestration",
    explainerParagraph: "Recraft is a focused choice when editable vectors and visual consistency are the deliverable. NodeTool fits when an image is one output of a larger repeatable workflow. A NodeTool sketch editor is not a substitute for every vector design operation.",
    ctaHeading: "Keep the draft and the final asset connected.",
    ctaParagraph: "Try the image-and-upscale starter and inspect both outputs.",
    faq: [
      {
        question: "Does NodeTool replace Recraft's vector editor?",
        answer: "No equivalent vector toolset is promised. NodeTool's sketch surface works with image layers, while Recraft offers dedicated vector generation."
      },
      {
        question: "Can Recraft be automated?",
        answer: "Yes. Recraft provides API access alongside its Studio."
      },
      {
        question: "What does the starter produce?",
        answer: "A generated image and an upscaled poster through FAL. It demonstrates a saved production graph rather than editable SVG output."
      }
    ],
    limitation: "Recraft specializes in image and vector design. NodeTool is an alternative when you need a reusable workflow connecting asset creation to other production stages."
  },
  {
    slug: "dreamina",
    name: "Dreamina",
    theme: "emerald",
    category: "Video studio",
    isNew: true,
    seo: {
      title: "Dreamina Alternative for Editable AI Media Projects | NodeTool",
      description: "Compare Dreamina's image, video, avatar, and marketing tools with NodeTool's open-source production workspace and saved workflows."
    },
    og: {
      image: "screen_storyboard.png",
      accent: "emerald",
      subtitle: "Hosted creative templates or an editable production graph."
    },
    starter: {
      id: "movie-trailer-generator",
      source: "dreamina",
      heading: "Build a trailer from an editable brief"
    },
    sources: [
      {
        title: "Dreamina image, video, and marketing tools",
        href: "https://dreamina.capcut.com/"
      }
    ],
    heroParagraph: "Dreamina combines image generation and editing with video, avatars, marketing studios, and creative templates. Its catalog includes Seedream and Seedance alongside other models. NodeTool is an alternative for retaining the brief, intermediate outputs, and editing steps in a workspace you can run with your own provider accounts.",
    competitorTagline: "Hosted creative platform for images, video, and avatars",
    competitorBullets: [
      "Image generation, restyling, and editing",
      "Text-, image-, and reference-led video tools",
      "Talking avatars and marketing studios",
      "Creative templates and multiple model families"
    ],
    nodetoolTagline: "Make the project steps visible and reusable",
    nodetoolBullets: [
      "Editable brief, storyboard, and workflow",
      "Inspect intermediate image and video outputs",
      "Timeline assembly in the same workspace",
      "Desktop and self-hosted deployment"
    ],
    rows: [
      {
        label: "Starting point",
        competitor: "Creative templates and task-specific studios",
        nodetool: "Agents, saved graphs, and shipped workflows"
      },
      {
        label: "Video direction",
        competitor: "Image, sketch, and reference-led tools",
        nodetool: "Storyboard plus model-specific provider settings"
      },
      {
        label: "Avatars",
        competitor: "Dedicated avatar creation tools",
        nodetool: "Capabilities of selected provider nodes"
      },
      {
        label: "Workspace control",
        competitor: "Hosted Dreamina experience",
        nodetool: "Open-source workspace and direct provider accounts"
      }
    ],
    explainerHeading: "Choose how much of the production process to retain",
    explainerParagraph: "Dreamina suits creators who want its templates and dedicated marketing or avatar tools. NodeTool suits repeated work where you need to revise the brief, switch a generation step, and inspect the result. Template convenience and workflow control address different production needs.",
    ctaHeading: "Revise the brief without losing the graph.",
    ctaParagraph: "Inspect a trailer starter and begin with one paid shot.",
    faq: [
      {
        question: "Is Dreamina only an image generator?",
        answer: "No. Dreamina lists video, avatars, and marketing studios alongside image generation and editing."
      },
      {
        question: "Does the starter use Seedance?",
        answer: "The shipped trailer starter uses Gemini and KIE, including Veo video. Other models require a compatible provider node and account."
      },
      {
        question: "Can NodeTool run the workspace locally?",
        answer: "Yes. Studio runs on your desktop. Hosted model calls still run through their providers and incur their charges."
      }
    ],
    limitation: "Dreamina combines hosted models, templates, and dedicated creative tools. NodeTool fits when you want to retain and run the production workflow with your own providers."
  },
  {
    slug: "comfyui",
    starter: { id: "generate-then-upscale-a-poster", source: "comfyui", heading: "Try a generation graph in NodeTool" },
    name: "ComfyUI",
    seo: {
      title: "ComfyUI Alternatives for Creative Workflows | NodeTool",
      description:
        "Compare ComfyUI and NodeTool for image, video, audio, and editable creative projects. See where each workflow editor fits.",
    },
    theme: "blue",
    category: "Node editor",
    og: {
      image: "screen_canvas.png",
      accent: "blue",
      subtitle:
        "The studio around the node editor — every medium, every provider.",
    },
    heroParagraph:
      "ComfyUI gives you detailed control over image and video generation in a node graph, including native video workflows. Shared graphs can require matching models and custom nodes on another machine. NodeTool combines a workflow canvas with storyboard, sketch, script, and timeline editors in an editable project. Both products are open source; the better fit depends on whether graph-level generation control or a broader production workspace matters more to you.",
    competitorTagline: "Node editor for image and video generation",
    competitorBullets: [
      "Deep control over Stable Diffusion pipelines",
      "Engineer-first, graph-based UX",
      "Local model focused",
      "Hundreds of community custom nodes — quality and maintenance vary",
    ],
    nodetoolTagline: "The studio around the canvas",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Every major model from every major provider",
      "Editing tools: masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Media types", competitor: "Image, video, audio via supported workflows", nodetool: "Image, video, audio, text" },
      { label: "Models", competitor: "Local and partner image/video models", nodetool: "Local and hosted models across media types" },
      { label: "Provider access", competitor: "Local and partner models", nodetool: "Local and hosted models on your accounts" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: "Available through workflows and nodes", nodetool: "Integrated editors and nodes" },
      { label: "Local models", competitor: true, nodetool: true },
      { label: "Desktop + browser", competitor: "Local web interface and Comfy Cloud", nodetool: "Studio and Cloud (alpha)" },
      { label: "Open source", competitor: true, nodetool: true },
      { label: "Custom-node stability", competitor: "Third-party, versions can conflict", nodetool: "Built-in, one maintained codebase" },
      { label: "Workflow portability across machines", competitor: "Custom nodes may need installation", nodetool: "Requires matching models and provider access" },
    ],
    explainerHeading: "From generation graph to editable project",
    explainerParagraph:
      "ComfyUI supports text-to-video and image-to-video as well as diffusion images. Choose it when you need detailed control of a generation graph and its model settings. NodeTool places generation workflows beside a storyboard, layered sketch, script, and video timeline. An agent can help build and revise the workflow, while the project remains editable. Both tools need the relevant models, extensions, or provider access for a shared workflow to run on another machine.",
    ctaHeading: "Open, complete, and yours.",
    ctaParagraph:
      "Download Studio and build across image, video, audio, and text in one place.",
    faq: [
      {
        question: "What is the difference between NodeTool and ComfyUI?",
        answer:
          "ComfyUI supports image and video generation with detailed graph control. NodeTool combines a workflow canvas with storyboard, sketch, script, and timeline editors in a saved creative project. Both are open source, and both can run local models.",
      },
      {
        question: "Why do ComfyUI workflows break after sharing or updating?",
        answer:
          "A shared ComfyUI graph may refer to custom nodes or models that are missing on another machine. ComfyUI Manager can help install missing nodes. Check extension and model requirements before sharing. NodeTool workflows also need matching models and provider access, although its core editing surfaces ship with the app.",
      },
      {
        question: "Is NodeTool open source like ComfyUI?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0. You can run it as a desktop app on macOS, Windows, or Linux, or in the browser via NodeTool Cloud, which is managed hosting of the same open-source code.",
      },
      {
        question: "Can NodeTool do more than image generation?",
        answer:
          "Yes. NodeTool connects image, video, audio, and text workflows to editable projects, including a storyboard and timeline. ComfyUI also supports text-to-video and image-to-video workflows; the products differ in their editing surfaces and project structure.",
      },
      {
        question: "How does NodeTool handle model pricing?",
        answer:
          "NodeTool runs on your own keys — you bring your own API keys and pay each provider their list price. There are no credits, no markup, and no hand-picked list of models. You can also run local models with Ollama, MLX, or llama.cpp in the desktop app.",
      },
    ],
    limitation:
      "ComfyUI supports image and video workflows, but shared graphs that use custom nodes may require matching extensions and models on another machine. NodeTool adds a storyboard, timeline, and other editors around the workflow canvas.",
  },
  {
    slug: "weavy",
    name: "Weavy",
    seo: {
      title: "Weavy Alternative — Now Figma Weave | NodeTool",
      description:
        "Looking for a Weavy alternative? Weavy is now Figma Weave. Compare NodeTool's open-source, self-hosted canvas, your own API keys, and workflows you own.",
    },
    footerName: "Weavy (Figma Weave)",
    theme: "blue",
    category: "Creative canvas",
    og: {
      image: "screen_canvas.png",
      accent: "violet",
      subtitle: "Open source and your own keys — no credits, no hand-picked list of models, no lock-in.",
    },
    heroParagraph:
      "One morning in October 2025, Weavy users woke up to a new name, a new owner, and the same old credit meter. Figma acquired Weavy, renamed it Figma Weave, and the canvas stayed what it always was: closed, hosted, and billed in credits, with a model list someone else curates. NodeTool takes the opposite bet — open source, your own keys at provider prices, workflows and files you own, and an agent-first workspace where an agent can build the pipeline for you. Cloud is just managed hosting of the same code you can self-host.",
    competitorTagline: "Closed SaaS canvas, now Figma Weave",
    competitorBullets: [
      "Credit system you top up and burn",
      "A hand-picked list of supported models",
      "Closed source, hosted only",
      "Now part of Figma — roadmap follows the platform",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Your own keys — pay providers directly at list prices",
      "Every major model from every major provider",
      "Open source under AGPL-3.0, self-hostable",
      "Agent-first: an agent builds, runs, and repairs workflows",
      "You own your workflows and files",
    ],
    rows: [
      { label: "Pricing model", competitor: "Credits", nodetool: "Your keys, provider prices" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every provider" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host", competitor: false, nodetool: true },
      { label: "Data ownership", competitor: false, nodetool: true },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Pay providers, not credits — and keep your work",
    explainerParagraph:
      "Credit systems and curated model lists decide which models you can use and what each call costs — and after an acquisition, someone else's roadmap decides everything else. NodeTool flips that: you add your own API keys and pay each provider their published list price. The workspace is agent-first, so you can describe what you want and an agent authors the workflow, runs it, and repairs what fails on the same canvas you use. All of it is open source under AGPL-3.0 — run it as a desktop app or self-host it, and your workflows and files stay yours. NodeTool Cloud is managed hosting of the same code.",
    ctaHeading: "Own your canvas.",
    ctaParagraph:
      "Download Studio and build with every provider, at provider prices.",
    faq: [
      {
        question: "How is NodeTool different from Weavy?",
        answer:
          "Weavy and similar closed SaaS canvases lock you into a credit system and a curated list of models. NodeTool is open source and runs on your own keys: every provider, your keys, provider prices, and you own your workflows and files. NodeTool Cloud is just managed hosting of the same open-source code you can self-host.",
      },
      {
        question: "What happened to Weavy?",
        answer:
          "Figma acquired Weavy in October 2025 and renamed it Figma Weave. The product runs as a standalone tool at weave.figma.com with its own AI credits and billing, separate from Figma, and is being folded into the Figma platform over time. It remains closed source and hosted-only.",
      },
      {
        question: "Does NodeTool use credits?",
        answer:
          "No. NodeTool runs on your own keys — you bring your own API keys and pay each provider their list price directly. There are no credits, no markup, and no hand-picked model list.",
      },
      {
        question: "Can I self-host NodeTool?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0. You can run it as a desktop app on macOS, Windows, or Linux, or self-host the same code that powers NodeTool Cloud.",
      },
      {
        question: "Who owns my workflows and files in NodeTool?",
        answer:
          "You do. In the desktop app your workflows and files stay on your machine. NodeTool does not lock your work behind a proprietary platform — the code is open source and self-hostable.",
      },
    ],
    limitation:
      "Weavy — now Figma Weave after Figma's October 2025 acquisition — is a closed, hosted canvas billed in credits: you can't self-host it, and your work lives on their platform.",
  },
  {
    slug: "figma-weave",
    starter: { id: "write-the-prompt-then-make-the-image", source: "figma-weave", heading: "Try an editable image project on your own keys" },
    name: "Figma Weave",
    seo: {
      title: "Figma Weave Alternative: Open-Source, Self-Hosted | NodeTool",
      description:
        "Compare an open-source, self-hosted Figma Weave alternative. NodeTool gives you your own API keys, local models, and workflows you can run and own.",
    },
    theme: "violet",
    category: "Creative canvas",
    og: {
      image: "screen_canvas.png",
      accent: "violet",
      subtitle: "The open-source, your own keys alternative to Figma Weave.",
    },
    heroParagraph:
      "Figma Weave — the canvas formerly known as Weavy — is a polished hosted tool with a curated frontier model list, billed in its own AI credits and moving deeper into the Figma platform with every release. That's fine until the day a model you rely on drops off the list, or the credit math changes, or the roadmap bends toward Figma's plans instead of yours. NodeTool covers the same visual media workflows in the open: AGPL-3.0 source, your own keys at provider prices, an agent that can build the pipeline for you, a desktop app that runs offline with local models, and workflows and files that stay yours.",
    competitorTagline: "Hosted AI canvas in the Figma ecosystem",
    competitorBullets: [
      "Billed in Figma Weave AI credits",
      "Curated list of models, chosen for you",
      "Closed source, browser-only, no self-host",
      "Roadmap follows Figma's platform plans",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Your own keys — pay providers directly at list prices",
      "Every major model from every major provider",
      "Open source under AGPL-3.0 — desktop app or self-host",
      "Agent-first: an agent builds, runs, and repairs workflows",
      "Local models via Ollama, MLX, and llama.cpp",
    ],
    rows: [
      { label: "Pricing model", competitor: "AI credits", nodetool: "Your keys, provider prices" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every provider" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Free tier", competitor: true, nodetool: "Studio is free" },
      { label: "Self-host", competitor: false, nodetool: true },
      { label: "Desktop app / offline", competitor: false, nodetool: true },
      { label: "Local models (Ollama, MLX, llama.cpp)", competitor: false, nodetool: true },
    ],
    explainerHeading: "Own the canvas, not a seat in an ecosystem",
    explainerParagraph:
      "Acquisitions change products: pricing, model lists, and roadmaps for Figma Weave now follow Figma's platform strategy, and your workflows live on their servers either way. NodeTool takes the opposite bet. The whole workspace is open source under AGPL-3.0, workflows are files you own, and models are called with your own API keys at each provider's published price — or run locally with Ollama, MLX, and llama.cpp. It is also agent-first: every editor is exposed to agents as tools, so you can describe a pipeline and an agent wires it, runs it, and repairs what fails. If the tool changes direction, you keep the code, the graphs, and the keys.",
    ctaHeading: "Build on a canvas nobody can acquire.",
    ctaParagraph:
      "Download Studio — open source, your own keys, every provider at provider prices.",
    faq: [
      {
        question: "Is Figma Weave the same as Weavy?",
        answer:
          "Yes. Figma acquired Weavy in October 2025 and renamed it Figma Weave. It runs as a standalone product at weave.figma.com with its own AI credits and billing, separate from Figma, and is being integrated into the Figma platform over time.",
      },
      {
        question: "Is there an open source alternative to Figma Weave?",
        answer:
          "NodeTool is one: an open-source (AGPL-3.0) visual canvas for image, video, audio, and text. It runs on your own keys — you call every major provider with your own keys at provider prices — and runs as a desktop app, in the browser, or self-hosted.",
      },
      {
        question: "Does NodeTool use credits like Figma Weave?",
        answer:
          "No. NodeTool runs on your own keys — you bring your own API keys and pay each provider their list price directly. There are no credits, no markup, and no hand-picked list of models. You can also run local models for no per-call cost at all.",
      },
      {
        question: "When is Figma Weave the better pick?",
        answer:
          "If your team already lives in Figma and wants a managed, hosted canvas with a hand-picked list of models and community workflows — and doesn't need self-hosting, local models, or pricing on your own keys — Figma Weave is a polished choice. NodeTool is for teams that want the same workflows with open source, their own keys, and their own machines.",
      },
    ],
    limitation:
      "Figma Weave is a closed, hosted canvas billed in its own AI credits — you can't self-host it, and its roadmap now follows Figma's platform plans.",
    isNew: true,
  },
  {
    slug: "runway",
    name: "Runway",
    theme: "violet",
    category: "Video studio",
    isNew: true,
    og: {
      image: "screen_workflow.png",
      accent: "violet",
      subtitle:
        "An open workspace for the whole edit — every video model on your own keys, on a timeline you own.",
    },
    heroParagraph:
      "Runway made prompt-to-video feel like a craft tool rather than a demo, and its own models are genuinely good. The catch is structural: the models are the ones Runway ships, the work lives on Runway's servers, and the meter runs in credits. A finished piece is rarely one clip — it is a board, a script, a voice, twenty takes, and a cut. NodeTool is the open-source, bring-your-own-key workspace for that whole pass: every video model from every provider at list price, a multi-track timeline in the same app, and an agent that can run the pipeline for you.",
    competitorTagline: "Hosted video studio",
    competitorBullets: [
      "Strong first-party video models",
      "Polished hosted editor, nothing to install",
      "Closed source, subscription + credits",
      "The model list is Runway's own",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Every video model from every provider, swapped in one node",
      "Storyboard, script, voice, and a multi-track timeline in one app",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — no credits, no markup",
      "Self-hostable, and local models cost nothing per call",
    ],
    rows: [
      { label: "Video models", competitor: "First-party", nodetool: "Every major provider" },
      { label: "Swap models mid-project", competitor: "Within the list", nodetool: "One node change" },
      { label: "Multi-track timeline", competitor: "Built-in", nodetool: "Built-in" },
      { label: "Storyboard + script + voice", competitor: "Partial", nodetool: "One document each, linked" },
      { label: "Automate a repeat job", competitor: "Manual per piece", nodetool: "A workflow you rerun" },
      { label: "Pricing model", competitor: "Subscription + credits", nodetool: "Your keys, provider prices" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "One studio's models, or every studio's",
    explainerParagraph:
      "Runway is a good answer to \"generate this shot\". It is a worse answer to \"generate this shot with whichever model is best this month, then do it again next week for forty SKUs\". NodeTool treats the model as a swappable part: the same graph calls Veo, Kling, Sora, Hailuo, Wan, or Seedance depending on which node you pick, billed to your own key at the provider's list price. Around that sit the parts a finished piece needs anyway — a storyboard that settles framing before you pay for clips, a script that knows which voice speaks each line, and a multi-track timeline to cut on. All of it is open source under AGPL-3.0, so the workflow is a file you own and can rerun anywhere.",
    ctaHeading: "Keep the edit, swap the model.",
    ctaParagraph:
      "Download Studio and build the whole video pipeline on your own keys.",
    faq: [
      {
        question: "What is the difference between NodeTool and Runway?",
        answer:
          "Runway is a closed, hosted video studio built around its own models and billed in credits. NodeTool is an open-source (AGPL-3.0) workspace that calls every major video provider with your own keys at list price, and puts a storyboard, script, voice, and multi-track timeline around the generation step. You can self-host it or run it as a desktop app.",
      },
      {
        question: "Can NodeTool use the same video models as Runway?",
        answer:
          "NodeTool calls whichever models the providers it supports serve — Veo, Kling, Sora, Hailuo, Wan, Seedance and others through fal, Replicate, Kie, and the model APIs directly. Runway's own first-party models are exclusive to Runway.",
      },
      {
        question: "Does NodeTool have a video editor?",
        answer:
          "Yes. Clips, audio, captions, and transitions sit on a multi-track timeline in the same app that generated them, and an agent can edit that timeline through the same tools you click.",
      },
      {
        question: "Is NodeTool cheaper than Runway?",
        answer:
          "NodeTool adds nothing per generation — you pay each provider its list price with your own key, and Studio is free and open source. Whether the total is lower depends on your workload and which models you pick; there is simply no platform margin on top.",
      },
    ],
    limitation:
      "Runway is a closed, credit-billed studio built on its own model list — no self-hosting, no bringing your own keys, and no swapping in a model it does not ship.",
    seo: {
      title: "Runway alternative — open source, your own keys | NodeTool",
      description:
        "An open-source alternative to Runway: every video model from every provider on your own keys, with a storyboard, script, voice, and multi-track timeline in the same workspace.",
    },
  },
  {
    slug: "langflow",
    name: "Langflow",
    theme: "blue",
    category: "Chatbot & agent builder",
    og: {
      image: "screen_workflow.png",
      accent: "emerald",
      subtitle: "Agents plus native image, video, and music generation — on one canvas.",
    },
    heroParagraph:
      "Your Langflow agent can answer from a thousand documents. Now ask it for a storyboard, and watch the flow end at a blank HTTP node waiting for an API you'll wire by hand. Langflow is a capable drag-and-drop builder for chat, document search, and agents, rooted in Python and LangChain — but its agents ship messages, not media. NodeTool covers that same ground and keeps going: native image, video, and music generation with editing tools on the same canvas, and an agent that can build the whole pipeline itself. Open source, your own keys at provider prices, local models included.",
    competitorTagline: "Drag-and-drop builder for chatbot and agent apps",
    competitorBullets: [
      "Visual flows for chatbots, document search, and agents",
      "Python-extensible, LangChain ecosystem",
      "Open source (MIT), self-hostable",
      "Text workflows first",
    ],
    nodetoolTagline: "Agents plus native generation",
    nodetoolBullets: [
      "Agents, document search, and chat on the same canvas",
      "Native image, video, and music generation nodes",
      "Editing tools: masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — local models via Ollama, MLX, llama.cpp",
    ],
    rows: [
      { label: "Focus", competitor: "chatbot and agent apps: chat, document search, agents", nodetool: "Agents + image, video, audio, text" },
      { label: "Native media generation (image, video, music)", competitor: "Via external APIs", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Agents & document search", competitor: true, nodetool: true },
      { label: "Local models", competitor: "Text models via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Your own API keys", competitor: true, nodetool: true },
      { label: "Open source", competitor: "MIT", nodetool: "AGPL-3.0" },
      { label: "Desktop app", competitor: "macOS, Windows", nodetool: "macOS, Windows, Linux" },
    ],
    explainerHeading: "The pipeline and the picture, on one canvas",
    explainerParagraph:
      "If your project ends at a chatbot or document question-answering, Langflow is a solid choice — visual flows, Python extensibility, a mature LangChain community. But the moment an agent needs to produce something you can look at or listen to — a storyboard, a product video, a soundtrack — Langflow hands you an API key form and a blank HTTP node. NodeTool keeps going: generation nodes for image, video, and music from every major provider sit on the same canvas as your agents and retrieval, with masks, inpaint, relight, upscale, and layers built in. And the agents don't just live in the workflow, they build it: NodeTool is agent-first, so you can describe a pipeline and an agent authors the graph, validates it, and repairs what fails. You bring your own keys and pay provider list prices — no credits, no markup — and run local models via Ollama, MLX, and llama.cpp on the desktop.",
    ctaHeading: "Build agents that make things.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents.",
    faq: [
      {
        question: "What is the difference between NodeTool and Langflow?",
        answer:
          "Langflow is a drag-and-drop visual builder for chatbot and agent apps, covering chat, document question-answering, and agents, rooted in the Python and LangChain ecosystem. NodeTool covers the same agent and document-search ground but treats media as a built-in output: image, video, and music generation run as native nodes on the same canvas, with editing tools like masks, inpaint, and layers built in. Both are open source and self-hostable.",
      },
      {
        question: "Can Langflow generate images and video?",
        answer:
          "Langflow is built for text and text work; generating media means wiring up external APIs yourself. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools — masks, inpaint, outpaint, relight, upscale, layers, and compositing.",
      },
      {
        question: "Is NodeTool open source like Langflow?",
        answer:
          "Yes. Langflow is MIT-licensed; NodeTool is open source under AGPL-3.0. Both can be self-hosted. NodeTool also ships as a desktop app for macOS, Windows, and Linux, and NodeTool Cloud is managed hosting of the same open-source code.",
      },
      {
        question: "Can I run local models in NodeTool?",
        answer:
          "Yes. NodeTool runs local models via Ollama, MLX, and llama.cpp in the desktop app, and connects to every major cloud provider with your own keys — your keys, provider list prices, no credits or markup.",
      },
    ],
    limitation:
      "Langflow is text-first: generating image, video, or audio means wiring up external APIs by hand.",
  },
  {
    slug: "n8n",
    name: "n8n",
    theme: "blue",
    category: "Workflow automation",
    og: {
      image: "screen_canvas.png",
      accent: "cyan",
      subtitle: "Workflows that create, not just connect — native generation and agents.",
    },
    heroParagraph:
      "n8n is what you reach for when a record has to travel from Salesforce to Slack to a spreadsheet, every night, without fail. But try to make the workflow produce something — a product video, a batch of campaign images, a soundtrack — and the creative step collapses into a generic HTTP node calling an API you configured by hand. NodeTool is built for workflows where the AI work is the point: native image, video, and music generation, agents, and editing tools on one canvas, with an agent that can author the pipeline for you. Open source under AGPL-3.0, your own keys at provider prices, with a desktop app and local models.",
    competitorTagline: "Workflow automation platform",
    competitorBullets: [
      "400+ integrations for business apps",
      "Scheduling, retries, and branching",
      "AI agent nodes built on LangChain",
      "Fair-code: source-available, commercially restricted",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation nodes",
      "Agents and document search on the same canvas as generation",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "App-to-app automation", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via external APIs", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Business app connectors", competitor: "400+ integrations", nodetool: "AI-focused set" },
      { label: "License", competitor: "Sustainable Use (fair-code)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "Text models via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Per-execution plans (cloud)", nodetool: "Your keys, provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Plumbing is solved. Production isn't.",
    explainerParagraph:
      "If the hard part of your workflow is moving records between Salesforce, Slack, and a spreadsheet on a schedule, n8n is built for exactly that. But when the workflow's output is the thing itself — a product video, a batch of campaign images, a soundtrack, an agent's research report — the generation can't live in a generic HTTP node. NodeTool makes it native: image, video, and music models from every major provider as built-in blocks, agents and retrieval on the same canvas, and editing tools — masks, inpaint, relight, upscale, layers — built in. It is also agent-first: describe the pipeline and an agent authors the graph, runs it, and repairs what fails, so the automation can build itself. Open source under AGPL-3.0 rather than fair-code, it runs as a desktop app on macOS, Windows, and Linux and calls models with your own keys at provider list prices.",
    ctaHeading: "Make the workflow the studio.",
    ctaParagraph:
      "Download Studio and generate image, video, and music where your agents already work.",
    faq: [
      {
        question: "What is the difference between NodeTool and n8n?",
        answer:
          "n8n is a workflow automation platform: it moves data between hundreds of business apps, with AI agent nodes built on LangChain. NodeTool is built for workflows where the AI work is the point — native image, video, and music generation, agents, and media editing tools on one visual canvas. If the job is connecting Salesforce to Slack on a schedule, use n8n. If the job is producing something with AI, use NodeTool.",
      },
      {
        question: "Is n8n open source?",
        answer:
          "n8n is fair-code under its Sustainable Use License: the source is available, but commercial use is restricted. NodeTool is open source under AGPL-3.0, an OSI-approved license — you can self-host it, modify it, and build on it, and NodeTool Cloud is managed hosting of the same code.",
      },
      {
        question: "Can n8n generate images or video?",
        answer:
          "Only by calling external APIs from generic HTTP or integration nodes. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools — masks, inpaint, outpaint, relight, upscale, layers, and compositing.",
      },
      {
        question: "When should I pick n8n instead of NodeTool?",
        answer:
          "When the hard part of your workflow is business-app plumbing: hundreds of connectors, schedules, retries, and branching between SaaS tools. That is what n8n is built for. NodeTool is the better fit when the workflow's output is AI-generated media or agent work, and you want local models, provider pricing on your own keys, and a desktop app.",
      },
    ],
    limitation:
      "n8n is built for app-to-app plumbing; AI generation lands in a generic HTTP node, and it is fair-code, not open source.",
  },
  {
    slug: "flowise",
    name: "Flowise",
    theme: "violet",
    category: "Chatbot & agent builder",
    og: {
      image: "screen_workflow.png",
      accent: "violet",
      subtitle: "chatbots that answer from your documents plus native image, video, and music generation.",
    },
    heroParagraph:
      "Flowise gets you from zero to a document-answering chatbot in an afternoon: vector store, retriever, LLM node, done. Then the client asks for the demo video, the launch images, a voice for the assistant — and every one of those lands outside the flow, in a raw HTTP node or another tool entirely. NodeTool covers the same agent and retrieval ground, then keeps the whole deliverable on one canvas: native image, video, and music generation, editing tools, and an agent that can build the pipeline itself. Open source under AGPL-3.0, your own keys at provider prices, with a desktop app and local models.",
    competitorTagline: "Drag-and-drop LangChain builder",
    competitorBullets: [
      "Fastest path to a chatbot that answers from your documents",
      "Vector store and LangChain node library",
      "Source-available under Apache 2.0",
      "Hosted cloud sold on usage-based credits",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Agents, document search, and native image/video/music generation",
      "Built-in editing tools — masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "LangChain chatbots & document search", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via HTTP request nodes", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Vector store / document search nodes", competitor: true, nodetool: true },
      { label: "License", competitor: "Apache 2.0 (source-available)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "Text models via Ollama", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Usage-based credits (cloud)", nodetool: "Your keys, provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "A chatbot is often just the front door.",
    explainerParagraph:
      "Flowise is genuinely fast at what it's built for: wire a vector store, a retriever, and a language model node into a working chatbot that answers from your documents in minutes. But the moment the workflow needs to produce something — a rendered image, a video cut, a voice line — that step lands in a generic HTTP node calling an external API by hand. In NodeTool, image, video, and music models from every major provider sit on the same canvas as the agent and retrieval nodes, with masks, inpaint, relight, upscale, and layers built in. The workspace is agent-first too: describe what the chatbot and its media pipeline should do, and an agent wires the graph, validates it, and repairs what fails. Every call runs on your own keys at list price, no credit tiers on top.",
    ctaHeading: "Build the chatbot. Ship the media too.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents and retrieval.",
    faq: [
      {
        question: "What is the difference between NodeTool and Flowise?",
        answer:
          "Flowise is a drag-and-drop builder for LangChain-based chatbot and agent apps — its fastest path is a chatbot that answers from your documents backed by a vector store. NodeTool covers the same agent and retrieval ground, then adds native image, video, and music generation nodes, plus editing tools (masks, inpaint, relight, layers), on the same canvas. If the deliverable is a chatbot, Flowise gets there fastest. If the deliverable includes generated media, NodeTool is built for the whole pipeline.",
      },
      {
        question: "Is Flowise open source?",
        answer:
          "Flowise is source-available under the Apache 2.0 license, with a hosted Flowise Cloud sold on usage-based credit tiers. NodeTool is open source under AGPL-3.0 and your own keys: you connect your own provider keys and pay providers directly at their list prices, with no credit markup on either self-hosted or NodeTool Cloud usage.",
      },
      {
        question: "Can Flowise generate images or video?",
        answer:
          "Only by wiring a generic HTTP request node to an external API. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, as built-in blocks on the same canvas as its agent and document search nodes.",
      },
      {
        question: "When should I pick Flowise instead of NodeTool?",
        answer:
          "When the job is strictly a LangChain-flavored chatbot or assistant over a document set, and you want the fastest drag-and-drop path to that specific shape. NodeTool is the better fit once the workflow also needs to produce image, video, or audio, or you want a desktop app with local-model support and pricing on your own keys across everything, not just the language model calls.",
      },
    ],
    limitation:
      "Flowise nails the LangChain chatbot that answers from your documents, but generating media drops you into a raw HTTP node, and its cloud is billed in credits.",
  },
  {
    slug: "dify",
    name: "Dify",
    theme: "amber",
    category: "Chatbot & agent builder",
    og: {
      image: "screen_llms.png",
      accent: "amber",
      subtitle: "Agents and document search, plus native image, video, and music generation.",
    },
    heroParagraph:
      "Dify earns its reputation on the text side: prompt management, knowledge bases, agent debugging — everything a support bot or internal copilot needs. But the day the deliverable includes a rendered image, a video cut, or a synthesized voice, the work has to leave the platform. NodeTool starts from the same agent and document-search ground and keeps the whole job on one canvas: native image, video, and music generation, editing tools, and an agent that can build the pipeline for you. Open source under AGPL-3.0, your own keys at provider prices, with a desktop app and local models.",
    competitorTagline: "language model app development platform",
    competitorBullets: [
      "Prompt management and app-store-style deployment",
      "Built-in knowledge bases and agent debugging",
      "Modified Apache 2.0 license with commercial limits",
      "Cloud sold on seat/usage plans",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Agents, document search, and native image/video/music generation",
      "Built-in editing tools — masks, inpaint, relight, layers",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Focus", competitor: "Text-first chatbot and agent apps & knowledge bases", nodetool: "AI generation + agents" },
      { label: "Native media generation (image, video, music)", competitor: "Via tool/plugin calls", nodetool: "Built-in nodes" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Agent debugging & tracing", competitor: true, nodetool: true },
      { label: "License", competitor: "Modified Apache 2.0 (commercial limits)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Local models", competitor: "language models via self-hosted endpoints", nodetool: "Ollama, MLX, llama.cpp" },
      { label: "Pricing model", competitor: "Seat/usage plans (cloud)", nodetool: "Your keys, provider prices" },
      { label: "Desktop app", competitor: false, nodetool: true },
    ],
    explainerHeading: "Great for the chatbot. Not built for the render.",
    explainerParagraph:
      "Dify earns its reputation on debugging and knowledge-base tooling for text-first chatbot and agent apps — a support bot, an internal copilot, a document Q&A assistant. But when the deliverable includes a generated image, a video cut, or a synthesized voice line, that step has to leave the platform. NodeTool puts image, video, and music models from every major provider on the same canvas as its agent and retrieval nodes, with masks, inpaint, relight, upscale, and layers built in. And because the workspace is agent-first, an agent can author that canvas itself — build the workflow, run it, and repair what fails — with every call on your own keys at list price.",
    ctaHeading: "Build past the chatbot.",
    ctaParagraph:
      "Download Studio and put generation on the same canvas as your agents and knowledge base.",
    faq: [
      {
        question: "What is the difference between NodeTool and Dify?",
        answer:
          "Dify is a language model app development platform focused on prompt management, knowledge bases, and agent debugging for text-first products like chatbots and copilots. NodeTool covers the same agent and document-search ground on a visual canvas, then adds native image, video, and music generation and editing tools — masks, inpaint, relight, layers — as built-in blocks, so a workflow can produce media, not just text and structured output.",
      },
      {
        question: "Is Dify open source?",
        answer:
          "Dify's source is published under a modified Apache 2.0 license that adds commercial-use conditions above certain usage thresholds — check Dify's own license file for the current terms before relying on it for a commercial deployment. NodeTool is open source under AGPL-3.0, an OSI-approved license, and is fully your own keys on both self-hosted and NodeTool Cloud deployments.",
      },
      {
        question: "Can Dify generate images or video?",
        answer:
          "Dify can call image-generation APIs through its tool/plugin system, but it is not built around media generation the way it is built around text and document search. NodeTool ships native generation nodes for image, video, and music across every major provider, plus built-in editing tools, on the same canvas as its agent and knowledge-base nodes.",
      },
      {
        question: "When should I pick Dify instead of NodeTool?",
        answer:
          "When the product is a text-first language model app — a support chatbot, an internal copilot, a knowledge-base assistant — and you want Dify's prompt-management interface, built-in observability, and app-store-style deployment. NodeTool is the better fit when the workflow needs to produce image, video, or audio alongside the agent and document search work, or when you want a desktop app with local-model support and pricing on your own keys throughout.",
      },
    ],
    limitation:
      "Dify is built around text-first chatbot and agent apps; media generation happens through plugins, and its license adds commercial limits.",
  },

  // --- First wave of new competitors (drafted from the same pattern) ---
  {
    slug: "flora",
    name: "Flora",
    theme: "rose",
    category: "Creative canvas",
    isNew: true,
    og: {
      image: "screen_canvas.png",
      accent: "rose",
      subtitle: "A creative AI canvas that's open source and runs on your own keys — not credit-metered.",
    },
    heroParagraph:
      "Flora is a beautifully designed hosted canvas for AI image and video — and every render on it burns credits, on a model list someone else curates, on servers where your work lives. NodeTool is the open version of that idea: image, video, music, and text on one visual canvas, every model called with your own keys at provider prices, an agent that can build the pipeline for you, and workflows and files you own and can self-host.",
    competitorTagline: "Hosted infinite canvas",
    competitorBullets: [
      "Polished, purpose-built creative canvas UX",
      "Curated image and video model selection",
      "Closed source, hosted only",
      "Billed in credits you top up",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Every major model from every major provider",
      "Open source under AGPL-3.0, self-hostable",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — no credits, no markup",
    ],
    rows: [
      { label: "Design / onboarding polish", competitor: "Purpose-built creative interface", nodetool: "A visual canvas built for depth" },
      { label: "Media types", competitor: "Image, video", nodetool: "Image, video, audio, text" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every major provider" },
      { label: "Pricing model", competitor: "Credits", nodetool: "Your keys, provider prices" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host / data ownership", competitor: false, nodetool: true },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "A canvas you can take with you",
    explainerParagraph:
      "Flora is genuinely pleasant to use — the onboarding and the canvas feel designed, and for a quick hosted image or video it's fast to reach for. But it's closed and credit-metered: the model list is curated, each render burns credits, and your work lives on their platform. NodeTool trades some of that turnkey polish for control. Image, video, music, and text share one canvas, every provider is called at list price with your own keys, and local models run via Ollama, MLX, and llama.cpp. It's agent-first too — describe what you want and an agent wires the graph and runs it — and the whole thing is open source under AGPL-3.0, so you can self-host it and keep your files.",
    ctaHeading: "Create on a canvas you own.",
    ctaParagraph:
      "Download Studio and build across image, video, audio, and text — your keys, your files.",
    faq: [
      {
        question: "What is the difference between NodeTool and Flora?",
        answer:
          "Flora is a hosted, closed-source creative canvas for AI image and video, billed in credits. NodeTool is an open-source (AGPL-3.0) visual canvas, run on your own keys, that spans image, video, audio, and text, connects to every major provider at list price, and can be self-hosted or run as a desktop app with local models.",
      },
      {
        question: "Is NodeTool a free alternative to Flora?",
        answer:
          "NodeTool Studio is free to download and open source; you pay only the providers you call, at their list prices, using your own API keys. There are no credits or platform markup. You can also run local models for free on your own hardware.",
      },
      {
        question: "Can I self-host NodeTool instead of using a hosted canvas?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and self-hostable, and NodeTool Cloud is managed hosting of the same code. Your workflows and files stay yours either way.",
      },
    ],
    limitation:
      "Flora is a closed, credit-metered hosted canvas — you can't self-host it or bring your own keys.",
  },
  {
    slug: "krea",
    name: "Krea",
    theme: "cyan",
    category: "Creative canvas",
    isNew: true,
    og: {
      image: "screen_canvas.png",
      accent: "cyan",
      subtitle: "An open canvas that runs on your own keys, built for the whole process rather than one instant render.",
    },
    heroParagraph:
      "Krea's party trick is real: sketch, and the image resolves under your cursor. For a single instant render, it's hard to beat. But a finished piece is rarely a single render — it's a pipeline of steps across image, video, music, and text, and that's where a hosted, credit-billed studio runs out of canvas. NodeTool is the open-source, bring-your-own-key workspace for the pipeline: every model at provider prices, editing built in, an agent that can wire the steps for you, and the whole thing self-hostable.",
    competitorTagline: "Hosted real-time studio",
    competitorBullets: [
      "Real-time, instant image generation and enhance",
      "Slick hosted UX, no setup",
      "Closed source, subscription + credits",
      "Curated model selection",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "Open source · your keys",
    nodetoolBullets: [
      "Image, video, audio, and text on one canvas",
      "Compose and edit — masks, inpaint, relight, layers",
      "Every major model from every major provider",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Your own keys at provider prices — self-hostable, local models",
    ],
    rows: [
      { label: "Real-time / instant generation", competitor: "Built-in, real-time", nodetool: "Batch & workflow, not real-time" },
      { label: "Media types", competitor: "Image, video", nodetool: "Image, video, audio, text" },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: "Enhance / upscale", nodetool: "Full editing on canvas" },
      { label: "Models", competitor: "Hand-picked list", nodetool: "Every major provider" },
      { label: "Pricing model", competitor: "Subscription + credits", nodetool: "Your keys, provider prices" },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0" },
      { label: "Self-host + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Speed at one step, or control across all of them",
    explainerParagraph:
      "Krea's real-time canvas is legitimately great: type or sketch and watch the image resolve instantly, then enhance and upscale — all hosted, nothing to install. If a fast, interactive single render is the job, Krea is hard to beat. NodeTool optimizes for the opposite end: composing multi-step pipelines that mix image, video, music, and text, editing on the same canvas with masks and layers, calling every provider with your own keys at list price, and running local models. It's agent-first, so an agent can author those pipelines from a description, run them, and repair what fails — and it's open source and self-hostable, so the whole pipeline is yours.",
    ctaHeading: "Own the whole pipeline.",
    ctaParagraph:
      "Download Studio and compose image, video, audio, and text on one open canvas.",
    faq: [
      {
        question: "What is the difference between NodeTool and Krea?",
        answer:
          "Krea is a hosted, closed-source studio built around real-time image generation and enhancement, sold on subscription and credits. NodeTool is an open-source (AGPL-3.0) visual canvas that runs on your own keys for multi-step pipelines across image, video, audio, and text, with editing tools built in, every major provider at list price, and self-hosting plus local models.",
      },
      {
        question: "Does NodeTool do real-time generation like Krea?",
        answer:
          "Not in the same instant, interactive way — Krea is purpose-built for real-time renders. NodeTool is built for composing and editing workflows: you wire up multi-step pipelines across different media and run them, rather than watching a single image resolve live.",
      },
      {
        question: "Is NodeTool cheaper than Krea?",
        answer:
          "NodeTool runs on your own keys — you pay each provider their list price with your own keys, with no subscription or credit markup, and Studio itself is free and open source. Whether that's cheaper depends on your usage, but there's no platform margin on top of the model cost.",
      },
    ],
    limitation:
      "Krea is a closed, credit-based hosted studio focused on real-time renders — no self-hosting, no your own keys, and it's image/video only.",
  },
  {
    slug: "lm-studio",
    name: "LM Studio",
    seo: {
      title: "LM Studio Alternatives for Local AI Workflows | NodeTool",
      description:
        "Compare local and open-source LM Studio alternatives for Windows and other platforms. See how NodeTool connects local models to agents, documents, and media workflows.",
    },
    theme: "emerald",
    category: "Local language model runtime",
    isNew: true,
    og: {
      image: "screen_llms.png",
      accent: "emerald",
      subtitle: "Run local models, then build the whole workflow around them.",
    },
    heroParagraph:
      "LM Studio lets you download local models, chat with documents, connect MCP tools, and serve models through an API. NodeTool focuses on editable creative projects: its visual workflows connect local models to image, video, audio, and document-processing steps, with agents that can edit the canvas.",
    competitorTagline: "Desktop local-language model runtime",
    competitorBullets: [
      "Polished model browser and one-click local language models",
      "OpenAI-compatible local server",
      "Chat with models and local documents",
      "MCP tool support",
      "Proprietary (free), text-language model focused",
    ],
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Local models via Ollama, MLX, and llama.cpp",
      "Plus native image, video, and music generation",
      "Agents, document search, and multi-step workflows on one canvas",
      "Agent-first: describe the workflow and an agent builds and runs it",
      "Open source under AGPL-3.0, your own keys for cloud models",
    ],
    rows: [
      { label: "Local language model chat & model browser", competitor: "Purpose-built, polished", nodetool: "Supported via Ollama/MLX/llama.cpp" },
      { label: "OpenAI-compatible local server", competitor: true, nodetool: "Via provider integrations" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Agents and document search", competitor: "Document chat and MCP tools", nodetool: "Editable agent and retrieval workflows" },
      { label: "Cloud providers (your own keys)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Proprietary (free)", nodetool: "AGPL-3.0 (open source)" },
      { label: "Visual canvas", competitor: false, nodetool: true },
    ],
    explainerHeading: "The runtime, and the workflow around it",
    explainerParagraph:
      "LM Studio is a focused choice for downloading local models, chatting with documents, connecting MCP tools, and serving an OpenAI-compatible endpoint. NodeTool can use local models in a visual workflow alongside retrieval, image, video, and audio steps. Its agents can build and revise that workflow, and its editors keep the resulting media in an editable project.",
    ctaHeading: "From local chat to full workflow.",
    ctaParagraph:
      "Download Studio and put your local models on a canvas with generation, agents, and document search.",
    faq: [
      {
        question: "What is the difference between NodeTool and LM Studio?",
        answer:
          "LM Studio is a desktop app specialized in running local GGUF language models — model browser, chat UI, and an OpenAI-compatible local server. NodeTool is an open source visual canvas that also runs local models (via Ollama, MLX, and llama.cpp) and additionally generates image, video, and music and builds agents and document search workflows around them.",
      },
      {
        question: "Should I use LM Studio or NodeTool for local models?",
        answer:
          "If you mainly want to download a local language model and chat with it, or serve it over an OpenAI-compatible endpoint, LM Studio is the more specialized tool. If you want to build workflows around local (and cloud) models — retrieval, agents, media generation — NodeTool is the canvas for that.",
      },
      {
        question: "Is NodeTool open source?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and runs as a desktop app on macOS, Windows, and Linux. LM Studio is free but proprietary.",
      },
    ],
    limitation:
      "LM Studio supports document retrieval and MCP tools, but its desktop interface centers on local-model chat and serving. NodeTool centers on editable creative workflows and media production.",
  },
  {
    slug: "jan",
    name: "Jan",
    theme: "blue",
    category: "Local language model runtime",
    isNew: true,
    og: {
      image: "screen_chat.png",
      accent: "blue",
      subtitle: "Open and local-first — plus generation, agents, and document search on one canvas.",
    },
    heroParagraph:
      "Jan makes one promise and keeps it: a private, offline chat with a local model, in an app that's fully open source. NodeTool shares the open, local-first values and asks a bigger question — what happens after the chat? On its canvas the same local models, run via Ollama, MLX, and llama.cpp, drive image, video, and music generation, agents, and document search on one graph, and an agent can build that graph for you.",
    competitorTagline: "Open source local chat app",
    competitorBullets: [
      "Offline-first, private local language model chat",
      "Clean local ChatGPT-style UI",
      "Open source and self-hostable",
      "Text and language model chat focused",
    ],
    nodetoolTagline: "The open AI canvas",
    nodetoolBullets: [
      "Local models via Ollama, MLX, and llama.cpp",
      "Native image, video, and music generation",
      "Agents, document search, and multi-step workflows on one canvas",
      "Agent-first: describe the workflow and an agent builds and runs it",
      "Open source under AGPL-3.0, your own keys for cloud models",
    ],
    rows: [
      { label: "Local language model chat", competitor: "Purpose-built, offline-first", nodetool: "Supported, plus workflows" },
      { label: "Offline / privacy focus", competitor: "Offline-first by design", nodetool: "Local models supported" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Agents, document search, multi-step workflows", competitor: false, nodetool: true },
      { label: "Cloud providers (your own keys)", competitor: "Optional", nodetool: "Every major provider" },
      { label: "Open source", competitor: true, nodetool: true },
      { label: "Visual canvas", competitor: false, nodetool: true },
    ],
    explainerHeading: "A great chat app, or a whole canvas",
    explainerParagraph:
      "Jan does one thing well and openly: private, offline-first chat with local models, with a UI that feels like a local ChatGPT. If that's what you want, Jan is a lovely, focused choice and fully open source. NodeTool aims wider: it runs the same local models via Ollama, MLX, and llama.cpp, but puts them on a visual canvas alongside native image, video, and music generation, agents, and document search — so a local model can drive a whole workflow, not just a chat window. It's agent-first too: describe the workflow and an agent builds it, runs it, and repairs what fails. Both are open source; the difference is scope.",
    ctaHeading: "Take local models past the chat window.",
    ctaParagraph:
      "Download Studio and build workflows around your local and cloud models.",
    faq: [
      {
        question: "What is the difference between NodeTool and Jan?",
        answer:
          "Jan is an open source, offline-first desktop app focused on chatting with local language models. NodeTool is an open source (AGPL-3.0) visual canvas that runs local models too, and additionally generates image, video, and music and builds agents and document search workflows around them.",
      },
      {
        question: "Are both NodeTool and Jan open source?",
        answer:
          "Yes. Jan is open source and offline-first; NodeTool is open source under AGPL-3.0 and runs as a desktop app on macOS, Windows, and Linux with local-model support plus your own keys cloud providers.",
      },
      {
        question: "Can NodeTool run fully offline like Jan?",
        answer:
          "NodeTool can run local models via Ollama, MLX, and llama.cpp for offline language model and media work. Cloud provider nodes need network access, but you choose which models are local and which are cloud.",
      },
    ],
    limitation:
      "Jan is a focused local chat app — no media generation and no multi-step agent or document search workflows.",
  },
  {
    slug: "lindy",
    name: "Lindy",
    theme: "violet",
    category: "Agent automation",
    isNew: true,
    og: {
      image: "screen_workflow.png",
      accent: "violet",
      subtitle: "When the agent's job is to create — image, video, music — not just plumb ops.",
    },
    heroParagraph:
      "Lindy's agents live in your inbox, your calendar, and your CRM, quietly handling the operations work nobody wants. But ask one for the campaign itself — the images, the video, the soundtrack — and you've left what the platform is built for. NodeTool is an open-source, bring-your-own-key canvas where the AI work is the deliverable: native image, video, and music generation, agents, and document search on one visual canvas, with an agent that builds the pipeline from your description.",
    competitorTagline: "Hosted business-ops agents",
    competitorBullets: [
      "Assistants for operations work, built without code",
      "Deep business-app integrations",
      "Hosted, closed source",
      "Billed in tasks/credits + seats",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation",
      "Agents and document search on the same canvas as generation",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — local models supported",
    ],
    rows: [
      { label: "Focus", competitor: "Business-ops automation", nodetool: "AI generation + agents" },
      { label: "Business-app integrations", competitor: "Deep, prebuilt", nodetool: "AI-focused set" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0 (open source)" },
      { label: "Pricing model", competitor: "Tasks/credits + seats", nodetool: "Your keys, provider prices" },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Ops plumbing, or creative production",
    explainerParagraph:
      "Lindy is strong where its integrations are strong: wiring an assistant into your inbox, calendar, and CRM to handle repetitive operations, all hosted and built without code. If the job is ops automation across business apps, that prebuilt depth is a real advantage. NodeTool is built for a different job — producing things with AI. Image, video, and music models sit on the same canvas as agents and document search, with editing tools built in, and the workspace is agent-first: describe the pipeline and an agent authors it, runs it, and repairs what fails. Every call is made with your own keys at provider prices, and the whole workspace is open source under AGPL-3.0 with local-model support and a desktop app.",
    ctaHeading: "Put creation on the canvas.",
    ctaParagraph:
      "Download Studio and build agents that generate image, video, and music.",
    faq: [
      {
        question: "What is the difference between NodeTool and Lindy?",
        answer:
          "Lindy is a hosted, closed-source platform for AI assistants that automate business operations like email, scheduling, and CRM. NodeTool is an open-source (AGPL-3.0) visual canvas, run on your own keys, focused on AI generation — image, video, and music — plus agents and document search, with a desktop app and local-model support.",
      },
      {
        question: "When should I pick Lindy instead of NodeTool?",
        answer:
          "When the job is automating business operations with deep prebuilt integrations into your inbox, calendar, and CRM. That's what Lindy is built for. NodeTool is the better fit when the workflow's output is AI-generated media or creative agent work.",
      },
      {
        question: "Is NodeTool open source, and does it run on your own keys?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0 and your own keys — you connect your own provider keys and pay list prices, with no per-task credits or platform markup, and you can run local models on your own hardware.",
      },
    ],
    limitation:
      "Lindy is a closed, hosted ops-automation platform — no native media generation, and billed in tasks and seats.",
  },
  {
    slug: "gumloop",
    name: "Gumloop",
    theme: "amber",
    category: "Workflow automation",
    isNew: true,
    og: {
      image: "screen_workflow.png",
      accent: "amber",
      subtitle: "When the workflow's output is generated media — not a business process.",
    },
    heroParagraph:
      "Gumloop will move your data through a business process without a line of code — prebuilt nodes, broad SaaS integrations, all hosted. But a process that ends in a spreadsheet is a different job from a workflow that ends in a finished video. NodeTool is an open-source, bring-your-own-key canvas built for the second job: native image, video, and music generation, agents, and document search on one visual canvas, with an agent that builds the pipeline from your description.",
    competitorTagline: "Hosted automation, no code required",
    competitorBullets: [
      "Prebuilt nodes for business automation",
      "Broad SaaS integrations",
      "Hosted, closed source",
      "Billed in credits + seats",
    ],
    competitorBulletTone: "negative",
    nodetoolTagline: "The AI-native canvas",
    nodetoolBullets: [
      "Native image, video, and music generation",
      "Agents and document search on the same canvas as generation",
      "Agent-first: describe the pipeline and an agent builds and runs it",
      "Open source under AGPL-3.0, desktop app included",
      "Your own keys at provider prices — local models supported",
    ],
    rows: [
      { label: "Focus", competitor: "Business-process automation", nodetool: "AI generation + agents" },
      { label: "Prebuilt integrations", competitor: "Broad SaaS library", nodetool: "AI-focused set" },
      { label: "Native media generation (image, video, music)", competitor: false, nodetool: true },
      { label: "Editing tools (masks, inpaint, relight, layers)", competitor: false, nodetool: true },
      { label: "Source", competitor: "Closed", nodetool: "AGPL-3.0 (open source)" },
      { label: "Pricing model", competitor: "Credits + seats", nodetool: "Your keys, provider prices" },
      { label: "Desktop app + local models", competitor: false, nodetool: true },
    ],
    explainerHeading: "Process automation, or media production",
    explainerParagraph:
      "Gumloop is good at what it's built for: automating business processes without writing code, with prebuilt nodes and broad SaaS integrations that get an ops workflow running fast and hosted. If that's the job, its integration library is a real edge. NodeTool is built to produce, not just process — image, video, and music models on the same canvas as agents and document search, editing tools built in, and an agent-first workspace where an agent authors the workflow, runs it, and repairs what fails. Every call is made with your own keys at provider prices, and the whole workspace is open source under AGPL-3.0 with local models and a desktop app.",
    ctaHeading: "Automate the creation itself.",
    ctaParagraph:
      "Download Studio and build workflows that generate image, video, and music.",
    faq: [
      {
        question: "What is the difference between NodeTool and Gumloop?",
        answer:
          "Gumloop is a hosted, closed-source platform for business-process automation with prebuilt nodes and SaaS integrations. NodeTool is an open-source (AGPL-3.0) visual canvas, run on your own keys, focused on AI generation — image, video, and music — plus agents and document search, with a desktop app and local-model support.",
      },
      {
        question: "When should I pick Gumloop instead of NodeTool?",
        answer:
          "When the job is automating a business process across SaaS tools with ready-made integrations that need no code. That's Gumloop's strength. NodeTool is the better fit when the workflow's output is AI-generated media or creative agent work you want to own and self-host.",
      },
      {
        question: "Is NodeTool open source and self-hostable?",
        answer:
          "Yes. NodeTool is open source under AGPL-3.0, self-hostable, and your own keys — you pay providers directly at list prices with no credits or platform markup, and you can run local models on your own hardware.",
      },
    ],
    limitation:
      "Gumloop is a closed, hosted process-automation platform — no native media generation, and billed in credits and seats.",
  },
];

/** Look up a competitor by slug. */
export function getCompetitor(slug: string): Competitor | undefined {
  return competitors.find((c) => c.slug === slug);
}

/**
 * The two-sentence answer that opens a `/vs` or `/alternatives` page, directly
 * under the H1: what the other tool is, then what NodeTool is. Built from the
 * record's own fields so it never states more than the page already claims,
 * and short enough to be quoted whole.
 */
export function shortAnswer(c: Competitor): string {
  const article = /^[aeiou]/i.test(c.competitorTagline) ? "an" : "a";
  const tagline =
    c.competitorTagline.charAt(0).toLowerCase() + c.competitorTagline.slice(1);
  return `${c.name} is ${article} ${tagline}. NodeTool is an open-source creative workspace for image, video, audio, and text workflows, with agents, desktop or self-hosted deployment, and your own provider accounts.`;
}

/**
 * Sibling comparison links for the in-content ComparisonMesh — every competitor
 * except the current one. Same
 * category first, so the most relevant comparisons lead.
 */
export function siblings(slug: string): Competitor[] {
  const current = getCompetitor(slug);
  const others = competitors.filter((c) => c.slug !== slug);
  if (!current) return others;
  return [...others].sort((a, b) => {
    const aSame = a.category === current.category ? 0 : 1;
    const bSame = b.category === current.category ? 0 : 1;
    return aSame - bSame;
  });
}

/**
 * The tool list for an `/alternatives/<slug>` page: NodeTool first (the
 * recommended alternative), then same-category rivals, capped at six entries.
 */
export function alternativesFor(slug: string): {
  name: string;
  href: string | null;
  note: string;
  isNodetool: boolean;
}[] {
  const current = getCompetitor(slug);
  const nodetool = {
    name: "NodeTool",
    href: null,
    note: current
      ? `An open-source canvas for image, video, audio, and text that runs on your own keys — the ${current.category.toLowerCase()} alternative you can host yourself.`
      : "An open-source canvas for image, video, audio, and text that runs on your own keys.",
    isNodetool: true,
  };
  const rivals = siblings(slug)
    .slice(0, 5)
    .map((c) => ({
      name: c.name,
      href: `/alternatives/${c.slug}`,
      note: c.competitorTagline,
      isNodetool: false,
    }));
  return [nodetool, ...rivals];
}

const YEAR = yearToken();

/**
 * `/alternatives/*` page entries for the registry, sitemap, and smoke suite.
 *
 * One record, one page. The `/vs/<slug>` twin this engine used to emit is gone
 * (2026-08-10): both routes generated from this same array, so they competed for
 * one query set, and `/alternatives` won 11 of the 12 head-to-head pairs — 4,817
 * impressions to 1,117 (SEO_STRATEGY.md § 0.10, finding 3). `/vs/<slug>` now
 * 301s here from `next.config.mjs`, and the head-to-head copy it owned (the
 * at-a-glance cards and the explainer) is rendered on this page instead, so the
 * "NodeTool vs X" queries keep their on-page support. The `vs*` fields below are
 * still the source of that copy — they name the section, not a route.
 */
export const alternativesEntries: PageEntry[] = competitors.map((c) => ({
  route: `/alternatives/${c.slug}`,
  title: `${c.name} alternatives (${YEAR}) — why teams choose NodeTool`,
  description: `${c.limitation} Compare NodeTool and other ${c.category.toLowerCase()} alternatives — open source, your own keys, one canvas for image, video, audio, and text.`,
  priority: c.isNew ? 0.6 : 0.7,
  changeFrequency: "monthly",
  indexable: true,
}));

/** The comparison engine's contribution to the registry. */
export const competitorEntries: PageEntry[] = alternativesEntries;

/**
 * Footer "Compare" column, derived from the data module. The established
 * competitors (not first-wave additions) keep the footer tidy.
 */
export const footerCompareLinks: { name: string; href: string }[] = competitors
  .filter((c) => !c.isNew)
  .map((c) => ({
    name: `vs ${c.footerName ?? c.name}`,
    href: `/alternatives/${c.slug}`,
  }));
