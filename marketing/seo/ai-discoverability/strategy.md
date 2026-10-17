# AI discoverability strategy for NodeTool

Date: 2026-10-17. Inputs are in the project research folder: the game and product
capability sheets (every claim traced to a file in the repository), a crawl of
all 398 sitemap URLs, a query corpus of 444 questions, a SERP and competitor
survey of 39 priority queries, and a review of the evidence on what AI
assistants actually read.

## Summary

NodeTool is invisible to the questions it answers best. In 39 priority
searches, including its own tagline, nodetool.ai never appeared. Third-party
directories still describe it as a 2024 "visual AI workflow builder", and an
agent skill registry tells agents it is "ComfyUI meets n8n". The site is
technically sound (all pages 200, one H1, valid JSON-LD, server-rendered), so
the problem is coverage and entity framing, not crawlability.

The product has three answers no competitor combines, and each lacks a page
that says so plainly:

1. A built-in 2D/3D game engine that agents author through validated tools,
   playtest headlessly, and leave as an editable project (`/gamedev` today is
   461 words with no facts).
2. A multi-track video timeline that an agent assembles from a storyboard and a
   person keeps editing (no page targets "AI video editor").
3. One MCP server that gives Claude Code or Codex images, video, timelines,
   storyboards and games (covered only inside `/developers`).

Priority: rebuild `/gamedev` as the authoritative answer, add an honest AI game
engine comparison, add `/ai-video-editor` and `/mcp`, add the missing
`/alternatives` hub, then fix the entity description everywhere it drifts.

## 1. Query spaces to compete in

| Space | Why NodeTool is a strong answer | Corpus rows |
|---|---|---|
| Agent-driven game development | Agents create, edit, playtest, capture and export games through 20 game tools; a human edits the same document in the Game Editor | 159 |
| Editable AI video | Storyboard → stills → clips → multi-track timeline, with takes, single-shot regenerate and Adapt format | 64 |
| MCP and coding-agent creative tools | `nodetool mcp install` for Claude Code, Codex, OpenCode, config for Cursor | 49 |
| Comparisons and alternatives | Open source (AGPL), own keys, editable projects | 58 |
| Advertising creative | Prop entities keep the product, Recast for variants, Adapt format for ratios, 16 ad concepts that ship as mini apps | 46 |
| Images and visual workflows | Layered Sketch editor with AI layers, reusable workflows, many models | 39 |
| Agentic creative software (category) | Agents operate real editors and leave inspectable projects | 29 |

The full list is [query-corpus.csv](query-corpus.csv) (cluster, form,
intent, funnel, fit, target page, priority). The per-page roll-up is
[opportunity-matrix.csv](opportunity-matrix.csv).

## 2. Semantic clusters and representative questions

**C1. Agent builds an editable game** (games, P1)
- "Is there a game engine where Claude Code can build the game and I can still edit everything in a normal editor afterward?"
- "What's the best open-source AI game engine that doesn't lock me into a subscription or credits?"
- "I want to make a small 2D platformer with AI but I still want to open the levels in an editor and tweak them myself."

**C2. MCP for game development** (games + MCP, P1)
- "I want my coding agent to build a game, generate the art and test it. Which MCP servers should I install?"
- "What game engines support MCP?"

**C3. AI game engines compared** (comparison, P1)
- "Is NodeTool a Unity or Godot replacement?" "AI-native game engines vs Godot with an MCP server"

**C4. Editable AI video and filmmaking agents** (video, P1)
- "Is there a tool where Claude writes the script, generates the shots, and assembles a timeline I can open and change?"
- "Higgsfield makes great clips but I end up stitching everything in CapCut. Is there something that keeps the whole project editable?"

**C5. Creative MCP server** (MCP, P1)
- "What MCP server can I add to Claude Code so it can generate images and videos and put them into an editable project?"
- "Is there an MCP server that lets Claude edit a video timeline, not just generate clips?"

**C6. Ad creative from product assets** (advertising, P2)
- "I sell skincare on Shopify. Can an AI make 10 short video ads from my product photos without warping the label?"
- "I need the same ad in 9:16, 4:5 and 1:1 with different hooks. What AI tool handles variants well?"

**C7. Agentic creative workspace** (category, P2)
- "I want something like Claude Code but for creative work: it should open editors, make changes and let me review."

**C8. Image editing and workflows** (images, P2)
- "Is there an open-source alternative to Krea where I can use my own API keys?"
- "I want to build an image workflow once and let my team run it with a simple form."

**C9. Alternatives** (comparison, P2)
- "I've used ComfyUI for a year. What would I gain or lose moving to NodeTool for video work?"

## 3. Existing pages that already cover clusters

| Cluster | Best existing page | Coverage |
|---|---|---|
| C1–C3 games | `/gamedev`, the `/developers` game section | Weak: no capability facts, no limits, no MCP, no comparison |
| C4 video | `/`, `/studio`, `/alternatives/runway`, `/storyboards`, `/use-cases/movie-trailer` | Partial: strong proof, no page answering "AI video editor" |
| C5 MCP | `/developers`, `/faq/use-nodetool-from-claude-code` | Partial: good install copy, no tool reference page |
| C6 ads | `/marketing`, `/ad-library`, 4 ad recipes | Strong proof, weak answer-first framing |
| C7 category | `/agents`, `/faq/what-does-agent-first-mean` | Strong on NodeTool's own terms, never uses "agentic" |
| C8 images | `/tasks/text-to-image`, `/recipes/ecommerce-sku-visual-factory` | Partial: no image-editor page |
| C9 alternatives | 35 `/alternatives/*` pages | Strong for ComfyUI and Runway. No hub (404). 20 pages share one formula |

## 4. Content gaps

1. G1. No page states what the game engine does, what agents author, what a human edits, how it exports, and what it does not do.
2. G2. No honest comparison of NodeTool with Unity, Godot (with MCP), Roblox Studio and the AI-native browser tools.
3. G3. No page answers "AI video editor with an editable timeline".
4. G4. No MCP reference page listing transports, tools, prompts and per-client setup.
5. G5. `/alternatives` returns 404, so the 35 comparison pages have no hub.
6. G6. No page for image editing (Sketch).
7. G7. `llms.txt` omits games, video editing, storyboards, ad library, MCP and blog.

## 5. Highest-value opportunities (ordered)

1. O1. Rebuild `/gamedev` as the authoritative open-source AI game engine page (C1, C2). 83 P1 queries. The SERP is owned by self-ranked vendor listicles, and Summer Engine is the only rival with MCP setup pages.
2. O2. New `/ai-video-editor` (C4). 36 P1 queries. Closest rivals (Pika Director's Suite, Palmier Pro) are new and either invite-only or video-only.
3. O3. New `/mcp` (C5). 27 P1 queries. MCP queries resolve to directory pages built from READMEs, so this page doubles as the source for directory submissions.
4. O4. New `/gamedev/ai-game-engines` comparison (C3).
5. O5. New `/alternatives` hub (C9), fixing a 404 and giving the comparison mesh a root.
6. O6. Entity consistency: one description across site JSON-LD, docs, README, package manifests, and third-party listings.
7. O7. Answer-first rewrites of `/marketing` and `/agents` intros (C6, C7).
8. O8. `/ai-image-editor` (C8).

## 6. Proposed new pages

| Page | Cluster | Status |
|---|---|---|
| `/gamedev` (rebuilt in place, URL kept because it is in the nav) | C1, C2 | PR 2 |
| `/gamedev/ai-game-engines` | C3 | PR 2 |
| `/ai-video-editor` | C4 | PR 3 |
| `/mcp` | C5 | PR 3 |
| `/alternatives` | C9 | PR 3 |
| `/ai-image-editor` | C8 | Proposed, next round |

Six pages, not hundreds. Each answers a whole cluster. No per-keyword or
per-client doorway pages: the per-client setup (Claude Code, Codex, OpenCode,
Cursor) lives as sections of `/mcp`.

## 7. Existing pages to improve instead

- `/marketing`: answer-first opening that names the product-to-ad pipeline and its real variant mechanisms (Recast, Adapt format, takes). P2.
- `/agents`: name the category in the intro ("agentic creative software") and fix "seven editors" (the FAQ lists eight). P2.
- `/storyboards` hub: title is "Example storyboards"; make it answer "AI storyboard generator" with what the editor does. P2.
- 20 first-wave `/alternatives` pages (Higgsfield through Dreamina) share one title formula, one lead sentence and one table shape. Rewrite the ones with real demand (Higgsfield, Krea title) before adding more. P2.
- Home, `/studio`, `/agents`, `/gamedev`: factual corrections found in the claim check (section 10).

## 8. Internal-link architecture

```
Home ──► /agents (category) ──► /gamedev, /ai-video-editor, /ai-image-editor, /marketing
  │                         └──► /mcp ◄── /developers
  ├──► /gamedev ──► /gamedev/ai-game-engines, /mcp#games, docs game editor, GitHub
  ├──► /ai-video-editor ──► /storyboards, /recipes/storyboard-to-trailer, /alternatives/runway, /mcp
  └──► /alternatives (hub) ──► every /alternatives/* page, /gamedev/ai-game-engines
Footer: Product column gains AI video editor and MCP server. Compare column gains All comparisons.
```

Rules: each hub links to its docs page and GitHub; anchor text names the
capability ("multi-track timeline", "MCP server for Claude Code"), never "learn
more". The main nav stays a product nav: no new items, because it already has
ten. `/mcp` and `/ai-video-editor` are reached from the footer, `/agents`,
`/developers`, and the home sections that already describe them.

## 9. Technical discovery improvements (PR 1)

What the evidence supports ([geo-practices.md](research/geo-practices.md)):
server-rendered HTML, answer-first text, accurate structured data, crawler
access, and third-party mentions. llms.txt has no demonstrated effect (Google
says it is not used; server logs show crawlers rarely fetch it), so it is kept
current because it is cheap, not expanded into llms-full.txt.

1. JSON-LD `license` points to a 404 (`LICENSE` is `LICENSE.txt`) on every page. Fix in 6 places.
2. `softwareVersion: "1.0"` (latest release is 0.8.x) and `softwareRequirements: "Node.js 22+"` (wrong for the desktop app). Remove the version, state the OS requirement.
3. Add a `WebSite` node and add docs and npm to `sameAs`.
4. robots.txt: name Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended and Applebot-Extended explicitly. They are allowed through `*` already; naming them documents intent.
5. llms.txt: add Games, Video editing, Storyboards, Ad library, MCP, Blog sections, and use each comparison page's real title.
6. Entity consistency: `docs/_config.yml` ("Local-first visual environment…"), `electron/package.json` ("node-based AI development tool") and the README use older framings.
7. Overlong meta descriptions on the main pages (`/marketing` 277 chars, `/developers` 210).

Not doing, with reasons: sitemap `lastmod` (no reliable per-page date source, and a fake date is worse than none); FAQPage on more pages (Google no longer shows the rich result, and its effect on AI answers is unproven, so only real FAQs get it).

## 10. Factual corrections found during the audit

1. "Play and edit" on `/gamedev`: the buttons are **Play** and **Install game**.
2. Home: "one .nodetool file" is wrong (projects export as `.nodetool-project`), and "ordinary files on your disk" is wrong (Studio keeps documents in a database, media as files).
3. Subscription section: says ChatGPT images need the Chrome extension, but Sign in with ChatGPT (`codex` provider) generates GPT Image without it.
4. `/agents`: "Seven editors" vs eight in the FAQ.
5. Needs your call: "no credits" copy. Cloud has a metered credit provider in code with plans, though payments are not wired up. True today for Studio and your own keys.

## 11. Video opportunities

- Own "AI video editor with an editable timeline": tracks, 10 clip types, 12 transitions, captions, keyframes, takes, Adapt format, MP4/WebM/PNG export, Premiere hand-off.
- "Create videos with Claude/ChatGPT/Gemini": honest answer. Claude plans and edits (agent), video models do the footage on your keys; Gemini plans include Veo through the tab provider.
- Storyboard generator framing on `/storyboards`.
- Don't claim: one-click upscale or lip sync in the timeline UI (agent tools only), FCPXML export (not in the menu).

## 12. Image opportunities

- Layered editor with AI layers that regenerate one layer without touching others, versions, masks.
- Product fidelity through Prop entities with reference images.
- Don't target "best AI image generator" (model question; `/models` answers it).

## 13. Advertising opportunities

- The full chain is real: product image → Prop entity → storyboard → stills → clips → timeline → Adapt format → Recast for the next SKU → export.
- 16 ad concepts ship as mini apps that build an editable ad timeline from the user's images, logo and copy.
- Don't target: AI actor libraries, ad performance prediction, auto-publishing to ad networks.

## 14. Game development opportunities

- "Open-source AI game engine" and "AI agent builds playable game": NodeTool is one of few that is open source, has its own runtime, an editor for humans, and headless playtests for agents.
- MCP game development: game tools reach Claude Code through `execute_code` and skills as slash commands. State that exactly.
- Comparison with Unity (MCP open beta), Godot + community MCP, Roblox Studio, Rosebud, Summer Engine: say plainly where those are stronger (native mobile and console export, multiplayer, 2D dynamic physics, shaders, ecosystem).
- Don't target: Roblox games, mobile game makers, multiplayer, Steam export, AAA, "Unity replacement".

## 15. Agents and MCP opportunities

- Category language: "agentic creative software", "agents that operate creative tools", "AI agent with editable output". Use it on `/agents` without dropping "creative harness".
- `/mcp` as the reference: one install command, clients, transports (stdio, HTTP `/mcp`), direct tools, `execute_code` capability surface, skills as prompts, keys.
- Off-site: submit to the MCP directories that answer these queries (glama.ai, mcpservers.org, mcp.directory, the official MCP registry). Needs your accounts.

## 16. Queries deliberately not targeted

Model questions ("best AI video generator", "Veo vs Kling vs Sora"),
competitor-vs-competitor ("Arcads vs Creatify"), Roblox, Unreal and Unity
MCP, mobile and console game makers, multiplayer builders, Steam export, AI
actors for UGC ads, ad performance prediction, "free unlimited text to video",
single-function utilities (background remover), and unrelated controls (voice
cloning apps, meeting notes). 43 corpus rows are weak or none.

## 17. Measurement

Two checks, each answering a different question.

1. [retrieval-review.py](retrieval-review.py) asks whether a page holds the
   facts an answer needs. It reads the built site, not assistant answers.
2. [mention-check.py](mention-check.py) asks whether assistants name NodeTool
   and get it right. It sends a fixed panel of 40 corpus questions to the
   search-grounded APIs of OpenAI (Responses with web search), Anthropic
   (Messages with the web search tool), Perplexity (the Agent API preset that
   replaced Sonar) and Gemini (Google Search grounding). The panel covers
   every P1 subcluster and adds the branded questions. Keys come from the
   environment, and a provider without a key is skipped.

For each answer the script records whether NodeTool is named, whether a
nodetool.ai or docs.nodetool.ai URL is cited, which competitors are named,
and flags for the known-false framings: "ComfyUI meets n8n", "visual workflow
builder", Godot export, mobile export and multiplayer. A flag counts only in a
passage that names NodeTool and a sentence without a negation, so "NodeTool
has no multiplayer" is not flagged. The flags are heuristics, so read the
`flag_evidence` column and the answers file before acting on one.

Rows append to `mention-check/mention-check-<date>.csv`, with the full answers
in a matching `.answers.jsonl`. Answers vary between runs, so compare rates
over the panel per provider (mention rate, citation rate, flagged answers),
not single answers. Run it before a page ships and again a few weeks after,
when crawlers have had time to pick the page up. Keep the panel fixed so the
runs stay comparable. When the panel must change, say so in the commit.

Bing Webmaster Tools' AI Performance report (action A5) is the only
first-party citation report found. It covers Copilot only.

## Off-site actions only you can take

1. A1. GitHub topics: add `game-engine`, `game-development`, `mcp`, `mcp-server`, `ai-agents`, `storyboard`, `video-editor`, `creative-tools`.
2. A2. Submit the MCP server to glama.ai, mcpservers.org, mcp.directory and the official MCP registry.
3. A3. Update AlternativeTo (type is "Task Automation App"), Future Tools, G2, SaaSHub descriptions.
4. A4. Update the OpenClaw `nodetool` skill description ("ComfyUI meets n8n").
5. A5. Verify nodetool.ai in Bing Webmaster Tools; its AI Performance report is the only first-party citation report found.

## Implementation plan

- PR 1: technical discovery, entity consistency, factual corrections, corpus committed to `marketing/seo/ai-discoverability/`.
- PR 2: `/gamedev` rebuilt, `/gamedev/ai-game-engines`.
- PR 3: `/ai-video-editor`, `/mcp`, `/alternatives` hub, footer links.
- Then: retrieval-readiness review of representative questions against the shipped pages.
