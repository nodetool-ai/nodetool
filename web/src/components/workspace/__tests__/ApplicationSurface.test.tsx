import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

const state: { error: Error | null } = { error: null };

jest.mock("../../../hooks/useApplications", () => ({
  useApplication: () => ({
    data: state.error
      ? undefined
      : {
          id: "app-1",
          projectId: "default",
          name: "Translator",
          description: "Translates things",
          document: { schemaVersion: 3, ui: { root: {}, content: [] } },
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-11T10:00:00.000Z"
        },
    isLoading: false,
    isError: state.error !== null,
    error: state.error
  })
}));

jest.mock("../../appbuilder/ApplicationAppBuilder", () => ({
  __esModule: true,
  default: ({ applicationId }: { applicationId: string }) => (
    <div data-testid="app-builder">{applicationId}</div>
  )
}));

jest.mock("../../applications/ApplicationGovernancePanel", () => ({
  __esModule: true,
  default: ({ applicationId }: { applicationId: string }) => (
    <div data-testid="governance">{applicationId}</div>
  )
}));

import ApplicationSurface from "../ApplicationSurface";

const renderSurface = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ApplicationSurface refId="app-1" />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  state.error = null;
});

describe("ApplicationSurface", () => {
  it("opens an app on its builder canvas", () => {
    renderSurface();

    expect(screen.getByTestId("app-builder")).toHaveTextContent("app-1");
    expect(screen.queryByTestId("governance")).not.toBeInTheDocument();
  });

  it("switches to publish and budget controls", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByTestId("governance")).toHaveTextContent("app-1");
    expect(screen.queryByTestId("app-builder")).not.toBeInTheDocument();
  });

  it("reports an app that could not be loaded", () => {
    state.error = new Error("Application not found");
    renderSurface();

    expect(screen.getByText("Application not found")).toBeInTheDocument();
  });
});
