# Narrative

What the site says, in what order, and why. [docs/BRAND.md](../docs/BRAND.md)
carries the repo-wide brand and verbal guidelines (mission, voice, the four
messaging pillars, lexicon); `PRODUCT.md` covers brand, users, and design
principles; this file covers the message; `POSITIONING_PLAN.md` covers the
competitive positioning, landing-page blueprint, and launch plan. When homepage
copy and this file disagree, one of them is wrong — fix both in the same change.
The page is edited more often than this file, so when in doubt the page is the
newer of the two: bring the doc up to it, then fix the page.

This file is the homepage's narrower cut of `BRAND.md`, not a second standard.
The positioning line below wins on nodetool.ai; `BRAND.md`'s elevator pitch
covers everywhere else (README, docs, listings). Both say the same thing: the
creator directs and keeps the project file.

## The register

The site is written in the register the category leaders use. Runway's product
page is the reference: short declarative claims that end in a period, model
breadth stated as abundance rather than as a list, capability named as volume
("Dozens of tools. Endless ways to create."), industry pages that say what they
are ("AI for Advertising") and nothing cleverer, an app grid where every tile is
a verb, node graphs introduced last as the power-user layer, and one CTA verb
repeated everywhere.

What that register does **not** contain, and neither does ours: a competitor's
name, a paragraph explaining why the alternative is worse, or a table the reader
must study before they have seen anything work. Confidence is stated by showing
the work, not by contrast. See [The argument we do not make](#the-argument-we-do-not-make).

Copy the grammar, never the sentences. Every claim below has to be one only
NodeTool can make.

## Positioning line

**You are the director. The agent is your crew.**

Two beats, declarative, no mechanism. It names who does what: the agent handles
the tedious stretch between a blank page and a rough cut — script, board,
footage, sound, cut — and the creator stays the director throughout. "You direct
the vision. The agent builds the film." is the same claim in prose form and stays
in the meta descriptions and OG images; the hero uses the shorter line.

The subhead carries the one claim a closed studio cannot make: what the agent
makes stays open. The board, the script with its takes, and the multi-track cut
come back as a project you can re-roll, re-voice, and re-cut. Other agents also
build a film. Nobody else hands the project back. That claim goes in the hero,
not one and a half screens down.

Under the CTA sits the trust line: free, open source, AGPL-3.0, and the three
platforms it runs on. It is our version of "Used by 60M+ users globally" — the
facts we actually have, stated once, without adjectives. When a user or install
count is worth printing, it replaces the platform list rather than joining it.

"The agent-first creative workspace" stays as the category descriptor in
`<title>`, meta descriptions, and schema. On the page itself the reader needs a
category they already know, so the hero badge says **open-source AI film
studio**. Nobody searches for a coined label.

## Message hierarchy

Everything below the hero earns its place by advancing one of three claims, in
this order of importance:

1. **Every model, on your keys.** Abundance first, ownership in the same breath.
   The model wall is the second thing on the page because breadth is the claim a
   reader checks before any other, and because ours comes with a fact no hosted
   platform can match: you pay the provider directly.
2. **Agentic automation, and what it leaves behind.** Not chat that tells you
   what to do, and not a render you cannot reopen. The agent does the heavy
   lifting and hands back a multi-track project you can still edit. Show the
   board appearing, the line re-voiced, the cut updating.
3. **One canvas, pitch through final cut.** Image, video, audio, text, plus the
   editors — storyboard, timeline, sketch, script — so a piece never leaves the
   studio to be finished.

Provider lists, node counts, tool counts, and architecture belong under those
claims, not next to them. On the homepage they are one strip of links to
`/studio`, `/developers`, and `/apps`, not ten sections.

## Order of the page

Hero → **every model, your keys** → how teams are using it (the recipes, each a
real run with its bundle) → the project one of those runs leaves behind → the
three steps (Pitch / Automate / Direct) → the editors, framed as volume →
**apps for everything** → ownership → **build the workflows that work for you**
→ comparison → Studio vs Cloud → ways in → FAQ → community → download.

Three rules produced that order:

**Breadth before proof.** Models move from late on the page to directly under
the hero. A reader who cannot find their model stops reading, and no amount of
finished work later recovers them. It is the beat every leading page in this
category puts second, and it was ours in tenth place.

**Results before the argument.** The recipes are the third beat because proof
earns the argument, not the other way round: the work first, then what one run
leaves behind, then how it is made.

**Graphs last.** The node canvas is the power-user layer and is introduced as
one, near the bottom, under its own heading — "Build the workflows that work for
you." A visual programming surface presented first reads as work; presented last
it reads as headroom. `/developers`, `/agents`, the CLI and SDK pages are the
back door, not the doorway.

Detailed comparison tables and the calculator belong on their own pages —
`/alternatives/*` and `/pricing`. The homepage names the difference and links
to the numbers.

## Vertical pages

One page per industry, named flatly after the industry, in the form leading
platforms use: **AI for Advertising**, not a coined phrase. `/marketing` is that
page today and is reachable at `/ai-for-ads`.

The grammar of a vertical page is fixed, and it is short:

1. The industry name as the `<h1>`, plain.
2. One paragraph covering the whole pipeline (ideation through delivery) and
   three benefits in one breath: teams move faster, they pitch more ambitious
   work, costs come down.
3. Two credibility chips beside the CTA — something countable, like the number
   of shipped workflows and the model count.
4. Proof, then the CTA verb.

A vertical page argues about the industry's job, never about a competitor. What
makes ours different from a hosted platform's is stated as fact in the benefit
paragraph ("on your own keys, at provider list prices") and then dropped.

Verticals to hold as the set: advertising and marketing (`/marketing`), film and
story (`/studio`), agents and automation (`/agents`). Do not add a fourth
without a shipped recipe behind it.

## Apps for everything

A grid of small, single-purpose tools, each named as a verb phrase for the job
it does and described in one sentence: "Cut a product out of its background."
"Relight a product for a seasonal campaign." "Score a silent clip."

The names come from the recipe steps in `recipeEntries.generated.ts` and the
mini-apps in `miniAppEntries.generated.ts`, so the grid is never aspirational —
every tile opens something that runs. The homepage shows a strip and links to
`/apps`; the full catalogue lives there.

This beat exists because a reader who does not want to direct a film still needs
to see something they would use on Tuesday. It sits after the editors and before
ownership.

## Jobs, not demos

The homepage shows the four recipes (`/recipes`) under the heading "How teams
are using NodeTool", because each is a job with a buyer, a real run against live
models, and a `.nodetool` bundle to download. The four use cases on `/use-cases`
(trailer, teaser, product video, poster) are demos of a surface; they stay on
their own pages.

Each recipe card carries: what you end up holding, who it is for, the models
the shipped chain calls, and the bundle. That is the proof the BYOK claim has
today. The proof it still lacks is a real provider bill per recipe. Until a
recorded run produces one, the card says "at provider list prices" and names
the models. **Do not put an estimated dollar figure on a card.** A number that
turns out wrong costs more trust than no number.

## The argument we do not make

The old page named an enemy — the closed AI studio — in its own section, and
compared against it before the reader had seen a single finished job. That
section is gone.

The reason is not politeness. Naming Runway, LTX Studio, Figma Weave, Flora or
Higgsfield on our homepage puts their name in the reader's head at our expense
and asks them to accept a competitive claim before they have any reason to
trust us. None of those companies names anyone on their own front page. The
strong move is the same one they make: show what the product does and let the
difference be self-evident.

What survives is the fact, never the grievance. "Your keys, your project file,
your models, AGPL-3.0" is stated in the ownership section as plain fact and in
the hero as one bullet. The comparison section stays, late and skippable, and it
compares **categories** — open studio against hosted platform — with a real
price worked through, not a brand name and a column of red crosses.

If a claim only works by making someone else look bad, it is not our claim. The
one about them that is both true and ours to make is narrow: what a hosted
platform keeps is the editable project and the model list. State it once, in the
ownership section, without a logo next to it.

Two carve-outs, both navigation rather than argument: the footer's Compare
column and the link line under the comparison table may name a product, because
their whole job is to route a reader who is already searching for that name to
its `/alternatives` page. Meta keywords may carry competitor terms for the same
reason. Body copy on the homepage may not.

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

Cost appears in three places and no more: the hero bullet ("your own keys,
provider list prices"), the recipe cards, and the calculator — which lives on
`/pricing`, not on the homepage. It used to appear seven times. Repetition
reads as anxiety, and a reader who has seen the calculator does not need the
dashboard.

- **Cost.** "Studio is free. You pay providers directly, at their published
  prices." Never imply a NodeTool credit exists.
- **Cloud.** Studio is the full product; Cloud is the zero-install preview and is
  in alpha. Say "alpha" wherever Cloud is offered as an entry point, the closing
  CTA included. A "start in seconds" claim that lands a reader in an alpha is a
  claim we lose. One recommendation across the site, never two: Studio for paid
  work, Cloud to look around without installing. A page that recommends Studio
  at the top and Cloud at the bottom has made the choice harder, not easier.
- **The alpha price and the price after it are different facts.** Cloud is free
  while it is in alpha. A hosting subscription follows at full release and its
  price is not set. Show both, separately, wherever Cloud is priced.
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

What the pages can say today, and do: how far the recorded run is from the
download. Every sample carries a per-model disclosure, and `sampleFidelity`
turns it into the one line that goes above the picture and on the card — run as
shipped, or *n* of *m* models reached another way. A visitor should never have
to infer that from a list.

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
- **"Studio"** is the product. **"Canvas"** is the surface you work on. Not
  "workspace", "workflow builder", "platform", or "tool" for the product, and
  not "workflow" for the thing you open. A workflow is one graph inside it.
- "Agent", not "the AI" or "the algorithm". "Pitch" or "direct", not "prompt
  engineering". "Takes" and "cast", not "generations" and "outputs".
- "Project" or "multi-track timeline", not "output" or "render" — the result is
  a workspace, not a locked file.
- "Filmmakers", "directors", "creators", "teams" — never "users" or "content
  creators".
- Concrete over categorical: "a Seedance run that costs $0.18 on KIE costs $0.18
  here" beats "no markup".
- Never "credits", "gems", or "tokens" as billing units, and never "chatbot" for
  the agent. See the avoid table in `BRAND.md`.
- No "magic", "revolutionary", "seamless", "powerful", "unlock", "empower". If a
  sentence survives its own deletion, delete it.
- The three steps are the creator's verbs and the agent's in one voice: you
  pitch, the agent automates, you direct. The visual under each step shows the
  film story (a board, stills, a cut), never a generic node chain.
