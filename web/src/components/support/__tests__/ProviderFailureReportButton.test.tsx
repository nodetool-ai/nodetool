import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ProviderFailureReportButton from "../ProviderFailureReportButton";
import { useBugReportStore } from "../../../stores/BugReportStore";
import {
  recordProviderCallFailure,
  useProviderCallFailureStore
} from "../../../stores/ProviderCallFailureStore";

const renderButton = (errorText: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProviderFailureReportButton errorText={errorText} />
    </ThemeProvider>
  );

beforeEach(() => {
  useProviderCallFailureStore.getState().clear();
  useBugReportStore.getState().close();
});

describe("ProviderFailureReportButton", () => {
  it("reports the provider call behind the banner", async () => {
    const user = userEvent.setup();
    recordProviderCallFailure({
      type: "provider_call_failed",
      provider: "anthropic",
      model: "claude-sonnet-5",
      operation: "generateMessages",
      kind: "auth",
      status: 401,
      message: "401 invalid x-api-key",
      request_id: "req_9",
      job_id: "job-7",
      timestamp: "2026-01-02T03:04:05.000Z"
    });

    renderButton("401 invalid x-api-key");
    await user.click(screen.getByRole("button", { name: /report/i }));

    const context = useBugReportStore.getState().context;
    expect(context).toMatchObject({
      source: "provider-call",
      provider: "anthropic",
      model: "claude-sonnet-5",
      jobId: "job-7"
    });
    expect(context?.summary).toBe(
      "anthropic/claude-sonnet-5 401 — credentials rejected"
    );
    expect(context?.providerCallDetail).toContain("Provider request id: req_9");
  });

  it("still reports when no provider call was recorded", async () => {
    const user = userEvent.setup();
    renderButton("Failed to connect to chat service");
    await user.click(screen.getByRole("button", { name: /report/i }));

    expect(useBugReportStore.getState().context).toMatchObject({
      source: "manual",
      errorText: "Failed to connect to chat service"
    });
  });
});
