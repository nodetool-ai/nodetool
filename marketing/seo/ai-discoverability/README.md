# AI discoverability research

This folder holds the questions NodeTool should answer for people who ask AI
assistants (ChatGPT, Claude, Gemini, Perplexity) about creative AI tools, and
the page that answers each one. [strategy.md](strategy.md) explains the
clusters, the priorities, and what the site deliberately does not target.

## Files

- `query-corpus.csv` is the source. One row per question, with its cluster,
  form, intent, funnel stage, how it was found, how well NodeTool fits, the
  page that answers it, and a priority.
- `opportunity-matrix.csv` is generated. It rolls the corpus up to one row per
  target page.
- `build-matrix.mjs` validates the corpus and writes the matrix.
- `retrieval-review.md` tests representative questions against the built pages. `retrieval-review.py` reruns it against a local `next start -p 3100`.
- `mention-check.py` asks four search-grounded assistant APIs a fixed panel
  of 40 corpus questions and records whether each answer names NodeTool,
  cites nodetool.ai or the docs, names competitors, or repeats a known-false
  framing. Results append to `mention-check/mention-check-<date>.csv`. See
  [strategy.md](strategy.md#17-measurement).

## Running the mention check

It needs Python 3.9 or later and no packages. Set any of `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY` and `GEMINI_API_KEY`. Providers
without a key are skipped.

```bash
python3 marketing/seo/ai-discoverability/mention-check.py --dry-run     # print the panel
python3 marketing/seo/ai-discoverability/mention-check.py --self-test   # parse canned responses
python3 marketing/seo/ai-discoverability/mention-check.py --providers anthropic,gemini --limit 5
```

The default models are in the `PROVIDERS` table at the top of the script.
Override one with `MENTION_CHECK_OPENAI_MODEL`, `MENTION_CHECK_ANTHROPIC_MODEL`,
`MENTION_CHECK_PERPLEXITY_PRESET` or `MENTION_CHECK_GEMINI_MODEL`. The panel
ids must exist in `query-corpus.csv`, and the script warns when a P1
subcluster has no panel question.

## Columns

| Column | Values |
|---|---|
| `form` | `keyword`, `question`, or `conversational` (a long question with constraints, as typed to an assistant) |
| `intent` | `informational`, `commercial`, `comparison`, `navigational`, `how-to` |
| `funnel` | `awareness`, `consideration`, `decision` |
| `nodetool_fit` | `strong`, `partial`, `weak`, `none`. Rate what the product does today, not what a page could claim |
| `page_status` | `existing`, `improve`, `rebuild`, `new`, `proposed` |
| `priority` | `P1`, `P2`, `P3`, `do-not-target` |

A question rated `weak` or `none` stays in the corpus so the decision not to
target it is recorded.

## Updating

Add or edit rows in `query-corpus.csv`, then run from the repository root:

```bash
node marketing/seo/ai-discoverability/build-matrix.mjs
node marketing/seo/ai-discoverability/build-matrix.mjs --check
```

Before a page claims a capability for a question, check the claim against the
code, as [strategy.md](strategy.md#10-factual-corrections-found-during-the-audit)
did. Product facts change faster than this corpus.
