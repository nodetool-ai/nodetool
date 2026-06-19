import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Divider } from "../Divider";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("Divider", () => {
  describe("rendering", () => {
    it("renders a horizontal separator by default", () => {
      const { container } = renderWithTheme(<Divider />);
      const hr = container.querySelector("hr");
      expect(hr).toBeInTheDocument();
      expect(hr).toHaveClass("MuiDivider-root");
    });

    it("renders as a vertical divider", () => {
      const { container } = renderWithTheme(
        <Divider orientation="vertical" flexItem />
      );
      const divider = container.querySelector(".MuiDivider-root");
      expect(divider).toBeInTheDocument();
      expect(divider).toHaveClass("MuiDivider-vertical");
    });
  });

  describe("variant prop", () => {
    it("renders fullWidth variant by default", () => {
      const { container } = renderWithTheme(<Divider />);
      const hr = container.querySelector("hr");
      expect(hr).toHaveClass("MuiDivider-fullWidth");
    });

    it("renders inset variant", () => {
      const { container } = renderWithTheme(<Divider variant="inset" />);
      const hr = container.querySelector("hr");
      expect(hr).toHaveClass("MuiDivider-inset");
    });

    it("renders middle variant", () => {
      const { container } = renderWithTheme(<Divider variant="middle" />);
      const hr = container.querySelector("hr");
      expect(hr).toHaveClass("MuiDivider-middle");
    });
  });

  describe("spacing prop", () => {
    it("applies different styles for different spacing values", () => {
      const { container: noneContainer } = renderWithTheme(
        <Divider spacing="none" />
      );
      const { container: spaciousContainer } = renderWithTheme(
        <Divider spacing="spacious" />
      );
      const noneHr = noneContainer.querySelector("hr");
      const spaciousHr = spaciousContainer.querySelector("hr");
      expect(noneHr?.className).not.toEqual(spaciousHr?.className);
    });

    it("applies vertical margins for horizontal divider", () => {
      const { container: compactContainer } = renderWithTheme(
        <Divider spacing="compact" />
      );
      const { container: comfortableContainer } = renderWithTheme(
        <Divider spacing="comfortable" />
      );
      const compactHr = compactContainer.querySelector("hr");
      const comfortableHr = comfortableContainer.querySelector("hr");
      expect(compactHr?.className).not.toEqual(comfortableHr?.className);
    });
  });

  describe("color prop", () => {
    it("applies different border colors for each color variant", () => {
      const { container: defaultContainer } = renderWithTheme(
        <Divider color="default" />
      );
      const { container: strongContainer } = renderWithTheme(
        <Divider color="strong" />
      );
      const defaultHr = defaultContainer.querySelector("hr");
      const strongHr = strongContainer.querySelector("hr");
      expect(defaultHr?.className).not.toEqual(strongHr?.className);
    });
  });

  describe("sx prop forwarding", () => {
    it("merges custom sx styles", () => {
      const { container: withSx } = renderWithTheme(
        <Divider sx={{ opacity: 0.5 }} />
      );
      const { container: withoutSx } = renderWithTheme(<Divider />);
      const withSxHr = withSx.querySelector("hr");
      const withoutSxHr = withoutSx.querySelector("hr");
      expect(withSxHr?.className).not.toEqual(withoutSxHr?.className);
    });
  });

  describe("displayName", () => {
    it("has displayName set", () => {
      expect(Divider.displayName).toBe("Divider");
    });
  });

  describe("props forwarding", () => {
    it("forwards data-testid", () => {
      const { container } = renderWithTheme(
        <Divider data-testid="my-divider" />
      );
      const hr = container.querySelector('[data-testid="my-divider"]');
      expect(hr).toBeInTheDocument();
    });

    it("forwards className", () => {
      const { container } = renderWithTheme(
        <Divider className="custom-class" />
      );
      const hr = container.querySelector("hr");
      expect(hr).toHaveClass("custom-class");
    });
  });
});
