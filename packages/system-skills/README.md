# System skills

The instruction documents NodeTool ships. A user skill is a row somebody wrote
and can rewrite; a system skill is a `SKILL.md` in the build — same shape in the
prompt, immutable, and present on every install with no seeding migration to
drift. Loader and discovery rules live in
`packages/agents/src/system-skills.ts`.

One directory per skill, holding a `SKILL.md` whose frontmatter `name` matches
the directory. Nothing imports these files, so this is not a workspace:
`stageSystemSkills` in `scripts/bundle-backend.mjs` copies every directory here
into `_skills/` beside the bundled `server.mjs`, and
`scripts/verify-backend-bundle.mjs` fails a build that misses one. A new
directory ships with no other change.

`SKILL.md` is the whole skill. Only that file is staged and only that file is
read, so material that would have been a `references/` file goes in a `##`
section of the body, which `load_skill` returns in one piece.

A skill the repository's own coding agent also wants is symlinked, not copied:
`.claude/skills/<name>` points here. `npm run check:agents-docs` fails on a
second copy, a broken link, a frontmatter name that disagrees with its
directory, and a file beside `SKILL.md` — the last two are mistakes the loader
would otherwise absorb in silence, leaving the skill out of the catalog with no
error anywhere.

## The surfaces

One skill per NodeTool document kind, for the agent inside the product and the
one working on this repository alike.

| Skill | Surface |
| :--- | :--- |
| `nodetool-workflow-builder` | Workflow graphs, and the routing table for when a graph is the wrong document |
| `nodetool-app-builder` | Mini apps: operations, widgets, bindings, variables, resources |
| `nodetool-sketch` | Sketches (image documents): layers, blend modes, placed images, briefs, versions |
| `nodetool-3d-scene` | glTF models: objects, transforms, lights, materials, headless Blender renders |
| `nodetool-js-scripting` | The QuickJS sandbox: Code node bodies, JS script documents, packs, calling nodes from code |
| `nodetool-video-post` | Repairs on delivered footage, and the candidate review protocol they return |
| `nodetool-rag-indexing` | Ingestion, vector collections, retrieval, the RAG loop |
| `nodetool-browser-agent` | Browser automation agents: navigation, extraction, forms |
| `nodetool-custom-node-developer` | New TypeScript node types and node packages |
| `nodetool-model-provider-config` | Providers, credentials, local models, model selection |
| `nodetool-api-reference` | REST, tRPC, MsgPack WebSocket, MCP, the OpenAI-compatible chat API |
| `nodetool-chat-cli` | Chat CLI sessions, provider selection, Global Chat |
| `nodetool-deployment` | Servers and workers: Docker, SSH, Runpod, cloud |
| `nodetool-troubleshooter` | A failing run, routed to the surface it belongs to, and stuck generations |
| `nodetool-skill-author` | Writing a user skill row or a shipped one |
| `storyboard-core` | Storyboards, entity casting, rendering, timeline assembly — the contract the job skills quote |
| `godot-game` | A playable Godot game or a complete asset pack |

The job skills that sit on `storyboard-core`, each one a brief shape rather
than a tool contract: `ugc-video`, `product-commercial`, `script-video`,
`short-film`, `video-clone`, `launch-kit`, `video-workflow`.

## The craft and the model lines

| Skill | Answers |
| :--- | :--- |
| `motion-graphics` | The timeline tool contract: roles, presets, transitions, groups, masks, mattes, effects, validate and preview |
| `motion-curves` | Custom animations — curves by hand, or a JS body baked in the sandbox |
| `motion-principles` | Durations, easing, stagger, weight, anticipation — the numbers before the call |
| `motion-direction` | The motion language a whole piece obeys, and the audit against it |
| `frame-composition` | Grids, focal placement, safe areas, depth and parallax, camera moves |
| `beat-sync-editing` | The beat grid, cut types, pacing arc, speed ramps |
| `color-motion` | Palettes, gradient fills, the grade chain, which colour channels move |
| `logo-reveal` | Stings: draw-on, wipe, build, wordmark, sound-logo sync |
| `motion-background` | Ambient beds that loop and stay behind |
| `caption-titles` | What on-screen text says and when it appears |
| `video-audio-continuity` | Sound across a multi-scene cut — one clip carrying every scene, or a track of your own |
| `explainer-storyboard`, `commercial-beat-sheet`, `launch-commercial`, `music-video-treatment` | Board shapes for four brief types |
| `trailer-template` | Trailers and teasers: eight audio-first beats on a runtime-scaled grid, event/reception pairs, the drop at ~65%, one unbroken music bed |
| `nano-banana-pro-prompting` | Nano Banana Pro: the art-director brief, and lock/change/amount/constraints for edits |
| `gpt-image-2-prompting` | GPT Image 2: five slots, change-versus-preserve edits, labelled multi-image compositing |
| `flux-2-klein-prompting` | FLUX.2 [klein]: the subject-first hierarchy, guidance and step choices, the seed-locked loop |
| `seedance-2-prompting` | Seedance 2: subject and motion first, quoted dialogue, the sound brief, cuts in one take |
| `veo-3-prompting` | Veo 3: the five-element structure, cinematography vocabulary, duration and audio economics |
| `minimax-h3-prompting` | MiniMax H3: which endpoint, a job per reference, timed shot lists, native audio direction |
| `wan-2-6-prompting` | Wan 2.6: the three modes and the prompt shape each one wants |
| `kling-video-prompting` | Kling 2.5-turbo and later: the shot list, tagged elements, the labelled dialogue format |
| `hailuo-prompting` | MiniMax Hailuo: beats in order, the Director bracket commands, no negative prompt |
| `seedream-prompting` | Seedream 4 and 5: the six-layer brief, quoted copy, pinning what an edit must not change |
| `qwen-image-prompting` | Qwen-Image: typography — exact copy, relative layout, twelve scripts, expansion off |
| `elevenlabs-audio-prompting` | ElevenLabs: audio tags and stability, the dialogue list, sound-effect briefs, composition plans |
| `stable-audio-prompting` | Stable Audio: genre/instruments/mood/BPM, the TrackType tags, which dials the distilled checkpoints ignore |

The `*-prompting` skills are the model-line guides. Each one is triggered
twice: its description names the model ids across every provider that serves the
line, and `find_model` attaches `prompting_skill` to a matching route so the
guide surfaces at the step before the prompt is written. The table behind the
second path is `MODEL_PROMPTING_SKILLS` in
`packages/agents/src/model-prompting-skills.ts`, and
`packages/agents/tests/model-prompting-skills.test.ts` checks it against the
skills on disk, the model ids the shipped provider manifests actually name, and
the capability registry. A new line means a directory here plus a row there.

`motion-graphics` carries the mechanics and the other motion skills carry the
craft. A skill quotes calls rather than teaching them, and a renamed tool leaves
it teaching a spelling no model can use, so
`packages/agents/tests/shipped-skill-names.test.ts` reads every snake_case call
out of every skill in this directory and checks it against the registry. A new
directory is covered with no entry to add.

It checks at two strengths. The motion skills its `SKILL_NAMES` lists are
matched exactly against the capability specs and `edit_timeline`'s op list, and
`motion-graphics` additionally has to name every shipped preset and stagger
unit. Every other skill is matched against the wider vocabulary the registry
writes about itself, because `edit_sketch`, `edit_model3d` and
`edit_storyboard` declare their ops in prose rather than an enum — there is no
list to compare against. A call that is neither is exempted by name in
`NOT_A_BACKEND_CALL`, with the reason it is not a rename waiting to happen.

## How the set routes

One job crosses the whole set in a fixed order, and each skill hands off at
the same seams:

1. **Brief → board.** A board skill (`commercial-beat-sheet`,
   `launch-commercial`, `explainer-storyboard`, `music-video-treatment`,
   `trailer-template`) resolves entities, writes the beats and stores them
   with `create_storyboard` / `edit_storyboard`. A job skill on
   `storyboard-core` decides what the picture looks like over the same board,
   and the two compose: structure from one, look from the other. The storyboard and entity call
   shapes — return fields, the five ops, what `set_board` accepts, which
   entities a shot's prompt receives, what text the generator actually reads —
   live once, in `commercial-beat-sheet` § Tool contract, and the other four
   point there.
2. **Board → model.** Before the shot text is written, `find_model` picks the
   image and video lines, `set_board {image_model, video_model}` makes them the
   render defaults, and the `prompting_skill` on each result names the
   `*-prompting` guide that decides how `action` and `motion` are worded.
3. **Sound, before the first render.** `video-audio-continuity` decides whether
   a multi-scene piece is one native-audio generation or separate clips under
   a track of your own; the audio guides (`elevenlabs-audio-prompting`,
   `stable-audio-prompting`) write that track.
4. **Render → cut.** `assemble_storyboard_timeline` turns the board into the
   document `motion-graphics` edits; `beat-sync-editing` sits the cuts on the
   bed, `caption-titles` adds every word on screen (never a render prompt),
   `logo-reveal` the mark, `color-motion` the grade, `motion-direction` the one
   motion language, and the rest of the craft skills the numbers.

Every skill states where the rest of the set picks up along that path. A craft
skill opens by pointing back at `motion-graphics` for the op contract and
sideways at the neighbours that decide its numbers; a board skill points
forward at the motion skills at the step where a board becomes a cut, so an
agent asked to animate a finished board loads the craft file instead of
improvising against the op list.

## Credit

The craft skills beside `motion-graphics` are adapted from
[iart-ai/motion-design-skills](https://github.com/iart-ai/motion-design-skills)
(MIT, commit `3c129f7`), rewritten against NodeTool's timeline: its animation
roles and preset catalog, its easing grammar, the animatable channels and how
they fold, and the validate-and-preview loop that closes each one. Upstream's
After Effects and Remotion skills have no counterpart — `motion-graphics` holds
the tool contract and `motion-curves` the sandbox bake, which is what those two
answer for this engine. The licence is kept at
`LICENSE-iart-motion-design-skills`.
