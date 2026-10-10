import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { ToneCurveEditor } from "../ToneCurveEditor";

type Point = { x: number; y: number };

const StatefulEditor = () => {
  const [master, setMaster] = useState<Point[]>([
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 }
  ]);
  return (
    <ToneCurveEditor
      master={master}
      onPatch={(patch) => {
        if (Array.isArray(patch.master)) setMaster(patch.master as Point[]);
      }}
    />
  );
};

describe("ToneCurveEditor keyboard", () => {
  it("keeps focus on a point moved with the arrow keys", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StatefulEditor />
      </ThemeProvider>
    );

    const point = screen.getByRole("button", { name: /master point 2,/i });
    point.focus();
    fireEvent.keyDown(point, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });

    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Master point 2, input 0.50, output 0.52"
    );
  });
});
