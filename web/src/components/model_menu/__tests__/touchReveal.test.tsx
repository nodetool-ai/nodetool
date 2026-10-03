import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import FavoriteStar from "../FavoriteStar";
import DefaultModelPin from "../DefaultModelPin";

/**
 * iOS Safari reads a tap on a row whose content changes on hover as the hover
 * and drops the click, so the model picker needed two taps. The star and pin
 * are revealed by a hover rule in ModelList, so they may only be hidden where
 * hover exists.
 */
const hiddenOutsideHoverMedia = (className: string): string[] => {
  const found: string[] = [];
  const walk = (rules: CSSRuleList, inHoverMedia: boolean) => {
    for (const rule of Array.from(rules)) {
      const media = rule as CSSMediaRule;
      if (media.media && media.cssRules) {
        walk(media.cssRules, inHoverMedia || /hover:\s*hover/.test(media.media.mediaText));
        continue;
      }
      const style = rule as CSSStyleRule;
      if (
        style.selectorText?.includes(`.${className}`) &&
        style.style?.opacity === "0" &&
        !inHoverMedia
      ) {
        found.push(style.cssText);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, false);
  }
  return found;
};

const wrapperClass = (container: HTMLElement, selector: string): string => {
  const el = container.querySelector(selector) as HTMLElement;
  return Array.from(el.classList).find((c) => c.startsWith("css-")) as string;
};

describe("model picker row actions on touch", () => {
  it("keeps the favorite star visible unless the device can hover", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <FavoriteStar provider="openai" id="gpt-4o" />
      </ThemeProvider>
    );
    const cls = wrapperClass(container, ".favorite-star");
    expect(cls).toBeTruthy();
    expect(hiddenOutsideHoverMedia(cls)).toEqual([]);
  });

  it("keeps the default pin visible unless the device can hover", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <DefaultModelPin modelType="language_model" provider="openai" id="gpt-4o" />
      </ThemeProvider>
    );
    const cls = wrapperClass(container, ".default-pin");
    expect(cls).toBeTruthy();
    expect(hiddenOutsideHoverMedia(cls)).toEqual([]);
  });
});
