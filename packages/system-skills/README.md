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

## What is here

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
craft. A craft skill quotes calls rather than teaching them, so
`packages/agents/tests/motion-graphics-skill-names.test.ts` checks every
snake_case call in all ten against the capability registry and
`edit_timeline`'s op list — a renamed tool fails there rather than in a model's
hands. Add a skill to `SKILL_NAMES` in that test in the same change. The four
board skills stay out of it: each names `set_entities` in order to say the op
does not exist, and that check cannot tell such a warning from a typo.

Every skill states where the rest of the set picks up. A craft skill opens by
pointing back at `motion-graphics` for the op contract and sideways at the
neighbours that decide its numbers; a board skill points forward at the motion
skills at the step where a board becomes a cut, so an agent asked to animate a
finished board loads the craft file instead of improvising against the op list.

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
