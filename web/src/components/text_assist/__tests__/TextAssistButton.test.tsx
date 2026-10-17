import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import userEvent from "@testing-library/user-event";
import mockTheme from "../../../__mocks__/themeMock";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args),
  randomRequestId: () => "req-test"
}));

const chatState = {
  selectedModel: { type: "language_model", id: "gpt-test", provider: "openai", name: "GPT Test" },
  setSelectedModel: jest.fn()
};
jest.mock("../../../stores/GlobalChatStore", () => {
  const useGlobalChatStore = (selector: (s: typeof chatState) => unknown) =>
    selector(chatState);
  useGlobalChatStore.getState = () => chatState;
  return { __esModule: true, default: useGlobalChatStore };
});

jest.mock("../../properties/LanguageModelSelect", () => ({
  __esModule: true,
  default: () => <span>model picker</span>
}));

jest.mock("../../support/ReportBugButton", () => ({
  __esModule: true,
  default: () => <button type="button">Report</button>
}));

import { TextAssistButton } from "../TextAssistButton";

const field = {
  label: "Descriptor",
  description: "Describe only stable visual traits."
};

const renderButton = (value: string, onApply = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <TextAssistButton value={value} onApply={onApply} field={field} />
    </ThemeProvider>
  );
  return onApply;
};

describe("TextAssistButton", () => {
  beforeEach(() => {
    rpcRequest.mockReset();
  });

  it("rewrites the text and applies the suggestion only on Replace", async () => {
    const user = userEvent.setup();
    rpcRequest.mockResolvedValue({ text: '"An old man in a grey felt hat"', data: null });
    const onApply = renderButton("old man with a hat");

    await user.click(screen.getByRole("button", { name: "Open the writing assistant" }));
    await user.click(screen.getByRole("button", { name: "Add detail" }));

    expect(await screen.findByText("An old man in a grey felt hat")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();

    const [command, data] = rpcRequest.mock.calls[0];
    expect(command).toBe("generate_text");
    expect(data).toMatchObject({ provider: "openai", model: "gpt-test" });
    expect(data.prompt).toContain("old man with a hat");
    expect(data.prompt).toContain("Label: Descriptor");

    await user.click(screen.getByRole("button", { name: "Replace text" }));
    expect(onApply).toHaveBeenCalledWith("An old man in a grey felt hat");
  });

  it("refines the suggestion with a typed instruction", async () => {
    const user = userEvent.setup();
    rpcRequest
      .mockResolvedValueOnce({ text: "A tall woman", data: null })
      .mockResolvedValueOnce({ text: "A tall woman in red", data: null });
    renderButton("");

    await user.click(screen.getByRole("button", { name: "Open the writing assistant" }));
    await user.click(screen.getByRole("button", { name: "Write it" }));
    await screen.findByText("A tall woman");

    await user.type(screen.getByLabelText("Instruction"), "Add a red coat{Enter}");

    expect(await screen.findByText("A tall woman in red")).toBeInTheDocument();
    expect(rpcRequest.mock.calls[1][1].prompt).toContain("# Current text\nA tall woman");
    expect(screen.getByRole("button", { name: "Insert" })).toBeInTheDocument();
  });

  it("shows a failed request as an error with a report control", async () => {
    const user = userEvent.setup();
    rpcRequest.mockRejectedValue(new Error("Provider key missing"));
    renderButton("some text");

    await user.click(screen.getByRole("button", { name: "Open the writing assistant" }));
    await user.click(screen.getByRole("button", { name: "Improve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Provider key missing");
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });
});
