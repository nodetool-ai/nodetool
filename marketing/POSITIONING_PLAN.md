# NodeTool Positioning Strategy & Execution Plan

Consolidated from the positioning, use-case, landing-page, asset, and rollout
work sessions (August 2026). This is the single reference for how NodeTool is
positioned, who it is for, what the website says, and what ships in the next
two weeks. Companion docs: [NARRATIVE.md](NARRATIVE.md) (brand voice),
[PRODUCT.md](PRODUCT.md) (product facts), [docs/SEO_STRATEGY.md](../docs/SEO_STRATEGY.md).

> Every dollar figure in this document (SaaS stack totals, per-asset costs,
> savings percentages) is illustrative and must be re-verified against current
> provider list prices before it appears on the website.

---

## Part 1 — Positioning

### Market diagnosis

The generative AI market is past the single-cool-image phase. The bottleneck in
2026 is **orchestration and finishing**: a creator generates stills in
Midjourney, motion in Runway, voice in ElevenLabs, cuts in Premiere, and glues
it together with Zapier. Each hop loses prompts, seeds, and context, and each
tool charges a credit-pack markup over raw model cost.

Competing products cover one corner each:

- **Automation engines** (Zapier, Make, n8n) — strong on JSON and webhooks,
  no native media primitives.
- **LLM agent builders** (Dify, Flowise, Langflow) — strong on prompt
  chaining, treat media as URL attachments.
- **Creative point solutions** (Runway, Midjourney, ElevenLabs) — strong
  single-asset generation, no programmable logic, no batch orchestration,
  vendor-locked.
- **ComfyUI** — deep diffusion control, but image-centric, no timeline, no
  voice casting, no app builder, hard to run headless or share.

NodeTool's position is the gap between them: **deep generative media
production combined with programmable, deterministic workflow automation**.

### Category anchor and pitch

- **Category:** the open-source, agent-first creative studio — a programmable
  multimodal workspace.
- **Elevator pitch:** NodeTool is the open-source platform where creative
  teams, developers, and marketers orchestrate generative AI models,
  deterministic media editors (timelines, sketches, scripts, 3D), and web
  automations into reproducible workflows and standalone mini-apps.
- **Headline (outcome-first):** *"From prompt to final cut on one canvas."*

Audience-specific taglines:

| Audience | Angle |
| :--- | :--- |
| Creative technologists | "From prompt to final cut — automate the full creative pipeline." |
| Performance marketers | "Build self-running ad engines, not just single images." |
| Developers / technical ops | "ComfyUI's depth with a timeline, code sandboxes, and instant UI apps." |

### The four positioning pillars

1. **True multimodal surfaces.** Audio, video, sketches, and 3D are
   first-class editors, not attachments to text: Storyboards (shots +
   keyframes + clips), Timelines (multi-track NLE), Sketches (layered
   canvases), Scripts (multi-speaker voicing with stale-take tracking), and 3D
   scenes.
2. **Deterministic precision on top of generative output.** FFmpeg transforms,
   Fabric.js vector layers, canvas compositing, audio normalization, and
   automated visual QA (pairwise knockout, adherence scoring) turn
   probabilistic generation into production output.
3. **Graph-to-app.** The built-in App Builder turns a node graph into an
   interactive mini-app — forms, sliders, preview players — so non-technical
   operators run the workflow without seeing the graph or writing React.
4. **Visual and pro-code, symmetrically.** The same system is drivable from
   the visual canvas, the headless flow SDK (`@nodetool-ai/sandbox-flow`), the
   graph DSL (`@nodetool-ai/sandbox-dsl`), and CodeAct agents — plus 120+ MCP
   tools for external agents (Claude Desktop, Claude Code, Cursor).

### The moat, in three claims

1. **Agents drive real editors, not chat.** A chatbot leaves a transcript;
   a NodeTool agent places timeline clips, masks sketch layers, casts voices —
   and the user can take the wheel at any moment.
2. **Deterministic control is built in.** Production needs exact trims,
   exact colors, exact timing; NodeTool pairs every generative step with
   programmatic post-processing.
3. **BYOK economics.** No credit markup: users pay FAL, Replicate, KIE,
   OpenAI, and the rest at list price. When a provider drops its price, the
   user's cost drops the same day.

---

## Part 2 — Ideal customers and wedge use cases

| Segment | Pain | Winning wedge | Capabilities |
| :--- | :--- | :--- | :--- |
| Performance ad agencies & e-commerce | Manual creative-variant production across platforms and languages | Automated social ad engine: scrape competitor angles, draft scripts, voice them, generate clips, composite captions, export 9:16 videos | storyboards, timelines, scripts, Apify, FFmpeg |
| Creative studios & content creators | Fragmentation across Midjourney/Runway/ElevenLabs/Premiere | End-to-end pre-vis and production: script → shot list → keyframes → clips → assembled timeline | scripts, storyboards, timelines, media critique |
| AI engineers & product teams | Weeks to build internal media tools from scratch | Chain models through one API surface and ship an internal mini-app in hours | apps, workflows, sandbox DSL |
| Enterprise brand & marketing ops | Inconsistent AI output, no brand compliance | Autonomous brand QA loops: generate, grade, score adherence against guidelines in a collection, iterate on failures | collections (RAG), image adjustment, adherence scoring |

### Use-case catalog (feeds templates, demos, and SEO pages)

**Creative & video production**

- **Social ad variant engine** — brief or product URL → competitor angle
  research (SerpAPI/Apify) → 5 script variants → voiceovers → keyframes →
  animated clips → 9:16 timelines with synced subtitles and CTA overlays.
- **Educational explainer builder** — long-form PDF/markdown → lesson modules
  → multi-speaker dialogue scripts → Fabric diagrams → compiled explainer
  timelines.
- **Podcast/video repurposing** — long recording → transcription → engagement
  analysis → extracted snippets → kinetic-typography shorts for
  YouTube/Reels/TikTok.

**Quality control & visual iteration**

- **Brand asset QA pipeline** — generate N candidates → pairwise knockout +
  adherence scoring with a vision model against brand guidelines in a
  collection → iterate on failures.
- **E-commerce visual factory** — scraped catalog images → background removal
  → layered sketch compositions with Fabric badges → multi-ratio banner
  export (1:1, 16:9, 9:16).

**Mini-apps**

- **Localized video generator** — marketing team inputs city, language,
  discount; the app fetches local footage, translates the script, voices it,
  adjusts overlays, previews instantly.
- **Creative director / moodboard suite** — prompt → narrative pitch,
  character and environment sketches, assets indexed into a project
  collection for team RAG search.

**Research & intelligence**

- **Competitor video breakdown** — monitored scrapers pull competitor ads →
  video understanding + OCR extract messaging, pacing, style → structured
  takeaways to memory and Sheets.
- **Regulatory redlining engine** — PDF specs → vector collection →
  multi-step LLM audit → markdown/PDF report with diffs and checklists.

**Operational workflows**

- **Personalized multimodal outreach** — scrape a lead's site → tailored
  email + rendered 3D product mockup → Gmail draft with Drive attachments.
- **Visual bug-report summarizer** — screen recordings from support channels
  → video understanding + transcription → structured tickets with annotated
  frame grabs.

---

## Part 3 — Competitive matrix

Use these differentiators verbatim on `/compare/*` pages.

| Dimension | NodeTool | ComfyUI | Zapier / Make / n8n | Runway / Midjourney | Langflow / Flowise / Dify |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Media depth | Full suite: video, audio, image, text, 3D, with editors | Diffusion images; little native editing | Text/JSON payloads | Siloed single-asset generation | Media as URL attachments |
| Timeline editing | Native multi-track NLE, generation at the playhead | None | None | Web editor, not scriptable/batchable | None |
| Script-to-voice | Native multi-speaker casting, stale-take tracking | None | Basic TTS API node | Per-tool | None |
| App deployment | Built-in visual app builder | Brittle wrappers | Forms only | Closed SaaS | Chat UIs |
| Pricing | Open source + BYOK, no markup | Open source | Task-execution tiers | Credit packs | Mixed |
| Agent/MCP support | 120+ MCP tools + CodeAct | Community scripts | Webhooks | Closed | LLM chains only |
| Deployment | Desktop (offline) or cloud | Local only | Cloud/self-hosted | Cloud only | Self-hosted |

Comparison-page punchlines:

- **vs ComfyUI:** "ComfyUI is an image generator. NodeTool is the whole
  studio." (No timeline, no voice casting, no app builder, Python environment
  wrangling.)
- **vs Zapier/Make/n8n:** "Built for pixels and waveforms, not just JSON."
- **vs Runway/Midjourney/Firefly:** "Zero vendor lock-in. When a better model
  drops tomorrow, switch in one click."
- **vs Langflow/Flowise/Dify:** "True multimodal execution, not text chains
  with attachments."

---

## Part 4 — Landing page blueprint (nodetool.ai)

### Page architecture

1. **Hero** — "From prompt to final cut on one canvas" + interactive 3-step
   pipeline demo + dual CTA.
2. **The pain grid** — "The five-tab tax": fragmented stack vs. one canvas.
3. **The five creative surfaces** — interactive tabs: Storyboard, Script &
   Voice, Timeline, Sketch, 3D.
4. **Graph-to-app** — node graph on the left, generated mini-app on the right.
5. **Developer & agentic power** — MCP, headless flow SDK, DSL, sandboxed code.
6. **BYOK ROI calculator** — interactive SaaS-stack vs. wholesale-API cost
   comparison.
7. **Competitive battleground** — matrix + links to `/compare/*` pages.
8. **Template gallery + social proof** — 1-click cloneable recipes.
9. **Final CTA + footer.**

### Hero section

- **Badge:** `Open Source (AGPL-3.0) · Local-First · BYOK Direct Pricing`
- **Headline:** **From prompt to final cut on one canvas.**
  (Adopted; [NARRATIVE.md](NARRATIVE.md) pins the same line, and the homepage
  H1 carries it.)
- **Subhead:** *Stop juggling Midjourney, Runway, ElevenLabs, and Premiere.
  NodeTool combines visual AI models, a multi-track timeline, layered
  sketching, and scripts into one open-source workspace you drive manually or
  through autonomous agents.*
- **CTAs:** `Download NodeTool Studio (Free)` / `Try Instant Cloud Alpha`
- **Visual:** interactive or looping 3-state demo — brief prompt → agent
  builds storyboard, casts voices, places clips on the timeline → finished
  video playback with captions.

Rationale: "The agent-first creative workspace" is abstract for first-time
visitors — lead with the outcome and let "agent-first" be shown, not asserted.
It stays as the category descriptor in `<title>`, meta descriptions, schema,
and body copy, per NARRATIVE.md.

### The five surfaces (tab copy, condensed)

| Tab | One-line concept | Proof points |
| :--- | :--- | :--- |
| Storyboard | "Pre-vis before you spend" — stills cost cents, clips cost dollars | Auto shot lists; persistent character/style entities; in-place shot revision; automated critique and knockout scoring |
| Script & Voice | "The script is the source of truth; audio is derived" | Per-character voice casting; multi-take auditioning; edits flag only the changed takes as stale |
| Timeline | "Generate at the playhead" | Multi-track video/audio/overlay/text; word-level subtitle sync; FFmpeg export; one-click assembly from storyboard and script |
| Sketch | "Pro image editing meets diffusion" | Layers, blend modes, masks; in-layer inpainting; Fabric SVG badges and typography |
| 3D | "Deterministic spatial composition" | Primitives, cameras, lights; capture views as depth/composition references for image and video models |

### Two under-promoted capabilities to elevate

1. **App Builder** — currently buried. Give it a top-tier section: "Package
   any graph into a mini-app for your team in minutes." Show graph → app
   split view; note the agent QA pass (validated bindings, simulated clicks)
   and single-file bundle distribution.
2. **MCP support** — currently an FAQ item. Give it a badge and a section:
   "Drive NodeTool from Claude, Cursor, or your terminal — 120+ creative
   tools over MCP."

### Use cases as recipe cards

Replace the current feature-named use cases with outcome-named recipe cards
carrying a real cost estimate (verify numbers before publishing):

| Recipe | Problem solved | Pipeline | Indicative cost |
| :--- | :--- | :--- | :--- |
| Localized ad engine | Re-voicing 20 video ads takes days | Master video → transcribe → translate → localized voiceover → synced subtitles | ~$0.35 / video |
| Storyboard-to-animatic | Paying for video clips nobody approved | Brief → keyframe gallery (cents) → approve stills → animate → export | ~$1.20 total |
| E-commerce visual factory | Manual banner production per SKU | Product image → background removal → vector badges → multi-ratio export | ~$0.04 / SKU |

### BYOK ROI calculator

Replace the static cost-dashboard screenshot with an interactive calculator:
sliders for monthly image/video/voice volume, side-by-side totals for a
typical multi-SaaS stack vs. wholesale API cost through NodeTool, and an
animated savings readout. Callout: *"When a provider drops their API price,
your cost drops immediately."* All stack prices must be sourced and dated.

---

## Part 5 — Asset production checklist

### Motion and video (launch blockers)

| Asset | Spec | Placement |
| :--- | :--- | :--- |
| Hero 3-stage pipeline reel | ~15 s loop, 60 fps, 16:9 MP4/WebM + 9:16 cut | Hero |
| Surface micro-demos ×5 | 5–8 s silent 1080p loops, one per surface | Surfaces tabs |
| "Five-tab chaos" animation | ~5 s Lottie/WebM, fragmented tabs vs. one canvas | Pain grid |

### Interactive components (engineering)

| Component | Description | Placement |
| :--- | :--- | :--- |
| BYOK ROI calculator | Volume sliders → live SaaS vs. wholesale comparison | Pricing section |
| Graph-to-app split slider | Scrub between node graph and generated mini-app | App Builder section |
| Model quality & cost leaderboard preview | Live price/latency table across FAL, KIE, Replicate, OpenAI | Pricing / footer |

### Template gallery bundles

Each recipe ships with a finished sample output, a downloadable workflow
bundle, and a tutorial card:

1. **Viral video ad engine** — sample 9:16 ad with kinetic captions +
   storyboard layout image.
2. **Multilingual video dubber** — split-screen original vs. dub with synced
   subtitles.
3. **E-commerce SKU factory** — before/after banner set in three ratios.
4. **Storyboard-to-trailer** — 30 s teaser + 6-shot contact sheet.

### Developer and brand assets

- MCP architecture diagram (SVG, dark theme): Claude Desktop / Cursor /
  terminal → NodeTool MCP server → studio tools and execution engine.
- Headless flow code card: `@nodetool-ai/sandbox-flow` pipeline in ~5 lines.
- GitHub README banner (1280×640) with badges: AGPL-3.0, Local-First, BYOK,
  MCP-Ready.
- OG cards (1200×630): main headline, comparison angle, MCP angle.
- Product Hunt gallery slides (5 × 16:9) and badge suite.

---

## Part 6 — Execution plan

### Timeline

| Phase | Days | Focus |
| :--- | :--- | :--- |
| 1 — Foundation | 1–3 | Copy deck signoff, design tokens, recipe prep, analytics plan |
| 2 — Asset sprint | 4–7 | Screen recordings, motion loops, diagrams, template bundles |
| 3 — Web build | 8–11 | Hero, calculator, tabs, recipe gallery, comparison pages |
| 4 — QA & launch | 12–14 | Cross-device QA, Core Web Vitals, README, launch blast |

### Workstreams and tasks

**W1 — Creative & motion assets**

Rendered by the demo harness from real product casts, not mocked up.
`demo/src/hero/` holds the compositions; the outputs live in
`marketing/public/`. Re-render with `npm run render:hero`,
`render:hero:vertical`, `render:surfaces`, `render:tab-chaos` in `demo/`.
The homepage's `SurfaceShowcase` plays the five loops (W2).

- [x] Hero 3-stage pipeline video — `hero-pipeline.{mp4,webm}` (16:9) and
      `hero-pipeline-vertical.{mp4,webm}` (9:16), 15 s silent loop, ~2.5 MB
      each, WebP posters alongside
- [x] Five surface micro-loops — `surface-storyboard`, `surface-script`,
      `surface-timeline`, `surface-sketch`, `surface-3d`, 6 s each. Sketch
      needed a renderer fix: its WebGPU display canvas reads back empty when
      screenshotted outside the frame it was drawn in, so the demo surface
      asks for the Canvas2D path (`preferCanvas2d`). 3D has no cast — a scene
      sits still and what moves is the camera, so the loop drives the editor's
      `cameraPose` over a scene `scripts/build-3d-cast-scene.ts` builds with
      the product's own `edit_model3d` operations. It renders with
      `--gl=angle`.
- [x] Five-tab chaos animation — `tab-chaos.{mp4,webm}`, 8.5 s, the windows
      collapse into the real canvas
- [x] MCP architecture schematic — `public/diagrams/mcp-architecture.svg`
- [x] GitHub banner — `public/github-banner.png` (1280×640)
- [x] Headless flow code card — `public/diagrams/code-card-flow-sdk.svg`
- [x] OG cards — generated per route by `src/lib/og.tsx`, so every page ships
      its own 1200×630 card. The root card now carries the adopted headline,
      and the comparison angle is `/alternatives/[slug]`. The MCP angle has no
      card because it has no page yet; that is W2 content, not an asset.
- [x] Product Hunt gallery — five 1270×760 slides in `public/product-hunt/`,
      one claim each over a real screenshot, from
      `scripts/generate-brand-assets.mjs`. The badge suite is an embed Product
      Hunt mints after launch, not something to draw here.

The three static assets are generated by
`marketing/scripts/generate-brand-assets.mjs`, so a fact that changes in the
repo changes the artwork in the same diff.

**W2 — Frontend & web engineering**

- [x] Hero overhaul — a dismissible announcement bar above the header
      (`--announce-h` offsets the fixed nav and pads the body, so every page's
      own clearance keeps working), a dual CTA of Download / Try the Cloud
      alpha, and the W1 hero reel in place of the static screenshot. The
      poster stays a plain `<img>` with a srcSet and high fetch priority — a
      `<video poster>` carries neither — and the reel mounts only when the
      hero scrolls into view.
- [x] BYOK ROI calculator — `ByokCalculator`, client-side, per-line model
      breakdown. Unit prices come from `calculatorPricing.generated.ts`, which
      `scripts/generate-calculator-pricing.mjs` reads out of the GenSpend
      catalog NodeTool bills a run against, so the page cannot quote a price
      the product does not charge. The resale comparison is a multiplier the
      reader sets, not a claim about a named competitor.
- [x] Graph-to-app widget — `GraphToAppSplit`, the same shipped example seen
      twice: the generated template graph, then the mini app that binds that
      workflow. Stacked rather than a drag-to-reveal split, because the two
      assets share no aspect ratio (a wide graph against a tall app page) and
      one frame either crops the app mid-sentence or shrinks it to a column.
- [x] Five-surface tab showcase — `SurfaceShowcase`, one tab per editor over
      its W1 loop, deep-linkable as `#surface-<id>`. The long-form sections
      keep their own `#storyboard`-style anchors; these are separate ids.
- [x] Comparison pages — all four exist, on `/alternatives/<slug>`, and
      `/compare/vs-<slug>` redirects there. A third prefix over the same copy
      is what the `/vs` → `/alternatives` consolidation already measured
      against (`docs/SEO_STRATEGY.md` § 0.10: 4,817 impressions to 1,117).
      ComfyUI, n8n, and Figma Weave were already written; Runway is new.

**W3 — Template gallery**

- [ ] Recipe 1: viral video ad engine (workflow bundle + sample ad + tutorial)
- [ ] Recipe 2: multilingual video dubber
- [ ] Recipe 3: e-commerce SKU visual factory
- [ ] Recipe 4: storyboard-to-trailer

**W4 — Developer hub**

- [ ] MCP quickstart: Claude Desktop / Claude Code / Cursor in under 3 minutes,
      plus the top 10 tools
- [ ] Headless flow SDK guide with runnable examples
- [ ] Live model leaderboard preview

**W5 — QA & launch**

- [ ] Core Web Vitals: LCP < 1.8 s, lazy-load non-hero media, AVIF/WebP
- [ ] Conversion tracking: `download_studio_click`, `launch_cloud_click`,
      `calculator_interaction`, `recipe_clone_click`, `github_star_click`
- [ ] README rewrite with new badges and feature GIFs
- [ ] Product Hunt launch, X/LinkedIn teardown thread ("the five-tool creative
      AI stack is broken"), Discord workshop on driving NodeTool over MCP

### Launch-day priority (if only four things ship)

1. Hero pipeline video
2. Five surface micro-loops
3. BYOK calculator
4. GitHub banner + main OG card

---

## Part 7 — Growth loops

1. **Template-led growth.** Every recipe page ranks for a high-intent query
   ("automate video ad variations", "open source Runway alternative") and
   clones in one click.
2. **Replace-your-stack narrative.** Side-by-side cost and time comparisons
   against the multi-subscription stack, backed by the calculator.
3. **Developer flywheel.** Position NodeTool as the creative execution backend
   for the agent ecosystem: "give your coding agent the ability to generate
   and edit video," promoted through the MCP server and GitHub.
4. **Benchmark authority.** An un-gated live leaderboard
   (`nodetool.ai/leaderboard`) comparing cost, latency, and adherence across
   video and image models establishes NodeTool as the neutral routing layer.

---

## Open items

- Verify every price figure (SaaS plans, wholesale API costs, per-recipe
  estimates) against current list prices; date the sources on the page.
- Fix the MCP tool count. The copy says "120+" (and "around 120" on
  `/agents`, `/developers`, and in `siteSchema.ts`); neither number matches
  the registry. `packages/cli/src/harness/capability-table.ts` — generated
  from the live registry by `npm run capabilities:sync` — lists **217**
  agent capabilities. The MCP mount itself registers far fewer *direct*
  tools: `registerAgentMcpTools` promotes a small set and publishes the rest
  through the sandbox catalog at `nodetool://capabilities`
  (`packages/websocket/src/mcp-agent-tools.ts`). So "120+ MCP tools"
  undercounts the capability surface and overcounts the tool list a client
  sees. Pick one claim and name what it counts.
- Decide cloud CTA wording ("Instant Cloud Alpha" vs. current naming).
- Community numbers ("5,000+ creators on Discord") must match reality or be
  dropped.
