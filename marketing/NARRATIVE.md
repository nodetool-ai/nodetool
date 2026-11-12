# Narrative

What the site says, in what order, and why. This file covers the message.
[docs/BRAND.md](../docs/BRAND.md) carries the repo-wide brand and verbal
guidelines: mission, voice, the four messaging pillars, and the lexicon.
`PRODUCT.md` covers brand, users, and design principles. `POSITIONING_PLAN.md`
covers the competitive positioning, landing-page blueprint, and launch plan.
[site-editorial.spec.md](site-editorial.spec.md) says which page owns which
argument and what each page leaves out.

When page copy and this file disagree, one of them is wrong. Fix both in the
same change. The page is edited more often than this file, so when in doubt
the page is the newer of the two. Bring the doc up to it, then fix the page.

The homepage, README, and docs share the primary tagline and intro in
`BRAND.md`. On the homepage the tagline is the line above the `<h1>`, and the
`<h1>` reads: "Create with AI. Make it your own."
The hero paragraph introduces the AI video editor and node-based workflows.
Below the demo, six linked cards cover timeline and node workflows, agents,
media types, model choice, local projects and integrations. Each links to its
detailed page. The lower strip covers plans and provider costs.
The homepage editor showcase omits experimental game creation.
The project section introduces the demo with "From an idea to a video you can edit."

## Shared copy

These lines appear on more than one surface. Change them everywhere at once.

| Line | Where it appears |
|---|---|
| "Open-source agent-first creative workspace" (tagline) | Homepage line above the `<h1>`, README title line, docs home `<h1>` |
| The intro ("Create images, video, audio, and text with agents…") | README, docs home lead, `BRAND.md` |
| "Create with AI. Make it your own." and its paragraph | Homepage `<h1>`, README under the intro |
| "Give Claude Code a creative harness." | `/agents` `<h1>`, README § MCP, docs home agents block |
| The plan table (ChatGPT, Claude, Gemini) | `SubscriptionSection` on `/pricing`, README, docs home |
| The category comparison rows | README § How NodeTool compares, docs `comparisons.md` |
| One line per shared fact | `SpecStrip` on `/`, `/agents`, `/studio` |

The page is the source for each row it shows. The README and the docs copy
it, shortened where a sentence depends on the page layout. The category
comparison rows left the homepage, so the README is now their source.

## The register

The site is written in the register the category leaders use on their product
pages: short declarative claims that end in a period, model breadth stated as
abundance rather than as a list, capability named as volume ("Dozens of tools.
Endless ways to create."), industry pages that say what they are ("AI for
Advertising") and nothing cleverer, an app grid where every tile is a verb,
node graphs introduced last as the power-user layer, and one CTA verb repeated
everywhere.

What that register does **not** contain, and neither does ours: a competitor's
name, a paragraph explaining why the alternative is worse, or a table the reader
must study before they have seen anything work. Confidence is stated by showing
the work, not by contrast. See [The argument we do not make](#the-argument-we-do-not-make).

Copy the grammar, never the sentences. Every claim below has to be one only
NodeTool can make.

## Positioning line

**Open-source agent-first creative workspace**

Create images, video, audio, and text with agents that work alongside you.
Describe what you want, let the agent build it, then take over whenever you
like.

Use "agent-first" in supporting copy to explain how agents build and revise
workflows and documents that creators can inspect and edit. Keep the homepage
metadata category-led: the `<title>` is "NodeTool | Open-source AI film studio,
agents, node workflows", which names the three homepage pillars in searched
words. The homepage pill above the `<h1>` speaks to creators:
"Open-source AI film studio · agent + node workflows". Edition and audience pages use
distinct headlines that answer the reason to choose that route: Studio makes
and revises production work, Cloud evaluates the workspace without an install,
and Agents builds reusable automation around editable artifacts.

Keep a setup line and a trust line under the homepage CTA. The setup line says
that Studio signs in with a ChatGPT or Claude plan or uses your own provider
keys at list price. The trust line says free, open source, and the supported
desktop platforms, and that the browser version is in alpha. Name AGPL-3.0 in
the FAQ, the footer, and on `/studio`, not in the hero. Keep "alpha" out of
button labels.

### The harness line

`/agents` speaks to people who already use a coding agent. Its eyebrow is
"Open-source creative harness" and its `<h1>` is "Give Claude Code a creative
harness." The page defines the word once: a harness is everything an agent
works inside, which is tools, editors, models, keys, and a record of each step.
NodeTool supplies all five, for the built-in agent or for Claude Code, Codex,
or Cursor over MCP.

Use "creative harness" on `/agents`, `/developers`, `/mcp`, and in the README
and docs sections about MCP and external agents. Do not use it as the homepage
category or in creator-facing copy, where "workspace" and "the agent" already
say it. Never stack it with the tagline ("agent-first creative harness
workspace").

## Message hierarchy

Everything below the hero earns its place by advancing one of three claims, in
this order of importance:

1. **A brief becomes a working project, fast.** Not chat that tells you what to
   do, and not a render you cannot reopen. The agent drafts, boards, renders,
   and cuts, and hands back a multi-track project you can still edit. Show the
   board appearing, the line re-voiced, the cut updating.
2. **You direct every detail of that project.** Storyboard, script, timeline,
   sketch, and 3D over the same files, so the answer to "what do I control once
   the agent has built something" arrives right after the agent does. The agent
   works those same surfaces when you send it back in with a note.
3. **Your plan, your keys, every model.** The agent runs on the ChatGPT,
   Claude, or Gemini plan the reader already pays for, and every other model
   runs on their own provider key at the provider's price. Abundance and
   ownership in one breath. It sits under the agent story rather than in front
   of it, because a reader who meets the model wall before they have seen the
   product reads us as a router. On the homepage it is one line in the spec
   strip.

Provider lists, node counts, tool counts, and architecture belong under those
claims, not next to them. The homepage gives a short overview and links to the
pages that explain each topic.

## Order of the page

Hero → **one shot changed, the rest of the cut kept** → **approve the still
before paying for the clip** → spec strip → FAQ → download.

[site-editorial.spec.md § Homepage](site-editorial.spec.md#homepage) holds the
five blocks and why each is there. Everything the homepage used to carry now
lives on the page that owns it: the editor tour and the films that open as
timelines on `/studio`, the ad library and recipes on `/marketing`, the plan
table on `/pricing`, models on `/models`, the node canvas on
`/node-based-workflows`, and comparisons on `/alternatives/*`.

Two rules produced that order:

**Show the backward edit.** The hero reel shows the forward pass, sentence in,
film out, which every hosted platform can also show. The second block shows
what they cannot: one note sends one shot back, and the cut keeps every other
shot.

**Keep the homepage useful on its own.** The overview cards summarize what
people can do. The download note explains provider accounts and local models.
The plans strip and five short FAQ answers cover costs, editions, setup and editing.
Contextual links lead to detail without requiring another page for the basics.

## Vertical pages

One page per industry, named flatly after the industry, in the form leading
platforms use: **AI for Advertising**, not a coined phrase. `/marketing` is that
page today and is reachable at `/ai-for-ads`.

The hero of an industry page has a fixed grammar:

1. **The industry name as the `<h1>`, plain.** "AI for advertising."
2. **One paragraph, two sentences.** The first names the outcome, from the
   first concept to the delivered asset. The second names the mechanism: the
   agent builds a workflow the team reruns. Do not add a list of benefits.
3. **Two credibility chips beside the CTA.** Each is a number or a set of
   names. Derive a number from the data that renders the proof, so it cannot
   drift. The advertising page counts `adRecipes` from `src/data/adLibrary.ts`
   and names the video models.
4. **The download CTA and one anchor to the proof below.**

The proof follows the hero directly. On the advertising page that is one
campaign end to end: the Directed Campaign Kit run, its three formats, and the
one revision note sent back. The ad library, storyboards, and recipes are
links under it.

A vertical page argues about the industry's job, never about a competitor.
What makes ours different from a hosted platform's is stated as fact in the
chips and the fact row ("on your keys", "Provider list prices"), never as a
grievance.

The current advertising paragraph shows the pattern:

> Take a product brief from the first concept to delivered ads in every
> format. Describe the campaign, and the agent builds a workflow you rerun for
> every SKU, market, and aspect ratio.

Advertising and marketing (`/marketing`) is the current industry vertical.

Game development (`/gamedev`) is the exception to the `<h1>` rule. Its hero
leads with the outcome, "Make a world people can play.", and then with the
shipped Kindle, Lumen, and Neon Drift games. Visitors can play a standalone
browser export, then open the same example in Studio to edit its art, levels,
and rules. Regenerate its browser exports with `npm run build:packages`, then
`npm --prefix marketing run gen:games`.

`/studio` is the desktop-edition page and `/agents` is the builder and
operator page. Film production remains a strong demonstration on both routes,
but it is not their product category.

## Product routes

- **Studio** answers whether a creator can make and revise production work. It
  recommends the desktop edition and ends on the download action.
- **Cloud** answers whether someone can evaluate the workspace without an
  install. It names the alpha at every entry point and keeps the hosted
  boundaries beside the demonstration.
- **Agents** answers whether a builder can operate, inspect, repair, and reuse
  automation around real creative artifacts. It starts with one product
  example, then exposes the technical entry points.


## Jobs, not demos

`/studio` shows shipped timeline examples under "Every film is a timeline you
can open." Each pairs a full film with a capture of its editable timeline. Lead
with Serein, Kite, and Tidewater, followed by Cadence, Prism, and Voltra.
T minus 30 stays outside the marketing showcase.

Recipes (`/recipes`) pair example media with a guide to making related work in
Studio. The use cases on `/use-cases`
(trailer, teaser, product video, poster) are demos of a surface; they stay on
their own pages.

Each recipe card shows one result, a short description, and a link to the guide.
Expanded recipe showcases play the featured ad on request. Model details belong on the
recipe page. Internal review status and production checklists stay in the run
records. Describe the visible result accurately, including when it is a
storyboard rather than a finished film. Do not put estimated costs on cards.

## The argument we do not make

The old page named an enemy — the closed AI studio — in its own section, and
compared against it before the reader had seen a single finished job. That
section is gone.

The reason is not politeness. Naming a competitor on our homepage puts their
name in the reader's head at our expense and asks them to accept a competitive
claim before they have any reason to trust us. None of those companies names anyone on their own front page. The
strong move is the same one they make: show what the product does and let the
difference be self-evident.

What survives is the fact, never the grievance. "Your keys, your project file,
your models, AGPL-3.0" is stated in the spec strip as plain fact. The category
comparison lives in the README and `/alternatives/*`, not on the homepage.

If a claim only works by making someone else look bad, it is not our claim. The
one about them that is both true and ours to make is narrow: what a hosted
platform keeps is the editable project and the model list. The hero states it
once as a category ("most AI video apps"), and names no product and shows no
logo.

Keep the contrast plain. "Slot machine" and "flat MP4" are fine because a
reader can check them. Coined labels are not: no "model sovereignty",
"arbitrage", "bidirectional harness", "entity bibles", or "wrapper tax".

One carve-out on the homepage, navigation rather than argument: the
footer's Compare column may name a product, because their whole job is to route a reader who is already searching
for that name to its `/alternatives` page. Meta keywords may carry competitor
terms for the same reason. Body copy on the homepage may not. Dedicated
`/alternatives/*` comparison pages are exempt from the homepage competitor-name
rule because their purpose is direct comparison with dated pricing, preset
mappings, and verifiable trade-offs.

## Audience

The front door speaks to **small production teams doing paid, repeated work**:
performance and social teams shipping ad variants weekly, catalogue teams with
more SKUs than shoot days, studios re-releasing a talk into another market. The
**solo filmmaker** making one trailer is the on-ramp, not the buyer: they arrive
through the trailer recipe, pay little, and tell the team they work with.

The repeat job is where the product's claims carry weight. "Runs again" and
provider pricing mean nothing to a person making one film. They mean the
difference between a viable margin and none to a team making a hundred.

## Cost, once

State provider pricing once in the main page copy. Keep detailed costs and the
calculator on `/pricing`.

One exception: the storyboard tab prices one still against five seconds of
video, because that gap is the reason to settle shots on stills first. It and
the `/node-based-workflows` paid-run line read their numbers from the
calculator catalog through `src/data/stageCosts.ts`, so they move with it.

- **Cost.** "Studio is free. You pay providers directly, at their published
  prices." On your own keys NodeTool adds nothing, in every edition.
- **Hosted credits.** The code has a credit balance for Cloud: a curated
  `nodetool` provider runs on NodeTool's platform keys and draws on monthly
  grants ([Costs and credits](../docs/costs-and-credits.md)). Payment is not
  implemented and no price is announced. Marketing copy does not sell credits,
  show plan prices, or say "no credits" about Cloud. "NodeTool sells no
  credits" and "NodeTool adds nothing on your keys" are both true today.
- **Cloud.** Studio is the full product; Cloud is the zero-install preview and is
  in alpha. Say "alpha" wherever Cloud is offered as an entry point, the closing
  CTA included. A "start in seconds" claim that lands a reader in an alpha is a
  claim we lose. One recommendation across the site, never two: Studio for paid
  work, Cloud to look around without installing. A page that recommends Studio
  at the top and Cloud at the bottom has made the choice harder, not easier.
- **Current and future pricing are different facts.** Current Cloud alpha access
  is free. Future Cloud pricing has not been announced. Do not promise a plan,
  price, or billing model before the deployment owner confirms it.
- **Subscriptions.** A reader who already pays for ChatGPT, Claude, or Gemini
  (about $20 a month) can run NodeTool on that plan, which is the cheapest way
  in. `/pricing` explains it in `SubscriptionSection`. The homepage, `/agents`,
  and `/studio` state it in one `SpecStrip` line that links there.
  State the limits with the claim: subscriptions run in Studio, not Cloud.
  Sign in with ChatGPT runs chat, the agent, and GPT Image with no extension.
  Gemini needs the NodeTool Chrome extension in the browser where the reader
  is signed in. Claude plans run chat and the agent only. Video comes from
  Gemini.
- **Local models.** True for language and image models, and for a filmmaker
  making video mostly not: open-weight video needs hardware they do not have. On
  the film page, ownership is keys, project file, and source. Local inference is
  claimed on `/studio` and `/models`, where the models it applies to are named.

## Proof

Still the weakest part of the story, and not a copy problem. What closes the
gap, in order of value:

1. A real provider bill and an elapsed time on each recipe, from a recorded
   run. `scripts/recipe-samples.manifest.json` records which models ran but
   neither what they cost nor how long they took, so neither number can be
   printed yet.
2. The hero reel ending on the backward edit: one shot re-rolled, one line
   re-voiced, the cut updating. Today it shows only the forward pass, sentence
   in, film out, which every hosted platform can also show.
3. A recorded run of the trailer recipe on the editable-sequence variant, so
   the flagship example ends where the hero claim says it does.
4. Short user quotes about time saved or control regained, and named teams
   under a "how teams are using NodeTool" heading. This is the beat the
   reference pages fill with customer stories and we currently fill with
   recipes. Recipes are honest and they are not the same thing.

Until those exist, do not compensate with adjectives. A missing testimonial is
better than a manufactured superlative, and a borrowed "used by millions" line
with no number behind it is worse than both.

Recipe pages show the result and name the provider that made it. Keep detailed
model substitutions and review evidence in the run records. When the guide
shows a different production from the featured result, say so in the guide.

## Claims need code

Every capability claim points at code, a generated catalog, or a doc page that
cites code. If none exists, the claim waits. Prices come from the calculator
catalog through `src/data/stageCosts.ts`, never from memory.

These claims were removed after a check found nothing behind them. Do not bring
them back without new evidence:

- A per-generation markup table, or a percentage markup for any platform.
- "$0.00 per generation" on a subscription. Plan runs count against the plan's
  own limits.
- Inspecting tensors in the node editor.
- A lens or depth pass in the 3D editor. The 3D editor captures a view as a
  depth or composition reference.
- One node for every model on Replicate, fal.ai, and Kie.ai. Generated nodes
  cover the models listed in each codegen config. fal.ai alone also has a node
  that calls any endpoint by id.
- Seeing a generation's cost "across four providers" before running. The cost
  estimate prices the provider and model each node has selected.

## Phrasing rules

Beyond [docs/WRITING_STYLE.md](../docs/WRITING_STYLE.md) and
[docs/BRAND.md § Lexicon](../docs/BRAND.md#5-lexicon), which apply here too:

- **Short declaratives that end in a period.** "Every model you need. On your own
  keys." Not a question, not a subordinate clause, not a colon holding two ideas
  together. If a heading needs a comma and a conjunction, it is two headings.
- **One CTA verb across the site.** The primary button is the download, and every
  secondary route reads "Try now" or "Learn more". Not "See a campaign workflow",
  "Explore the canvas", "Discover what's underneath". A reader should not have to
  parse a button.
- **Abundance is a number or a name, never an adjective.** "Every major model,
  your keys" and a wall of model names beats "extensive model support". Name
  providers where a reader is checking for a specific one (pricing, model pages).
- **"Workspace"** is the product category. **"Studio"** is the desktop edition
  of NodeTool. **"Canvas"** is a surface inside the workspace. A workflow is one
  graph, not the whole project.
- "Agent", not "the AI" or "the algorithm". "Pitch" or "direct", not "prompt
  engineering". "Takes" and "cast", not "generations" and "outputs".
- "Project" or "multi-track timeline", not "output" or "render". The result is
  an editable project, not a locked file.
- "Filmmakers", "directors", "creators", "teams" — never "users" or "content
  creators".
- Concrete over categorical: "a Seedream 5 Lite still that costs $0.03 on
  Kie.ai costs $0.03 here" beats "no markup". Read the number from
  `stageCosts.ts`.
- Never "credits", "gems", or "tokens" as billing units in Studio copy, and
  never "chatbot" for the agent. See the avoid table in `BRAND.md` and
  [Cost, once](#cost-once) for hosted credits.
- No "magic", "revolutionary", "seamless", "powerful", "unlock", "empower". If a
  sentence survives its own deletion, delete it.
