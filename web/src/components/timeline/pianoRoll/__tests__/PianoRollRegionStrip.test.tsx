/**
 * The region strip names the clip and shows a badge for each active region
 * parameter (CE6, D53).
 */

import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  PianoRollRegionStrip,
  regionParamBadges
} from "../PianoRollRegionStrip";

describe("regionParamBadges", () => {
  it("is empty for a clip with no active parameter", () => {
    expect(regionParamBadges({})).toEqual([]);
    expect(
      regionParamBadges({ quantize: { grid: "1/16", strength: 0 } })
    ).toEqual([]);
  });

  it("names each active parameter", () => {
    expect(
      regionParamBadges({
        transpose: 7,
        velocityOffset: -20,
        quantize: { grid: "1/16", strength: 80 }
      })
    ).toEqual(["+7 st", "Vel -20", "Q 1/16 80%"]);
  });
});

describe("PianoRollRegionStrip", () => {
  it("draws the badges in the strip", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PianoRollRegionStrip
          geometry={{ pxPerTick: 0.1, scrollTick: 0, rowHeightPx: 12, topPitch: 72 }}
          widthPx={400}
          windowFromTick={0}
          windowToTick={3000}
          name="Riff"
          badges={["+7 st", "Q 1/16 80%"]}
        />
      </ThemeProvider>
    );
    expect(screen.getByText("+7 st · Q 1/16 80%")).toBeInTheDocument();
  });
});
