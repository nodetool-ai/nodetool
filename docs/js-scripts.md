---
layout: page
title: "JS Scripts"
permalink: /js-scripts
description: "Write reusable JavaScript as a saved document with declared inputs, outputs, secrets, and tests, then run it, test it, or use it as a node."
---

A JS script is a saved JavaScript document. It has a body, declared input and output ports, the secret names it may read, a timeout, and saved test cases. Unlike the body of a Code node, which lives inside one workflow, a script is a standalone document you can reuse, run on its own, and test.

Scripts run in the server's QuickJS sandbox, never in the browser. For what the sandbox allows, its limits, and its imports, see [JavaScript Sandbox](javascript-sandbox.md).

## Create a script

1. Open **JS Scripts** in the left sidebar.
2. Select the **New JS script** button (+). NodeTool creates "Untitled JS script" and opens it as a workspace tab.

The sidebar panel lists your scripts, newest first, and **Search JS scripts...** filters them by name or description. Select a script to open it in a tab.

## The editor

The script tab has four regions.

- **Editor.** The script body in Monaco. Every keystroke autosaves. Undo and redo work as in other documents.
- **Run console.** Below the editor, with **Run** and **Test** buttons and the result of the last run.
- **Script tab.** On the right, the settings panel described below.
- **Assistant tab.** On the right, next to **Script**. See [Assistant](#assistant).

On a phone these become four panes, **Code**, **Run**, **Script**, and **Assistant**, with one visible at a time.

### Writing the body

The host wraps the body in an async function, so write top-level statements only.

- Do not write `export` or wrap the body in a function. `inputs` is already in scope.
- Read an input as `inputs.<name>`.
- Send a result out with `await output(name, value)` or `await emit(name, value)`.
- Do not return outputs. A body that returns its outputs fails validation.
- Import any installed sandbox pack or `@nodetool-ai/sandbox-nodetool/<namespace>` directly.

```js
await output("total", inputs.numbers.reduce((a, n) => a + n, 0));
```

Media handles are valid only for the current run. Persist them before output, for example with `await image.toAsset(frame)`. A body that reads its inputs with `stream` runs once and pulls items as they arrive. For the full model, see the [nodetool-js-scripting skill](skills.md) and [JavaScript Sandbox](javascript-sandbox.md).

## Declare inputs and outputs

In the **Script** tab, the **Inputs** and **Outputs** lists declare the script's ports. Select **Add** to add a row, then enter a name and choose a type. Port names must be valid identifiers, because the body reads them as `inputs.<name>`.

The available types are `str`, `int`, `float`, `bool`, `list`, `dict`, `image`, `audio`, `video`, `document`, and `any`.

The ports are the only source for the run dialog, the test cases, and the validation checks. The same panel holds:

| Field | What it does |
|-------|--------------|
| Description | What the script does. Agents read it to decide whether to call the script. |
| Show in node menu | Adds the script to **My Nodes** so it drops onto a graph like any node. **Category** sets the group, and defaults to My Nodes. |
| Timeout (seconds, max 120) | How long a run may take. The default is 30. |

## Secrets

Under **Secrets**, list the names of the secrets the body may read, such as `OPENAI_API_KEY`. The body reads one with `nodetool.secrets.get`.

The list is a ceiling, not a grant. A run gets only the names that appear both in this list and in what the calling context allows, so declaring a name never widens access. The validator warns when a declared secret is missing on the current install.

## Run a script

Select **Run** in the console. The **Run script** dialog asks for one value per declared input, using the control that matches the port type. The `list`, `dict`, and `any` types take JSON text. A value that does not parse is passed as a string. A script with no inputs says "This script declares no inputs. Run it as it is."

If the body reads inputs with `stream`, each field instead takes a JSON array of items to stage, for example `[1, 2, 3]`.

The console then shows **Last run** with its status and duration, plus **Logs**, **Streamed** values from `emit`, and **Outputs**. Failures show the error in a banner.

Runs always use the saved script. If the document has unsaved changes, the console says "Runs use the saved script", and the run and test tools flush the live document first.

## Tests

A test case has a name, the inputs to run with, and the expected result. It can compare the final outputs per port (`expect`) and the ordered sequence of `emit` calls (`expectedStreamed`). A case for a body that uses `stream` stages items with `inputStreams`.

The editor has no form for writing cases. Ask the assistant to add them, or edit them through the CLI or the agent tools described below. The **Test** button reads "No tests" until a case exists, then "Test (N)". It runs the cases one at a time and reports "N passed, M failed". Each failing case lists the output name with its expected and actual values.

## Assistant

The **Assistant** tab ("JS Script Assistant") edits the document directly. Its changes autosave, with no Apply step. Ask it to write or change the script, add an error output, or write a test for the empty case.

Its tools:

| Tool | What it does |
|------|--------------|
| `ui_jsscript_get_state` | Reads the name, document, validation issues, and the last run and test results |
| `ui_jsscript_set_code` | Replaces the body |
| `ui_jsscript_set_ports` | Replaces input and output ports |
| `ui_jsscript_set_meta` | Sets name, description, secrets, and timeout |
| `ui_jsscript_set_tests` | Replaces the saved test cases |
| `ui_jsscript_run` | Runs the saved script with given inputs |
| `ui_jsscript_test` | Runs and grades the saved cases. Fails when there are none. |

Outside the editor, agents manage scripts with `list_js_scripts`, `get_js_script`, `save_js_script`, `validate_js_script`, `run_js_script`, `test_js_script`, `edit_js_script`, and `delete_js_script`, plus version tools for listing, reading, creating, restoring, and deleting versions.

## Use a script in a workflow

Two paths exist.

- **Node menu.** Turn on **Show in node menu** in the **Script** tab. The script appears under the category you set in the node menu.
- **Code node.** The Code node has a **Script** property that links it to a script version. Linking copies that version's code, secrets, and timeout into the node and pins the version. Editing the script later does not change the workflow. Use **Update to latest** to re-copy and re-pin.

## Command line

`nodetool jsscript` works on a script JSON file or a saved script id. Full options are in [CLI reference](cli.md#nodetool-jsscript).

| Command | What it does |
|---------|--------------|
| `nodetool jsscript validate <script_id_or_file>` | Checks syntax, imports, undefined names, undeclared `inputs.*` reads, unreachable outputs, port names, and tests. `--warnings-as-errors` fails on warnings. |
| `nodetool jsscript run <script_id_or_file>` | Runs the body once. Pass `--inputs '{"a":1}'` or, for a body that uses `stream`, `--input-streams '{"nums":[1,2,3]}'`. |
| `nodetool jsscript test <script_id_or_file>` | Runs and grades the saved cases. Exits non-zero if any case fails. |
| `nodetool jsscript debug <script_id_or_file>` | Replays scripted `ui_jsscript_*` steps against the headless bridge and validates the result. |
| `nodetool jsscript versions` | Lists, creates, and restores versions of a script. |

```bash
nodetool jsscript validate script.json
nodetool jsscript run script.json --inputs '{"numbers":[1,2,3]}'
nodetool jsscript test script.json
```
