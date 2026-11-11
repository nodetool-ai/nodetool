# Site editorial spec

Rules for how much the marketing site says, and where. [NARRATIVE.md](NARRATIVE.md)
covers what the site says. This file covers subtraction: which page owns
which argument, and what a page must leave to another page. A change that
breaks a rule here fixes the rule or the page in the same PR.

## Global rules

1. **Once per site.** The shared facts are the plan (ChatGPT, Claude, Gemini),
   provider keys, provider list price, local models, open source under
   AGPL-3.0, and project files on disk. Each has one owner page that explains
   it (see the table below). Every other page states it in one line through
   `SpecStrip` (`src/components/SpecStrip.tsx`), or not at all. The homepage
   setup line under Download is the one exception (see § Homepage). No
   multi-sentence section restates a shared fact outside its owner page.
2. **One thesis per page.** Each route owns one argument and one piece of
   visual proof. A section that argues another route's thesis is cut and
   replaced by a link.
3. **Show the change, not the capability.** Do not write a paragraph saying
   a project is editable. Show one shot, line, or frame changed while the rest
   stays, and say what changed.
4. **No unbacked social proof.** A claim about who uses NodeTool needs a
   named person or team, their work, and a link. Without them, say that
   NodeTool is open source and link to GitHub and Discord. Banned without that
   evidence: "Made with working creatives", "Made with marketing teams",
   "Always on brand", and any line of the same shape.
5. **Honest limits.** Every product and comparison page keeps one concrete
   limit: a "What it does not do yet" block, a "When <tool> is the better
   choice" block, or the limitation recorded for a case study.
6. **Add by removing.** A new section on the homepage or a vertical page
   replaces one. The homepage block count is pinned by
   `tests/e2e/smoke.spec.ts`.

## Page ownership

| Route | Thesis | Proof | Leaves to other pages |
|---|---|---|---|
| `/` | One sentence to a short film you can edit, with clips paid for only after their stills are approved. | The hero reel, the node reel, three finished films with their briefs, the cheap-stills cost example | Ad library, recipes, the seven-editor tour, model lists, plan table, comparisons, Studio vs Cloud, API, CLI and MCP |
| `/agents` | The agent works inside the same editors and records as you, and the harness catches its mistakes. | The failed-run-and-repair session, the build-validate-run-inspect-repair loop, what validation reports, the permission modes | MCP install, CLI, HTTP API (linked to `/developers`), film production pitch, plan and key explanations |
| `/studio` | The desktop app: every editor, and the project stays on your computer. | The seven-editor tour (its storyboard panel shows a shot edited by hand), the films that open as timelines, local models and setup | The still-versus-clip cost example (homepage), plan and key explanations, ad and recipe catalogues |
| `/node-based-workflows` | A graph you can check before a paid run, and run again. | The node reel, the node-by-node walkthrough | Plan explanation, Studio facts |
| `/marketing` | One brief becomes a campaign, with a bounded revision. | The Directed Campaign Kit run: hero, square, story, one revision note | Ad library, storyboards, recipes, other workflows (linked) |
| `/developers` | Programmatic use: MCP, CLI, HTTP, and a real asset pipeline. | The sprite session with filenames and terminal output, the MCP install, the run endpoint | The harness loop and validation (`/agents`), filmmaking copy, plan explanation |
| `/solutions/local-first` | A workflow that runs on a local model with the network off. | The Private Assistant run on Ollama, the model memory table, what stays local and what stops offline | Film production, the editor tour, plan explanation, hosted model lists |
| `/pricing` | What NodeTool costs, plans and keys. | `SubscriptionSection`, the calculator | Owner of the plan, keys, and cost facts |
| `/models` | Which models run, hosted and local. | The generated model directory | Owner of the model facts |
| `/alternatives/*` | The trade-off against one named tool. | One feature table, the three product stages | Summary paragraphs that repeat the table, the full comparison directory (the footer and `/alternatives` carry it) |

## Homepage

Five blocks, in order:

1. **The overview.** The `<h1>` states the promise: one sentence to a short
   film you can edit, with clips paid for only after their stills are
   approved. Under Download, one line says Studio signs in with a ChatGPT or
   Claude plan or uses your own provider keys at list price. Then the hero
   reel and three linked cards for films, the agent, and the live timeline
   (a clip bound to a workflow goes stale when its inputs change). The cards
   carry no `h2`. Developer surfaces (API, CLI, MCP) stay on `/developers`.
2. **The workflow payoff.** "Made it once? Run it again." The project is a
   node graph you run again, a ComfyUI workflow can come along, and the agent
   checks the graph before a paid run. The node reel (`/hero-nodes`) loads
   lazily.
3. **Finished films.** Three films from `/storyboards`, each with the brief it
   started from, its shot count and length (`StoryboardTeaser` with
   `showBrief`). Add a cost only when the render recorded one.
4. **The cost behaviour.** Approve the still before paying for the clip. The
   prices come from `src/data/stageCosts.ts`.
5. **The way in.** Five short FAQ answers cover hardware, accounts, costs, editions and
   editing the agent's work. They emit matching FAQPage schema. Keep the
   download and Cloud actions, with GitHub, Discord, and email in one line.

## Comparison pages

One template renders every `/alternatives/<slug>` page. It keeps:

- the hero and its reel,
- the three product stages,
- one feature table, introduced by the short answer that answer engines lift,
- the cost and preset tables where the record has them,
- one paragraph under "When <tool> is the better choice",
- the short list of alternatives (it matches the page title and the ItemList
  schema), and the FAQ.

A FAQ row must not restate the short answer or the table. A record may set
`answer` when the generic short answer would only repeat the hero, and `hero`
when the category promise does not fit (the ComfyUI page does both).

## Checks

- `npm run seo:check` keeps the Markdown mirrors in `public/` in step with
  the page data.
- `tests/e2e/smoke.spec.ts` pins the homepage blocks, the three cards, and
  the plan line by Download.
