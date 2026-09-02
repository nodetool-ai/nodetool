# Narrative

What the site says, in what order, and why. [docs/BRAND.md](../docs/BRAND.md)
carries the repo-wide brand and verbal guidelines (mission, voice, the four
messaging pillars, lexicon); `PRODUCT.md` covers brand, users, and design
principles; this file covers the message; `POSITIONING_PLAN.md` covers the
competitive positioning, landing-page blueprint, and launch plan. When homepage
copy and this file disagree, one of them is wrong — fix both in the same change.

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
hero uses the shorter line. The earlier lines — *"From prompt to final cut on one
canvas"* and *"Describe the piece. Keep the workflow."* — survive as claims 1
and 2 below: a closed tool generates behind glass and hands you a file;
NodeTool's agent generates *and* hands you the multi-track project that made
it, a normal, editable file you can open, re-cut, and run again.

"The agent-first creative workspace" stays as the category descriptor in
`<title>`, meta descriptions, and schema. It is accurate and it is what people
search for. It is not the H1: it names a category instead of a benefit.

## Message hierarchy

Everything below the hero earns its place by advancing one of three claims, in
this order of importance:

1. **Agentic automation, and what it leaves behind.** Not chat that tells you
   what to do, and not a black box that returns a render. The agent does the
   heavy lifting and hands back a multi-track project you can still edit. Show
   the graph appearing, the node being edited, the run resuming from the middle.
2. **One canvas, pitch through final cut.** Image, video, audio, text, plus the
   editors — storyboard, timeline, sketch, script — so a piece never leaves the
   workspace to be finished.
3. **Creative sovereignty.** Your keys, your files, your models, AGPL-3.0, local
   option. No token markups, no locked project formats. Stated as fact, never as
   a pitch.

Provider lists, node counts, tool counts, and architecture belong under those
claims, not next to them.

## Order of the page

Hero → the status quo (the pain, once, briefly) → the demo → the three steps
(Pitch / Automate / Direct) → use cases with real output → the three claims
above → proof → comparisons → download.

The pain section comes before any feature because the features only mean
something against it. Comparisons come late: a reader who is convinced does not
need them, and a reader who is not will scroll to them.

## Audience

The front door speaks to **filmmakers, directors, and creators** — plus the
small teams around them: designers, marketers, content studios — who want
production output without becoming ML engineers or paying a token tax.

Technical depth is the back door, not the doorway: `/developers`, `/agents`, the
CLI and SDK pages. Keeping it off the homepage is what stops the site reading as
neither-for-artists-nor-for-engineers.

## Cost and status, stated early

Two things a reader must not have to hunt for, because vagueness here reads as a
trap:

- **Cost.** "Studio is free. You pay providers directly, at their published
  prices. Local models are free after the download." Never imply a NodeTool
  credit exists.
- **Cloud.** Studio is the full product; Cloud is the zero-install preview and is
  in alpha. Say "alpha" wherever Cloud is offered as an entry point. A "start in
  seconds" claim that lands a reader in an alpha is a claim we lose.

## Proof

The weakest part of the story, and not a copy problem. What closes the gap:
end-to-end project pages with the finished piece, its workflow file, and its
real cost; community workflows and mini-apps surfaced on the homepage; short
user quotes about time saved or control regained.

Until those exist, do not compensate with adjectives. A missing testimonial is
better than a manufactured superlative.

## Phrasing rules

Beyond [docs/WRITING_STYLE.md](../docs/WRITING_STYLE.md) and
[docs/BRAND.md § Lexicon](../docs/BRAND.md#5-lexicon), which apply here too:

- "Studio" or "canvas", not "workflow builder" — the latter undersells the
  editors and puts us in the n8n bracket.
- "Agent", not "the AI" or "the algorithm". "Pitch" or "direct", not "prompt
  engineering". "Takes" and "cast", not "generations" and "outputs".
- "Multi-track timeline", not "output" or "render" — the result is a workspace,
  not a locked file.
- "Filmmakers", "directors", "creators" — never "users" or "content creators".
- "Every major model, your keys" instead of a fourteen-name provider list. Name
  providers where a reader is checking for a specific one (pricing, model pages).
- Concrete over categorical: "a Seedance run that costs $0.18 on KIE costs $0.18
  here" beats "no markup".
- Never "credits", "gems", or "tokens" as billing units, and never "chatbot" for
  the agent. See the avoid table in `BRAND.md`.
- No "magic", "revolutionary", "seamless", "powerful", "unlock", "empower". If a
  sentence survives its own deletion, delete it.
