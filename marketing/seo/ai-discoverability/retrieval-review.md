# Retrieval-readiness review

Date: 2026-10-17. Branch `claude/ai-discoverability-4l2i1b` (PR 6741), built
with `next build` and served with `next start`.

## Method

Each row is a representative question from [query-corpus.csv](query-corpus.csv),
one or more per cluster, weighted toward P1 rows. For each, I listed the facts
an assistant needs to answer it and recommend NodeTool accurately. A script
fetched the server-rendered HTML of the target page, removed scripts and tags,
and checked that each fact appears as text. AI crawlers do not run JavaScript,
so only server-rendered text counts.

The script is a presence check. It shows that the facts are on the page.
It does not show that an assistant will retrieve or cite the page. That
depends on crawling, indexing and off-site mentions, which this branch does
not control. Rerun the review after deploy with live answers from ChatGPT,
Claude, Gemini and Perplexity (see the strategy's measurement section).

## Result

34 answered, 1 partial, 2 gaps, out of 37 questions.

| Cluster | Question | Page | Verdict | Detail |
|---|---|---|---|---|
| games | Can an AI agent build a playable game I can keep editing? | `/gamedev` | Answered | all facts on page |
| games | Can Claude Code build a game? | `/gamedev` | Answered | all facts on page |
| games | What is the best open-source AI game engine? | `/gamedev/ai-game-engines` | Answered | all facts on page |
| games | Which game engines support MCP? | `/gamedev/ai-game-engines` | Answered | all facts on page |
| games | Is NodeTool a Unity or Godot replacement? | `/gamedev` | Answered | all facts on page |
| games | Can I export a NodeTool game to iOS or Android? | `/gamedev` | Answered | all facts on page |
| games | Does NodeTool support 3D games and physics? | `/gamedev` | Answered | all facts on page |
| games | What language are game scripts in? | `/gamedev` | Answered | all facts on page |
| games | Generate sprites and music for my game with AI | `/gamedev` | Answered | all facts on page |
| games | Does NodeTool do multiplayer? | `/gamedev` | Answered | all facts on page |
| video | AI video editor with editable timeline | `/ai-video-editor` | Answered | all facts on page |
| video | Can Claude edit a video timeline? | `/ai-video-editor` | Answered | all facts on page |
| video | Keep the same character across AI video shots | `/ai-video-editor` | Answered | all facts on page |
| video | Change one shot without regenerating everything | `/ai-video-editor` | Answered | all facts on page |
| video | Switch between Veo, Kling and Seedance without three subscriptions | `/ai-video-editor` | Answered | all facts on page |
| video | Script to storyboard to edit | `/ai-video-editor` | Answered | all facts on page |
| video | Export AI edit to Premiere Pro | `/ai-video-editor` | Answered | all facts on page |
| video | Open-source alternative to Runway | `/alternatives/runway` | Answered | all facts on page |
| video | Example AI short films with storyboards | `/storyboards` | Answered | all facts on page |
| mcp-dev | MCP server for image and video generation in Claude Code | `/mcp` | Answered | all facts on page |
| mcp-dev | MCP server that edits a video timeline | `/mcp` | Answered | all facts on page |
| mcp-dev | Cursor MCP image generation | `/mcp` | Answered | all facts on page |
| mcp-dev | Connect Claude Desktop to local image generation on Mac | `/mcp` | Answered | all facts on page |
| mcp-dev | Difference between ComfyUI MCP and NodeTool | `/mcp` | Answered | all facts on page |
| mcp-dev | Call AI workflows from CI or a script | `/developers` | Partial | missing: /api/workflows |
| mcp-dev | Does the MCP server need the desktop app? | `/mcp` | Answered | all facts on page |
| advertising | Turn product photos into video ads I can edit | `/marketing` | Answered | all facts on page |
| advertising | Make 9:16, 1:1 and 4:5 versions of an ad | `/ai-video-editor` | Answered | all facts on page |
| advertising | AI UGC product video | `/recipes/ugc-product-video` | Answered | all facts on page |
| advertising | AI ad examples to copy | `/ad-library` | Answered | all facts on page |
| agentic-category | What is an open-source creative harness for Claude Code? | `/agents` | Answered | all facts on page |
| agentic-category | Can I approve each step an AI agent takes? | `/agents` | Gap | missing: approv |
| comparison | NodeTool vs ComfyUI | `/alternatives/comfyui` | Answered | all facts on page |
| comparison | NodeTool alternatives and comparisons | `/alternatives` | Answered | all facts on page |
| comparison | NodeTool vs Higgsfield | `/alternatives/higgsfield` | Answered | all facts on page |
| image | Layered AI image editor with masks | `/ai-image-editor` | Gap | page HTTP Error 404: Not Found |
| image | Open-source AI image editor that agents can use | `/studio` | Answered | all facts on page |

## Findings

1. F1. Games, video, MCP and comparison questions now have a page that
   answers them directly, including the "what it does not do" questions
   (mobile export, multiplayer, Unity replacement, FCPXML).
2. F2. `/developers` renders its REST example inside a client component.
   The curl command appears only in the serialized payload, not as text, so
   crawlers that read text miss "call a workflow from CI". Render the code
   block on the server, or repeat the endpoint in prose.
3. F3. `/agents` never says how a person approves agent actions. The product
   has Plan, Default and Auto permission modes and an approval card. Add one
   section that names them, after the Auto-mode claim in the capability sheet
   is checked (the Auto label promises "asks once", and the gate code allows
   every call in Auto).
4. F4. `/ai-image-editor` does not exist yet (strategy item O8). Image editor
   questions now land on `/studio`, which mentions layers and sketches only
   briefly.

## Rerun

```bash
cd marketing && npx next build && npx next start -p 3100
python3 -I seo/ai-discoverability/retrieval-review.py
```
