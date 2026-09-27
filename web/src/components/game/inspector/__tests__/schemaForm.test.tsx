import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { z } from "zod";
import { gameDocument, gameRenderEffect } from "@nodetool-ai/protocol/game.js";
import { validateGame } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import SchemaFields from "../SchemaFields";
import { gameSchemaFields, schemaDefault } from "../schemaForm";

const schema = z.object({ name: z.string(), newOptionalField: z.string().optional() });

function FormFixture() {
  const [value, setValue] = useState<Record<string, unknown>>({ name: "Player" });
  return <ThemeProvider theme={mockTheme}>
    <SchemaFields schema={gameSchemaFields(schema)} value={value} onChange={(next) => setValue(next as Record<string, unknown>)} />
  </ThemeProvider>;
}

describe("generated game inspector fields", () => {
  it("exposes a newly added optional schema field without form-specific code", async () => {
    const user = userEvent.setup();
    render(<FormFixture />);

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Player");
    expect(screen.queryByRole("textbox", { name: "New Optional Field" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add New Optional Field" }));
    expect(screen.getByRole("textbox", { name: "New Optional Field" })).toBeInTheDocument();
  });

  it("uses schema defaults for an added object and leaves optional fields absent", () => {
    const defaults = schemaDefault(gameSchemaFields(z.object({ count: z.number().positive(), label: z.string().default("Ready"), optional: z.boolean().optional() })));
    expect(defaults).toEqual({ count: 1, label: "Ready" });
  });

  it("keeps invalid text locally until the field is corrected", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<ThemeProvider theme={mockTheme}><SchemaFields schema={gameSchemaFields(z.string().min(1))} value="Scene" onChange={onChange} path="Name" /></ThemeProvider>);
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(screen.getByText("Enter at least 1 character")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.type(input, "Forest");
    expect(input).toHaveValue("Forest");
    expect(onChange).toHaveBeenLastCalledWith("Forest");
  });

  it("keeps an out-of-range number visible until correction", () => {
    const onChange = jest.fn();
    render(<ThemeProvider theme={mockTheme}><SchemaFields schema={gameSchemaFields(z.number().int().min(1))} value={2} onChange={onChange} path="Count" /></ThemeProvider>);
    const input = screen.getByRole("textbox", { name: "Count" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalledWith(0);
    expect(screen.getByText("Value is outside the allowed range")).toBeInTheDocument();
    expect(input).toHaveValue("0");
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("shows rotation in degrees and stores the converted angle", () => {
    const onChange = jest.fn();
    render(<ThemeProvider theme={mockTheme}><SchemaFields schema={gameSchemaFields(z.number())} value={Math.PI / 2}
      onChange={onChange} path="transform2d.rotation" /></ThemeProvider>);
    const input = screen.getByRole("textbox", { name: "Rotation" });
    expect(input).toHaveValue("90");
    expect(screen.getByText("°")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "180" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(Math.PI);
  });

  it("edits paired transform axes without replacing their sibling values", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const transform = { x: 2, y: 3, rotation: 0, scaleX: 1, scaleY: 2 };
    const transformSchema = z.object({ x: z.number(), y: z.number(), rotation: z.number(), scaleX: z.number().positive(), scaleY: z.number().positive() });
    render(<ThemeProvider theme={mockTheme}><SchemaFields schema={gameSchemaFields(transformSchema)} value={transform}
      path="transform2d" onChange={onChange} /></ThemeProvider>);

    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("Scale")).toBeInTheDocument();
    expect(screen.queryAllByText(/^[XY]$/)).toHaveLength(0);
    expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("2");
    const scale = screen.getByRole("textbox", { name: "Scale X" });
    await user.clear(scale);
    await user.type(scale, "4");
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith({ ...transform, scaleX: 4 });
    expect(screen.getByRole("textbox", { name: "Y" })).toHaveValue("3");
    expect(screen.getByRole("textbox", { name: "Scale Y" })).toHaveValue("2");
  });

  it("keeps paired size inputs named without visible axis markers", () => {
    render(<ThemeProvider theme={mockTheme}><SchemaFields schema={gameSchemaFields(z.object({ width: z.number(), height: z.number() }))}
      value={{ width: 4, height: 3 }} path="size" onChange={() => undefined} /></ThemeProvider>);

    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.queryAllByText(/^[WH]$/)).toHaveLength(0);
    expect(screen.getByRole("textbox", { name: "Width" })).toHaveValue("4");
    expect(screen.getByRole("textbox", { name: "Height" })).toHaveValue("3");
  });

  it("supports moving and removing array entries", async () => {
    const user = userEvent.setup();
    function ArrayFixture() {
      const [value, setValue] = useState(["left", "right"]);
      return <ThemeProvider theme={mockTheme}><SchemaFields schema={gameSchemaFields(z.array(z.string()))} value={value} onChange={(next) => setValue(next as string[])} path="actions" /></ThemeProvider>;
    }
    render(<ArrayFixture />);
    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    expect(screen.getAllByRole("textbox").map((input) => (input as HTMLInputElement).value)).toEqual(["right", "left"]);
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(screen.getAllByRole("textbox").map((input) => (input as HTMLInputElement).value)).toEqual(["left"]);
  });

  it("places a LUT dimension validation issue under its asset field", () => {
    const document = gameDocument.parse({
      schemaVersion: 2, engineVersion: "1", id: "game", revision: "one", entrySceneId: "scene", pixelsPerUnit: 16, tickRate: 60,
      inputActions: [], assets: { lut: { assetId: "image", digest: "digest", width: 8, height: 8 } },
      renderEffects: [{ kind: "lut", assetId: "lut", size: 4 }], scenes: [{ id: "scene", name: "Scene", entities: [] }]
    });
    const issues = validateGame(document).issues;
    expect(issues).toContainEqual({ path: ["renderEffects", 0, "assetId"], message: "LUT dimensions must be 16×4" });
    render(<ThemeProvider theme={mockTheme}><SchemaFields schema={gameSchemaFields(gameRenderEffect)} value={document.renderEffects?.[0]}
      path="renderEffects.0" issuePath={["renderEffects", 0]} issues={issues} assets={document.assets} onChange={() => undefined} /></ThemeProvider>);
    expect(screen.getByText("LUT dimensions must be 16×4")).toBeInTheDocument();
  });
});
