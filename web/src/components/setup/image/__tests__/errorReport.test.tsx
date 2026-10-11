/**
 * @jest-environment jsdom
 *
 * Every failure the image flow shows carries Report, so a creator who reads
 * it has somewhere to send it.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [], isLoading: false })
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { IdeaStep } from "../IdeaStep";
import { ReviewStep } from "../ReviewStep";
import type { UploadFirstLayerResult } from "../../../../hooks/sketch/useUploadFirstLayer";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

describe("image flow failures", () => {
  it("offers Report beside a failed Re-refine", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={mockTheme}>
          <ReviewStep
            onReRefine={jest.fn()}
            refining={false}
            error="The model did not return a brief. Try again."
          />
        </ThemeProvider>
      </QueryClientProvider>
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
  });

  it("offers Report when an upload fails", () => {
    const upload = {
      uploadFirstLayer: jest.fn(),
      uploading: false,
      error: "The file could not be uploaded.",
      clearError: jest.fn(),
      cancel: jest.fn()
    } as unknown as UploadFirstLayerResult;
    render(
      <ThemeProvider theme={mockTheme}>
        <IdeaStep onStartBlank={jest.fn()} upload={upload} />
      </ThemeProvider>
    );
    expect(screen.getByText("The file could not be uploaded.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
  });
});
