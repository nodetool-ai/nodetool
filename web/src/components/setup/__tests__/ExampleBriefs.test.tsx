import React, { useRef } from "react";
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
