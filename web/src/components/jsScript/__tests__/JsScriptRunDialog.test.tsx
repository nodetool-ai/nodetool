/**
 * The run dialog's two input modes: one value per handle for a buffered body,
 * a JSON array of staged items per handle for a body that reads `stream`.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import JsScriptRunDialog, { parseStagedItems } from "../JsScriptRunDialog";

const renderDialog = (element: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{element}</ThemeProvider>);

const inputs = [{ name: "numbers", type: "int" }];

describe("parseStagedItems", () => {
  it("reads a JSON array as the items to stage", () => {
    expect(parseStagedItems("[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("stages a lone value as one item, and an empty field as none", () => {
    expect(parseStagedItems("7")).toEqual([7]);
    expect(parseStagedItems("hello")).toEqual(["hello"]);
    expect(parseStagedItems("  ")).toEqual([]);
  });
});

describe("JsScriptRunDialog", () => {
  it("stages items per handle for a streaming body", async () => {
    const onRun = jest.fn();
    renderDialog(
      <JsScriptRunDialog
        open
        streaming
        inputs={inputs}
        onClose={() => {}}
        onRun={onRun}
      />
    );

    await userEvent.type(
      screen.getByLabelText("numbers (stream of int)"),
      // `[` opens a key descriptor in user-event's keyboard syntax; `[[` is
      // how one types the literal character.
      "[[1, 2, 3]"
    );
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onRun).toHaveBeenCalledWith({
      inputs: {},
      inputStreams: { numbers: [1, 2, 3] }
    });
  });

  it("passes one value per handle for a buffered body", async () => {
    const onRun = jest.fn();
    renderDialog(
      <JsScriptRunDialog
        open
        inputs={inputs}
        onClose={() => {}}
        onRun={onRun}
      />
    );

    await userEvent.type(screen.getByLabelText("numbers (int)"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onRun).toHaveBeenCalledWith({ inputs: { numbers: 7 } });
  });
});
