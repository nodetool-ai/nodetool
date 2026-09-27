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

## Choose a NodeTool surface

Product work is routed by the document the user wants, not by the tool they
named. Each of these loads the rest of what it needs.

| Requested result | Skill |
|---|---|
| A finished video, still set or campaign | [storyboard-core](../storyboard-core/SKILL.md), which picks the job skill |
| A workflow graph | [nodetool-workflow-builder](../nodetool-workflow-builder/SKILL.md) |
| A screen someone clicks | [nodetool-app-builder](../nodetool-app-builder/SKILL.md) |
| A repair on delivered footage | [nodetool-video-post](../nodetool-video-post/SKILL.md) |
| JavaScript in the sandbox, or a Code node | [nodetool-js-scripting](../nodetool-js-scripting/SKILL.md) |
| A layered image, mask or overlay | [nodetool-sketch](../nodetool-sketch/SKILL.md) |
| A 3D model or scene | [nodetool-3d-scene](../nodetool-3d-scene/SKILL.md) |
| A playable built-in game or asset pack | [native-game](../native-game/SKILL.md) |
| A new node type | [nodetool-custom-node-developer](../nodetool-custom-node-developer/SKILL.md) |
| A run that is failing, on any surface | [nodetool-troubleshooter](../nodetool-troubleshooter/SKILL.md) |
| An integration over REST, tRPC, WebSocket or MCP | [nodetool-api-reference](../nodetool-api-reference/SKILL.md) |
| Retrieval over documents | [nodetool-rag-indexing](../nodetool-rag-indexing/SKILL.md) |
| A browser automation agent | [nodetool-browser-agent](../nodetool-browser-agent/SKILL.md) |
| Provider keys and model selection | [nodetool-model-provider-config](../nodetool-model-provider-config/SKILL.md) |
| A server or worker to deploy | [nodetool-deployment](../nodetool-deployment/SKILL.md) |
| Instructions that should persist across sessions | [nodetool-skill-author](../nodetool-skill-author/SKILL.md) |

Read the selected skill, not every entry. Load supporting references only when
the task reaches the operation they describe.

## Continue at the requested scope

For a recommendation request, name the skill and explain why in one or two
sentences. For an action request, continue with the selected skill. Another phase
is useful only when it resolves an actual remaining need.

Read [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md) when context management or a handoff
is needed. Tracker setup is needed only when a requested tracker operation's
destination or conventions cannot be established from existing context.
