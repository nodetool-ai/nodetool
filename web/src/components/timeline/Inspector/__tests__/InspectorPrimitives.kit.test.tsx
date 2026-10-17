import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { EYEBROW } from "../../../ui_primitives";
import { InspectorHeader, InspectorStaticValue } from "../InspectorPrimitives";
import { InspectorStaticValue as SharedInspectorStaticValue } from "../../../ui_primitives";

describe("timeline inspector kit", () => {
  it("draws InspectorHeader with the shared SectionHeader eyebrow", () => {
    const onAdd = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <InspectorHeader eyebrow="Inspector" actions={[{ icon: <span>+</span>, label: "Add clip", onClick: onAdd }]} />
      </ThemeProvider>
    );
    const title = screen.getByText("Inspector");
    expect(title).toHaveClass("section-header-title");
    expect(title).toHaveStyle({ textTransform: EYEBROW.textTransform, letterSpacing: EYEBROW.letterSpacing });
    fireEvent.click(screen.getByRole("button", { name: "Add clip" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("re-exports the shared InspectorStaticValue", () => {
    expect(InspectorStaticValue).toBe(SharedInspectorStaticValue);
  });
});
