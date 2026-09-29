/**
 * useGuardedPanelTab — confirms before leaving a dirty Code tab instead of
 * `window.confirm`, and lets a clean switch through untouched.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useGuardedPanelTab } from "../useGuardedPanelTab";

/** Exercises the hook through real DOM controls so the dialog it renders is
 *  actually mounted, not just returned as an unrendered element. */
function Harness() {
  const { panelTab, setPanelTab, confirmDialog } = useGuardedPanelTab();
  return (
    <>
      <div data-testid="panel-tab">{panelTab}</div>
      <button onClick={() => setPanelTab("code")}>Go to code</button>
      <button onClick={() => setPanelTab("inspector")}>Go to inspector</button>
      <button onClick={() => setPanelTab("history")}>Go to history</button>
      <button onClick={() => useTimelineUIStore.getState().setCodePanelDirty(true)}>
        Mark dirty
      </button>
      {confirmDialog}
    </>
  );
}

function renderHarness() {
  return render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <Harness />
      </TimelineProvider>
    </ThemeProvider>
  );
}

describe("useGuardedPanelTab", () => {
  it("switches immediately when the Code tab has no unsaved edits", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Go to code" }));
    expect(screen.getByTestId("panel-tab")).toHaveTextContent("code");

    await user.click(screen.getByRole("button", { name: "Go to inspector" }));
    expect(screen.getByTestId("panel-tab")).toHaveTextContent("inspector");
    expect(screen.queryByText("Unsaved code changes")).not.toBeInTheDocument();
  });

  it("asks first when leaving a dirty Code tab, and cancel keeps it", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Go to code" }));
    await user.click(screen.getByRole("button", { name: "Mark dirty" }));

    await user.click(screen.getByRole("button", { name: "Go to inspector" }));

    expect(await screen.findByText("Unsaved code changes")).toBeInTheDocument();
    // The dialog is deciding — the tab has not switched yet.
    expect(screen.getByTestId("panel-tab")).toHaveTextContent("code");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText("Unsaved code changes")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("panel-tab")).toHaveTextContent("code");
  });

  it("confirm switches away from a dirty Code tab", async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole("button", { name: "Go to code" }));
    await user.click(screen.getByRole("button", { name: "Mark dirty" }));

    await user.click(screen.getByRole("button", { name: "Go to history" }));
    await user.click(await screen.findByRole("button", { name: "Leave" }));

    expect(screen.getByTestId("panel-tab")).toHaveTextContent("history");
    await waitFor(() =>
      expect(screen.queryByText("Unsaved code changes")).not.toBeInTheDocument()
    );
  });
});
