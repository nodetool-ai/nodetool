/**
 * What a project cost, split by what it bought — and whether the ledger read
 * that fed it was capped, so the total is a lower bound rather than the
 * final figure.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ProjectSpendBar from "../ProjectSpendBar";
import type { ProjectDetail } from "../projectStatus";

const spend = (
  over: Partial<ProjectDetail["spend"]>
): ProjectDetail["spend"] => ({
  totalUsd: 0,
  unpricedCount: 0,
  byCategory: [],
  ...over
});

const renderBar = (s: ProjectDetail["spend"]) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectSpendBar spend={s} />
    </ThemeProvider>
  );

describe("ProjectSpendBar", () => {
  it("shows the plain total when the ledger read was complete", () => {
    renderBar(spend({ totalUsd: 4.12 }));
    expect(screen.getByText("$4.12")).toBeInTheDocument();
  });

  it("marks the total as a lower bound when the ledger read was capped", () => {
    renderBar(spend({ totalUsd: 4.12, partial: true }));
    expect(screen.getByText("≥$4.12")).toBeInTheDocument();
    expect(screen.queryByText("$4.12")).not.toBeInTheDocument();
  });
});
