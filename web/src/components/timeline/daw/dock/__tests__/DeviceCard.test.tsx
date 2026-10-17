import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../../__mocks__/themeMock";
import { DeviceCard, type DeviceCardProps } from "../DeviceCard";

function renderCard(props: Partial<DeviceCardProps> = {}) {
  const onToggleCollapsed = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <DeviceCard
        title="WT-1 Wavetable"
        kind="Instrument"
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        testId="card"
        {...props}
      >
        <div>device body</div>
      </DeviceCard>
    </ThemeProvider>
  );
  return { onToggleCollapsed };
}

describe("DeviceCard", () => {
  it("shows the title and kind as separate labels over the body", () => {
    renderCard();
    expect(screen.getByText("WT-1 Wavetable")).toBeInTheDocument();
    expect(screen.getByText("Instrument")).toBeInTheDocument();
    expect(screen.getByText("device body")).toBeInTheDocument();
  });

  it("folds a row card to a vertical strip without its body", () => {
    renderCard({ collapsed: true });
    expect(screen.queryByText("device body")).not.toBeInTheDocument();
    expect(screen.queryByText("Instrument")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WT-1 Wavetable" })).toBeInTheDocument();
  });

  it("folds a stacked card to its header, keeping the kind label", () => {
    const { onToggleCollapsed } = renderCard({ collapsed: true, layout: "stack" });
    expect(screen.queryByText("device body")).not.toBeInTheDocument();
    expect(screen.getByText("Instrument")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand WT-1 Wavetable" }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
