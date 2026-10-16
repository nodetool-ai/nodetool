import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { PageHeader } from "../PageHeader";
import { PageLayout } from "../PageLayout";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("PageHeader", () => {
  it("renders the title as the page h1 with subtitle, icon and actions", () => {
    renderWithTheme(
      <PageHeader
        title="Costs"
        subtitle="Spend per node"
        icon={<span data-testid="icon" />}
        actions={<button>Export</button>}
      />
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Costs" })
    ).toBeInTheDocument();
    expect(screen.getByText("Spend per node")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("omits the subtitle and actions when not given", () => {
    const { container } = renderWithTheme(<PageHeader title="Solo" />);
    expect(container.querySelector(".page-header-subtitle")).toBeNull();
    expect(container.querySelector(".page-header-actions")).toBeNull();
  });

  it("opens the docs link in a new window", () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    renderWithTheme(
      <PageHeader title="Docs" docsUrl="https://example.com/docs" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Documentation" }));
    expect(open).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer"
    );
    open.mockRestore();
  });

  it("marks the subtitle hidden on mobile and the title truncated on request", () => {
    const { container } = renderWithTheme(
      <PageHeader
        title="Long"
        subtitle="Sub"
        hideSubtitleOnMobile
        truncateTitle
        variant="plain"
      />
    );
    expect(
      container.querySelector(".page-header-subtitle--hide-mobile")
    ).not.toBeNull();
    expect(
      container.querySelector(".page-header-title--truncate")
    ).not.toBeNull();
  });
});

describe("PageLayout", () => {
  it("renders the header and padded content by default", () => {
    const { container } = renderWithTheme(
      <PageLayout title="Models" subtitle="All models">
        <div>body</div>
      </PageLayout>
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Models" })
    ).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(
      container.querySelector(".page-layout-content--padded")
    ).not.toBeNull();
  });

  it("drops the header with showHeader={false} and the padding with padded={false}", () => {
    const { container } = renderWithTheme(
      <PageLayout title="Hidden" showHeader={false} padded={false} scrollable>
        <div>body</div>
      </PageLayout>
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".page-layout-content--padded")).toBeNull();
    expect(
      container.querySelector(".page-layout-content--scrollable")
    ).not.toBeNull();
  });

  it("renders no header without a title", () => {
    renderWithTheme(
      <PageLayout subtitle="orphan">
        <div>body</div>
      </PageLayout>
    );
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
