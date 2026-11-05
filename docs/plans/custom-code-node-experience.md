# Custom Code node experience

## Goal

Make it easier to create, understand, test, and reuse a custom node. Keep the
canvas and node menu quiet. Reveal programming details inside the editor when
requested.

This plan extends the existing Code node, assistant, and versioned JS scripts.
It does not introduce another execution engine or a separate reuse system.

## Product decisions

| Decision | Intended behavior |
| --- | --- |
| D1 | Use **Create a custom node** as the main entry point. Show datatype suggestions only after creation, inside the editor. Avoid generic “transform” and “convert” labels. |
| D2 | Bring sample inputs, code, and result preview into one editing experience. Keep secondary tools collapsed. |
| D3 | Preserve drafts and the working graph. Explain consequential changes before applying them. |
| D4 | Infer types from connections and suggest types from examples. Use plain-language labels and allow explicit corrections. |
| D5 | Extend **Save to My Nodes** and pinned script versions for reuse. |
| D6 | Put examples and capability discovery inside the editor, without adding more node-menu entries. |
| D7 | Allow a successful preview to become a saved test. |
| D8 | Give the node one short behavior description and an optional explanation of the code's meaningful steps. |
| D9 | Refresh generated explanations after a changed code revision is saved. Preserve user-written comments. |
| D10 | Put optional author attribution under **Details**, separate from edit history. |
| D11 | Put technical capabilities and limitations behind **Runtime & libraries**. |

Suggested creation copy:

> Describe what you want it to do, or write JavaScript. Work with text, lists,
> images, files, and more.

The canvas shows the node's purpose-specific name, short description, inputs,
outputs, and an Edit action. Tests, authorship, runtime reference, and extended
explanations do not become permanent canvas controls.

## Existing foundations

| Area | Starting point |
| --- | --- |
| Contextual creation and wiring | [useCodeGenFromHandle](../../web/src/hooks/useCodeGenFromHandle.ts) |
| Searchable creation entry | [codeGenPaletteMetadata](../../web/src/config/codeGenPaletteMetadata.ts) |
| Assistant draft and Apply | [CodeAssistantDialog](../../web/src/components/node_types/code_assistant/CodeAssistantDialog.tsx) |
| Inline code editing | [CodeBody](../../web/src/components/node_types/CodeBody.tsx) |
| Inferred handles | [codeNodeHandles](../../web/src/utils/codeNodeHandles.ts) |
| Script extraction and version pinning | [useCodeNodeScriptLink](../../web/src/hooks/nodes/useCodeNodeScriptLink.ts) |
| Saved scripts and tests | [JS Scripts](../js-scripts.md) |
| Engine, libraries, and runtime policy | [JavaScript Sandbox](../javascript-sandbox.md) |

These are implementation starting points, not a claim that the proposed flows
have been verified in the running app.

## Milestone 1: Establish the editing and metadata contract

Dependencies: none. Decisions: D2, D3, D8, D9, D10.

- [ ] A1. Inspect the current node, inspector, assistant, and script editor flows. Record where they share state and where save/apply behavior differs.
- [ ] A2. Define the minimal canvas view and editor layout using existing UI primitives. Keep assistant, explanations, tests, and details available on demand.
- [ ] A3. Define storage for the short description, generated step explanation, explanation revision, and optional author. Reuse existing metadata where its meaning matches.
- [ ] A4. Define draft persistence and the exact event that commits a code revision. A background draft save must not accidentally apply code to the workflow.
- [ ] A5. Define backward-compatible defaults for existing Code nodes and saved scripts, including import/export and version snapshots.
- [ ] A6. Verify the layout with keyboard navigation and at 1280 × 720 before adding further controls.

Acceptance: an existing node can be opened without migration prompts or lost
data. The proposed layout exposes the main editing action without opening
secondary panels.

## Milestone 2: Guide creation and simplify inputs and outputs

Dependencies: milestone 1. Decisions: D1, D4, D6.

- [ ] A7. Present **Create a custom node** through the existing creation routes. Consolidate overlapping creation labels without hiding existing saved nodes.
- [ ] A8. Open the new node's editor with **What should this node do?**, free-text authoring, and **Write code**. Carry connected input context into the editor.
- [ ] A9. Show a small set of suggestions based on connected datatypes, only inside the new node editor. Offer **More ideas** and hide starters once the node has a purpose.
- [ ] A10. Provide starters such as text find/replace, list filtering, image resizing, number calculation, and structured field selection. Selecting a starter fills code and ports together.
- [ ] A11. When no input exists, offer **Add an input**, describing the task, or writing code. Do not require datatype selection before the task is known.
- [ ] A12. Inherit input types from connections and offer plain-language labels. Suggest output types from analysis and samples without treating one sample as proof of a complete schema.
- [ ] A13. Support field selection from structured samples, explicit type corrections, and input defaults through **Edit inputs and outputs**.
- [ ] A14. Explain mismatches with the actual expected and received values or types. Do not silently coerce values with ambiguous meaning.
- [ ] A15. Verify creation with text, lists, media, structured data, missing samples, and multiple inputs. Verify that cancelling restores the graph.

Acceptance: a creator can connect data and select a useful starting point
without manually declaring the same input twice. Suggestions add no entries to
the main node menu.

## Milestone 3: Preview and apply changes safely

Dependencies: milestones 1 and 2. Decisions: D2, D3, D4, D7.

- [ ] A16. Add a result preview beside the editing surface, with logs and errors available without leaving the editor.
- [ ] A17. Run the draft against editable samples or captured upstream values without rerunning upstream models. Label sample source and freshness and provide explicit refresh.
- [ ] A18. Reuse the existing sandbox execution path. Report capability differences when a test environment cannot execute the same operations as a workflow run.
- [ ] A19. Require deliberate execution for network requests, writes, and paid operations. Enable automatic preview only when side-effect-free execution can be established.
- [ ] A20. Preserve the last valid port layout while code is temporarily invalid. Provide inline diagnostics and completion for actual inputs and available APIs.
- [ ] A21. Preview consequential port changes before Apply. Rename ports, update references and connections, and apply code as one undoable operation.
- [ ] A22. Preserve unfinished drafts on close and reopen. Detect a changed underlying node before applying an older draft.
- [ ] A23. Add **Save as test** from a preview, with editable inputs and expected outputs. Support streamed results through the existing test contract.
- [ ] A24. Verify cancellation, failed execution, stale samples, port removal, rename, undo, draft recovery, and concurrent edits.

Acceptance: a creator can inspect a result before changing the working node,
recover unfinished work, and undo code and wiring changes together. Saving a
test requires no assistant or CLI.

## Milestone 4: Explain the saved code

Dependencies: milestones 1 and 3. Decisions: D8, D9.

- [ ] A25. Show one short behavior description on the node, for example “Keeps articles published within the last seven days.” Include consequential filtering or failure behavior when practical.
- [ ] A26. Add an optional step explanation in the editor. Explain meaningful operations rather than narrating every line. Retain syntax highlighting.
- [ ] A27. Keep generated explanations separate from user-written comments. If explanations are displayed beside code, anchor them to the saved revision without rewriting the source.
- [ ] A28. Refresh explanations after each changed code revision is saved. Coalesce rapid saves and discard responses for superseded revisions.
- [ ] A29. Use deterministic analysis where sufficient and the configured model for richer explanations. Do not send captured input values or secrets merely to explain code.
- [ ] A30. Preserve the previous explanation when generation fails or is unavailable, but show that it needs updating. Saving code must still succeed.
- [ ] A31. Define how authored descriptions override generated descriptions. Preserve deliberate wording and mark it for review when code changes rather than overwriting it silently.
- [ ] A32. Test unchanged saves, overlapping generation requests, invalid code, offline operation, manual descriptions, and preservation of source comments.

Acceptance: the short description and detailed explanation identify the revision
they describe. Failed or delayed generation never blocks saving or presents an
older explanation as current. Generated explanations are not presented as proof
that the code is correct.

## Milestone 5: Explain the runtime on demand

Dependencies: milestone 1. Decision: D11.

- [ ] A33. Add a secondary **Runtime & libraries** button inside the editor.
- [ ] A34. Explain QuickJS WebAssembly execution, async/await, inputs, final outputs, streaming, and state in a compact technical introduction.
- [ ] A35. Explain the absence of a full Node.js or browser environment, DOM access, and unrestricted npm imports. Describe media references and their lifetime.
- [ ] A36. List available libraries with short descriptions and copyable import examples, using the installed catalog.
- [ ] A37. Show effective limits and access for the selected execution context, including timeout, memory/output limits, secret names, network access, and filesystem restrictions. Never display secret values.
- [ ] A38. Distinguish browser and server capabilities and link to the full reference. Show unavailable or unknown capabilities explicitly.
- [ ] A39. Verify the reference against actual runtime configuration and catalog changes, including missing packages and restricted execution contexts.

Suggested introduction, to verify against the selected runtime:

> JavaScript in a QuickJS WebAssembly sandbox. Use async/await, installed sandbox
> libraries, and available NodeTool APIs. Read inputs through `inputs`, publish
> final results with `output()`, and stream values with `emit()`. This is not a
> full Node.js or browser environment. Available capabilities and execution
> limits depend on where the workflow runs.

Acceptance: a programmer can find the engine, supported imports, and effective
restrictions without searching external documentation. The reference adds no
permanent canvas content.

## Milestone 6: Reuse and attribution

Dependencies: milestones 2 through 4. Decisions: D5, D7, D10.

- [ ] A40. Extend **Save to My Nodes** to preserve descriptions, typed ports, defaults, tests, dependency information, and optional author attribution using the existing script model.
- [ ] A41. Put **Author** under **Details** and preserve it through duplication, extraction, sharing, and import/export. Keep it distinct from last-editor metadata and verified identity.
- [ ] A42. Let reusable nodes expose ordinary settings such as a threshold or selection without requiring source edits.
- [ ] A43. Distinguish pinned version, local modifications, and available updates. Preserve self-contained workflow execution and existing version pinning.
- [ ] A44. Preview code and port changes before updating a reused node. Run saved tests deliberately, respecting the execution controls from milestone 3.
- [ ] A45. Verify reuse in a second workflow, local edits, version updates, missing source scripts, attribution preservation, and rollback.

Acceptance: a saved node can be used through its normal inputs and settings.
Updating its source never silently changes existing workflows.

## Milestone 7: Validate the complete experience

Dependencies: milestones 1 through 6.

- [ ] A46. Exercise creation, sample preview, safe Apply, explanation refresh, saving a test, and reuse as one end-to-end scenario.
- [ ] A47. Verify keyboard access, focus restoration, dark/light themes, and small-window layout using the [Design System](../DESIGN.md), [UX Guidelines](../UX_GUIDELINES.md), and [UI Primitives Strategy](../../web/src/components/ui_primitives/STRATEGY.md).
- [ ] A48. Measure time to a correct result, manual type/wiring actions, accidental connection changes, and successful reuse. Record observations before and after implementation rather than inventing improvement targets.
- [ ] A49. Check that contextual suggestions, author metadata, and runtime details remain absent from the default node menu and canvas view.
- [ ] A50. Update [JS Scripts](../js-scripts.md) and [JavaScript Sandbox](../javascript-sandbox.md) where the implemented behavior changes their guidance.
- [ ] A51. Build packages and run the required post-change checks from [Development Standards](../DEVELOPMENT_STANDARDS.md) and [repository instructions](../../AGENTS.md): `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main`.

Acceptance: each milestone's behavior is demonstrated through the applicable
tests and UI checks. Completion claims include the commands and observed
outcomes.
