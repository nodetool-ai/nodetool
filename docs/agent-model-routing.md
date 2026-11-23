# Agent Model Routing

This page sets which model does which kind of work when an orchestrator agent
delegates. It covers Claude Opus, Sonnet and Haiku subagents, Codex with
GPT-6.1 Sol ("Sol"), and Google Antigravity `agy` with Gemini 4 Neon ("Neon").
Read [Agent Rules](../AGENTS.md) and the
[Development Standards](DEVELOPMENT_STANDARDS.md) first. This page adds
delegation rules only.

## Routing Table

| Task type | Primary model | Reviewer |
|---|---|---|
| React UI, Qt Quick UI, visual polish, UX copy | Opus | Neon first review, Sol second review |
| Backend TypeScript, protocol, persistence | Neon or Sol | Neon first review, Sol second review |
| Native C++, threads, audio, low-level engine work | Sol, Neon for the hardest problems | Neon first review, Sol second review |
| Hard engineering: concurrency, tick math, contracts | Neon | Sol second review |
| Fixes from a review round, native | Sol | Sol second review |
| Fixes from a review round, web and TypeScript | Sonnet with the [fix-agent prompt rules](#fix-agent-prompt-rules), or Sol | Sol second review |
| First sweep review of a feature | Neon | Not applicable |
| Closure review after each fix round | Sol | Not applicable |
| Web search, page extraction, summaries | Haiku | Not applicable |

Do not route UI work to Sol. When a Sol or Neon task changes QML or React
views, an Opus screenshot pass follows it before the task closes. Do not use Sol for the first sweep review. Its
static pass is narrow, and Neon covers more surface in one review.

## Review Pipeline

1. Run the first review with `agy` and Neon in plan mode, with no shell. Give
   it the contract, the diff and a no-shell rule. Ask for one defect per
   finding ID, so that each closure can be checked.
2. Send the findings to a fix agent selected from the [routing table](#routing-table).
3. Run the second review with Codex: `codex exec -s read-only ... < /dev/null`.
   Close stdin, or `codex exec` waits for input and never returns. Set a
   timeout. Ask for the closure list first, then for new defects.
4. Never accept a fix-agent rejection without a second check. Send each
   rejection to Sol with the contract clause. Accept the rejection only when
   Sol agrees, or when the fix agent attaches a test that shows the defect does
   not reproduce.
5. Repeat steps 2 to 4. Stop when a second review finds fewer than 3 new
   defects.

## Invocation Rules

- `agy` implementation runs may use `--dangerously-skip-permissions`. Review
  runs use plan mode with no shell. A review prompt also says "Do not write or
  edit any file. Print the whole review as your final answer." Without it, a
  reviewer that tries to save its review is blocked and prints nothing.
- Do not use the Codex sandbox bypass flag. Use `-s read-only` for reviews and
  the workspace-write sandbox for implementation.
- Measure free memory before you spawn an agent. Run at most two agents at
  once.
- Run one native build at a time, with `-j4`.
- Run test runners with `--maxWorkers=2`.
- Do not build an app bundle, sign code or touch Keychain paths. Native agents
  build `tst_*` targets only.
- Run GUI apps headless only. Do not open visible windows.
- Cancel a delegated task when its agent stops. A task that keeps running can
  change files after the orchestrator reads the result.

## Fix-Agent Prompt Rules

Put these rules in every fix-agent prompt. Each rule answers a failure that the
[project evidence](#project-evidence) records.

1. Write a red test first for each item. Run it against the old code and show
   the failing line in the report.
2. Do not reject an item that the contract requires. List a disputed item as
   open, with the contract clause, and let the reviewer decide.
3. Fix each item fully, or list the rest as open. Do not report a partial fix
   as done.
4. Format only the lines you changed. Do not run prettier on whole files.
5. Run the related tests only. Do not start a whole-package or whole-app Jest
   run.
6. Send one final report.

## Vendor Guidance

Facts below come from official vendor pages. Third-party opinion is marked.

- Opus 5.5: Anthropic says it leads in agentic coding and suits long jobs such
  as codebase-wide audits. One customer quote on the page rates its graphics
  and polish highest in a game-building test
  ([Anthropic](https://anthropic.com/news/claude-opus-5-5)).
- Sonnet 5.5: Anthropic positions it as the faster, lower-cost complement to
  Opus for well-scoped tasks. It says Opus stays stronger at open-ended work
  that needs sustained judgment
  ([Anthropic](https://www.anthropic.com/claude-sonnet-5-5)).
- Haiku 5.5: Anthropic recommends it for high-volume tasks, browser use, and
  as a subagent beside Opus and Sonnet. It says Haiku suits narrowly scoped
  tasks ([Anthropic](https://anthropic.com/claude-haiku-5-5)).
- GPT-6.1 Sol: OpenAI recommends it for complex coding and long-running Codex
  work ([OpenAI](https://developers.openai.com/api/docs/models/gpt-6.1-sol)).
  OpenAI model guidance now names GPT-6.2 Sol and GPT-6.2 Astra, and gives no
  6.1-specific advice
  ([OpenAI](https://developers.openai.com/docs/guides/model-guidance)).
- Gemini 4 Neon: Google reports a top coding-agent index score, strong
  vulnerability-finding results and long tool-heavy runs
  ([Google](https://blog.google/intl/en-in/products/introducing-gemini-4-neon/)).
  The launch post does not address UI work or code review.
- No vendor compares these models on code review. Third-party opinion: a UX
  Planet test rated Sol's UI output less creative than Sonnet's.

## Project Evidence

Measured on 2026-11-22. The orchestrator read the review files, the Codex
second-review files and the fix-agent reports from the music-mode clip-editing,
piano-roll and automation work, and counted each finding by its outcome. The
full tables are in
[review-model-analysis.md](plans/music-mode/review-model-analysis.md). Fixed
counts are approximate within two items.

- Neon first reviews: 110 findings in 5 reviews. About 85 percent led to a
  code change. About 7 percent were false or out of scope.
- Sol second reviews: 25 new defects in 6 reviews, none known to be false. Sol
  judged 7 of 13 fix-agent rejections unsound.
- Sol as the native fix agent: 1 of 20 fixes was incomplete, with zero
  rejections and red tests first.
- Sonnet as the web fix agent: tests written after fixes, unsound rejections,
  broad Jest runs, prettier on whole files and repeated reports.
- One Codex run waited 6 hours on stdin. Closing stdin fixed every later run.
