import React from "react";
import { render, screen } from "@testing-library/react";
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
});
