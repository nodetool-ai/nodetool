/**
 * Ruler label formatting.
 *
 * The tick interval drops to 500 / 200 / 100 ms as you zoom in, which
 * pinch-to-zoom makes routine on a phone. A whole-second label repeats itself
 * at those intervals ("0:02  0:02  0:02"), so the label carries decimals once
 * the interval goes sub-second.
 */

import { formatTimecode } from "../TimeRuler";

describe("formatTimecode", () => {
  it("prints M:SS at second-or-coarser tick intervals", () => {
    expect(formatTimecode(0, 1000)).toBe("0:00");
    expect(formatTimecode(5000, 1000)).toBe("0:05");
    expect(formatTimecode(90_000, 5000)).toBe("1:30");
    expect(formatTimecode(605_000, 60_000)).toBe("10:05");
  });

  it("keeps whole seconds as the default", () => {
    expect(formatTimecode(2400)).toBe("0:02");
  });

  it("adds one decimal at a 500ms interval", () => {
    expect(formatTimecode(2000, 500)).toBe("0:02.0");
    expect(formatTimecode(2500, 500)).toBe("0:02.5");
  });

  it("adds two decimals below 500ms, so adjacent ticks differ", () => {
    expect(formatTimecode(2000, 100)).toBe("0:02.00");
    expect(formatTimecode(2100, 100)).toBe("0:02.10");
    expect(formatTimecode(2200, 100)).toBe("0:02.20");
    expect(formatTimecode(2200, 200)).toBe("0:02.20");
  });

  it("counts frames instead of decimals when the sequence fps is known", () => {
    expect(formatTimecode(2000, 500, 30)).toBe("0:02:00");
    expect(formatTimecode(2500, 500, 30)).toBe("0:02:15");
    expect(formatTimecode(2080, 100, 25)).toBe("0:02:02");
    expect(formatTimecode(61_500, 500, 24)).toBe("1:01:12");
  });

  it("keeps whole seconds at coarse intervals even with an fps", () => {
    expect(formatTimecode(5000, 1000, 30)).toBe("0:05");
  });

  it("pads seconds under ten and rolls over past a minute", () => {
    expect(formatTimecode(9900, 100)).toBe("0:09.90");
    expect(formatTimecode(61_500, 500)).toBe("1:01.5");
    expect(formatTimecode(70_000, 100)).toBe("1:10.00");
  });
});
