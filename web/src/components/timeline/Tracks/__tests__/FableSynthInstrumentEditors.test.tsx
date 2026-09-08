import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { findInstrumentPreset, type MidiInstrument } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import FableSynthInstrumentEditor, { InstrumentKeyboard } from "../FableSynthInstrumentEditors";

function setup(id: string) {
  const onChange = jest.fn();
  const preset = findInstrumentPreset(id)!;
  function Editor() {
    const [instrument, setInstrument] = useState<MidiInstrument>(preset.instrument);
    if (instrument.type === "subtractive") throw new Error("Expected a Fable instrument");
    return <FableSynthInstrumentEditor instrument={instrument} onChange={(next, pitch) => {
      setInstrument(next);
      onChange(next, pitch);
    }} />;
  }
  render(<ThemeProvider theme={mockTheme}><Editor /></ThemeProvider>);
  return onChange;
}

it("auditions chromatic pitches from the labelled keyboard", async () => {
  const user = userEvent.setup();
  const onChange = jest.fn();
  render(<ThemeProvider theme={mockTheme}><InstrumentKeyboard start={48} onPlay={onChange} /></ThemeProvider>);
  for (const [key, pitch] of [["C3", 48], ["C♯3", 49], ["B3", 59], ["C5", 72]] as const) {
    await user.click(screen.getByRole("button", {name: `Play ${key}`}));
    expect(onChange).toHaveBeenLastCalledWith(pitch);
  }
});

it("resets a bass knob to its actual default", () => {
  const onChange = setup("bl1-acid");
  const drive = screen.getByRole("slider", {name: "DRIVE"});
  fireEvent.doubleClick(drive);
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({drive: 0}), undefined);
});

it("edits only the selected drum pad and auditions its MIDI pitch", async () => {
  const user = userEvent.setup();
  const onChange = setup("dr1-tr-void");
  const preset = findInstrumentPreset("dr1-tr-void")!.instrument;
  if (preset.type !== "drum") throw new Error("Expected drum preset");
  await user.click(screen.getByRole("button", {name: "Edit pad 3: Snare"}));
  expect(onChange).toHaveBeenLastCalledWith(preset, preset.baseNote + 2);
  fireEvent.change(screen.getByRole("slider", {name: "LEVEL"}), {target: {value: "0.42"}});
  const updated = onChange.mock.lastCall![0];
  expect(updated.pads[2].level).toBeCloseTo(0.42);
  expect(updated.pads[0]).toEqual(preset.pads[0]);
});
