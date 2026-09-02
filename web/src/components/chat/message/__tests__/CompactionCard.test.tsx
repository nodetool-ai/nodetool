import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MessageView } from "../MessageView";
import mockTheme from "../../../../__mocks__/themeMock";
import type { Message } from "../../../../stores/ApiTypes";

jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: jest.fn(<T,>(selector: (s: unknown) => T) => selector({}))
}));

jest.mock("../../../../contexts/EditorInsertionContext", () => ({
  useEditorInsertion: () => undefined
}));

jest.mock("../../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({ writeClipboard: jest.fn().mockResolvedValue(undefined) })
}));

// The plain user-message path renders content through ChatMarkdown. Rendering
// it as text is what lets a test tell the card apart from that path.
jest.mock("../ChatMarkdown", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>
}));

const SUMMARY =
  "- Goal: cut a 30s trailer\n- Keeps asset://abc123 as the hero still";

const compactionMessage: Message = {
  id: "compaction-1",
  role: "user",
  execution_event_type: "compaction",
  content: `[Conversation so far]\n${SUMMARY}`
} as Message;

const renderMessage = (message: Message) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MessageView
        message={message}
        isThoughtExpanded={() => false}
        onToggleThought={() => {}}
      />
    </ThemeProvider>
  );

describe("compaction row", () => {
  it("renders a collapsed card instead of the user's own words", () => {
    renderMessage(compactionMessage);

    expect(
      screen.getByRole("button", { name: /earlier conversation summarized/i })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/hero still/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conversation so far/)).not.toBeInTheDocument();
    expect(document.querySelector(".chat-message.user")).toBeNull();
  });

  it("shows the summary without its header once expanded", async () => {
    const user = userEvent.setup();
    renderMessage(compactionMessage);

    await user.click(
      screen.getByRole("button", { name: /earlier conversation summarized/i })
    );

    expect(screen.getByText(/Keeps asset:\/\/abc123 as the hero still/))
      .toBeInTheDocument();
    expect(screen.queryByText(/Conversation so far/)).not.toBeInTheDocument();
  });

  it("expands from the keyboard", async () => {
    const user = userEvent.setup();
    renderMessage(compactionMessage);

    const toggle = screen.getByRole("button", {
      name: /earlier conversation summarized/i
    });
    toggle.focus();
    await user.keyboard("{Enter}");

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Keeps asset:\/\/abc123 as the hero still/))
      .toBeInTheDocument();
  });

  it("leaves an ordinary user message on the plain path", () => {
    renderMessage({
      id: "u1",
      role: "user",
      content: "make the trailer 30 seconds"
    } as Message);

    expect(screen.getByText("make the trailer 30 seconds")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /earlier conversation summarized/i })
    ).not.toBeInTheDocument();
  });
});
