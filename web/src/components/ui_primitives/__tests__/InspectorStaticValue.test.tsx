import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { InspectorStaticValue } from "../InspectorStaticValue";

describe("InspectorStaticValue", () => {
  it("shows the value with the full text as its tooltip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <InspectorStaticValue value="clip_0123456789abcdef" />
      </ThemeProvider>
    );
    const value = screen.getByText("clip_0123456789abcdef");
    expect(value).toHaveAttribute("title", "clip_0123456789abcdef");
    expect(value).toHaveStyle({ textOverflow: "ellipsis", whiteSpace: "nowrap" });
  });
});
