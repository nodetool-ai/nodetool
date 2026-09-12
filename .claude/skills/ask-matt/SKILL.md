---
name: ask-matt
description: "Choose an installed repository skill when the user asks which engineering workflow fits their task."
disable-model-invocation: true
---

# Ask Matt

Recommend the smallest workflow that produces the user's requested result.
Use the conversation and repository context before asking for missing information.
Carry forward existing decisions and authorization. A sufficient spec needs no
preliminary interview or tracker setup.

## Choose a starting point

| Requested result | Skill |
|---|---|
| Resolve an unclear plan through discussion | [grill-with-docs](../grill-with-docs/SKILL.md) |
| Build from a spec or tickets | [implement](../implement/SKILL.md) |
| Develop behavior test-first | [tdd](../tdd/SKILL.md) |
| Diagnose a bug or performance regression | [diagnosing-bugs](../diagnosing-bugs/SKILL.md) |
| Review a diff, branch, or PR | [code-review](../code-review/SKILL.md) |
| Remove unnecessary code or prose | [unslop](../unslop/SKILL.md) |
| Evaluate incoming issues or external PRs | [triage](../triage/SKILL.md) |
| Write a spec from a discussion | [to-spec](../to-spec/SKILL.md) |
| Split agreed work into dependent tickets | [to-tickets](../to-tickets/SKILL.md) |
| Map decisions across a large effort | [wayfinder](../wayfinder/SKILL.md) |
| Compare architecture improvements | [improve-codebase-architecture](../improve-codebase-architecture/SKILL.md) |
| Design a module's interface or test boundary | [codebase-design](../codebase-design/SKILL.md) |
| Clarify domain terms or record a decision | [domain-modeling](../domain-modeling/SKILL.md) |
| Answer a design question with runnable code | [prototype](../prototype/SKILL.md) |
| Investigate primary sources and save findings | [research](../research/SKILL.md) |
| Resolve an active merge or rebase | [resolving-merge-conflicts](../resolving-merge-conflicts/SKILL.md) |
| Prepare a procedure requiring human access | [wizard](../wizard/SKILL.md) |
| Configure tracker and domain-document conventions | [setup-matt-pocock-skills](../setup-matt-pocock-skills/SKILL.md) |

Read the selected skill, not every entry. For NodeTool media or workflow work,
select the matching skill from the available catalog. Load supporting references
only when the task reaches the operation they describe.

## Continue at the requested scope

For a recommendation request, name the skill and explain why in one or two
sentences. For an action request, continue with the selected skill. Another phase
is useful only when it resolves an actual remaining need.

Read [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md) when context management or a handoff
is needed. Tracker setup is needed only when a requested tracker operation's
destination or conventions cannot be established from existing context.
