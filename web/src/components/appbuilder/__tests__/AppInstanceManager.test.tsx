import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import mockTheme from "../../../__mocks__/themeMock";
import AppInstanceManager from "../AppInstanceManager";

const instance = {
  id: "a".repeat(32),
  user_id: "owner",
  application_id: "app",
  source_id: "application:app",
  name: "Spring sale",
  version: 1,
  revision: 3,
  is_default: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  variables: {},
  snapshot: {
    document: createEmptyDocument(),
    workflow_graphs: {},
    script_documents: {}
  }
};
const flushInstance = jest.fn();
const refreshInstance = jest.fn();
const rename = jest.fn();
const setTitle = jest.fn();
const openTab = jest.fn();
const closeTab = jest.fn();
let visitor = false;

jest.mock("../runtime/AppRuntimeContext", () => ({
  useAppRuntimeContext: () => ({ instance, flushInstance, refreshInstance })
}));
jest.mock("../../../serverState/useAppInstances", () => ({
  useAppInstances: () => ({
    data: { pages: [{ instances: [instance] }] },
    error: null,
    hasNextPage: false
  }),
  useAppInstanceMutations: () => ({ rename: { mutateAsync: rename } })
}));
jest.mock("../runtime/appInstanceApi", () => ({
  loadAppInstance: async () => instance
}));
jest.mock("../../../lib/appSession", () => ({
  getAppSessionToken: () => (visitor ? "visitor" : null)
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "project",
  tabId: (type: string, ref: string, id: string) => `${type}:${ref}:${id}`,
  useWorkspaceTabsStore: <T,>(
    select: (state: {
      openForegroundTab: jest.Mock;
      closeTab: jest.Mock;
      setTitle: jest.Mock;
    }) => T
  ) => select({ openForegroundTab: openTab, closeTab, setTitle })
}));

beforeEach(() => {
  jest.clearAllMocks();
  visitor = false;
  flushInstance.mockResolvedValue(undefined);
  refreshInstance.mockResolvedValue(undefined);
  rename.mockResolvedValue({ ...instance, name: "Autumn sale", revision: 4 });
});

it("keeps owner controls keyboard accessible and renames through the revision-aware instance action", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <AppInstanceManager
        applicationId="app"
        latestVersion={2}
        onAdvanced={jest.fn()}
      />
    </ThemeProvider>
  );
  for (const name of [
    "New instance",
    "Rename",
    "Duplicate",
    "Delete instance",
    "Advance to version 2"
  ]) {
    expect(screen.getByRole("button", { name })).toBeEnabled();
  }
  act(() => screen.getByRole("button", { name: "Rename" }).focus());
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toHaveAccessibleName(/Rename instance/);
  const input = screen.getByRole("textbox", { name: "Instance name" });
  expect(input).toHaveValue("Spring sale");
  await user.clear(input);
  await user.type(input, "Autumn sale");
  act(() => screen.getByRole("button", { name: "Save" }).focus());
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(rename).toHaveBeenCalledWith({
      id: instance.id,
      expected_revision: 3,
      name: "Autumn sale"
    })
  );
  expect(flushInstance).toHaveBeenCalledTimes(1);
  expect(setTitle).toHaveBeenCalledWith(
    "app",
    "application",
    "Autumn sale",
    instance.id
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(openTab).not.toHaveBeenCalled();
  expect(closeTab).not.toHaveBeenCalled();
});

it("does not expose owner management controls to visitors", () => {
  visitor = true;
  render(
    <ThemeProvider theme={mockTheme}>
      <AppInstanceManager applicationId="app" onAdvanced={jest.fn()} />
    </ThemeProvider>
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
