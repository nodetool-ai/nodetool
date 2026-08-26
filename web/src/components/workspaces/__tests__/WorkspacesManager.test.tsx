/**
 * What the manager offers follows the server's `can_manage` answer, not the
 * client's idea of where it is running. A cloud deployment refuses
 * create/update/delete but still serves the managed workspace.
 */

import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import WorkspacesManager from "../WorkspacesManager";

const managed = {
  id: "ws-managed",
  user_id: "u1",
  name: "Default",
  path: "workspaces/1",
  is_default: true,
  is_managed: true,
  is_accessible: true,
  created_at: "2026-08-26T06:26:04.406Z",
  updated_at: "2026-08-26T06:26:04.406Z"
};

let canManage = true;

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workspace: {
      list: { query: () => Promise.resolve(listResponse()) }
    }
  }
}));

function listResponse() {
  return { workspaces: [managed], can_manage: canManage, next: null };
}

jest.mock("../useFolderPicker", () => ({
  useFolderPicker: () => ({ pickFolder: jest.fn(), dialog: null })
}));

const renderManager = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <WorkspacesManager />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  canManage = true;
});

it("offers the folder picker when the server allows managing folders", async () => {
  renderManager();

  expect(await screen.findByText(managed.path)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /add workspace/i })
  ).toBeInTheDocument();
});

it("lists the managed workspace but hides the picker when it does not", async () => {
  canManage = false;
  renderManager();

  expect(await screen.findByText(managed.path)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /add workspace/i })
  ).not.toBeInTheDocument();
});
