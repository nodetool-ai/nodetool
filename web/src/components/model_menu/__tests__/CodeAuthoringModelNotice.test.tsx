import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import CodeAuthoringModelNotice from "../CodeAuthoringModelNotice";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate
}));

const renderNotice = (
  props: React.ComponentProps<typeof CodeAuthoringModelNotice> = {}
) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <CodeAuthoringModelNotice {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );

describe("CodeAuthoringModelNotice", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("announces the blocking state", () => {
    renderNotice();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /no model available for code generation/i
    );
  });

  it("lists why each candidate was skipped", () => {
    renderNotice({
      skipped: [
        {
          source: "code_preference",
          model: { provider: "replicate", id: "no-tools", name: "No Tools" },
          reason: "no_tool_support"
        },
        {
          source: "chat",
          model: { provider: "openai", id: "retired", name: "" },
          reason: "unknown_model"
        }
      ]
    });

    expect(
      screen.getByText("Code Generation default: No Tools (no tool support)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chat model: retired (not available)")
    ).toBeInTheDocument();
  });

  it("navigates to the default models settings", async () => {
    const user = userEvent.setup();
    renderNotice();

    await user.click(screen.getByRole("button", { name: /open settings/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=0");
  });
});
