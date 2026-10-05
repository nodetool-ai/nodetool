import React from "react";
import { render, screen } from "@testing-library/react";
import PanelErrorBoundary from "../PanelErrorBoundary";

const fallback = <span>Render failed</span>;
function Output({ broken }: { broken: boolean }): React.ReactElement {
  if (broken) { throw new Error("Broken output"); }
  return <span>Recovered output</span>;
}

describe("PanelErrorBoundary", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => { consoleError = jest.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { consoleError.mockRestore(); });

  it("keeps the fallback for the failed producer and retries on a new producer", () => {
    const onError = jest.fn();
    const view = render(<PanelErrorBoundary resetKey="first" fallback={fallback} onError={onError}><Output broken /></PanelErrorBoundary>);
    expect(screen.getByText("Render failed")).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    view.rerender(<PanelErrorBoundary resetKey="first" fallback={fallback}><Output broken={false} /></PanelErrorBoundary>);
    expect(screen.queryByText("Recovered output")).not.toBeInTheDocument();
    view.rerender(<PanelErrorBoundary resetKey="second" fallback={fallback}><Output broken={false} /></PanelErrorBoundary>);
    expect(screen.getByText("Recovered output")).toBeInTheDocument();
  });

  it("still catches a widget crash when its reporting callback fails", () => {
    render(<PanelErrorBoundary fallback={fallback} onError={() => { throw new Error("Reporter failed"); }}><Output broken /></PanelErrorBoundary>);
    expect(screen.getByText("Render failed")).toBeInTheDocument();
  });
});
