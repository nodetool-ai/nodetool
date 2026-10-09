import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import mockTheme from "../../../__mocks__/themeMock";
import EditorActivationCover from "../EditorActivationCover";

describe("EditorActivationCover", () => {
  it("hands the click point to the owner", () => {
    const onActivate = jest.fn();
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <EditorActivationCover onActivate={onActivate} />
      </ThemeProvider>
    );
    const cover = container.querySelector(".editor-activation-cover");
    expect(cover).not.toBeNull();
    fireEvent.click(cover as Element, { clientX: 40, clientY: 12 });
    expect(onActivate).toHaveBeenCalledWith(40, 12);
  });

  it("takes no canvas behavior classes", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <EditorActivationCover onActivate={jest.fn()} />
      </ThemeProvider>
    );
    const cover = container.querySelector(".editor-activation-cover");
    expect(cover).not.toHaveClass("nowheel");
    expect(cover).not.toHaveClass("nodrag");
  });
});
