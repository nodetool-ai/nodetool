import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { UiContext, UiDocumentRef } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import {
  DOCUMENT_DIRECT_APPLY_STORAGE_KEY,
  useDocumentProposalStore
} from "../../../stores/DocumentProposalStore";
import DocumentAgentPanel from "../DocumentAgentPanel";

interface MockAssistantChatPanelProps {
  chatSource: string;
  focused?: UiDocumentRef | null;
  getSelection?: () => UiContext["selection"];
  beforeSend?: () => Promise<void>;
  documentEditMode?: "staged" | "direct" | null;
  headerActions?: ReactNode;
  welcomeTitle: string;
  welcomeBody: string;
}

let lastProps: MockAssistantChatPanelProps | null = null;

jest.mock("../../chat/assistant/AssistantChatPanel", () => ({
  __esModule: true,
  default: (props: MockAssistantChatPanelProps) => {
    lastProps = props;
    return (
      <div
        data-testid="mock-assistant-chat-panel"
        data-edit-mode={props.documentEditMode ?? ""}
      >
        <div data-testid="header-actions">{props.headerActions}</div>
      </div>
    );
  }
}));

describe("DocumentAgentPanel (D2, R7, R8, R9)", () => {
  beforeEach(() => {
    lastProps = null;
    window.localStorage.removeItem(DOCUMENT_DIRECT_APPLY_STORAGE_KEY);
    useDocumentProposalStore.setState({ directApply: false, proposals: {} });
  });

  it("defaults to staged approval mode and toggles direct-apply mode, forwarding documentEditMode", async () => {
    const user = userEvent.setup();
    const flush = jest.fn(async () => {});
    const getSelectedText = jest.fn(() => "  selected sentence  ");

    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentAgentPanel
          assetId="doc-42"
          title="Draft.md"
          flush={flush}
          getSelectedText={getSelectedText}
        />
      </ThemeProvider>
    );

    const panel = screen.getByTestId("mock-assistant-chat-panel");
    expect(panel).toHaveAttribute("data-edit-mode", "staged");

    const toggleButton = screen.getByRole("button", { name: "Review changes" });
    expect(toggleButton).toHaveAttribute("aria-pressed", "false");

    // Verify focused document ref, beforeSend, and trimmed selection forwarding.
    expect(lastProps?.chatSource).toBe("document_assistant");
    expect(lastProps?.focused).toEqual({
      type: "document",
      id: "doc-42",
      title: "Draft.md"
    });
    expect(lastProps?.beforeSend).toBe(flush);
    expect(lastProps?.getSelection?.()).toEqual({ text: "selected sentence" });

    // Toggle to Direct apply.
    await user.click(toggleButton);

    expect(panel).toHaveAttribute("data-edit-mode", "direct");
    expect(useDocumentProposalStore.getState().directApply).toBe(true);
    expect(
      window.localStorage.getItem(DOCUMENT_DIRECT_APPLY_STORAGE_KEY)
    ).toBe("true");

    const directButton = screen.getByRole("button", { name: "Direct apply" });
    expect(directButton).toHaveAttribute("aria-pressed", "true");

    // Toggle back to staged Review changes.
    await user.click(directButton);

    expect(panel).toHaveAttribute("data-edit-mode", "staged");
    expect(useDocumentProposalStore.getState().directApply).toBe(false);
    expect(
      screen.getByRole("button", { name: "Review changes" })
    ).toHaveAttribute("aria-pressed", "false");
  });
});
