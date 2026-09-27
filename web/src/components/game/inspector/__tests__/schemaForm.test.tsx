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

    expect(screen.getByRole("textbox", { name: "name" })).toHaveValue("Player");
    expect(screen.queryByRole("textbox", { name: "newOptionalField" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add newOptionalField" }));
    expect(screen.getByRole("textbox", { name: "newOptionalField" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Decrease Count" }));
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Decrease Count" }));
    expect(onChange).not.toHaveBeenCalledWith(0);
    expect(screen.getByText("Value is outside the allowed range")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Increase Count" }));
    expect(onChange).toHaveBeenLastCalledWith(1);
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
