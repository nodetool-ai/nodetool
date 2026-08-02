/**
 * The `app-tools` tool-loop eval suite: cases over the App Builder's `ui_app_*`
 * surface.
 *
 * The bridge itself lives in `../../app-build/bridge.ts` and is re-exported
 * here. It moved because the app-build Author stage drives the same tools with
 * a real model, and the two must not drift: this file used to keep the tool
 * contract in sync with `web/src/lib/tools/builtin/puck.ts` by convention (copy
 * the names, descriptions and Zod shapes verbatim; call the shared
 * `@nodetool-ai/app-runtime` doc-ops rather than reimplementing them). That
 * convention still governs the bridge's relationship to the browser tools —
 * what changed is that the eval and the production authoring loop now share one
 * implementation, so a contract change reaches both or neither.
 */

export {
  createAppToolBridge,
  type AppBridgeDocument,
  type AppBridgeFinalState,
  type AppBridgeInitialState,
  type AppComponentSummary,
  type AppToolBridge,
  type ComponentNode,
  type SeedComponent
} from "../../app-build/bridge.js";

import { createAppToolBridge } from "../../app-build/bridge.js";
import type { AppBridgeFinalState } from "../../app-build/bridge.js";
import type { ToolLoopEvalCase } from "../tool-loop-eval.js";

/** Count widgets of a given type in the final document (at any depth). */
function countByType(state: AppBridgeFinalState, type: string): number {
  return state.components.filter((c) => c.type === type).length;
}

const APP_SYSTEM_PROMPT = `You are an assistant building a mini web app in the App Builder through UI tools.

The app is a tree of widgets bound to one or more workflows. Every ui_app_* tool takes the \`application_id\` of the app you are editing — the id named in the objective, never a workflow id. Use the ui_app_* tools:
- Call ui_app_get_snapshot first to see the placed widgets, the page title, and the available widget types.
- Call ui_app_list_component_types to learn valid widget \`type\` values and their props.
- Add widgets with ui_app_add_component. To nest inside a layout widget, pass parent_id and the slot it holds children in: Panel (Container) and Accordion use 'content', Columns 'left'/'right', Tabs 'tab1'/'tab2'/'tab3'.
- Edit a widget's props with ui_app_update_component (its id cannot change); remove one with ui_app_remove_component.
- Set the page title with ui_app_set_title.

Widgets are wired to workflow runs through the document's operations, variables, and resources:
- ui_app_get_binding_targets lists every slot a widget can bind to and the exact token to put in its \`binding\` prop (op:<opId>/in:<nodeId>, op:<opId>/out:<nodeId>, op:<opId>/exec#running|progress|error|activity, var:<id>). Call it before binding instead of guessing.
- ui_app_list_operations / ui_app_add_operation / ui_app_update_operation / ui_app_remove_operation manage which workflows the app runs and how their inputs and outputs are mapped.
- ui_app_list_variables / ui_app_declare_variable / ui_app_update_variable / ui_app_remove_variable manage app state. Only user-scoped variables may persist.
- ui_app_list_resources / ui_app_add_resource / ui_app_remove_resource manage the document collections the app may reach.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

// Note on `noErrorResults`: the tool-loop runner only counts a *thrown* tool
// error as an errored result — a returned `{ ok: false }` (e.g. update/remove
// on an unknown id) is not flagged. These cases therefore lean on the
// `finalState` predicates to catch a wrong-but-non-throwing tool call, and use
// `noErrorResults` only to catch genuine exceptions.
export const APP_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<AppBridgeFinalState>[] =
  [
    {
      id: "build-form",
      description:
        "Set the page title, then add a heading, a text input, and a run button",
      objective:
        "Build a simple app (application_id 'app-1'): set the page title to 'Ask the AI', add a Heading, add a TextInput for the prompt, and add a Button to run the workflow.",
      createBridge: () => createAppToolBridge(),
      systemPrompt: APP_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_app_add_component", "ui_app_set_title"],
        noErrorResults: true,
        minToolCalls: 4,
        maxToolCalls: 15,
        finalState: [
          {
            name: "titleIsAskTheAI",
            detail: "page title was not set to 'Ask the AI'",
            test: (s) => (s.title ?? "").trim().toLowerCase() === "ask the ai"
          },
          {
            name: "hasHeading",
            detail: "no Heading widget present",
            test: (s) => countByType(s, "Heading") >= 1
          },
          {
            name: "hasTextInput",
            detail: "no TextInput widget present",
            test: (s) => countByType(s, "TextInput") >= 1
          },
          {
            name: "hasButton",
            detail: "no Button widget present",
            test: (s) => countByType(s, "Button") >= 1
          }
        ]
      }
    },
    {
      id: "nest-in-panel",
      description: "Add a Text widget inside an existing Panel's content slot",
      objective:
        "The app has one empty Panel. Add a Text widget inside that Panel so it appears within the panel, not at the top level.",
      createBridge: () =>
        createAppToolBridge({
          components: [{ type: "Container", id: "panel-1", props: { title: "Details" } }]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The app (application_id 'app-1') has one empty Panel (a Container widget with id 'panel-1'). Add a Text widget inside that Panel's content slot so it is nested within the panel, not at the top level.",
      expect: {
        requiredTools: ["ui_app_add_component"],
        noErrorResults: true,
        minToolCalls: 1,
        maxToolCalls: 10,
        finalState: [
          {
            name: "textNestedInPanel",
            detail: "no Text widget nested inside 'panel-1'",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.type === "Text" &&
                  c.parentId === "panel-1" &&
                  c.slot === "content"
              )
          },
          {
            name: "noTopLevelText",
            detail: "a Text widget was added at the top level instead of nested",
            test: (s) =>
              !s.components.some(
                (c) => c.type === "Text" && c.parentId === null
              )
          }
        ]
      }
    },
    {
      id: "relabel-and-remove",
      description:
        "Relabel an existing Button and remove a leftover Text widget",
      objective:
        "The app has a Button and a leftover Text widget. Change the Button's label to 'Submit', and remove the Text widget.",
      createBridge: () =>
        createAppToolBridge({
          components: [
            { type: "Button", id: "btn-1", props: { label: "Run" } },
            { type: "Text", id: "text-1", props: { text: "delete me" } }
          ]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The app (application_id 'app-1') has a Button (id 'btn-1') and a leftover Text widget (id 'text-1'). Change the Button's label to 'Submit', and remove the Text widget.",
      expect: {
        requiredTools: ["ui_app_update_component", "ui_app_remove_component"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 10,
        finalState: [
          {
            name: "buttonRelabeled",
            detail: "the Button's label is not 'Submit'",
            test: (s) =>
              s.components.some(
                (c) => c.id === "btn-1" && c.props.label === "Submit"
              )
          },
          {
            name: "textRemoved",
            detail: "the Text widget is still present",
            test: (s) => !s.components.some((c) => c.type === "Text")
          }
        ]
      }
    },
    {
      id: "bind-widgets-to-workflow",
      description:
        "Look up the binding targets and wire an input and a display widget to them",
      objective:
        "Bind the app's TextInput to the workflow's prompt input node and its Text widget to the answer output node, using the exact binding tokens the App Builder reports.",
      createBridge: () =>
        createAppToolBridge({
          workflowId: "wf-app",
          workflow: {
            inputs: [{ nodeId: "in-1", name: "prompt", label: "Prompt" }],
            outputs: [{ nodeId: "out-1", name: "answer", label: "Answer" }],
            variables: []
          },
          components: [
            { type: "TextInput", id: "input-1", props: { label: "Prompt" } },
            { type: "Text", id: "text-1" }
          ]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: App 'app-1' (application_id 'app-1') has a TextInput (id 'input-1') and a Text widget (id 'text-1'), both unbound. " +
        "Bind the TextInput to the workflow's prompt input node and the Text widget to its answer output node. " +
        "Look the tokens up with ui_app_get_binding_targets — do not guess them.",
      expect: {
        requiredTools: [
          "ui_app_get_binding_targets",
          "ui_app_update_component"
        ],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "inputBoundToPromptNode",
            detail: "the TextInput is not bound to op:main/in:in-1",
            test: (s) =>
              s.components.some(
                (c) => c.id === "input-1" && c.props.binding === "op:main/in:in-1"
              )
          },
          {
            name: "textBoundToAnswerNode",
            detail: "the Text widget is not bound to op:main/out:out-1",
            test: (s) =>
              s.components.some(
                (c) => c.id === "text-1" && c.props.binding === "op:main/out:out-1"
              )
          }
        ]
      }
    },
    {
      id: "declare-and-bind-variable",
      description:
        "Declare a persisted user-scoped variable and bind a Switch to it",
      objective:
        "Declare a user-scoped variable that persists across sessions and bind the app's Switch widget to it.",
      createBridge: () =>
        createAppToolBridge({
          workflowId: "wf-app",
          components: [
            { type: "Switch", id: "switch-1", props: { label: "Dark mode" } }
          ]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: App 'app-1' (application_id 'app-1') has a Switch widget (id 'switch-1') for a dark-mode preference. " +
        "Declare a variable with id 'dark_mode' that is scoped to the user and persists across sessions, " +
        "then bind the Switch to it.",
      expect: {
        requiredTools: ["ui_app_declare_variable", "ui_app_update_component"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "variableIsUserScopedAndPersisted",
            detail:
              "no 'dark_mode' variable with scope 'user' and persist true was declared",
            test: (s) =>
              s.variables.some(
                (v) =>
                  v.id === "dark_mode" && v.scope === "user" && v.persist === true
              )
          },
          {
            name: "switchBoundToVariable",
            detail: "the Switch is not bound to var:dark_mode",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.id === "switch-1" && c.props.binding === "var:dark_mode"
              )
          }
        ]
      }
    },
    {
      // The widget the objective needs is only reachable if the model reads the
      // catalog: Table and Tabs are not in the handful of types the tool
      // descriptions name.
      id: "tabbed-results",
      description:
        "Discover a display widget beyond the examples and nest it in a Tabs slot",
      objective:
        "Put a Table of the workflow's rows output in the first tab of the app's Tabs widget.",
      createBridge: () =>
        createAppToolBridge({
          workflowId: "wf-app",
          workflow: {
            inputs: [],
            outputs: [{ nodeId: "out-1", name: "rows", label: "Rows" }],
            variables: []
          },
          components: [{ type: "Tabs", id: "tabs-1", props: { tab1Label: "Results" } }]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: App 'app-1' (application_id 'app-1') has a Tabs widget (id 'tabs-1') whose first tab is empty. " +
        "The workflow emits a list of rows. Add a widget that shows those rows as a table inside the first tab, " +
        "and bind it to the rows output — look the widget type and the binding token up with the tools rather than guessing.",
      expect: {
        requiredTools: ["ui_app_add_component"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "tableInFirstTab",
            detail: "no Table widget nested in the Tabs widget's tab1 slot",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.type === "Table" &&
                  c.parentId === "tabs-1" &&
                  c.slot === "tab1"
              )
          },
          {
            name: "tableBoundToRowsOutput",
            detail: "the Table is not bound to op:main/out:out-1",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.type === "Table" && c.props.binding === "op:main/out:out-1"
              )
          }
        ]
      }
    },
    {
      // A sketch output is a ref, not media — bind it to Image and the app
      // shows nothing. The model has to find the widget that resolves it.
      id: "show-sketch-output",
      description:
        "Pick the widget that renders a sketch output and bind it, over the media widgets",
      objective:
        "Show the workflow's sketch output in the app using the widget that renders a sketch document.",
      createBridge: () =>
        createAppToolBridge({
          workflowId: "wf-app",
          workflow: {
            inputs: [{ nodeId: "in-1", name: "prompt", label: "Prompt" }],
            outputs: [{ nodeId: "out-1", name: "artwork", label: "Artwork" }],
            variables: []
          }
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: App 'app-1' (application_id 'app-1') is empty. Its workflow emits a sketch document " +
        "(a layered image document) on the 'artwork' output. Add the widget that previews a sketch and bind it " +
        "to that output. Look the widget type and the binding token up with the tools rather than guessing — " +
        "a sketch is a document reference, not an image URL, so the Image widget will not render it.",
      expect: {
        requiredTools: ["ui_app_add_component"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasSketchWidget",
            detail: "no Sketch widget present",
            test: (s) => countByType(s, "Sketch") >= 1
          },
          {
            name: "sketchBoundToArtworkOutput",
            detail: "the Sketch widget is not bound to op:main/out:out-1",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.type === "Sketch" && c.props.binding === "op:main/out:out-1"
              )
          },
          {
            name: "noImageWidget",
            detail:
              "an Image widget was added, which cannot render a sketch reference",
            test: (s) => countByType(s, "Image") === 0
          }
        ]
      }
    },
    {
      id: "show-timeline-output",
      description:
        "Pick the widget that renders a timeline output and nest it in a Panel",
      objective:
        "Show the workflow's timeline output inside the app's existing Panel.",
      createBridge: () =>
        createAppToolBridge({
          workflowId: "wf-app",
          workflow: {
            inputs: [],
            outputs: [{ nodeId: "out-1", name: "cut", label: "Cut" }],
            variables: []
          },
          components: [
            { type: "Container", id: "panel-1", props: { title: "Preview" } }
          ]
        }),
      systemPrompt: APP_SYSTEM_PROMPT,
      userPrompt:
        "Objective: App 'app-1' (application_id 'app-1') has an empty Panel (a Container widget with id 'panel-1'). " +
        "The workflow emits a timeline sequence on its 'cut' output. Add the widget that previews a timeline inside " +
        "that Panel's content slot and bind it to the output. A timeline is a document reference, not a video file — " +
        "look the widget type and the binding token up with the tools rather than guessing.",
      expect: {
        requiredTools: ["ui_app_add_component"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "timelineNestedInPanel",
            detail: "no Timeline widget nested in 'panel-1' content slot",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.type === "Timeline" &&
                  c.parentId === "panel-1" &&
                  c.slot === "content"
              )
          },
          {
            name: "timelineBoundToCutOutput",
            detail: "the Timeline widget is not bound to op:main/out:out-1",
            test: (s) =>
              s.components.some(
                (c) =>
                  c.type === "Timeline" &&
                  c.props.binding === "op:main/out:out-1"
              )
          }
        ]
      }
    }
  ];
