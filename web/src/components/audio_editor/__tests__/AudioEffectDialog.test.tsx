import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioEffectDialog from "../AudioEffectDialog";
import { makeAudioSample } from "../audioSample";
import type { AudioEffect } from "../audioEffects";

const effect: AudioEffect = {
  id: "gainTest",
  label: "Gain test",
  group: "Tone",
  description: "Scales the level.",
  params: [
    {
      key: "amount",
      label: "Amount",
      min: 0,
      max: 10,
      step: 0.5,
      defaultValue: 2,
      unit: "dB"
    }
  ],
  process: (input) => Promise.resolve(input)
};

const sample = makeAudioSample(4, [new Float32Array([0, 0.5, 1, 0.5])]);

const renderDialog = (
  overrides: Partial<ComponentProps<typeof AudioEffectDialog>> = {}
) => {
  const props = {
    effect,
    sample,
    selection: null,
    initialParams: { amount: 3 },
    getAudioContext: jest.fn(),
    onApply: jest.fn().mockResolvedValue(undefined),
    onClose: jest.fn(),
    ...overrides
  };
  render(<AudioEffectDialog {...props} />, {
    wrapper: ({ children }) => (
      <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
    )
  });
  return props;
};

it("shows the parameters and applies the current values", async () => {
  const props = renderDialog();
  expect(screen.getByText("Applies to the whole clip.", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("3.0 dB")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Apply"));
  await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  expect(props.onApply).toHaveBeenCalledWith(effect, { amount: 3 });
});

it("resets parameters to their defaults", () => {
  renderDialog();
  fireEvent.click(screen.getByText("Reset"));
  expect(screen.getByText("2.0 dB")).toBeInTheDocument();
});

it("keeps the dialog open and shows the error when applying fails", async () => {
  const props = renderDialog({
    selection: { start: 0, end: 0.5 },
    onApply: jest.fn().mockRejectedValue(new Error("render failed"))
  });
  expect(screen.getByText("Applies to the selection.", { exact: false })).toBeInTheDocument();
  fireEvent.click(screen.getByText("Apply"));
  expect(await screen.findByText("render failed")).toBeInTheDocument();
  expect(props.onClose).not.toHaveBeenCalled();
});
