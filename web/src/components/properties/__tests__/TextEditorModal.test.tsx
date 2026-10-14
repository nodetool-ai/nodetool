import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import TextEditorModal from "../TextEditorModal";

// Stub Monaco with a textarea so the editor can be driven without the real bundle.
jest.mock("../../../hooks/editor/useMonacoEditor", () => ({
  useMonacoEditor: () => ({
    MonacoEditor: ({
      value,
      onChange
    }: {
      value: string;
      onChange?: (val?: string) => void;
    }) => (
      <textarea
        data-testid="monaco"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    ),
    monacoLoadError: null,
    isMonacoLoading: false,
    loadMonacoIfNeeded: jest.fn().mockResolvedValue(undefined),
    monacoOnMount: jest.fn()
  })
}));

jest.mock("../../chat/containers/ChatView", () => ({
  __esModule: true,
  default: () => null
}));

const renderModal = (onChange: (text: string) => void) => (
  <ThemeProvider theme={mockTheme}>
    <TextEditorModal
      value="start"
      language="json"
      propertyName="config"
      onChange={(next) => onChange(next)}
      onClose={jest.fn()}
    />
  </ThemeProvider>
);

describe("TextEditorModal", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sends the last edit when it closes inside the debounce window", () => {
    const onChange = jest.fn();
    const { rerender, unmount } = render(renderModal(onChange));

    fireEvent.change(screen.getByTestId("monaco"), {
      target: { value: "edited" }
    });
    // A parent re-render passes a new inline onChange; the edit must survive it.
    rerender(renderModal(onChange));
    unmount();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("edited");
  });
});
