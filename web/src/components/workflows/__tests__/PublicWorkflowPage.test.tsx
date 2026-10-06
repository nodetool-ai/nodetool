import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import mockTheme from "../../../__mocks__/themeMock";
import PublicWorkflowPage from "../PublicWorkflowPage";

const mockAuth = { state: "logged_in" };
jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: (selector: (state: typeof mockAuth) => unknown) => selector(mockAuth)
}));

const mockQuery: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
} = { data: undefined, isLoading: false, isError: false };
const mockMutateAsync = jest.fn();
jest.mock("../../../serverState/useWorkflowSharing", () => ({
  usePublicSharedWorkflow: () => mockQuery,
  useDuplicateSharedWorkflow: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false
  })
}));

jest.mock("../../version/WorkflowGraphPreview", () => ({
  __esModule: true,
  default: () => <div data-testid="graph-preview" />
}));

const renderAt = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MemoryRouter initialEntries={["/view/tok_abc"]}>
        <Routes>
          <Route path="/view/:token" element={<PublicWorkflowPage />} />
          <Route path="/editor/:id" element={<div>editor opened</div>} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );

const sharedWorkflow = {
  name: "Shared pipeline",
  description: "Turns a prompt into an image",
  tags: [],
  graph: { nodes: [], edges: [] }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.state = "logged_in";
  mockQuery.data = sharedWorkflow;
  mockQuery.isLoading = false;
  mockQuery.isError = false;
});

test("shows the shared workflow and copies it into the viewer's workflows", async () => {
  const user = userEvent.setup();
  mockMutateAsync.mockResolvedValue({ id: "wf-copy", name: "Shared pipeline" });
  renderAt();

  expect(screen.getByText("Shared pipeline")).toBeInTheDocument();
  expect(screen.getByTestId("graph-preview")).toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Duplicate to my workflows" })
  );

  expect(mockMutateAsync).toHaveBeenCalledWith("tok_abc");
  await waitFor(() =>
    expect(screen.getByText("editor opened")).toBeInTheDocument()
  );
});

test("asks a signed-out viewer to sign in instead of copying", async () => {
  const user = userEvent.setup();
  mockAuth.state = "logged_out";
  renderAt();

  await user.click(screen.getByRole("button", { name: "Sign in to duplicate" }));

  expect(mockMutateAsync).not.toHaveBeenCalled();
  expect(screen.getByText("login page")).toBeInTheDocument();
});

test("explains a revoked or unknown link", () => {
  mockQuery.data = undefined;
  mockQuery.isError = true;
  renderAt();

  expect(
    screen.getByText("This workflow is not available")
  ).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
