---
name: resolving-merge-conflicts
description: "Resolve an in-progress Git merge or rebase by preserving both sides' intent and verifying the result."
---

# Resolve merge conflicts

Finish the in-progress merge or rebase while preserving the intent of both sides
and unrelated local work.

1. Inspect Git status, history, the operation in progress, and unmerged paths.
2. Read both versions and relevant commit, PR, or issue context. Resolve by the
   intended behavior, not by choosing an entire side indiscriminately.
3. Resolve compatible changes directly. If the intents conflict and the user's
   goal does not settle the choice, prepare the alternatives and ask about that
   hunk while continuing independent resolutions. Do not invent behavior.
4. Run the [mandatory post-change verification](../../../AGENTS.md#mandatory-post-change-verification)
   for code changes and repair failures caused by the resolution.
5. Stage only the resolved files belonging to the operation. Inspect the index
   for unrelated changes before continuing the merge or rebase. Repeat until the
   operation is complete, then report its status and verification results.

Do not abort or discard either side's work unless the user requests it. Do not
stage every working-tree file as a shortcut. Respect a request to leave the
resolution uncommitted for review.
