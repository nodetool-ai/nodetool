# SEO drafts — the human-edit gate

Everything under `drafts/` is machine-written and **unreviewed**. Nothing here is
wired into the site. A person reads a draft, fixes what's wrong, and edits the
finished copy into the real data module by hand.

- `drafts/models/<slug>.md` — first-draft model pages from the
  [Model Page Copy Writer](../model-page-copy-writer.json). A human edits the
  approved copy into `marketing/src/data/modelEntries.ts`.

The generators **never** write to `modelEntries.ts` (or any data module) on their
own. That edit is deliberate and manual — a draft is a starting point, not a
page.

## Working a draft

1. Generate it (see [`../README.md`](../README.md)).
2. Read it. The writer only uses the facts you paste in, and it ends every draft
   with a **Reviewer notes** section flagging what it was unsure about — start
   there.
3. Check the capability facts against the vendor's own docs. The model does not
   invent specs, but pasted facts can be stale or wrong.
4. Move the copy you keep into `modelEntries.ts`. Delete the draft, or leave it
   for the next reviewer.
