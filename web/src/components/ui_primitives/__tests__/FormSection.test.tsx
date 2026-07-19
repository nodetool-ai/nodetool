import React from "react";
import { render, screen } from "@testing-library/react";
import { FormSection } from "../FormSection";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("FormSection", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders children correctly", () => {
    renderWithTheme(
      <FormSection>
        <div>Field 1</div>
        <div>Field 2</div>
      </FormSection>
    );

    expect(screen.getByText("Field 1")).toBeInTheDocument();
    expect(screen.getByText("Field 2")).toBeInTheDocument();
  });

  it("forwards ref to the root element", () => {
    const ref = React.createRef<HTMLDivElement>();
    renderWithTheme(
      <FormSection ref={ref}>
        <div>Field</div>
      </FormSection>
    );

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("renders the group label uppercase", () => {
    renderWithTheme(
      <FormSection label="Run settings">
        <div>Field</div>
      </FormSection>
    );

    const label = screen.getByText("Run settings");
    expect(label).toHaveStyle({
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    });
  });

  it("renders the group label as a non-label element", () => {
    renderWithTheme(
      <FormSection label="Run settings">
        <div>Field</div>
      </FormSection>
    );

    // A group heading has no single control to reference, so it must not be
    // a <label> element.
    expect(screen.getByText("Run settings").tagName).not.toBe("LABEL");
  });

  it("renders no label element when label is omitted", () => {
    const { container } = renderWithTheme(
      <FormSection>
        <div>Field</div>
      </FormSection>
    );

    expect(container.querySelector("label")).toBeNull();
    // Only the field column remains under the root.
    const root = container.firstChild as HTMLElement;
    expect(root.childNodes).toHaveLength(1);
  });

  it("lays the body out as a vertical flex column", () => {
    renderWithTheme(
      <FormSection>
        <div>Field</div>
      </FormSection>
    );

    const body = screen.getByText("Field").parentElement as HTMLElement;
    expect(body).toHaveStyle({ display: "flex", flexDirection: "column" });
  });

  it("applies custom className to the root element", () => {
    const { container } = renderWithTheme(
      <FormSection className="custom-section">
        <div>Field</div>
      </FormSection>
    );

    expect(container.firstChild).toHaveClass("custom-section");
  });
});
