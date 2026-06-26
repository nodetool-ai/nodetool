---
layout: page
title: "Writing Style"
permalink: /writing-style
description: "How to write docs, READMEs, and AGENTS.md files for NodeTool — concise, direct, no AI slop."
---

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [DEVELOPMENT_STANDARDS §19](DEVELOPMENT_STANDARDS.md#19-documentation--comments) → **Writing Style**

How to write prose in this repo: docs, READMEs, AGENTS.md files, PR descriptions, comments. The goal is text a reader trusts — concrete, short, free of the filler that marks machine-generated copy.

This applies to humans and agents alike. When an agent edits a Markdown file, it follows these rules and fixes violations it passes.

## The rule

Write what's true, in the fewest words that stay clear. Cut anything that doesn't add information. If a sentence survives deletion without losing meaning, delete it.

## Forbidden expressions

These are the words and phrases that mark AI slop. Do not use them. Most have a shorter, plainer replacement; often the fix is to delete the word.

### Inflated verbs

`leverage` → use · `utilize` → use · `delve into` → cover · `dive into` → see · `unlock` · `unleash` · `harness` · `empower` · `elevate` · `supercharge` · `streamline` · `foster` · `bolster` · `amplify` · `revolutionize` · `facilitate` · `underscore` → show · `illuminate` · `embark` · `navigate` (figurative) · `unravel` · `spearhead`

### Inflated adjectives

`seamless` / `seamlessly` · `robust` · `powerful` · `effortless` · `cutting-edge` · `state-of-the-art` · `next-generation` · `world-class` · `best-in-class` · `revolutionary` · `groundbreaking` · `game-changing` · `comprehensive` · `holistic` · `innovative` · `transformative` · `pivotal` · `bespoke` · `blazing fast` / `blazingly fast` · `lightning-fast` · `first-class` · `battle-tested` · `production-grade` (as a boast)

### Filler nouns

`tapestry` · `landscape` (figurative) · `realm` · `world of` · `synergy` · `testament` · `treasure trove` · `plethora` · `myriad` · `cornerstone` · `beacon` · `journey` (figurative) · `ecosystem` (as filler) · `powerhouse` · `paradigm`

### Throat-clearing and hedges

`it's worth noting that` · `it's important to note that` · `it should be noted` · `keep in mind that` · `as you can see` · `needless to say` · `at the end of the day` · `when it comes to` · `in the world of` · `in today's fast-paced world` · `in today's digital age` · `let's dive in` · `let's unpack` · `simply put` · `rest assured` · `that being said` · `it goes without saying`

### AI-cadence transitions

Don't open sentences with these out of habit: `Furthermore` · `Moreover` · `Additionally` · `Notably` · `Importantly` · `Essentially` · `Ultimately` · `Indeed` · `Consequently` · `Subsequently`. Use a plain `And`, `But`, `So`, `Also`, or no transition at all.

### Marketing filler

`gone are the days` · `say goodbye to` · `look no further` · `the possibilities are endless` · `whether you're a beginner or an expert` · `unlock the power of` · `take it to the next level` · `at your fingertips` · `with just a few clicks` · `out of the box` (prefer "by default") · `and much more` / `and more!` · `wide range of` / `rich set of` (say the number or the list)

### Banned patterns

- **The "it's not just X, it's Y" frame.** "NodeTool isn't just a tool, it's a workspace." Cut it. State what it is.
- **Rule of three for rhythm.** "Fast, reliable, and scalable." Three adjectives where one fact would do. List specifics or pick the one that matters.
- **"Whether you're X or Y" openers.** Address the reader's actual task instead.
- **Bold-label bullets that restate the label.** `**Live Preview**: See a live preview` — the body must add information the label doesn't.
- **Emoji as decoration** in body text or headings. Status markers in a comparison table (✅ / ⚠️ / ❌) are fine.
- **Concluding summary paragraphs** ("In conclusion…", "Overall, NodeTool…") that repeat what was already said.
- **Em-dash overuse.** One per paragraph at most. A comma, period, or parenthesis usually reads cleaner.

## Write like this

| Don't | Do |
|---|---|
| "Seamlessly integrate with your existing workflow" | "Runs your workflow over the API" |
| "A comprehensive suite of powerful tools" | "12 built-in tools" (name them, or link the list) |
| "Leverage the power of local models" | "Run models locally" |
| "NodeTool empowers you to unlock your creativity" | "NodeTool wires every model onto one canvas" |
| "It's worth noting that the cache is per-URL" | "The cache is per-URL." |
| "Robust error handling ensures reliability" | "Errors surface in the node; the run keeps going" |
| "In today's fast-paced AI landscape…" | (delete — start with the point) |

## Checklist

Before committing prose, scan for:

- [ ] No word or phrase from the forbidden lists above.
- [ ] No sentence that survives deletion without losing meaning.
- [ ] Every bold-label bullet adds information beyond its label.
- [ ] Claims are concrete: numbers, names, file paths — not "powerful" or "wide range".
- [ ] At most one em-dash per paragraph.
- [ ] No opening throat-clear and no closing summary that repeats the body.

## Related

- [DEVELOPMENT_STANDARDS §19 Documentation & Comments](DEVELOPMENT_STANDARDS.md#19-documentation--comments) — comment and README rules
- [Root AGENTS.md](../AGENTS.md) — repo rules for agents and contributors
- The `unslop` skill (`.claude/skills/`) — the equivalent pass for code
</content>
</invoke>
