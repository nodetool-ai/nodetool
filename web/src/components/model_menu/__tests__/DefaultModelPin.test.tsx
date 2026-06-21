import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DefaultModelPin from "../DefaultModelPin";
import { useModelPreferencesStore } from "../../../stores/ModelPreferencesStore";

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("DefaultModelPin", () => {
  beforeEach(() => {
    useModelPreferencesStore.setState({ defaults: {} });
  });

  it("renders nothing without a modelType", () => {
    const { container } = renderWithTheme(
      <DefaultModelPin provider="openai" id="gpt-4o" name="GPT-4o" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("sets the model as default for its modality on click", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <DefaultModelPin
        modelType="language_model"
        provider="openai"
        id="gpt-4o"
        name="GPT-4o"
      />
    );

    await user.click(screen.getByRole("button", { name: /set as default/i }));

    expect(useModelPreferencesStore.getState().defaults["language_model"]).toEqual(
      { provider: "openai", id: "gpt-4o", name: "GPT-4o" }
    );
  });

  it("clears the default when the active default is clicked again", async () => {
    const user = userEvent.setup();
    useModelPreferencesStore.setState({
      defaults: {
        language_model: { provider: "openai", id: "gpt-4o", name: "GPT-4o" }
      }
    });

    renderWithTheme(
      <DefaultModelPin
        modelType="language_model"
        provider="openai"
        id="gpt-4o"
        name="GPT-4o"
      />
    );

    // When active, the toggle exposes the "clear" affordance.
    await user.click(screen.getByRole("button", { name: /clear default/i }));

    expect(
      useModelPreferencesStore.getState().defaults["language_model"]
    ).toBeUndefined();
  });

  it("does not treat a same-id model from another provider as the default", () => {
    useModelPreferencesStore.setState({
      defaults: {
        language_model: { provider: "openai", id: "gpt-4o", name: "GPT-4o" }
      }
    });

    renderWithTheme(
      <DefaultModelPin
        modelType="language_model"
        provider="ollama"
        id="gpt-4o"
        name="GPT-4o"
      />
    );

    // Provider differs, so this row offers "set" rather than "clear".
    expect(
      screen.getByRole("button", { name: /set as default/i })
    ).toBeInTheDocument();
  });
});
