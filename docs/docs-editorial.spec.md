# Docs Editorial Spec

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [Writing Style](WRITING_STYLE.md) | [Brand & Verbal Guidelines](BRAND.md) → **Docs Editorial Spec**

Rules for pages published on docs.nodetool.ai. [Writing Style](WRITING_STYLE.md)
covers word choice for all prose in the repo. This spec covers what a docs
page must contain and what it must leave out.

A reader opens the docs to build a mental model, copy a working pattern, or
debug a failure. They are already using NodeTool. A page that sells the
product, or repeats a schema in sentences, delays all three.

## Invariants

Every published page follows these. `npm run check:docs-prose` enforces the
first one, and Docs CI runs it on every pull request that touches `docs/`.

1. **No marketing adjectives.** The banned list is `BANNED` in
   [`scripts/check-docs-prose.mjs`](../scripts/check-docs-prose.mjs)
   (effortless, seamless, powerful, revolutionary, intuitive, next-generation,
   and others). State what the system does mechanically. "Renders the
   timeline on the GPU" replaces "blazing fast rendering".
2. **No schema restatements.** A description that repeats a field's name and
   type adds nothing. `Prompt (str): The prompt to send to the model` gets
   deleted, not reworded. Write prose for a field only when it has a default
   worth knowing, a valid range, a format constraint, a side effect, or a
   failure mode. Leave the cell empty otherwise.
3. **Artifact before prose.** A concept or reference page shows a concrete
   artifact in its first screen: a CLI command, a graph snippet, a directory
   tree, a JSON payload, a tool call, or a screenshot of the result. One
   sentence of context may precede it.
4. **Constraints up front.** A guide or model page states its operating bounds
   before step one: local or cloud, which API keys or subscriptions it needs,
   and hardware minimums. Take hardware numbers from code or model metadata.
   If the code does not say, write "not measured" or leave the line out.
   Never estimate VRAM.
5. **Failure modes.** A reference page lists what happens when things go
   wrong: a missing API key, a rate limit, a missing local weight file, a
   cancelled run, a locked track. Describe the actual behavior from code: the
   error text, whether the run stops or continues, what the user sees.
6. **Code is the source of truth.** Every payload, flag, path, default, and
   error message on a page must match the code it describes. Do not invent
   example output. Copy it from a test, a fixture, or a real run.

## Cut on sight

| Pattern | Example | Fix |
|---|---|---|
| Value-proposition opener | "NodeTool's agent-first workspace lets you orchestrate…" | Delete. Start with what the feature does. |
| Why-it-matters essay | Two paragraphs on why flat video files are a problem | Delete, or keep one sentence that states the mechanism. |
| Schema in prose | "The `temperature` parameter controls the temperature." | Delete the sentence. Keep the table row. |
| Narrated obvious UI | "Click the button in the top right to open Settings, then navigate to…" | "Open **Settings → Providers**." |
| Repeated setup | Installing NodeTool or adding an API key at the top of every guide | Link [Installation](installation.md) or [Providers](providers.md) once in Prerequisites. |
| Bold-label bullet that restates its label | `**Live preview**: See a live preview.` | Say what the preview shows, or cut the bullet. |
| Closing summary | "In summary, the Storyboard Editor…" | Delete. |
| Feature tour without a result | A list of every panel with no task attached | Replace with one task that uses the panels, or a reference table. |

## Page archetypes

Each page has one job. URLs stay where they are. The table maps existing
pages to the archetype whose template they follow. When a page mixes two
jobs, split the content with headings in the archetype order, or move the
second job to the page that owns it.

| Archetype | Job | Must show | Cut |
|---|---|---|---|
| Quickstart | Zero to one finished result | Copy-paste commands or exact clicks, the expected output | Architecture, editor tours, provider matrices, config flags |
| Concept | The mental model of one subsystem | A trace, state diff, file tree, or payload | Step-by-step UI tutorials, positioning |
| Guide | One reproducible task end to end | Prerequisites with constraints, numbered steps, the output file or screen | Feature overviews, install and API key setup beyond a link |
| Reference | Fast lookup | Tables of inputs, outputs, types, defaults, ranges, errors | Introductory essays, sentences that restate a field |
| Developer | Extend or drive NodeTool from code | Minimal working code, flags, config, wire examples | GUI walkthroughs, what an AI agent is |

### Page map

| Archetype | Pages |
|---|---|
| Quickstart | `installation`, `getting-started`, `first-workflow`, `game-engine/quick-start` |
| Concept | `key-concepts`, `data-types`, `glossary`, `architecture`, `execution-strategies`, `execution-lifecycle`, `agent-memory`, `memory`, `projects`, `workspaces`, `models`, `models-and-providers`, `cookbook/core-concepts`, `game-engine/` overview and engine subsystem pages |
| Guide | `tutorials`, `cookbook`, `cookbook/patterns`, `use-cases`, editor pages (`storyboard-editor`, `video-editor`, `sketch-editor`, `3d-editor`, `game-editor`, `audio-editor`, `script-editor`, and the rest of the Creative Editors and Workflow Editor sections), `guided-flows`, `mini-apps-guide`, `app-builder`, integration pages, deployment pages, `comfyui-setup`, `troubleshooting` |
| Reference | `providers`, `mini-apps-reference`, `configuration`, `keyboard-shortcuts`, `cli`, `api-reference`, `workflow-api`, `websocket-api`, `chat-api`, `harnesses`, `python-bridge-protocol`, `costs-and-credits`, `nodes/` |
| Developer | `developer/` and its pages, `javascript-sandbox`, `js-scripts`, `mcp-server`, `mcp-production`, `node-packs`, `dev-environment`, `packages` |

`comparisons` (Why NodeTool), `index`, `faq`, `privacy`, and `changelog`
are positioning or help pages. They follow the invariants but no template.

## Templates

### Concept page

1. **Mechanism.** One sentence that defines the subsystem by what it does.
   "A storyboard is a JSON document of shots, each with a prompt, references,
   and a render slot that holds the generated media."
2. **Artifact.** The trace, payload, tree, or diff that shows it working. For
   agent features, show the prompt, the tool call with its arguments, and the
   resulting change to the document.
3. **Invariants and boundaries.** Bullets: what can change it, what needs
   approval (paid generations, deletes), where its files live on disk.
4. **Related.** Links to the guide and reference pages that use it.

### Guide page

1. **Constraints block.** Local or cloud, required keys, hardware, time.
   Use a `.callout-note` block (see [Callouts](#callouts)).
2. **Prerequisites.** Links, not repeated setup.
3. **Steps.** Numbered. Each step names the input, the action, and what you
   should see. Skip steps a user would do without being told.
4. **Result.** The output file, screen, or command output.
5. **If it fails.** Two to five failure states with the fix.

### Reference page

1. **Header.** Name, one-line mechanism, execution target (local CPU/GPU or
   cloud API), and a link to the source file on GitHub.
2. **Signature.** `Input | Type | Default | Constraints` and
   `Output | Type` tables. Empty constraint cells are fine.
3. **Behavior and edge cases.** Two to four bullets on non-obvious mechanics:
   caching, chunking, memory use, format coercion.
4. **Example.** One minimal graph snippet, CLI call, or request that runs.
5. **Errors.** What fails and what the user sees.

## Callouts

A callout is a blockquote followed by a kramdown IAL class. Use callouts for
constraints and warnings, not decoration.

```markdown
> **Runs:** locally. **Needs:** no API key. **Hardware:** 8 GB VRAM (from model metadata).
{: .callout-note}
```

`.callout-tip` and `.callout-warning` are also available.

## Checklist for a docs pull request

- [ ] `npm run check:docs-prose` passes.
- [ ] Every page touched opens with its mechanism or artifact, not a pitch.
- [ ] No table cell or bullet restates a field name.
- [ ] Guides state local or cloud, keys, and hardware before step one.
- [ ] Reference pages list failure modes.
- [ ] Every payload, path, and error string was checked against code.
- [ ] The Jekyll build and htmlproofer pass, as in `.github/workflows/docs-ci.yml`.
