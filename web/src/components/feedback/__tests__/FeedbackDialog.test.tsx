import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { FeedbackDialog } from "../FeedbackDialog";
import userEvent from "@testing-library/user-event";
import { restFetch } from "../../../lib/rest-fetch";

const mockWorkflowStore = {
  getState: () => ({
    workflowJSON: () => '{"name":"Example Workflow"}'
  })
};

jest.mock("../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      currentWorkflowId: "workflow-1",
      getNodeStore: () => mockWorkflowStore
    })
}));

const renderDialog = (
  props: Partial<React.ComponentProps<typeof FeedbackDialog>> = {}
) => {
  const resolvedProps = {
    open: true,
    onClose: jest.fn(),
    ...props
  };

  return {
    ...render(
      <ThemeProvider theme={mockTheme}>
        <FeedbackDialog {...resolvedProps} />
      </ThemeProvider>
    ),
    props: resolvedProps
  };
};

describe("FeedbackDialog", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (restFetch as jest.Mock).mockResolvedValue(
      {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, deliveredTo: ["email"] })
      } as Response
    );
    window.api = {
      ...window.api,
      clipboard: {
        ...window.api?.clipboard,
        readImage: jest.fn().mockResolvedValue(""),
        readFileAsDataURL: jest.fn().mockResolvedValue(null)
      },
      dialog: {
        ...window.api?.dialog,
        openFile: jest.fn().mockResolvedValue({
          canceled: true,
          filePaths: []
        })
      }
    } as typeof window.api;
  });

  it("renders the basic feedback form when open", () => {
    renderDialog();

    expect(screen.getByText("Send feedback")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(
      screen.getByText(/for bugs, include what happened/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/for features, describe the workflow/i)
    ).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const { props } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(props.onClose).toHaveBeenCalled();
  });

  it("submits feedback including the selected workflow JSON", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText("Username"), "rkt");
    await user.type(screen.getByLabelText("Message"), "Please improve export flow");
    await user.click(
      screen.getByRole("checkbox", { name: "Include current workflow JSON" })
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(restFetch).toHaveBeenCalledTimes(1));

    const [, requestInit] = (restFetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit
    ];
    const body = requestInit.body as FormData;
    expect(body.get("username")).toBe("rkt");
    expect(body.get("feedbackType")).toBe("bug");
    expect(body.get("message")).toBe("Please improve export flow");
    expect(body.get("workflowJson")).toBe('{"name":"Example Workflow"}');
    expect(body.get("destinations")).toBe('["email"]');
    expect(props.onClose).toHaveBeenCalled();
  });

  it("adds a clipboard image attachment", async () => {
    const user = userEvent.setup();
    (window.api.clipboard.readImage as jest.Mock).mockResolvedValue(
      "data:image/png;base64,aGVsbG8="
    );

    renderDialog();

    await user.click(screen.getByRole("button", { name: "Paste clipboard image" }));

    expect(await screen.findByText("clipboard-image.png")).toBeInTheDocument();
  });

  it("adds a selected log file attachment", async () => {
    const user = userEvent.setup();
    (window.api.dialog.openFile as jest.Mock).mockResolvedValue({
      canceled: false,
      filePaths: ["C:\\logs\\nodetool.log"]
    });
    (window.api.clipboard.readFileAsDataURL as jest.Mock).mockResolvedValue(
      "data:text/plain;base64,bG9nIGxpbmU="
    );

    renderDialog();

    await user.click(screen.getByRole("button", { name: "Attach log file" }));

    expect(await screen.findByText("nodetool.log")).toBeInTheDocument();
  });
});
