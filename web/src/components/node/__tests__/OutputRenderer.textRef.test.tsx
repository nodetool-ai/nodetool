/** @jsxImportSource @emotion/react */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import OutputRenderer from "../OutputRenderer";

jest.mock("../../../trpc/client", () => {
  const idle = { useQuery: () => ({ data: undefined, isLoading: false }) };
  return {
    trpc: {
      sketch: { get: idle },
      timeline: { get: idle },
      storage: { signUrl: idle }
    }
  };
});

const renderOutput = (value: unknown) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <OutputRenderer value={value} showTextActions={false} />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("OutputRenderer text refs", () => {
  it("shows the text of a reloaded text generation, not the ref JSON", () => {
    // Shape `assetToOutputValue` builds for a saved `text/plain` generation,
    // which a Preview node shows after reload.
    const { container } = renderOutput({
      type: "text",
      text: "I told my calendar I needed a break.",
      uri: "https://storage.example/nodetool-assets/abc.txt?token=t"
    });

    expect(
      screen.getByText("I told my calendar I needed a break.")
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("uri");
    expect(container.textContent).not.toContain("token=");
  });

  it("shows the data of a TextRef", () => {
    const { container } = renderOutput({ type: "text", data: "inline body" });

    expect(screen.getByText("inline body")).toBeInTheDocument();
    expect(container.textContent).not.toContain('"type"');
  });
});
