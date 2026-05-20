// web/src/components/chat/composer/__tests__/PersistentComposer.test.tsx
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  ComposerSlotProvider,
  useComposerSlotContext
} from "../composerSlotContext";
import PersistentComposer from "../PersistentComposer";

beforeAll(() => {
  // @ts-ignore jsdom lacks ResizeObserver
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const sendSpy = jest.fn();

jest.mock("../../containers/ChatInputSection", () => ({
  __esModule: true,
  default: ({ onSendMessage }: any) => (
    <button
      data-testid="composer"
      onClick={() => onSendMessage([{ type: "text", text: "hi" }], "hi", false)}
    >
      composer
    </button>
  )
}));

jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: any) =>
    selector({
      status: "connected",
      selectedModel: { type: "language_model", provider: "openai", id: "x" },
      selectedTools: [],
      agentMode: false,
      setSelectedModel: jest.fn(),
      setSelectedTools: jest.fn(),
      setAgentMode: jest.fn(),
      stopGeneration: jest.fn()
    })
}));

function RegisterButton() {
  const { registerSlot } = useComposerSlotContext();
  return (
    <button
      onClick={() => {
        const el = document.createElement("div");
        el.id = "slot";
        document.body.appendChild(el);
        registerSlot(el, sendSpy);
      }}
    >
      register
    </button>
  );
}

function renderTree() {
  return render(
    <ThemeProvider theme={mockTheme}>
      <ComposerSlotProvider>
        <RegisterButton />
        <PersistentComposer />
      </ComposerSlotProvider>
    </ThemeProvider>
  );
}

describe("PersistentComposer", () => {
  beforeEach(() => sendSpy.mockClear());

  it("renders exactly one composer", () => {
    renderTree();
    expect(screen.getAllByTestId("composer")).toHaveLength(1);
  });

  it("is hidden until a slot is active, then visible", () => {
    renderTree();
    const root = document.querySelector(
      "[data-persistent-composer]"
    ) as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.visibility).toBe("hidden");

    act(() => {
      screen.getByText("register").click();
    });
    expect(root.style.visibility).toBe("visible");
  });

  it("routes submit through the active slot's send handler", () => {
    renderTree();
    act(() => {
      screen.getByText("register").click();
    });
    act(() => {
      screen.getByTestId("composer").click();
    });
    expect(sendSpy).toHaveBeenCalledWith(
      [{ type: "text", text: "hi" }],
      "hi",
      false
    );
  });
});
