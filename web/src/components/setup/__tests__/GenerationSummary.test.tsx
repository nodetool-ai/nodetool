import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import GenerationSummary from "../GenerationSummary";
import { generationEstimate } from "../generationEstimate";

it("prices the selected provider and increases the allowance for a longer brief", () => {
  const model = { id: "gpt-4o-mini", provider: "openai" };
  const short = generationEstimate(model, "A short brief", 8192);
  const long = generationEstimate(model, "Long brief ".repeat(4000), 8192);
  expect(short?.low).toBeGreaterThan(0);
  expect(short?.high).toBeGreaterThan(short?.low ?? 0);
  expect(long?.high).toBeGreaterThan(short?.high ?? 0);
  expect(
    generationEstimate(
      { ...model, provider: "unknown-provider" },
      "Brief",
      8192
    )
  ).toBeNull();
});

it("never presents an unpriced model as free and names the result and next step", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <GenerationSummary
        result="Write text only"
        next="Audio is generated separately"
        model={{ id: "unknown-model", provider: "openai" }}
        brief="test"
        maxOutputTokens={8192}
      />
    </ThemeProvider>
  );
  expect(
    screen.getByText("Cost estimate unavailable for this model")
  ).toBeVisible();
  expect(screen.getByText("Model: unknown-model (openai)")).toBeVisible();
  expect(screen.getByText("Write text only")).toBeVisible();
  expect(screen.getByText("Audio is generated separately")).toBeVisible();
  expect(screen.getByText(/Rough wait/)).toBeVisible();
});

it("distinguishes a preset with no call from an unpriced generation", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <GenerationSummary
        result="Use preset"
        next="Review next"
        model={null}
        brief="test"
        maxOutputTokens={4096}
        noModelCall
      />
    </ThemeProvider>
  );
  expect(screen.getByText("$0, no model call")).toBeVisible();
  expect(screen.getByText("Ready immediately")).toBeVisible();
});
