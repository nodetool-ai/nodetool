import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import RightSideButtons from "../RightSideButtons";
import mockTheme from "../../../__mocks__/themeMock";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";

jest.mock("../../../stores/KeyPressedStore", () => ({
  useCombo: jest.fn()
}));

jest.mock("../../../lib/env", () => ({
  isProduction: true
}));

jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  return {
    ...actual,
    useMediaQuery: jest.fn(() => false)
  };
});

jest.mock("../NotificationButton", () => () => <div data-testid="notification-button" />);
jest.mock("../../content/Help/Help", () => () => null);
jest.mock("../../menus/SettingsMenu", () => () => <div data-testid="settings-menu" />);
jest.mock("../SystemStats", () => () => <div data-testid="system-stats" />);
jest.mock("../../hugging_face/OverallDownloadProgress", () => () => (
  <div data-testid="download-progress" />
));
jest.mock("../../feedback/FeedbackDialog", () => ({
  FeedbackDialog: ({ open }: { open: boolean }) => (open ? <div>Send feedback</div> : null),
}));

const renderComponent = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RightSideButtons />
    </ThemeProvider>
  );

describe("RightSideButtons", () => {
  beforeEach(() => {
    useAppHeaderStore.setState(useAppHeaderStore.getInitialState());
  });

  it("renders a feedback button", () => {
    renderComponent();

    expect(screen.getByRole("button", { name: "Feedback" })).toBeInTheDocument();
  });

  it("opens feedback when the feedback button is clicked", () => {
    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));

    expect(useAppHeaderStore.getState().feedbackOpen).toBe(true);
    expect(screen.getByText("Send feedback")).toBeInTheDocument();
  });
});
