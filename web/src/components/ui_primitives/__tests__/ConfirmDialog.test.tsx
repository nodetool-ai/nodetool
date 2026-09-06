import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { ConfirmDialog } from "../ConfirmDialog";
import mockTheme from "../../../__mocks__/themeMock";

const addNotification = jest.fn();

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (state: { addNotification: jest.Mock }) => unknown
  ) => selector({ addNotification })
}));

const renderDialog = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <ConfirmDialog
        open={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete workflow"
        content="This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        {...props}
      />
    </ThemeProvider>
  );
  return { onClose, onConfirm };
};

describe("ConfirmDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders title and content", () => {
    renderDialog();
    expect(screen.getByText("Delete workflow")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onConfirm and onClose when confirming", () => {
    const { onClose, onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose but not onConfirm when cancelling", () => {
    const { onClose, onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("posts a notification on confirm when a message is given", () => {
    renderDialog({
      notificationMessage: "Workflow deleted",
      notificationType: "error",
      alert: true
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(addNotification).toHaveBeenCalledWith({
      content: "Workflow deleted",
      type: "error",
      alert: true
    });
  });

  it("posts no notification when no message is given", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(addNotification).not.toHaveBeenCalled();
  });
});
