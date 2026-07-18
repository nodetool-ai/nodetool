/**
 * Guards the CONTROL height mechanism on TextInput and SelectField: the root
 * carries the token minHeight and the value box's vertical padding is small
 * enough that the content always fits under that floor (a floor alone does
 * not cap MUI's own line-height + padding — measured 30.6-38.6px before the
 * fix). True rendered-height measurement lives in the browser visual suite;
 * jsdom does not cascade descendant-selector rules into getComputedStyle, so
 * the descendant rules are asserted against the emotion CSS scoped to the
 * component's generated class.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { TextInput } from "../TextInput";
import { SelectField } from "../SelectField";
import { CONTROL } from "../tokens";

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

/**
 * Emotion rules scoped to the element's generated css- class, whitespace
 * stripped. Read through the CSSOM — emotion inserts via insertRule, so the
 * <style> tags' textContent is empty.
 */
const cssRulesFor = (el: Element): string => {
  const cls = Array.from(el.classList).find((c) => c.startsWith("css-"));
  expect(cls).toBeDefined();
  return Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules);
      } catch {
        return [];
      }
    })
    .map((rule) => rule.cssText)
    .filter((text) => text.includes(`.${cls}`))
    .join("\n")
    .replace(/\s+/g, "");
};

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" }
];

describe("control token heights", () => {
  it("TextInput medium: root floor 36px, input padding 7px", () => {
    renderWithTheme(<TextInput label="Name" />);
    const rules = cssRulesFor(
      screen.getByLabelText("Name").closest(".MuiFormControl-root") as Element
    );
    expect(rules).toContain(`min-height:${CONTROL.height.lg}px`);
    expect(rules).toContain("padding-top:7px");
    expect(rules).toContain("padding-bottom:7px");
  });

  it("TextInput compact: root floor 28px, input padding 3px", () => {
    renderWithTheme(<TextInput label="Name" compact />);
    const rules = cssRulesFor(
      screen.getByLabelText("Name").closest(".MuiFormControl-root") as Element
    );
    expect(rules).toContain(`min-height:${CONTROL.height.sm}px`);
    expect(rules).toContain("padding-top:3px");
    expect(rules).toContain("padding-bottom:3px");
  });

  it.each(["standard", "outlined"] as const)(
    "SelectField %s medium: root floor 36px, display fits under it",
    (variant) => {
      renderWithTheme(
        <SelectField
          label="Kind"
          value="a"
          onChange={jest.fn()}
          options={options}
          variant={variant}
        />
      );
      const root = screen
        .getByRole("combobox")
        .closest(".MuiInputBase-root") as Element;
      expect(root).toHaveStyle({ minHeight: `${CONTROL.height.lg}px` });
      // Zero vertical padding + flex centering keeps the display content
      // under the minHeight floor in every variant.
      const rules = cssRulesFor(root);
      expect(rules).toContain("display:flex");
      expect(rules).toContain("align-items:center");
      expect(rules).toContain("padding-top:0px");
      expect(rules).toContain("padding-bottom:0px");
      expect(rules).toContain("min-height:0px");
    }
  );

  it.each(["standard", "outlined"] as const)(
    "SelectField %s small: root floor 28px",
    (variant) => {
      renderWithTheme(
        <SelectField
          label="Kind"
          value="a"
          onChange={jest.fn()}
          options={options}
          variant={variant}
          size="small"
        />
      );
      const root = screen
        .getByRole("combobox")
        .closest(".MuiInputBase-root") as Element;
      expect(root).toHaveStyle({ minHeight: `${CONTROL.height.sm}px` });
      const rules = cssRulesFor(root);
      expect(rules).toContain("padding-top:0px");
      expect(rules).toContain("padding-bottom:0px");
    }
  );
});
