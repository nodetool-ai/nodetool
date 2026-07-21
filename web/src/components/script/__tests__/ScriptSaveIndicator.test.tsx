import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import {
  useScriptStore,
  type ScriptSaveStatus
} from "../../../stores/script/ScriptStore";
import ScriptSaveIndicator from "../ScriptSaveIndicator";

const SCRIPT_ID = "script-1";

const WithTheme: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
);

const setStatus = (status: ScriptSaveStatus): void => {
  useScriptStore.getState().setSaveStatus(SCRIPT_ID, status);
};

beforeEach(() => {
  useScriptStore.setState({ saveStatus: {} });
});

describe("ScriptSaveIndicator", () => {
  it("defaults to a calm Saved state before any save cycle", () => {
    render(
      <WithTheme>
        <ScriptSaveIndicator scriptId={SCRIPT_ID} />
      </WithTheme>
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows an Unsaved-changes label during the debounce window", () => {
    setStatus("unsaved");
    render(
      <WithTheme>
        <ScriptSaveIndicator scriptId={SCRIPT_ID} />
      </WithTheme>
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("shows a Saving label while a save is in flight", () => {
    setStatus("saving");
    render(
      <WithTheme>
        <ScriptSaveIndicator scriptId={SCRIPT_ID} />
      </WithTheme>
    );
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("surfaces a retrying message on save failure", () => {
    setStatus("error");
    render(
      <WithTheme>
        <ScriptSaveIndicator scriptId={SCRIPT_ID} />
      </WithTheme>
    );
    expect(screen.getByText("Save failed — retrying")).toBeInTheDocument();
  });

  it("warns when a newer server version replaced local edits", () => {
    setStatus("reloaded");
    render(
      <WithTheme>
        <ScriptSaveIndicator scriptId={SCRIPT_ID} />
      </WithTheme>
    );
    expect(screen.getByText("Reloaded newer version")).toBeInTheDocument();
  });
});
