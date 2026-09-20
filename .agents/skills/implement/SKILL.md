---
name: implement
description: "Implement an existing spec or tickets, verify the requested behavior, and report the result."
disable-model-invocation: true
---

# Implement

Deliver the behavior and acceptance criteria in the user's spec or tickets.
Read applicable repository instructions and the current implementation. Reuse
choices and authorization already established in the conversation.

Resolve routine implementation choices from the code and spec. Ask only when a
missing decision materially changes the requested behavior or requires new
authorization. Continue independent work while that question is pending.

Use [tdd](../tdd/SKILL.md) when requested or useful for a behavior change. Reuse
existing test boundaries. Reproduce bugs before fixing them and retain the
reproduction, as required by the repository.

Run focused checks while changing the code, then complete the
[mandatory post-change verification](../../../AGENTS.md#mandatory-post-change-verification).
Once required checks pass, repeat or broaden them only for new changes,
failures, or unresolved risks.

Review the diff against the acceptance criteria and repository rules. Use
[code-review](../code-review/SKILL.md) for a structured review when needed.
Report the resulting behavior, verification evidence, and any remaining blocker.
Commit or publish only when authorized by the user's request or session context.
