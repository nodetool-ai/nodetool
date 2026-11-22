# NodeTool Manifesto

Most AI creative apps ask you to pay for a roll and hand back a flat file. When the lighting on shot four is wrong or a voice line drags, you regenerate and hope the next roll
matches. That works for a one-off test. It breaks on real production work, where the job is revising one detail while keeping everything else intact.

## Return an editable project

When an agent builds a film, an ad, a sketch, or a game, it leaves behind the working documents: the storyboard, script, takes, and multi-track timeline for video, the layers for a
sketch, the scene for 3D, or the entities and scripts for a game. Every piece stays open. Change one shot or update an upstream input, and only the stale work reruns.

## Put agents and people in the same editors

A chat window that tells you which buttons to click still leaves the manual work on your desk. In NodeTool, the agent edits the storyboard, script, timeline, sketch, 3D, game, and
node documents directly, using the same actions you trigger by hand. External agents such as Claude Code, Codex, and Cursor reach the same toolbelt over MCP. Let an agent build the
first pass, take over to tighten the cut, and send the project back with a note when you want another round.

## Turn one good result into a repeatable pipeline

Generating a single clip is easy. Shipping twenty ad variants or keeping a character steady across ten episodes requires a pipeline you can rerun. When a step works, you can inspect
the typed node graph behind it, bind it to a timeline clip or sketch layer, and execute the same pipeline headlessly from the CLI, an API, or a mini app. What worked on one piece
runs again next week without retyping the brief.

## Pay providers directly, or run locally

Models change every month, so a creative tool should stay out of the middle of your model bill. In Studio, run the agent on the ChatGPT, Claude, or Gemini plan you already pay for,
within that plan's limits. Call cloud models through your own API keys at each provider's published price. When privacy or offline work matters, run open-weight models on your own
GPU or Apple Silicon through Ollama, llama.cpp, MLX, or local Python runtimes, bounded by your hardware memory. NodeTool Cloud (in alpha) adds optional hosted storage and hosted
credits for trying the workspace in a browser without setup, while Studio and self-hosted installs carry no platform billing.

## Show the mechanics, then step back for the output

A project you open a week later should still make sense. Inputs, types, model choices, cost estimates, and stale clips stay visible in the document, with no silent prompt rewrites.
We expose how a run works before wrapping it in shortcuts. Once the image, clip, or audio lands, the interface gets out of the way so you can judge the work on its own.

## Keep the source open under AGPL-3.0

Creative tools outlive their vendors only when anyone can read the code, modify it, and run it on their own hardware. NodeTool is licensed under AGPL-3.0. Studio is free to
download, self-hosting requires no permission, and modifications to a hosted deployment stay open under the same license.
