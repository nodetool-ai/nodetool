---
name: nodetool-skill-author
description: "Write or revise a NodeTool skill: a user skill row through create_skill, or a shipped system skill under packages/system-skills. Use when instructions should persist across sessions."
---

# Author a NodeTool skill

A skill is a named set of instructions an agent loads when its description
matches the task. Write one when the same direction would otherwise be repeated
every session. Do not write one for a single job: do the job.

## Which kind

| | User skill | System skill |
|---|---|---|
| Lives in | A row in the user's account | `packages/system-skills/<name>/SKILL.md` in the build |
| Written by | `create_skill`, `update_skill`, `delete_skill` | A file in a pull request |
| Scope | That user | Every install, on day one, with no seeding migration |
| Editable at runtime | Yes | No. Immutable, and the names are reserved so a user row cannot shadow one |

A repository skill under `.claude/skills/` is a third thing: it directs the
coding agent working on the NodeTool repository, not the agent inside the
product — the engineering loop, not a product surface. Its maintenance rules
are in a checkout's `.claude/README.md`, § Maintaining skills.

A skill that teaches a product surface is a system skill even when the coding
agent also wants it. `packages/system-skills/<name>` holds the one copy and
`.claude/skills/<name>` is a symlink to it, so the product and the repository
read the same document. Write a second copy under `.claude/skills/` and the
two drift; `npm run check:agents-docs` fails on one.

## The contract

Both kinds are the same document.

```markdown
---
name: my-skill
description: When to use this
---

The instructions.
```

- `name` is a lowercase slug, `a-z0-9-` only, at most 64 characters. It cannot
  contain `anthropic` or `claude`. A user's names must be unique per user.
- `description` is one bounded line, at most 1024 characters, with no markup.
  **It is the only part always in context**, so write it as *when to use this*,
  not as what the skill contains. A description that does not name the trigger
  means the skill never loads.
- The body must be non-empty. Frontmatter is parsed as scalar `key: value`
  pairs, not full YAML, and the fence is the first `---` line after the opening
  one, so a `---` rule inside the body survives.
- `##` headings split the body into sections a loader can fetch one at a time.
  Use them for material an agent needs only at one step.

Confirm the parse by listing it back: `list_skills` shows name and description,
`load_skill {name}` returns the full instructions.

## Write it so it fires and so it holds

- **Lead with the result, then the loop.** The reader is mid-task and will act
  on the first thing that looks like an instruction.
- **Name tools exactly.** A renamed tool in a skill is a failure a model cannot
  recover from. Check each call against the live schema or the capability
  registry before writing it.
- **State what a tool refuses**, not only what it accepts. Most skill failures
  are a call made with a field the tool drops.
- **Point at the neighbour** rather than restating it. A craft skill quotes a
  call, the contract skill owns it.
- **Do not add checkpoints or deliverables** the user did not ask for. An
  example in a skill is an illustration, not a requirement on the next request.

## Shipping a system skill

One directory holding a `SKILL.md` whose frontmatter `name` matches the
directory. Nothing imports these files, so `packages/system-skills` is not a
workspace: `stageSystemSkills` in `scripts/bundle-backend.mjs` copies every
directory into `_skills/` beside the bundled `server.mjs`, and
`scripts/verify-backend-bundle.mjs` fails a build that misses one. A new
directory ships with no other change.

Discovery order is `_skills/` beside the bundle, else `packages/system-skills`
on the way up, else `NODETOOL_SYSTEM_SKILLS_DIR`. Only `SKILL.md` is read: a
skill ships as one document, so material that would have been a `references/`
file belongs in a `##` section of the body.

Symlink the new directory into `.claude/skills/<name>` when the repository's
coding agent should reach it too.

Two follow-ups a new system skill usually needs:

- Nothing, for the tool names: `packages/agents/tests/shipped-skill-names.test.ts`
  reads every snake_case call out of every shipped skill and checks it against
  the registry, so a new directory is covered as soon as it exists. A skill
  whose body names timeline calls can also go in that test's `SKILL_NAMES`,
  which matches them exactly against the capability specs and `edit_timeline`'s
  op list.
- A skill that guides one model line goes in `MODEL_PROMPTING_SKILLS`
  (`packages/agents/src/model-prompting-skills.ts`) so `find_model` attaches it
  to a matching route. `packages/agents/tests/model-prompting-skills.test.ts`
  checks that table against the skills on disk, the model ids the shipped
  provider manifests name, and the capability registry.

## Reference

In a NodeTool checkout, these repository sources go further:

- `packages/system-skills/README.md` — the shipped set, and how one job
  routes across it.
- `packages/agents/src/system-skills.ts` — loader and discovery rules.
- `packages/protocol/src/skill-document.ts` — the parser and the validators.
