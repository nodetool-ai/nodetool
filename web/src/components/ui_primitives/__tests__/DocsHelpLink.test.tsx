import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { DocsHelpLink } from "../DocsHelpLink";
import { DOCS_BASE_URL, DOCS_PATHS } from "../../../config/docsLinks";
import mockTheme from "../../../__mocks__/themeMock";

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("DocsHelpLink", () => {
  it("links to the topic's documentation page in a new tab", () => {
    renderWithTheme(<DocsHelpLink topic="workflows" label="Workflows" />);

    const link = screen.getByRole("link", {
      name: "Workflows documentation"
    });
    expect(link).toHaveAttribute(
      "href",
      `${DOCS_BASE_URL}/${DOCS_PATHS.workflows}`
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("names the surface it explains in its accessible label", () => {
    renderWithTheme(<DocsHelpLink topic="assets" label="Assets" />);

    expect(
      screen.getByRole("link", { name: "Assets documentation" })
    ).toBeInTheDocument();
  });

  it("adds the short explanation to the existing documentation tooltip", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <DocsHelpLink
        topic="workflows"
        label="Workflows"
        description="Open, create, and manage workflows."
      />
    );

    const link = screen.getByRole("link", {
      name: "Workflows documentation"
    });
    await user.hover(link);

    expect(
      await screen.findByText(
        "Open, create, and manage workflows. Open documentation."
      )
    ).toBeInTheDocument();
  });

  it("keeps the documentation link in the keyboard tab order", async () => {
    const user = userEvent.setup();
    renderWithTheme(<DocsHelpLink topic="assets" label="Assets" />);

    await user.tab();

    expect(
      screen.getByRole("link", { name: "Assets documentation" })
    ).toHaveFocus();
  });
});
