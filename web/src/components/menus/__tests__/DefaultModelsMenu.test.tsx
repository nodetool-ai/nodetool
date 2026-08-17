import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import DefaultModelsMenu from "../DefaultModelsMenu";
import { useModelPreferencesStore } from "../../../stores/ModelPreferencesStore";

interface StubSelectProps {
  onChange: (value: unknown) => void;
  value: string;
  placeholder?: string;
  requireToolSupport?: boolean;
}

function makeStub(testId: string) {
  const Stub = ({ value, placeholder, requireToolSupport }: StubSelectProps) => (
    <div
      data-testid={testId}
      data-value={value}
      data-placeholder={placeholder ?? ""}
      data-require-tool-support={requireToolSupport ? "true" : "false"}
    >
      {value || placeholder || "Select Model"}
    </div>
  );
  return { __esModule: true, default: Stub };
}

jest.mock("../../properties/LanguageModelSelect", () =>
  makeStub("language-model-select")
);
jest.mock("../../properties/ImageModelSelect", () =>
  makeStub("image-model-select")
);
jest.mock("../../properties/EmbeddingModelSelect", () =>
  makeStub("embedding-model-select")
);
jest.mock("../../properties/TTSModelSelect", () => makeStub("tts-model-select"));
jest.mock("../../properties/ASRModelSelect", () => makeStub("asr-model-select"));
jest.mock("../../properties/VideoModelSelect", () =>
  makeStub("video-model-select")
);

const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DefaultModelsMenu />
    </ThemeProvider>
  );

describe("DefaultModelsMenu", () => {
  beforeEach(() => {
    useModelPreferencesStore.setState({ defaults: {} });
  });

  it("renders a Code Generation row that falls back to the chat model", () => {
    const { container } = renderMenu();

    expect(screen.getByText("Code Generation")).toBeInTheDocument();

    const row = container.querySelector("#default-model-code_model");
    const select = row?.querySelector("[data-testid='language-model-select']");
    expect(select).toHaveAttribute("data-placeholder", "Use chat model");
    expect(select).toHaveAttribute("data-require-tool-support", "true");
  });

  it("shows the stored code_model default", () => {
    useModelPreferencesStore.setState({
      defaults: {
        code_model: { provider: "openai", id: "gpt-tools", name: "GPT Tools" }
      }
    });

    const { container } = renderMenu();

    const row = container.querySelector("#default-model-code_model");
    expect(
      row?.querySelector("[data-testid='language-model-select']")
    ).toHaveAttribute("data-value", "gpt-tools");
  });

  it("leaves the language model row unfiltered", () => {
    const { container } = renderMenu();

    const row = container.querySelector("#default-model-language_model");
    expect(
      row?.querySelector("[data-testid='language-model-select']")
    ).toHaveAttribute("data-require-tool-support", "false");
  });
});
