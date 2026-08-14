/**
 * The run dialog's two input modes: typed property widgets for a buffered
 * body, a JSON array of staged items per handle for a body that reads `stream`.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import JsScriptRunDialog, { parseStagedItems } from "../JsScriptRunDialog";

const renderDialog = (element: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{element}</ThemeProvider>);

const intPort = { name: "numbers", type: "int" };

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
        inputs={[intPort]}
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

  it("uses a number control for an int port and sends the displayed default", async () => {
    const onRun = jest.fn();
    renderDialog(
      <JsScriptRunDialog
        open
        inputs={[intPort]}
        onClose={() => {}}
        onRun={onRun}
      />
    );

    expect(screen.getByLabelText("Increase numbers")).toBeInTheDocument();
    expect(screen.queryByLabelText("numbers (int)")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onRun).toHaveBeenCalledWith({ inputs: { numbers: 0 } });
  });

  it("uses a text control for a str port", async () => {
    const onRun = jest.fn();
    renderDialog(
      <JsScriptRunDialog
        open
        inputs={[{ name: "prompt", type: "str" }]}
        onClose={() => {}}
        onRun={onRun}
      />
    );

    await userEvent.type(screen.getByLabelText("Prompt"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onRun).toHaveBeenCalledWith({ inputs: { prompt: "hello" } });
  });

  it("uses a switch for a bool port", async () => {
    const onRun = jest.fn();
    renderDialog(
      <JsScriptRunDialog
        open
        inputs={[{ name: "flag", type: "bool" }]}
        onClose={() => {}}
        onRun={onRun}
      />
    );

    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onRun).toHaveBeenCalledWith({ inputs: { flag: true } });
  });

  it("reads list and dict ports as JSON", async () => {
    const onRun = jest.fn();
    renderDialog(
      <JsScriptRunDialog
        open
        inputs={[
          { name: "items", type: "list" },
          { name: "meta", type: "dict" }
        ]}
        onClose={() => {}}
        onRun={onRun}
      />
    );

    await userEvent.type(
      screen.getByLabelText("items (list)"),
      "[[1, 2]"
    );
    await userEvent.type(screen.getByLabelText("meta (dict)"), '{{"a":1}');
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onRun).toHaveBeenCalledWith({
      inputs: { items: [1, 2], meta: { a: 1 } }
    });
  });
});
