import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";

const mockStatus = jest.fn();
const mockInstall = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    mcpConfig: {
      status: { query: (...args: unknown[]) => mockStatus(...args) },
      install: { mutate: (...args: unknown[]) => mockInstall(...args) }
    }
  }
}));

import LocalAgentsCard from "../LocalAgentsCard";
import useOnboardingStore from "../../../stores/OnboardingStore";

interface TargetFixture {
  target: string;
  label: string;
  present: boolean;
  installed: boolean;
}

const target = (
  id: string,
  label: string,
  present: boolean,
  installed = false
): TargetFixture => ({ target: id, label, present, installed });

const statusWith = (targets: TargetFixture[]) => ({
  targets: targets.map((t) => ({ ...t, url: null, command: null, configPath: null })),
  defaultUrl: "http://127.0.0.1:7777/mcp",
  defaultLaunch: "http://127.0.0.1:7777/mcp"
});

const renderCard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <LocalAgentsCard />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("LocalAgentsCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingStore.setState({ localAgentsDismissed: false });
  });

  it("offers to connect only the agents installed on this machine", async () => {
    mockStatus.mockResolvedValue(
      statusWith([
        target("claude", "Claude Code", true),
        target("codex", "Codex", false),
        target("opencode", "OpenCode", true),
        target("antigravity", "Antigravity", true)
      ])
    );
    renderCard();

    const connect = await screen.findByRole("button", {
      name: "Connect Claude Code and Antigravity"
    });
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("OpenCode")).not.toBeInTheDocument();

    mockInstall.mockResolvedValue({
      results: [
        { target: "claude", label: "Claude Code", success: true, configPath: "a" },
        { target: "antigravity", label: "Antigravity", success: true, configPath: "b" }
      ],
      launch: "nodetool-mcp serve"
    });
    await userEvent.click(connect);

    expect(mockInstall).toHaveBeenCalledWith({ targets: ["claude", "antigravity"] });
    expect(
      await screen.findByText("Claude Code and Antigravity can now use NodeTool")
    ).toBeInTheDocument();
    expect(screen.getByText("Use NodeTool to list my workflows.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useOnboardingStore.getState().localAgentsDismissed).toBe(true);
  });

  it("connects only the agents that are not connected yet", async () => {
    mockStatus.mockResolvedValue(
      statusWith([
        target("claude", "Claude Code", true, true),
        target("codex", "Codex", true)
      ])
    );
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: "Connect Codex" }));
    expect(mockInstall).toHaveBeenCalledWith({ targets: ["codex"] });
  });

  it("renders nothing when every installed agent is already connected", async () => {
    mockStatus.mockResolvedValue(
      statusWith([target("claude", "Claude Code", true, true)])
    );
    const { container } = renderCard();
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on a hosted server, where the status is refused", async () => {
    mockStatus.mockRejectedValue(new Error("MCP configuration is not available in production"));
    const { container } = renderCard();
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a reportable error when a config file cannot be written", async () => {
    mockStatus.mockResolvedValue(statusWith([target("codex", "Codex", true)]));
    mockInstall.mockResolvedValue({
      results: [{ target: "codex", label: "Codex", success: false, error: "EACCES" }],
      launch: "nodetool-mcp serve"
    });
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: "Connect Codex" }));
    expect(
      await screen.findByText(
        "Could not connect. Check that the agent's config file is writable, then try again."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Codex" })).toBeInTheDocument();
  });

  it("stays hidden once dismissed", async () => {
    useOnboardingStore.setState({ localAgentsDismissed: true });
    mockStatus.mockResolvedValue(statusWith([target("codex", "Codex", true)]));
    const { container } = renderCard();
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
