import { useCallback, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";

import mockTheme from "../../../__mocks__/themeMock";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";
import type { Workflow } from "../../../stores/ApiTypes";
import AppRuntimeView from "../AppRuntimeView";
import {
  defaultAppInstance,
  loadAppInstance,
  saveAppInstance,
  type ServerAppInstance
} from "../runtime/appInstanceApi";

jest.mock("../runtime/appInstanceApi", () => ({
  ...jest.requireActual("../runtime/appInstanceApi"),
  defaultAppInstance: jest.fn(),
  loadAppInstance: jest.fn(),
  saveAppInstance: jest.fn()
}));
jest.mock("../AppInstanceManager", () => ({ __esModule: true, default: () => null }));
jest.mock("../AppRunHistory", () => ({ __esModule: true, default: () => null }));

const CASES: Array<[string, Data["content"][number], string]> = [
  ["TextInput", { type: "TextInput", props: { id: "field", label: "Name", binding: "name" } }, "Name"],
  ["WorkflowInput", { type: "WorkflowInput", props: { id: "field", label: "Name", binding: "prompt" } }, "Name"],
  ["WorkflowForm", { type: "WorkflowForm", props: { id: "field" } }, "Prompt"],
  ...(
    [
      ["Container", "content"],
      ["Columns", "left"],
      ["Tabs", "tab1"],
      ["Accordion", "content"]
    ] as const
  ).map(([type, slot]): [string, Data["content"][number], string] => [
    `TextInput in a ${type} in a Container`,
    {
      type: "Container",
      props: {
        id: "outer",
        variant: "plain",
        content: [
          {
            type,
            props: {
              id: "inner",
              tab1Label: "First",
              [slot]: [{ type: "TextInput", props: { id: "field", label: "Name", binding: "name" } }]
            }
          }
        ]
      }
    },
    "Name"
  ])
];
let document: ApplicationDocument;
const workflow = {
  id: "wf",
  name: "Focus",
  access: "private",
  graph: {
    nodes: [
      { id: "in1", type: "nodetool.input.StringInput", data: { name: "prompt", label: "prompt", value: "" } }
    ],
    edges: []
  }
} as unknown as Workflow;
const uiFor = (item: Data["content"][number]): Data => ({ root: { props: {} }, content: [item], zones: {} });

// A server response is a fresh object graph on every call.
const serverInstance = (
  revision: number,
  variables: Record<string, unknown>
): ServerAppInstance =>
  JSON.parse(
    JSON.stringify({
      id: "instance-1",
      user_id: "1",
      application_id: "app",
      name: "Default",
      revision,
      variables,
      snapshot: { document, workflow_graphs: {}, script_documents: {} }
    })
  ) as ServerAppInstance;

describe.each(CASES)("%s", (_name, item, label) => {
it.each([["pinned instance", "instance-1"], ["default instance", undefined]])("keeps focus with a %s", async (_c, instanceId) => {
  const ui = uiFor(item);
  document = {
    schemaVersion: 3,
    ui,
    operations: [{ id: "main", name: "Main", workflowId: "wf", inputs: {}, outputs: {} }],
    resources: [],
    variables: [{ id: "name", type: "string", default: "" }]
  } as unknown as ApplicationDocument;
  jest.mocked(saveAppInstance).mockClear();
  jest.mocked(defaultAppInstance).mockImplementation(async () => serverInstance(1, {}));
  jest.mocked(loadAppInstance).mockImplementation(async () => serverInstance(1, {}));
  jest
    .mocked(saveAppInstance)
    .mockImplementation(async (_id, revision, variables) =>
      serverInstance(revision + 1, variables)
    );
  const RuntimeView = () => {
    const [selectedInstanceId, setSelectedInstanceId] = useState(instanceId);
    const handleInstanceReady = useCallback((instance: ServerAppInstance) => {
      setSelectedInstanceId(instance.id);
    }, []);

    return (
      <AppRuntimeView
        workflow={workflow}
        data={ui}
        document={document}
        application={{ id: "app", version: 1 }}
        instanceId={selectedInstanceId}
        onInstanceReady={handleInstanceReady}
        workflowOverrides={{ wf: workflow }}
      />
    );
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <RuntimeView />
      </ThemeProvider>
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  const field = await screen.findByLabelText(label);
  await user.click(field);
  await user.type(field, "a");
  await waitFor(() => expect(saveAppInstance).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(screen.getByLabelText(label)).toBe(field);
  expect(window.document.activeElement).toBe(field);
  await user.keyboard("b");
  expect(field).toHaveValue("ab");
});
});
