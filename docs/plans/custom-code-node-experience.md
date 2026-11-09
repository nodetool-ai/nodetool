# Custom Code node experience

Cross-plan references use `CN-`, for example `CN-A19`. Local IDs stay unchanged.

- **One entry point.** **Create a custom node** replaces **Write Code with AI** and the two handle menu items. Starters come from the existing snippet catalog and appear only inside the editor.
- **One editor.** The Code assistant dialog becomes the editor: code, assistant, preview, and tests together. The small canvas editor stays for quick edits.
- **The large editor applies a draft.** Apply shows affected connections and undoes in one step. The small canvas editor and script tab keep saving directly.
- **Preview on a click.** Run the draft on the server with usable last-run values or typed samples, without changing the node or running upstream nodes. External effects follow the preview's enforced access settings.
- **No new execution properties.** Bounded, validated description, explanation, author, and tests live in `ui_properties` and are copied into the script on **Save to My Nodes**.
- **No unrequested model calls.** Explanations are generated on **Explain** and marked **Out of date** when the code changes.
- **Reuse stays pinned.** A saved node keeps its version in each workflow until the creator updates it there.
- **Fix existing defects first.** Milestone 0 corrects the assistant's outdated output contract, broken connections after port changes, data lost on save, and undo after cancel.

## Goal

Make it easier to create, understand, test, and reuse a custom node. Keep the
canvas and node menu quiet. Reveal programming details inside the editor when
requested.

This plan extends the existing Code node (`nodetool.code.Code`), its assistant
dialog, and versioned JS scripts. It adds no execution engine, no reuse system,
and no new execution properties. Existing behavior stays available unless a task
says how it is replaced.

## The finished experience

1. The creator picks **Create a custom node** from the node menu, or from a
   handle's context menu. A Code node appears and its editor opens.
2. The editor asks **What should this node do?** The creator describes the
   task, picks a starter, or writes code. The assistant writes the code, ports,
   name, and short description.
3. The creator checks the result in the preview, using values from the last run
   or typed samples. This editor's draft reaches the node only on **Apply**.
4. Apply shows which connections a port change affects and can be undone in one
   step. A good preview can be kept with **Save as test**.
5. On the canvas the node shows its name, short description, ports, and an Edit
   action. **Explain**, **Runtime & libraries**, and **Details** stay inside the
   editor.
6. **Save to My Nodes** makes the node reusable. Other workflows keep the
   version they placed until the creator updates them.

## Words in the interface

Use these labels consistently across tasks, locales, and documentation.

| Label | Meaning |
| --- | --- |
| Custom node | A Code node. It becomes reusable once saved to My Nodes. |
| Editor | The large Code node dialog (today's Code assistant dialog). The small editor on the canvas stays for quick edits. |
| Apply | Writes the editor's draft to the node. The only commit in the editor. |
| Preview | Runs the draft once, without changing the node or running other nodes. |
| Test | A saved preview: inputs plus the expected outputs. |
| Description | One sentence on the canvas saying what the node does. |
| Explanation | The longer, on-request walkthrough of the code's main steps. |
| Out of date | The explanation describes different code or port declarations than the node has now. |

## Product decisions

| Decision | Intended behavior |
| --- | --- |
| D1 | Use **Create a custom node** as the main entry point. Show datatype suggestions only after creation, inside the editor. Avoid generic “transform” and “convert” labels, but keep them as search aliases. |
| D2 | Bring sample inputs, code, and result preview into one editor. Keep secondary tools collapsed. |
| D3 | Preserve drafts and the working graph. Show consequential changes before applying them. |
| D4 | Infer types from connections and suggest types from preview results. Use plain-language labels and allow explicit corrections. |
| D5 | Extend **Save to My Nodes** and pinned script versions for reuse. |
| D6 | Put starters and capability discovery inside the editor, without adding node-menu entries. |
| D7 | Allow a successful preview to become a saved test. |
| D8 | Give the node one short description and an optional explanation of the code's main steps. |
| D9 | An explanation records the code it describes. When the code changes, it shows as **Out of date** with an **Update** action. Nothing regenerates without a click. Comments in the code are never rewritten. |
| D10 | Put optional author attribution under **Details**, separate from edit history. |
| D11 | Put technical capabilities and limitations behind **Runtime & libraries**. |

Suggested creation copy:

> Describe what you want it to do, or write JavaScript. Work with text, lists,
> images, files, and more.

## Current behavior

These source observations have no recorded inspection revision. Recheck claims
needed by a milestone and record the commit and evidence under the
[evidence rules](https://github.com/nodetool-ai/nodetool/blob/main/docs/plans/feature-interplay/README.md#evidence-and-interpretation).

| Finding | What the code does today |
| --- | --- |
| F1 | Three creation routes open the same assistant dialog: the node-menu entry **Write Code with AI** ([codeGenPaletteMetadata](https://github.com/nodetool-ai/nodetool/blob/main/web/src/config/codeGenPaletteMetadata.ts), search aliases `transform`, `convert`, `extract`, …), and the handle context-menu items **Transform this output…** and **Create value with AI…** ([useCodeGenFromHandle](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/useCodeGenFromHandle.ts)). The handle routes seed one typed port and wire one edge. |
| F2 | Cancelling a creation route deletes the created node and edge and restores a replaced edge ([CodeGenDialogHost](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/code_gen/CodeGenDialogHost.tsx)). Creation and removal are separate store calls, so undo history after a cancel is unverified. |
| F3 | The node menu already lists code snippets as nodes whose code is hidden (`codeNodeMode: "snippet"`, [snippetMetadata](https://github.com/nodetool-ai/nodetool/blob/main/web/src/config/snippetMetadata.ts), `CODE_SNIPPETS` in `codeSnippets.ts`). Saved scripts shown in the menu drop in as `codeNodeMode: "custom"` ([instantiatePaletteNode](https://github.com/nodetool-ai/nodetool/blob/main/web/src/utils/instantiatePaletteNode.ts)). |
| F4 | Three editing surfaces commit differently. The canvas editor in [CodeBody](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/node_types/CodeBody.tsx) writes every keystroke to the node and re-infers ports, grouping focus-to-blur into one undo step (`useUndoGroup`). The [CodeAssistantDialog](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/node_types/code_assistant/CodeAssistantDialog.tsx) edits a draft and writes code and ports in one `updateNodeData` on Apply. The JS script tab autosaves every keystroke with no Apply ([JS Scripts](../js-scripts.md#the-editor)). |
| F5 | The assistant's system prompt in [CodeAssistantChatPanel](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/node_types/code_assistant/CodeAssistantChatPanel.tsx) teaches the legacy contract: returned object keys become outputs and `yield` streams. The sandbox contract is `output()` and `emit()`, and `return` is ignored ([JavaScript Sandbox](../javascript-sandbox.md#the-code-node)). The `run_code` and `validate_code` tool specs teach the current contract. |
| F6 | Assistant Apply rebuilds `dynamic_inputs` and `dynamic_outputs` from the draft ports. It does not touch edges, so removing or renaming a connected port may leave an edge pointing at a missing handle. Not yet reproduced. |
| F7 | Port inference ([codeOutputInference](https://github.com/nodetool-ai/nodetool/blob/main/web/src/utils/codeOutputInference.ts) `deriveCodeIOUpdates`) keeps every existing input slot, keeps connected outputs, and keeps all outputs when the body does not parse. New inferred ports are typed `any`. |
| F8 | Dynamic input slots already carry `description`, `default`, `min`, `max`, and `required` (`DynamicSlotDeclaration` in [NodeData](https://github.com/nodetool-ai/nodetool/blob/main/web/src/stores/NodeData.ts)). A JS script port stores only `name` and `type` ([js-scripts schema](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/api-schemas/js-scripts.ts)). |
| F9 | **Save to My Nodes** extracts the node into a script with `description: ""` and `tests: []` ([useCodeNodeScriptLink](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/nodes/useCodeNodeScriptLink.ts) `extractToScript`). Ports are written from `TypeMetadata.type`, which drops type arguments, so `list[str]` may become `list`. The Code node's `max_response_size`, local-network, and host-filesystem settings have no field in the script document. |
| F10 | The script document has `description`, `tests` (with `expect` and `expectedStreamed`), and `palette`. It has no author field. A Code node has an editable title and no description or tests of its own. |
| F11 | A linked Code node shows its body read-only and runs the copied code, so a run never reads a script row. Editing it requires **Detach**. |
| F12 | `useRunSingleNode` with `buildRunSubgraph` runs one node against its upstream. It injects cached generative outputs but reruns every non-generative upstream node, and it runs the node's stored code, not a draft. |
| F13 | `run_code` and `test_code` run a body with given inputs and return outputs, `streamed` values, logs, and errors. The Code node runs on the server and also in the browser runner (`packages/workflow-runner/` `./browser`). JS scripts run only on the server. |
| F14 | The sandbox has hard limits (30 s, 64 MB heap, 20 fetches, 100 KB output, among others). The Code node adds `timeout`, `max_response_size`, local-network, and host-filesystem settings ([code-node.ts](https://github.com/nodetool-ai/nodetool/blob/main/packages/code-nodes/src/nodes/code-node.ts)). |
| F15 | [ResultsStore](https://github.com/nodetool-ai/nodetool/blob/main/web/src/stores/ResultsStore.ts) keeps each node's outputs per job (`getOutputResult(workflowId, jobId, nodeId)`). |
| F16 | A graph node's `ui_properties` is an unvalidated record that already stores the title, color, and exposed inputs ([reactFlowNodeToGraphNode](https://github.com/nodetool-ai/nodetool/blob/main/web/src/stores/reactFlowNodeToGraphNode.ts)). Fields stored there change no node definition, DSL, or generated docs. |
| F17 | The node assistant has `ui_code_get_state`, `ui_code_set_code`, and `ui_code_set_ports` ([code tools](https://github.com/nodetool-ai/nodetool/blob/main/web/src/lib/tools/builtin/code.ts)). The script assistant also has `ui_jsscript_set_meta` for name and description. |

## Open questions

Each question blocks the milestone named in it. Record the answer in this file
before starting that milestone.

| Question | Blocks | Options and recommendation |
| --- | --- | --- |
| Q1 | M1 | Does the canvas editor keep writing every keystroke? **Recommend yes** (F4). It serves quick edits, and removing it would remove a feature. The large editor uses a draft and Apply. |
| Q2 | M1, M3 | Where do tests live before a node is saved to My Nodes? Option A: in the node's `ui_properties` (F16), carried into the script on save. Option B: **Save as test** saves to My Nodes first. **Recommend A.** B makes testing depend on reuse. |
| Q3 | M1 | Where do the description, explanation, and author live on a node? **Recommend** validated, size-bounded `ui_properties`, copied to the script on save and back on link. The explanation hashes exact code and port declarations. Whitespace and comment edits mark it out of date. |
| Q4 | — | Merged into Q3. |
| Q5 | M3 | Where does preview run when the workflow runs in the browser runner (F13)? **Recommend** always on the server through `run_code`, with a note in the preview when the workflow runs elsewhere. |
| Q6 | M6 | Does the script document gain optional fields for port `description`, `default`, `min`, `max`, full port types, access settings, explanation/hash, and `author` (F8, F9, F10)? **Recommend** additive optional fields under `schemaVersion: 1`, with A3's validation and limits, so existing documents still validate. |

## Risks

| Risk | Mitigation |
| --- | --- |
| R1 | A saved draft reaches the workflow without Apply. Keep drafts in a draft store keyed by workflow and node, never in node data, until Apply (A4, A22). |
| R2 | Explanations spend provider money or send code to a remote model unasked. Generate only on **Explain** or **Update**, name the provider in the editor, and send only code and port declarations (A29). |
| R3 | Preview can have external effects. It always requires a click, uses enforced access settings, and runs no other nodes (A17–A19). Static analysis is not a permission boundary. |
| R4 | A port rename or removal silently breaks connections (F6). Port changes go through one previewed, undoable Apply (A21). |
| R5 | Save to My Nodes loses data (F9). Round-trip tests come before any change to the save path (A54). |

## Milestone 0: Fix existing defects

Dependencies: none. Independent of the redesign, so these can ship first.
Reproduce each before fixing it, and ship the reproduction as a test.

- [ ] A52. Rewrite the assistant system prompt (F5) to the `output()`/`emit()` contract, matching the `run_code` spec. Add a test that the prompt does not describe `return` keys as outputs.
- [ ] A53. Reproduce F6 with a connected port removed or renamed in the assistant, then fix Apply so no edge points at a missing handle.
- [ ] A54. Add a round-trip test for **Save to My Nodes** followed by a drop from the menu, covering typed list ports, input defaults, and the Code node's access settings. Fix what is lost, or record it under Q6.
- [ ] A55. Check that cancelling a creation route (F2) leaves undo history unchanged. Fix it if undo restores the discarded node.

Acceptance: each fix has a test that failed before the change.

## Milestone 1: Establish the editing and metadata contract

Dependencies: Q1 to Q3 answered. Decisions: D2, D3, D8, D9, D10.

- [ ] A1. Confirm F4 in the running app and record where the three editing surfaces share state and where saving differs.
- [ ] A2. Turn `CodeAssistantDialog` into the editor using existing UI primitives, with the assistant as one collapsible panel. The canvas AI button and **Edit** open it. Linked nodes open read-only with **Detach to edit**, preserving the pinned source until confirmed. Explanation, tests, runtime reference, and details open on demand.
- [ ] A3. Store description, explanation with its hash, author, and tests in validated `ui_properties` per Q2 and Q3. Set per-field and total serialized-size limits, including test count and input size. Reject secrets and embedded media bytes in saved samples. Tests may use authorized persistent asset references, never temporary run handles. Show the description under the node title.
- [ ] A4. Add the draft store. Apply is the only event that writes the draft to the node. The canvas editor keeps writing directly (Q1).
- [ ] A5. Treat absent fields as empty for existing Code, snippet, and custom nodes, with no migration prompt. Verify the new `ui_properties` fields survive save, import/export, version snapshots, and agent `update_workflow`.
- [ ] A6. Verify the layout with keyboard navigation and at 1280 × 720 before adding further controls.

Acceptance: an existing Code node, snippet node, and linked node each open
without migration prompts or lost data. The main editing action is reachable
without opening secondary panels.

## Milestone 2: Guide creation and simplify inputs and outputs

Dependencies: milestone 1. Decisions: D1, D4, D6.

- [ ] A7. Rename the menu entry **Write Code with AI** to **Create a custom node**, keeping its search aliases. Relabel the handle items to **Create a custom node from this output…** and **Create a custom node for this input…**, without changing their wiring (F1). Update every locale file.
- [ ] A8. Open a new node's editor on **What should this node do?** with a free-text box and a **Write code** option. Carry the seeded port from a handle route into the editor. Add `ui_code_set_meta`, modelled on `ui_jsscript_set_meta` (F17), so the assistant sets the node's name and description along with its code.
- [ ] A9. Show up to a few starters that match the connected datatypes, from A10's list, only in a new node's editor. Offer **More ideas** and hide starters once the node has code.
- [ ] A10. Take starters from the existing `CODE_SNIPPETS` catalog (F3) rather than a second list. Selecting one fills code, ports, name, and description together. Snippet entries stay in the node menu.
- [ ] A11. When no input exists, offer **Add an input** beside describing the task and writing code. Do not ask for a datatype before the task is known.
- [ ] A12. Type a new input from its connection instead of `any` (F7).
- [ ] A13. Under **Edit inputs and outputs**, edit the slot fields that already exist (F8): type, description, default, min, and max.
- [ ] A14. Explain a type mismatch with the expected and received type. Do not coerce values whose meaning is ambiguous.
- [ ] A15. Verify creation with text, lists, media, structured data, and multiple inputs. Verify that cancelling restores the graph and undo history (A55).

Acceptance: a creator can connect data and pick a starting point without
declaring the same input twice. The node menu has no new entries, and the
renamed entry is still found by its old aliases.

## Milestone 3: Preview and apply changes safely

Dependencies: milestones 1 and 2, Q2 and Q5 answered. Decisions: D2, D3, D4, D7.

- [ ] A16. Add a preview beside the code showing outputs, streamed values, logs, and errors, in the shape `run_code` returns (F13).
- [ ] A17. Fill inputs from usable latest results in [ResultsStore](https://github.com/nodetool-ai/nodetool/blob/main/web/src/stores/ResultsStore.ts) (F15), or typed samples. Label their source and age. Resolve authorized persistent media references in the preview context. If a temporary handle has expired or cannot be resolved there, request a replacement sample. Never reuse a run handle as if it were a persistent asset or silently rerun upstream nodes.
- [ ] A18. Run the draft through `run_code` per Q5.
- [ ] A19. Always require **Run preview**. Show effective access settings and enforce them in the preview runtime. Static analysis may explain code but never authorize automatic execution. Defer auto-preview.
- [ ] A20. Suggest output types from the preview result, marked as suggestions. From a structured result, let the creator pick fields to become outputs.
- [ ] A21. Before Apply, list port additions, removals, and renames with the connections each affects. Apply code, ports, and connection updates as one undo step.
- [ ] A22. Keep an unfinished draft across closing and reopening the editor. If the node changed since the draft began, ask before applying the older draft.
- [ ] A23. Add **Save as test**, storing a `jsScriptTestCase` (`inputs`, `expect`, `expectedStreamed`) under A3's validation and size limits. Require replacement of temporary media handles and removal of secrets before saving. Let the creator edit expected values, list tests, and run them with `test_code`.
- [ ] A24. Test cancellation, failed execution, expired media, stale samples, rejected oversized/secret-bearing fixtures, port changes, undo, draft recovery, and agent edits through `ui_code_*` during an open draft.

Acceptance: a creator can see a result before changing the node, recover
unfinished work, and undo code and connection changes in one step. Saving and
running a test needs neither the assistant nor the CLI.

## Milestone 4: Explain the code

Dependencies: milestones 1 and 3. Decisions: D8, D9.

- [ ] A25. Show the short description under the node title, for example “Keeps articles published within the last seven days.” The assistant fills it (A8) and the creator can edit it. The assistant changes an existing description only when asked.
- [ ] A26. Add **Explain** in the editor. It produces a walkthrough of the code's main steps, not each line, and keeps syntax highlighting in quoted code.
- [ ] A27. Hash the exact code string and deterministically serialized port declarations used to generate the explanation (A3). Whitespace, comments, and port edits mark it out of date. Do not add semantic normalization or rewrite code/comments.
- [ ] A28. Show **Out of date** with an **Update** action when the stored hash differs from the current code, whichever editor changed it.
- [ ] A29. Generate the explanation with the configured model from the code and port declarations only, never input values or secrets.
- [ ] A30. When generation fails or no provider is configured, keep the previous explanation, mark it out of date, and say why.
- [ ] A31. Merged into A25: there is one description, and the creator's edits are never overwritten.
- [ ] A32. Test unchanged code, whitespace/comment-only edits, port edits, changes from each editor, failed requests, no configured provider, and preservation of comments.

Acceptance: an explanation is shown as current only when it matches the code.
Explaining never blocks Apply. The UI does not present an explanation as proof
that the code is correct.

## Milestone 5: Explain the runtime on demand

Dependencies: milestone 1 only, so it can ship alongside milestone 2. Decision: D11.

- [ ] A33. Add a secondary **Runtime & libraries** button inside the editor.
- [ ] A34. Give a short technical introduction: QuickJS WebAssembly, async/await, `inputs`, `output()`, `emit()`, `stream`, `state`, and `progress()`.
- [ ] A35. State what is absent: Node.js and browser globals, DOM access, and arbitrary npm imports. Distinguish temporary media handles, valid only in their creating run, from persistent asset references resolved with authorization in each run (A17).
- [ ] A36. List installed sandbox packages with one-line descriptions and copyable imports, from the catalog `list_sandbox_packages` reads, so a third-party pack appears without a code change.
- [ ] A37. Show the limits for this node: the sandbox defaults and the node's `timeout`, `max_response_size`, local-network, and host-filesystem settings (F14). List declared secret names, never values.
- [ ] A38. Say which capabilities differ between the server and the browser runner (F13), and link to [JavaScript Sandbox](../javascript-sandbox.md).
- [ ] A39. Read limits and the package list from runtime configuration, not copied text. Test with a missing package and a node with restricted access.

Suggested introduction, to verify against the selected runtime:

> JavaScript in a QuickJS WebAssembly sandbox. Use async/await, installed sandbox
> libraries, and available NodeTool APIs. Read inputs through `inputs`, publish
> final results with `output()`, and stream values with `emit()`. This is not a
> full Node.js or browser environment. Available capabilities and execution
> limits depend on where the workflow runs.

Acceptance: a programmer can find the engine, supported imports, and effective
limits without leaving the editor. The canvas gains no permanent content.

## Milestone 6: Reuse and attribution

Dependencies: milestones 2 to 4, Q6 answered. Decisions: D5, D7, D10.

- [ ] A40. Extend **Save to My Nodes** to copy the description, explanation/hash, full port types, input defaults and descriptions, tests, access settings, and author into the script document (Q6), and back when linked or dropped. Apply A3's metadata validation and limits in both directions. A54's round-trip test covers each field.
- [ ] A41. Put **Author** under **Details**. Preserve it through duplication, saving, linking, sharing, and import/export. Keep it apart from last-editor metadata and verified identity.
- [ ] A42. Check that inputs with defaults, such as a threshold, keep their defaults on a saved node, so a reused node can be adjusted without editing code.
- [ ] A43. On a linked node, show the pinned version and whether a newer one exists. Keep runs self-contained and editing behind **Detach** (F11).
- [ ] A44. Before **Update to latest**, show code, ports, description, explanation, tests, attribution, and access-setting changes. Offer to run the incoming version's saved tests explicitly. Apply the reviewed update as one undo step.
- [ ] A45. Verify reuse in a second workflow, editing after Detach, updating to a newer version, a deleted source script, attribution preservation, and undoing an update.

Acceptance: a saved node is usable through its inputs. Updating the script
never changes an existing workflow until the creator updates the node there.

## Milestone 7: Validate the complete experience

Dependencies: milestones 0 to 6.

- [ ] A46. Automate the walkthrough in [The finished experience](#the-finished-experience) with the web Playwright suite ([Testing](https://github.com/nodetool-ai/nodetool/blob/main/web/TESTING.md)).
- [ ] A47. Verify keyboard access, focus restoration, dark and light themes, and small-window layout against the [Design System](https://github.com/nodetool-ai/nodetool/blob/main/docs/DESIGN.md), [UX Guidelines](https://github.com/nodetool-ai/nodetool/blob/main/docs/UX_GUIDELINES.md), and [UI Primitives Strategy](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/ui_primitives/STRATEGY.md).
- [ ] A48. Measure time to a correct result, manual type and wiring actions, accidental connection changes, and successful reuse, before and after. Record observations rather than invented targets.
- [ ] A49. Check that starters, author metadata, and runtime details are absent from the default node menu and canvas.
- [ ] A50. Update [JS Scripts](../js-scripts.md) and [JavaScript Sandbox](../javascript-sandbox.md) where behavior changed, including tests and new document fields (Q6). Use the labels from [Words in the interface](#words-in-the-interface).
- [ ] A51. Follow [repository verification requirements](https://github.com/nodetool-ai/nodetool/blob/main/AGENTS.md#mandatory-post-change-verification).

Acceptance: each milestone's behavior is shown by tests and UI checks.
Completion claims include the commands run and their results.
