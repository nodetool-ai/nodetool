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

## Positioning line

**You are the director. The agent is your crew.**

The hero claim is not the feature list and not the category label. It names who
does what: the agent handles the tedious stretch between a blank page and a
rough cut — script, board, footage, sound, cut — and the creator stays the
director throughout. "You direct the vision. The agent builds the film." is the
same claim in prose form and stays in the meta descriptions and OG images; the
hero uses the shorter line.

The subhead carries the one claim a closed studio cannot make: what the agent
makes stays open. The board, the script with its takes, and the multi-track cut
come back as a project you can re-roll, re-voice, and re-cut. Runway's agent
also builds a film. Nobody else hands the project back. That claim goes in the
hero, not one and a half screens down.

"The agent-first creative workspace" stays as the category descriptor in
`<title>`, meta descriptions, and schema. On the page itself the reader needs a
category they already know, so the hero badge says **open-source AI film
studio**. Nobody searches for a coined label.

## The enemy

One enemy, named once, and **after the work has been shown**: the closed AI
studio. Runway, LTX Studio, Figma Weave, Flora, Higgsfield and the rest will
generate the trailer and let you download the file. What does not come with it
is the project — the board, the rejected takes, the cut — and the freedom to
run the next version on a model they have not added.

State that precisely or not at all. "They keep your film" is false: every one
of them exports a video. What they keep is the editable project and the model
list, which is the claim that survives contact with a reader who has used them.

"Five browser tabs per shot" was the 2024 pain, and the closed studios already
solve it. Against them, the only pain that holds is the last one: their models,
their credits, their locked project. That is the pain the status quo section
names, and the pain every ownership claim answers. Export hops, markups, and
tab counts are symptoms of it, not enemies of their own.

The comparison section compares against the closed studios. ComfyUI is not what
a filmmaker is choosing between; that comparison lives on `/alternatives`.

## Message hierarchy

Everything below the hero earns its place by advancing one of three claims, in
this order of importance:

1. **Agentic automation, and what it leaves behind.** Not chat that tells you
   what to do, and not a render you cannot reopen. The agent does the heavy
   lifting and hands back a multi-track project you can still edit. Show the
   board appearing, the line re-voiced, the cut updating.
2. **One canvas, pitch through final cut.** Image, video, audio, text, plus the
   editors — storyboard, timeline, sketch, script — so a piece never leaves the
   studio to be finished.
3. **Creative sovereignty.** Your keys, your project file, your models,
   AGPL-3.0. No markups, no locked project formats. Stated as fact, never as a
   pitch.

Provider lists, node counts, tool counts, and architecture belong under those
claims, not next to them. On the homepage they are one strip of links to
`/studio`, `/developers`, and `/apps`, not ten sections.

## Order of the page

Hero → the jobs, each a real run with its bundle → the project one of those
runs leaves behind → the three steps (Pitch / Automate / Direct) → the five
surfaces → models → ownership → the enemy (once, briefly) → comparison against
the closed studios → Studio vs Cloud → ways in → what is underneath, as a strip
→ FAQ → community → download.

**Results before the argument.** The page used to name the enemy in the second
section, which asked a reader to agree with our competitive position before
they had seen a single finished job. Proof earns the argument, not the other
way round: the recipes come first, then what one of them leaves behind, then
how it is made. The enemy and the comparison sit together, late, where a reader
who is already convinced can skip both. Everything after "ways in" is a route
to another page, not a section that argues.

Detailed comparison tables and the calculator belong on their own pages —
`/alternatives/*` and `/pricing`. The homepage names the difference and links
to the numbers.

## Audience

The front door speaks to **small production teams doing paid, repeated work**:
performance and social teams shipping ad variants weekly, catalogue teams with
more SKUs than shoot days, studios re-releasing a talk into another market. The
**solo filmmaker** making one trailer is the on-ramp, not the buyer: they arrive
through the trailer recipe, pay little, and tell the team they work with.

The repeat job is where the product's claims carry weight. "Runs again" and
provider pricing mean nothing to a person making one film. They mean the
difference between a viable margin and none to a team making a hundred.

Technical depth is the back door, not the doorway: `/developers`, `/agents`, the
CLI and SDK pages. Keeping it off the homepage is what stops the site reading as
neither-for-artists-nor-for-engineers.

## Jobs, not demos

The homepage shows the four recipes (`/recipes`), because each is a job with a
buyer, a real run against live models, and a `.nodetool` bundle to download.
The four use cases on `/use-cases` (trailer, teaser, product video, poster) are
demos of a surface; they stay on their own pages.

Each recipe card carries: what you end up holding, who it is for, the models
the shipped chain calls, and the bundle. That is the proof the BYOK claim has
today. The proof it still lacks is a real provider bill per recipe. Until a
recorded run produces one, the card says "at provider list prices" and names
the models. **Do not put an estimated dollar figure on a card.** A number that
turns out wrong costs more trust than no number.

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
   in, film out, which every closed studio can also show.
3. A recorded run of the trailer recipe on the editable-sequence variant, so
   the flagship example ends where the hero claim says it does.
4. Short user quotes about time saved or control regained.

Until those exist, do not compensate with adjectives. A missing testimonial is
better than a manufactured superlative.

What the pages can say today, and do: how far the recorded run is from the
download. Every sample carries a per-model disclosure, and `sampleFidelity`
turns it into the one line that goes above the picture and on the card — run as
shipped, or *n* of *m* models reached another way. A visitor should never have
to infer that from a list.

## Phrasing rules

Beyond [docs/WRITING_STYLE.md](../docs/WRITING_STYLE.md) and
[docs/BRAND.md § Lexicon](../docs/BRAND.md#5-lexicon), which apply here too:

- **"Studio"** is the product. **"Canvas"** is the surface you work on. Not
  "workspace", "workflow builder", "platform", or "tool" for the product, and
  not "workflow" for the thing you open. A workflow is one graph inside it.
- "Agent", not "the AI" or "the algorithm". "Pitch" or "direct", not "prompt
  engineering". "Takes" and "cast", not "generations" and "outputs".
- "Project" or "multi-track timeline", not "output" or "render" — the result is
  a workspace, not a locked file.
- "Filmmakers", "directors", "creators", "teams" — never "users" or "content
  creators".
- "Every major model, your keys" instead of a fourteen-name provider list. Name
  providers where a reader is checking for a specific one (pricing, model pages).
- Concrete over categorical: "a Seedance run that costs $0.18 on KIE costs $0.18
  here" beats "no markup".
- Never "credits", "gems", or "tokens" as billing units, and never "chatbot" for
  the agent. See the avoid table in `BRAND.md`.
- No "magic", "revolutionary", "seamless", "powerful", "unlock", "empower". If a
  sentence survives its own deletion, delete it.
- The three steps are the creator's verbs and the agent's in one voice: you
  pitch, the agent automates, you direct. The visual under each step shows the
  film story (a board, stills, a cut), never a generic node chain.
