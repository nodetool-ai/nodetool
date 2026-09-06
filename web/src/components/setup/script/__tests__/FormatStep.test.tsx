import { render, screen, fireEvent, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { FormatStep } from "../FormatStep";
import { useScriptStore } from "../../../../stores/script/ScriptStore";

// The format cards carry stills, and the real resolver needs a QueryClient.
jest.mock("../../../../hooks/useResolvedMediaUri");

jest.mock("../../../properties/LanguageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));

it("offers the lengths as one choice, with the current one checked", () => {
  useScriptStore.getState().ensureScript("duration-radio");
  useScriptStore
    .getState()
    .setSetup("duration-radio", { stage: "format", length_seconds: 30 });
  render(
    <ThemeProvider theme={mockTheme}>
      <FormatStep scriptId="duration-radio" />
    </ThemeProvider>
  );

  // Picking one length unpicks the rest, so the row is a radio group and not
  // four independent toggles (F26).
  const group = screen.getByRole("radiogroup", { name: "Length" });
  expect(
    within(group)
      .getAllByRole("radio")
      .map((radio) => radio.textContent)
  ).toEqual(["30s", "1 min", "2 min", "Custom"]);
  expect(within(group).getByRole("radio", { checked: true })).toHaveTextContent(
    "30s"
  );
  // One tab stop: the checked option, with the others reachable by arrow key.
  expect(
    within(group)
      .getAllByRole("radio")
      .filter((radio) => radio.getAttribute("tabindex") === "0")
  ).toHaveLength(1);

  // The seconds field is a field, not one of the options.
  fireEvent.click(within(group).getByRole("radio", { name: "Custom" }));
  expect(within(group).queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.getByRole("spinbutton")).toBeInTheDocument();
});

it("makes Custom exclusive even when its value equals a preset", () => {
  useScriptStore.getState().ensureScript("duration-test");
  render(
    <ThemeProvider theme={mockTheme}>
      <FormatStep scriptId="duration-test" />
    </ThemeProvider>
  );
  expect(screen.getByRole("radio", { name: "1 min" })).toBeChecked();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
  expect(screen.getByRole("radio", { name: "1 min" })).not.toBeChecked();
  expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  // The field holds what is typed until it is left: a half-typed "9" must not
  // become the script's length (F21). Nothing has written one yet, so the
  // document still carries none at all.
  const custom = screen.getByRole("spinbutton");
  fireEvent.change(custom, { target: { value: "9" } });
  expect(
    useScriptStore.getState().getScript("duration-test")?.setup?.length_seconds
  ).toBeUndefined();
  fireEvent.change(custom, { target: { value: "90" } });
  fireEvent.blur(custom);
  expect(
    useScriptStore.getState().getScript("duration-test")?.setup?.length_seconds
  ).toBe(90);
  // An unreadable draft says why and leaves the document alone.
  fireEvent.change(custom, { target: { value: "" } });
  fireEvent.blur(custom);
  expect(screen.getByText(/whole number of seconds/)).toBeInTheDocument();
  expect(
    useScriptStore.getState().getScript("duration-test")?.setup?.length_seconds
  ).toBe(90);
  fireEvent.change(custom, { target: { value: "90" } });
  fireEvent.click(screen.getByRole("radio", { name: "1 min" }));
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(
    useScriptStore.getState().getScript("duration-test")?.setup?.length_seconds
  ).toBe(60);
});
