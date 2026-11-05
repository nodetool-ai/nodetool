# Custom Code node experience

## Goal

Make it easier to create, understand, test, and reuse a custom node. Keep the
canvas and node menu quiet. Reveal programming details inside the editor when
requested.

This plan extends the existing Code node (`nodetool.code.Code`), its assistant,
and versioned JS scripts. It does not introduce another execution engine or a
separate reuse system. Existing behavior stays available unless a task says how
it is replaced.

## Product decisions

| Decision | Intended behavior |
| --- | --- |
| D1 | Use **Create a custom node** as the main entry point. Show datatype suggestions only after creation, inside the editor. Avoid generic “transform” and “convert” labels, but keep them as search aliases. |
| D2 | Bring sample inputs, code, and result preview into one editing experience. Keep secondary tools collapsed. |
| D3 | Preserve drafts and the working graph. Explain consequential changes before applying them. |
| D4 | Infer types from connections and suggest types from examples. Use plain-language labels and allow explicit corrections. |
| D5 | Extend **Save to My Nodes** and pinned script versions for reuse. |
| D6 | Put examples and capability discovery inside the editor, without adding more node-menu entries. |
| D7 | Allow a successful preview to become a saved test. |
| D8 | Give the node one short behavior description and an optional explanation of the code's meaningful steps. |
| D9 | Mark explanations stale when a changed code revision is saved. Regenerate them without a click only where the creator has asked for explanations on that node. Preserve user-written comments. |
| D10 | Put optional author attribution under **Details**, separate from edit history. |
| D11 | Put technical capabilities and limitations behind **Runtime & libraries**. |

D9 differs from the first draft, which regenerated on every save. An
explanation uses the configured model, so regenerating on every save would
spend provider money the creator never asked for. See R2.

Suggested creation copy:

> Describe what you want it to do, or write JavaScript. Work with text, lists,
> images, files, and more.

The canvas shows the node's purpose-specific name, short description, inputs,
outputs, and an Edit action. Tests, authorship, runtime reference, and extended
explanations do not become permanent canvas controls.

## Current behavior

Read from the source on the branch this plan was written against. These are
code observations, not verified app behavior. Recheck each before building on
it.

| Finding | What the code does today |
| --- | --- |
| F1 | Three creation routes open the same assistant dialog: the node-menu entry **Write Code with AI** ([codeGenPaletteMetadata](../../web/src/config/codeGenPaletteMetadata.ts), search aliases `transform`, `convert`, `extract`, …), and the handle context-menu items **Transform this output…** and **Create value with AI…** ([useCodeGenFromHandle](../../web/src/hooks/useCodeGenFromHandle.ts)). The handle routes seed one typed port and wire one edge. |
| F2 | Cancelling a creation route deletes the created node and edge and restores a replaced edge ([CodeGenDialogHost](../../web/src/components/code_gen/CodeGenDialogHost.tsx)). Creation and removal are separate store calls, so undo history after a cancel is unverified. |
| F3 | The node menu already lists code snippets as nodes whose code is hidden (`codeNodeMode: "snippet"`, [snippetMetadata](../../web/src/config/snippetMetadata.ts), `CODE_SNIPPETS` in `codeSnippets.ts`). Saved scripts shown in the menu drop in as `codeNodeMode: "custom"` ([instantiatePaletteNode](../../web/src/utils/instantiatePaletteNode.ts)). |
| F4 | Three editing surfaces commit differently. The inline Monaco editor in [CodeBody](../../web/src/components/node_types/CodeBody.tsx) writes every keystroke to the node and re-infers ports, grouping focus-to-blur into one undo step (`useUndoGroup`). The [CodeAssistantDialog](../../web/src/components/node_types/code_assistant/CodeAssistantDialog.tsx) edits a draft and writes code and ports in one `updateNodeData` on Apply. The JS script tab autosaves every keystroke with no Apply ([JS Scripts](../js-scripts.md#the-editor)). |
| F5 | The assistant's system prompt in [CodeAssistantChatPanel](../../web/src/components/node_types/code_assistant/CodeAssistantChatPanel.tsx) teaches the legacy contract: returned object keys become outputs and `yield` streams. The sandbox contract is `output()` and `emit()`, and `return` is ignored ([JavaScript Sandbox](../javascript-sandbox.md#the-code-node)). The `run_code` and `validate_code` tool specs teach the current contract. |
| F6 | Assistant Apply rebuilds `dynamic_inputs` and `dynamic_outputs` from the draft ports. It does not touch edges, so removing or renaming a connected port may leave an edge pointing at a missing handle. Not yet reproduced. |
| F7 | Port inference ([codeOutputInference](../../web/src/utils/codeOutputInference.ts) `deriveCodeIOUpdates`) keeps every existing input slot, keeps connected outputs, and keeps all outputs when the body does not parse. New inferred ports are typed `any`. |
| F8 | Dynamic input slots already carry `description`, `default`, `min`, `max`, and `required` (`DynamicSlotDeclaration` in [NodeData](../../web/src/stores/NodeData.ts)). A JS script port stores only `name` and `type` ([js-scripts schema](../../packages/protocol/src/api-schemas/js-scripts.ts)). |
| F9 | **Save to My Nodes** extracts the node into a script with `description: ""` and `tests: []` ([useCodeNodeScriptLink](../../web/src/hooks/nodes/useCodeNodeScriptLink.ts) `extractToScript`). Ports are written from `TypeMetadata.type`, which drops type arguments, so `list[str]` may become `list`. The Code node's `max_response_size`, local-network, and host-filesystem settings have no field in the script document. |
| F10 | The script document has `description`, `tests` (with `expect` and `expectedStreamed`), and `palette`. It has no author field. A Code node has an editable title and no description or tests of its own. |
| F11 | A linked Code node shows its body read-only and runs the copied code, so a run never reads a script row. |
| F12 | `useRunSingleNode` with `buildRunSubgraph` already runs one node against its upstream: inputs and cached generative outputs are injected, deterministic upstream nodes rerun, and uncached generative upstreams block the run with a message. It runs the node's stored code, not a draft. |
| F13 | `run_code` and `test_code` run a body with given inputs and return outputs, `streamed` values, logs, and errors. The Code node runs on the server and also in the browser runner (`packages/workflow-runner/` `./browser`). JS scripts run only on the server. |
| F14 | The sandbox has hard limits (30 s, 64 MB heap, 20 fetches, 100 KB output, among others). The Code node adds `timeout`, `max_response_size`, local-network, and host-filesystem settings ([code-node.ts](../../packages/code-nodes/src/nodes/code-node.ts)). |

## Open questions

Each question blocks the milestone named in it. Record the answer in this file
before starting that milestone.

| Question | Blocks | Options and recommendation |
| --- | --- | --- |
| Q1 | M1 | Does the inline canvas editor keep live writes? **Recommend yes.** Keep the inline editor live for small edits (F4) and give the expanded editor a draft with Apply. Removing live inline editing would remove a feature. |
| Q2 | M1, M3 | Where do tests live for a node that is not saved as a script? Option A: a `tests` property on the Code node, carried into the script on save. Option B: **Save as test** first saves to My Nodes. **Recommend A.** B makes testing depend on reuse. |
| Q3 | M1 | Where do the short description and author live on an unsaved node? **Recommend** optional Code node properties `description` and `author`, mapped to the script document's `description` and a new optional `author` on extraction and link. |
| Q4 | M1 | Does the step explanation persist in the workflow, or only in a local cache keyed by code hash? **Recommend** persisting it on the node with the code hash it describes, so a shared workflow shows the same explanation. |
| Q5 | M3 | Where does preview run when the workflow runs in the browser runner (F13)? **Recommend** the server through `run_code`, with a visible note when the workflow's run target differs. |
| Q6 | M6 | Does the script port schema gain optional `description`, `default`, `min`, `max`, and full type metadata (F8, F9)? **Recommend** additive optional fields under `schemaVersion: 1`, so existing documents still validate. |

## Risks

| Risk | Mitigation |
| --- | --- |
| R1 | A background draft save applies code to the workflow by accident. Keep drafts in editor state or a draft store, never in node `properties`, until Apply. Test it (A22). |
| R2 | Explanation generation spends provider money or sends code to a remote model without consent. Generate only on request or per D9, show the provider before the first call, and never send input values or secrets (A29). |
| R3 | Preview has side effects: fetches, writes, paid nodes upstream. Preview runs only side-effect-free bodies automatically (A19). Upstream generative nodes use cached outputs only (F12). |
| R4 | Renaming ports breaks downstream edges silently (F6). Port changes go through one previewed, undoable operation (A21). |
| R5 | Extraction loses data (F9). Add round-trip tests before changing the save path (A54). |

## Milestone 0: Fix existing defects

Dependencies: none. These are independent of the redesign and can ship first.
Reproduce each before fixing it, and ship the reproduction as a test.

- [ ] A52. Rewrite the assistant system prompt (F5) to the `output()`/`emit()` contract, matching the `run_code` spec. Add a test that the prompt does not describe `return` keys as outputs.
- [ ] A53. Reproduce F6 with a connected port removed or renamed in the assistant, then fix Apply so no edge points at a missing handle.
- [ ] A54. Add a round-trip test for **Save to My Nodes** then drop from the menu, covering typed list ports, input defaults, and the Code node's network and filesystem settings. Fix what the test shows is lost, or record it under Q6.
- [ ] A55. Verify that cancelling a creation route (F2) leaves undo history unchanged. Fix it if undo restores the discarded node.

Acceptance: each fix has a test that failed before the change.

## Milestone 1: Establish the editing and metadata contract

Dependencies: Q1 to Q4 answered. Decisions: D2, D3, D8, D9, D10.

- [ ] A1. Confirm F4 in the running app and record where the inline editor, assistant dialog, and script editor share state and where save behavior differs.
- [ ] A2. Define the canvas view and the editor layout using existing UI primitives. The editor grows from `CodeAssistantDialog` rather than a new dialog. Assistant, explanations, tests, and details open on demand.
- [ ] A3. Add storage for the short description, step explanation with the code hash it describes, and optional author, per Q3 and Q4. Reuse the script document's `description`.
- [ ] A4. Define the draft store and the single event that commits a code revision (Apply). Follow R1.
- [ ] A5. Define defaults for existing Code nodes, snippet nodes, custom nodes, and saved scripts: absent fields read as empty, with no migration prompt. Cover import/export and version snapshots.
- [ ] A6. Verify the layout with keyboard navigation and at 1280 × 720 before adding further controls.

Acceptance: an existing Code node, snippet node, and linked node each open
without migration prompts or lost data. The main editing action is reachable
without opening secondary panels.

## Milestone 2: Guide creation and simplify inputs and outputs

Dependencies: milestone 1. Decisions: D1, D4, D6.

- [ ] A7. Rename the menu entry **Write Code with AI** to **Create a custom node**. Keep its search aliases. Relabel the two handle context-menu items to match, without changing their wiring (F1). Update every locale file.
- [ ] A8. Open the new node's editor with **What should this node do?**, free-text authoring, and **Write code**. Carry the seeded port from a handle route into the editor.
- [ ] A9. Show a small set of suggestions based on connected datatypes, only inside the new node's editor. Offer **More ideas** and hide suggestions once the node has code.
- [ ] A10. Draw starters from the existing `CODE_SNIPPETS` catalog (F3), filtered by connected types, rather than a second list. Selecting a starter fills code and ports together. Snippet entries stay in the node menu.
- [ ] A11. When no input exists, offer **Add an input**, describing the task, or writing code. Do not require a datatype before the task is known.
- [ ] A12. Type new inputs from their connection instead of `any` (F7). Suggest output types from analysis and samples, labelled as suggestions, since one sample does not prove a schema.
- [ ] A13. Under **Edit inputs and outputs**, edit the slot fields that already exist (F8): type, description, default, min, max. Add field selection from structured samples.
- [ ] A14. Explain a type mismatch with the expected and received type or value. Do not coerce values whose meaning is ambiguous.
- [ ] A15. Verify creation with text, lists, media, structured data, missing samples, and multiple inputs. Verify that cancelling restores the graph and undo history (A55).

Acceptance: a creator can connect data and pick a starting point without
declaring the same input twice. The node menu has no new entries, and the
renamed entry is still found by its old aliases.

## Milestone 3: Preview and apply changes safely

Dependencies: milestones 1 and 2, Q2 and Q5 answered. Decisions: D2, D3, D4, D7.

- [ ] A16. Add a result preview beside the editor showing outputs, `streamed` values, logs, and errors, in the shape `run_code` returns (F13).
- [ ] A17. Run the draft against editable samples or captured upstream values. Resolve upstream values with `buildRunSubgraph` (F12) so generative upstreams use cached outputs and are never rerun. Label each sample's source and age and provide an explicit refresh.
- [ ] A18. Execute through `run_code` per Q5. State when the preview target differs from where the workflow runs.
- [ ] A19. Require a deliberate click for bodies that fetch, write files, read secrets, or depend on paid upstream nodes. Run automatic preview only when static analysis finds none of these.
- [ ] A20. Keep the last valid port layout while code does not parse (F7 already does this for outputs). Add inline diagnostics from `validate_code` and completion for the node's actual input names.
- [ ] A21. Before Apply, list port additions, removals, and renames with the edges each affects. Apply code, ports, and edge updates as one undo step.
- [ ] A22. Preserve unfinished drafts across close and reopen. Detect when the node changed since the draft began and ask before applying the older draft.
- [ ] A23. Add **Save as test** from a preview, storing per Q2 in the `jsScriptTestCase` shape (`inputs`, `expect`, `expectedStreamed`). Let the creator edit the expected values before saving. Add a minimal test list editor, since the script editor has none today ([JS Scripts](../js-scripts.md#tests)).
- [ ] A24. Test cancellation, failed execution, stale samples, port removal, rename, undo, draft recovery, and concurrent edits by an agent through the `ui_code_*` tools.

Acceptance: a creator can inspect a result before changing the node, recover
unfinished work, and undo code and wiring changes in one step. Saving a test
needs neither the assistant nor the CLI.

## Milestone 4: Explain the saved code

Dependencies: milestones 1 and 3. Decisions: D8, D9.

- [ ] A25. Show one short behavior description on the node, for example “Keeps articles published within the last seven days.” Include filtering or failure behavior when it matters.
- [ ] A26. Add an optional step explanation in the editor that covers meaningful operations, not each line. Keep syntax highlighting.
- [ ] A27. Store generated explanations apart from the source (A3). Anchor them to the code hash. Never rewrite the source or its comments.
- [ ] A28. After a changed revision is applied, mark the explanation stale and regenerate per D9. Coalesce rapid applies and discard responses for superseded hashes.
- [ ] A29. Use deterministic analysis (port names, imports, fetch and secret use) where it suffices and the configured model otherwise. Send only the code and port declarations, never input values or secrets.
- [ ] A30. When generation fails or no provider is configured, keep the previous explanation, mark it stale, and let Apply succeed.
- [ ] A31. A description the creator wrote overrides the generated one. When code changes, flag it for review instead of overwriting it.
- [ ] A32. Test unchanged applies, overlapping requests, unparseable code, no configured provider, manual descriptions, and preservation of source comments.

Acceptance: the description and explanation each name the revision they
describe. Failed or delayed generation never blocks Apply and never shows an
older explanation as current. The UI does not present an explanation as proof
that the code is correct.

## Milestone 5: Explain the runtime on demand

Dependencies: milestone 1 only, so it can ship alongside milestone 2. Decision: D11.

- [ ] A33. Add a secondary **Runtime & libraries** button inside the editor.
- [ ] A34. Give a short technical introduction: QuickJS WebAssembly, async/await, `inputs`, `output()`, `emit()`, `stream`, `state`, and `progress()`.
- [ ] A35. State what is absent: Node.js and browser globals, DOM access, arbitrary npm imports. Explain media references and that they are valid only for the current run.
- [ ] A36. List installed sandbox packages with one-line descriptions and copyable imports, from the same catalog `list_sandbox_packages` reads, so a third-party pack appears without a code change.
- [ ] A37. Show the effective limits for this node: the sandbox defaults and the node's own `timeout`, `max_response_size`, local-network, and host-filesystem settings (F14). List declared secret names, never values.
- [ ] A38. Distinguish server and browser-runner capabilities (F13). Show an unavailable or unknown capability as such. Link to [JavaScript Sandbox](../javascript-sandbox.md).
- [ ] A39. Read limits and the package list from runtime configuration, not copied text. Test with a missing package and a node that restricts access.

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

- [ ] A40. Extend **Save to My Nodes** to carry the description, full port types, slot defaults and descriptions, tests, node settings, and author into the script document (F9, Q6). A54's round-trip test covers each field.
- [ ] A41. Put **Author** under **Details**. Preserve it through duplication, extraction, linking, sharing, and import/export. Keep it apart from last-editor metadata and verified identity.
- [ ] A42. Let a reused node expose ordinary settings, such as a threshold, as inputs with defaults (F8) so they can be changed without editing source.
- [ ] A43. Show the pinned version, whether the node's copy differs from it, and whether a newer version exists. Keep runs self-contained (F11) and keep existing pinning.
- [ ] A44. Before **Update to latest**, preview code and port changes as in A21. Run the script's saved tests on request, under A19's rules.
- [ ] A45. Verify reuse in a second workflow, local edits, version updates, a deleted source script, attribution preservation, and rollback.

Acceptance: a saved node is usable through its inputs and settings. Updating
the script never changes an existing workflow until the creator applies the
update there.

## Milestone 7: Validate the complete experience

Dependencies: milestones 0 to 6.

- [ ] A46. Run one end-to-end scenario: creation, sample preview, Apply, explanation refresh, saving a test, and reuse in a second workflow. Automate it with the web Playwright suite ([Testing](../../web/TESTING.md)).
- [ ] A47. Verify keyboard access, focus restoration, dark and light themes, and small-window layout against the [Design System](../DESIGN.md), [UX Guidelines](../UX_GUIDELINES.md), and [UI Primitives Strategy](../../web/src/components/ui_primitives/STRATEGY.md).
- [ ] A48. Measure time to a correct result, manual type and wiring actions, accidental connection changes, and successful reuse, before and after. Record observations rather than invented targets.
- [ ] A49. Check that suggestions, author metadata, and runtime details are absent from the default node menu and canvas.
- [ ] A50. Update [JS Scripts](../js-scripts.md) and [JavaScript Sandbox](../javascript-sandbox.md) where behavior changed, including the test editor (A23) and new document fields (Q6).
- [ ] A51. Build packages and run the post-change checks from [Development Standards](../DEVELOPMENT_STANDARDS.md) and [repository instructions](../../AGENTS.md#mandatory-post-change-verification): `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main`.

Acceptance: each milestone's behavior is shown by tests and UI checks.
Completion claims include the commands run and their results.
