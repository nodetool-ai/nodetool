import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { settingsStyles } from "../settingsMenuStyles";

describe("settingsStyles", () => {
  it("emits valid sidebar padding values", () => {
    const styles = settingsStyles(mockTheme as Theme) as Record<
      string,
      CSSObject
    >;

    expect(styles[".settings-sidebar-item"].padding).toBe(
      "4px 24px 4px 32px"
    );
    expect(styles[".settings-sidebar-category"].padding).toBe(
      "6px 16px 6px 8px"
    );
    expect(
      (styles[".settings-item"] as Record<string, CSSObject>)["ul"].padding
    ).toBe("0 0 0 24px");
  });

  it("keeps the sidebar readable and content close to the tree", () => {
    const styles = settingsStyles(mockTheme as Theme) as Record<
      string,
      CSSObject
    >;

    expect(styles[".settings-sidebar-item"].fontSize).toBe(
      mockTheme.fontSizeNormal
    );
    expect(styles[".settings-sidebar-category"].fontSize).toBe(
      mockTheme.fontSizeSmall
    );
    expect(styles[".settings-content"].margin).toBe(0);
  });
});
