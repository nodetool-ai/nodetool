import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { GENERATION_STATUS } from "../generationStatus";
import { StatusIndicator } from "../StatusIndicator";
import { statusPillColors } from "../StatusPill";

describe("GENERATION_STATUS", () => {
  it("draws work in flight in the primary tone in all three primitives", () => {
    const generating = GENERATION_STATUS.generating;
    expect(generating.status).toBe("running");
    expect(generating.pill).toBe("rendering");
    expect(generating.dot).toBe("primary");
  });

  it("keeps queued work neutral", () => {
    const queued = GENERATION_STATUS.queued;
    expect(queued.status).toBe("pending");
    expect(queued.pill).toBe("neutral");
    expect(queued.dot).toBe("neutral");
  });
});

describe("StatusIndicator", () => {
  it("draws its dot with StatusDot", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <StatusIndicator status="running" label="Generating" />
      </ThemeProvider>
    );
    const dot = container.querySelector(".status-icon");
    expect(dot?.tagName).toBe("SPAN");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });
});

describe("statusPillColors", () => {
  it("takes theme tones from CSS vars so they follow the colour scheme", () => {
    const done = statusPillColors("done", mockTheme);
    expect(done.color).toBe(mockTheme.vars.palette.success.main);
    expect(done.background).toContain(mockTheme.vars.palette.success.mainChannel);
  });

  it("reads a custom accent unlifted on light surfaces", () => {
    const rendering = statusPillColors("rendering", mockTheme, "#8b5cf6");
    expect(rendering.lightColor).toBe("#8b5cf6");
    expect(rendering.border).toBe("#8b5cf6");
  });
});
