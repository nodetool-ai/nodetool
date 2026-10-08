import React, { useRef, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ExampleBriefs } from "../ExampleBriefs";

it("wraps full examples, excludes the current brief, and selects the full text", () => {
  const text =
    "A very long opening sentence, followed by the distinguishing detail that must stay readable.";
  const onSelect = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <ExampleBriefs
        examples={["Same brief", text, text]}
        brief=" Same brief "
        onSelect={onSelect}
      />
    </ThemeProvider>
  );
  expect(
    screen.queryByRole("button", { name: "Same brief" })
  ).not.toBeInTheDocument();
  const button = screen.getByRole("button", { name: text });
  expect(button).toHaveStyle({
    height: "auto",
    whiteSpace: "normal",
    overflowWrap: "anywhere"
  });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledWith(text);
});

// Picking an example rewrites the brief and drops the button that was clicked,
// so the keyboard has nowhere to be unless it is sent to the field.
it("returns focus to the brief field after an example is applied", () => {
  const Host = () => {
    const brief = useRef<HTMLTextAreaElement>(null);
    return (
      <>
        <textarea ref={brief} aria-label="Brief" readOnly value="" />
        <ExampleBriefs
          examples={["A lighthouse at dusk"]}
          brief=""
          briefRef={brief}
          onSelect={jest.fn()}
        />
      </>
    );
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <Host />
    </ThemeProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "A lighthouse at dusk" }));

  expect(screen.getByLabelText("Brief")).toHaveFocus();
});

// An example picked over typed text replaces it, and Undo brings the
// creator's own words back (O5).
it("offers Undo when an example replaces typed text", () => {
  const Host = () => {
    const [brief, setBrief] = useState("My own idea");
    const field = useRef<HTMLTextAreaElement>(null);
    return (
      <>
        <textarea ref={field} aria-label="Brief" readOnly value={brief} />
        <ExampleBriefs
          examples={["A lighthouse at dusk"]}
          brief={brief}
          briefRef={field}
          onSelect={setBrief}
        />
      </>
    );
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <Host />
    </ThemeProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "A lighthouse at dusk" }));
  expect(screen.getByLabelText("Brief")).toHaveValue("A lighthouse at dusk");
  expect(screen.getByRole("status")).toHaveTextContent(
    "The example replaced your text."
  );

  fireEvent.click(screen.getByRole("button", { name: "Undo" }));

  expect(screen.getByLabelText("Brief")).toHaveValue("My own idea");
  expect(screen.getByLabelText("Brief")).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

it("offers no Undo when the brief was empty", () => {
  const Host = () => {
    const [brief, setBrief] = useState("");
    return (
      <ExampleBriefs
        examples={["A lighthouse at dusk", "A night market"]}
        brief={brief}
        onSelect={setBrief}
      />
    );
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <Host />
    </ThemeProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "A lighthouse at dusk" }));

  expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
});

// Undo brings back what the creator wrote, however many examples were tried
// over it.
it("keeps the creator's own brief for Undo across a second example", () => {
  const onSelect = jest.fn();
  const Host = () => {
    const [brief, setBrief] = useState("My own idea");
    return (
      <ExampleBriefs
        examples={["Example A", "Example B"]}
        brief={brief}
        onSelect={(text) => {
          onSelect(text);
          setBrief(text);
        }}
      />
    );
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <Host />
    </ThemeProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Example A" }));
  fireEvent.click(screen.getByRole("button", { name: "Example B" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));

  expect(onSelect).toHaveBeenLastCalledWith("My own idea");
});
