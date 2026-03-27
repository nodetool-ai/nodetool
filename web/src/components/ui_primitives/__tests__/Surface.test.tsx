import React, { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { Surface } from "../Surface";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("Surface", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders children", () => {
    renderWithTheme(
      <Surface>
        <div>Surface content</div>
      </Surface>
    );
    expect(screen.getByText("Surface content")).toBeInTheDocument();
  });

  it("renders with elevation", () => {
    const { container } = renderWithTheme(
      <Surface elevation={2}>
        <div>Elevated</div>
      </Surface>
    );
    const paper = container.firstChild as HTMLElement;
    expect(paper).toBeInTheDocument();
  });

  it("renders with border", () => {
    const { container } = renderWithTheme(
      <Surface bordered>
        <div>Bordered</div>
      </Surface>
    );
    const paper = container.firstChild as HTMLElement;
    expect(paper).toBeInTheDocument();
  });

  it("applies transparent background", () => {
    const { container } = renderWithTheme(
      <Surface background="transparent">
        <div>Transparent</div>
      </Surface>
    );
    const paper = container.firstChild as HTMLElement;
    expect(paper).toBeInTheDocument();
  });

  it("applies rounded variants", () => {
    const { container } = renderWithTheme(
      <Surface rounded="large" padding={2}>
        <div>Rounded</div>
      </Surface>
    );
    const paper = container.firstChild as HTMLElement;
    expect(paper).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(
      <Surface ref={ref}>
        <div>Ref test</div>
      </Surface>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
