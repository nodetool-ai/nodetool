/**
 * @jest-environment jsdom
 *
 * The public page is the one surface a stranger reaches, so what matters here
 * is what it does with the session token: it holds one only while the page is
 * mounted, and it renders the release it was handed without fetching anything
 * else.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../publicAppClient", () => ({
  PublicAppUnavailableError: class extends Error {},
  fetchPublicApplication: jest.fn(),
  createPublicAppSession: jest.fn()
}));

const runtimeProps = jest.fn();
jest.mock("../../appbuilder/AppRuntimeView", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    runtimeProps(props);
    return <div data-testid="runtime" />;
  }
}));

import { getAppSessionToken } from "../../../lib/appSession";
import {
  createPublicAppSession,
  fetchPublicApplication
} from "../publicAppClient";
import PublicAppPage from "../PublicAppPage";

const fetchApp = fetchPublicApplication as jest.Mock;
const createSession = createPublicAppSession as jest.Mock;

const graph = {
  nodes: [{ id: "n1", type: "nodetool.text.Concat" }],
  edges: []
};

const publicApp = {
  id: "app-1",
  name: "Poem maker",
  description: "Turns a prompt into a poem",
  release: {
    id: "ver-1",
    applicationId: "app-1",
    version: 4,
    released: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    capabilities: { workflows: [{ workflowId: "wf-1" }], resources: [] },
    document: {
      schemaVersion: 3,
      title: "Poem maker",
      ui: { root: { props: {} }, content: [{ type: "Button" }], zones: {} },
      operations: [
        {
          id: "main",
          name: "Run",
          workflowId: "wf-1",
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ],
      resources: [],
      variables: []
    },
    workflows: [
      { workflowId: "wf-1", version: 2, graphHash: "abc", graph }
    ]
  }
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/a/tok3n"]}>
          <Routes>
            <Route path="/a/:token" element={<PublicAppPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

describe("PublicAppPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runtimeProps.mockClear();
    fetchApp.mockResolvedValue(publicApp);
    createSession.mockResolvedValue({
      token: "nda_session",
      expiresAt: "2026-01-01T01:00:00.000Z",
      applicationId: "app-1",
      version: 4
    });
  });

  it("runs the release off the pinned graph, fetching no workflow", async () => {
    renderPage();

    await screen.findByTestId("runtime");
    const props = runtimeProps.mock.calls.at(-1)?.[0];
    expect(props.application).toEqual({ id: "app-1", version: 4 });
    expect(props.workflowOverrides["wf-1"].graph).toEqual(graph);
    // The host workflow is the pinned one, so nothing has to be looked up —
    // which matters, because the session cannot make an authenticated call.
    expect(props.workflow.graph).toEqual(graph);
    expect(props.document.operations[0].workflowId).toBe("wf-1");
  });

  it("shows the app's name and description", async () => {
    renderPage();
    expect(await screen.findByText("Poem maker")).toBeInTheDocument();
    expect(
      screen.getByText("Turns a prompt into a poem")
    ).toBeInTheDocument();
  });

  it("holds the session only while it is mounted", async () => {
    const view = renderPage();
    await waitFor(() => expect(getAppSessionToken()).toBe("nda_session"));

    view.unmount();
    // The token authenticates as the app's owner; nothing outside this page
    // should be able to connect with it.
    expect(getAppSessionToken()).toBeNull();
  });

  it("says nothing about why a dead link is dead", async () => {
    fetchApp.mockRejectedValue(new Error("This app is not available"));
    renderPage();

    expect(
      await screen.findByText("This app is not available")
    ).toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
    expect(getAppSessionToken()).toBeNull();
  });
});
