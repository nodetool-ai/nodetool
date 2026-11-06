import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { useGenerationBatchStore } from "../../../../stores/GenerationBatchStore";
import { GenerationBatchProgress, batchFromResult } from "../GenerationBatchProgress";

jest.mock("../../../ui_primitives/ResponsiveImage", () => ({
  ResponsiveImage: ({ alt }: { alt: string }) => <img alt={alt} />
}));

const renderBar = (props: { toolCallId: string; resultContent?: unknown }) =>
  render(<ThemeProvider theme={mockTheme}><GenerationBatchProgress {...props} /></ThemeProvider>);

describe("GenerationBatchProgress", () => {
  beforeEach(() => useGenerationBatchStore.setState({ batches: {} }));

  it("shows live progress and unfolds into each request", async () => {
    act(() => useGenerationBatchStore.getState().applyUpdate({
      tool_call_id: "call-1",
      concurrency: 2,
      items: [
        { id: "1", label: "Shot 1 still", tool: "generate_image", provider: "fal_ai", model: "flux", status: "completed",
          estimate_seconds: 20, started_at: 1, finished_at: 5001, uri: "asset://a.png", media_type: "image" },
        { id: "2", label: "Shot 2 still", tool: "generate_image", status: "failed", estimate_seconds: 20, error: "provider refused" },
        { id: "3", label: "Shot 3 still", tool: "generate_image", status: "queued", estimate_seconds: 20 }
      ]
    }));
    renderBar({ toolCallId: "call-1" });
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
    expect(screen.getByText("Failed: 1")).toBeInTheDocument();
    expect(screen.getByText("About 20s left")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Generation progress" })).toBeInTheDocument();
    expect(screen.queryByText("Shot 1 still")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show requests" }));
    expect(screen.getByText("Shot 1 still")).toBeInTheDocument();
    expect(screen.getByText("Done · Took 5s")).toBeInTheDocument();
    expect(screen.getByText("fal_ai:flux")).toBeInTheDocument();
    expect(screen.getByAltText("Shot 1 still")).toBeInTheDocument();
    expect(screen.getByText("provider refused")).toBeInTheDocument();
    expect(screen.getByText("Queued · Expected 20s")).toBeInTheDocument();
  });

  it("draws a finished batch from the call's result after a reload", () => {
    const result = JSON.stringify({ batch: { concurrency: 1, items: [
      { id: "1", label: "Theme", tool: "generate_music", status: "completed", estimate_seconds: 60 }
    ] } });
    expect(batchFromResult(result)?.items).toHaveLength(1);
    renderBar({ toolCallId: "gone", resultContent: result });
    expect(screen.getByText("1 of 1 done")).toBeInTheDocument();
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });
});
