import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import ReasoningSelector from "../ReasoningSelector";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";

const renderSelector = (provider: string, model: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ReasoningSelector provider={provider} model={model} />
    </ThemeProvider>
  );

describe("ReasoningSelector", () => {
  beforeEach(() => {
    useGlobalChatStore.setState({ reasoningEffort: null });
  });

  it("renders nothing for a model that takes no reasoning level", () => {
    const { container } = renderSelector("ollama", "qwen3");

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the active level for a model that takes one", () => {
    useGlobalChatStore.setState({ reasoningEffort: "high" });

    renderSelector("anthropic", "claude-opus-5-5");

    expect(screen.getByRole("button", { name: "High" })).toBeInTheDocument();
  });

  it("writes the picked level to the store and closes the menu", async () => {
    const user = userEvent.setup();
    renderSelector("openai", "gpt-5");

    await user.click(screen.getByRole("button", { name: "Default" }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items).toHaveLength(4);
    await user.click(screen.getByRole("menuitemradio", { name: /Low/ }));

    expect(useGlobalChatStore.getState().reasoningEffort).toBe("low");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("offers Extra high only for a model that takes it", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSelector("gemini", "gemini-4-hydrogen");

    await user.click(screen.getByRole("button", { name: "Default" }));
    expect(await screen.findAllByRole("menuitemradio")).toHaveLength(5);
    await user.click(screen.getByRole("menuitemradio", { name: /Extra high/ }));
    expect(useGlobalChatStore.getState().reasoningEffort).toBe("xhigh");
    unmount();

    renderSelector("gemini", "gemini-4-argon");
    expect(screen.getByRole("button", { name: "Default" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Default" }));
    expect(await screen.findAllByRole("menuitemradio")).toHaveLength(4);
    expect(
      screen.queryByRole("menuitemradio", { name: /Extra high/ })
    ).not.toBeInTheDocument();
  });
});
