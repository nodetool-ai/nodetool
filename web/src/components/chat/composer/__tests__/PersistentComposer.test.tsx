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
      agentPlanner: "multi",
      selectedCollections: [],
      setSelectedModel: jest.fn(),
      setSelectedTools: jest.fn(),
      setAgentMode: jest.fn(),
      setAgentPlanner: jest.fn(),
      setSelectedCollections: jest.fn(),
      stopGeneration: jest.fn(),
      createNewThread: jest.fn().mockResolvedValue("new-thread-id"),
      switchThread: jest.fn()
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

  it("renders nothing until a slot is registered, avoiding a (0,0) placeholder", () => {
    renderTree();
    // No slot yet → no overlay at all (so the FLIP can't animate in from 0,0).
    expect(document.querySelector("[data-persistent-composer]")).toBeNull();
    expect(screen.queryByTestId("composer")).toBeNull();

    act(() => {
      screen.getByText("register").click();
    });

    // Once a slot exists, exactly one composer is mounted and visible.
    expect(screen.getAllByTestId("composer")).toHaveLength(1);
    const root = document.querySelector(
      "[data-persistent-composer]"
    ) as HTMLElement;
    expect(root).toBeTruthy();
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
