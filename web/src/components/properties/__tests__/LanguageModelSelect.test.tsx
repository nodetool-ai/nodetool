import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { LanguageModel } from "../../../stores/ApiTypes";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import LanguageModelSelect from "../LanguageModelSelect";
import { queryClient } from "../../../queryClient";

const dialogProps: Record<string, unknown>[] = [];

jest.mock("../../model_menu/LanguageModelMenuDialog", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    dialogProps.push(props);
    return <div data-testid="model-dialog" />;
  }
}));

jest.mock("../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({ models: [], isLoading: false })
}));

const renderSelect = (props: Partial<React.ComponentProps<typeof LanguageModelSelect>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <LanguageModelSelect onChange={jest.fn()} value="" {...props} />
    </ThemeProvider>
  );

describe("LanguageModelSelect", () => {
  beforeEach(() => {
    dialogProps.length = 0;
  });

  it("shows the default placeholder when nothing is selected", () => {
    renderSelect();

    expect(
      screen.getByRole("button", { name: /select model/i })
    ).toBeInTheDocument();
  });

  it("shows a custom placeholder", () => {
    renderSelect({ placeholder: "Use chat model" });

    expect(
      screen.getByRole("button", { name: /use chat model/i })
    ).toBeInTheDocument();
  });

  it("forwards requireToolSupport to the dialog", async () => {
    const user = userEvent.setup();
    renderSelect({ requireToolSupport: true });

    await user.click(screen.getByRole("button"));

    expect(dialogProps.at(-1)).toMatchObject({ requireToolSupport: true });
  });

  it("leaves requireToolSupport unset by default", () => {
    renderSelect();

    expect(dialogProps.at(-1)?.requireToolSupport).toBeUndefined();
  });

  it("emits the picked model, records it as recent, and closes the menu", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    renderSelect({ onChange });

    await user.click(screen.getByRole("button"));
    const pick = dialogProps.at(-1)?.onModelChange as (m: LanguageModel) => void;
    act(() => {
      pick({
        type: "language_model",
        id: "gpt-5.4-mini",
        name: "GPT-5.4 mini",
        provider: "openai"
      });
    });

    expect(onChange).toHaveBeenCalledWith({
      type: "language_model",
      id: "gpt-5.4-mini",
      provider: "openai",
      name: "GPT-5.4 mini"
    });
    expect(useModelPreferencesStore.getState().getRecent()[0]).toMatchObject({
      provider: "openai",
      id: "gpt-5.4-mini",
      name: "GPT-5.4 mini"
    });
    expect(dialogProps.at(-1)).toMatchObject({ open: false });
  });

  // UX research study 4: a node showed only "test-assistant-model", and the
  // missing Anthropic key surfaced only when the run failed.
  describe("a model whose provider has no key", () => {
    afterEach(() => {
      queryClient.removeQueries({ queryKey: ["secrets"] });
    });

    it("names the provider and warns before any run", async () => {
      queryClient.setQueryData(
        ["secrets"],
        [{ key: "ANTHROPIC_API_KEY", is_configured: false }]
      );
      renderSelect({ value: "test-assistant-model", provider: "anthropic" });

      const button = screen.getByRole("button", {
        name: /test-assistant-model/i
      });
      expect(button).toHaveTextContent("Anthropic");
      expect(
        await screen.findByRole("img", { name: /needs ANTHROPIC_API_KEY/ })
      ).toBeInTheDocument();
    });

    it("shows no warning once the key is set", () => {
      queryClient.setQueryData(
        ["secrets"],
        [{ key: "ANTHROPIC_API_KEY", is_configured: true }]
      );
      renderSelect({ value: "test-assistant-model", provider: "anthropic" });

      expect(
        screen.queryByRole("img", { name: /needs ANTHROPIC_API_KEY/ })
      ).not.toBeInTheDocument();
    });
  });
});
