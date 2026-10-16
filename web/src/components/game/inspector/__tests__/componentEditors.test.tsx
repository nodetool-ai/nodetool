import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { z } from "zod";
import type { GameValidationIssue } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import SchemaFields from "../SchemaFields";
import { gameSchemaFields } from "../schemaForm";
import type { GameComponentEditorProps } from "../componentEditors";

const componentSchema = gameSchemaFields(z.object({
  name: z.string(),
  particles: z.object({ rate: z.number().default(2) }).optional(),
  health: z.object({ value: z.number() })
}));
const initial = { name: "Emitter", particles: { rate: 2 }, health: { value: 5 } };
const seen = jest.fn();

function TestEditor(props: GameComponentEditorProps) {
  seen(props);
  return <button onClick={() => props.onChange({ rate: 7 })}>Use preview rate</button>;
}

const componentEditors = { particles: TestEditor };

describe("game component editor overrides", () => {
  beforeEach(() => seen.mockClear());

  it("edits a 3D component without replacing siblings and forwards its field context", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const assets = {};
    const issuePath = ["scenes", 0, "entities", 0] as const;
    const issues: GameValidationIssue[] = [{ path: [...issuePath, "particles", "rate"], message: "Invalid rate" }];
    const props = { schema: componentSchema, value: initial, onChange, path: "entity", issuePath,
      issues, assets, componentSections: true, componentEditors, dimension: "3d" as const };
    render(<ThemeProvider theme={mockTheme}><SchemaFields {...props} /></ThemeProvider>);

    await user.click(screen.getByRole("button", { name: "Use preview rate" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...initial, particles: { rate: 7 } });
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({
      schema: componentSchema.properties?.particles, value: initial.particles, path: "entity.particles",
      issuePath: [...issuePath, "particles"], issues, assets, dimension: "3d"
    }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Emitter");
    expect(screen.getByRole("textbox", { name: "Value" })).toHaveValue("5");
    expect(screen.queryByRole("textbox", { name: "Rate" })).not.toBeInTheDocument();
  });

  it("retains component add and remove actions around an override", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    function Fixture() {
      const [value, setValue] = useState<unknown>({ name: initial.name, health: initial.health });
      const props = { schema: componentSchema, value, path: "entity", componentSections: true,
        componentEditors, dimension: "3d" as const, onChange: (next: unknown) => { setValue(next); onChange(next); } };
      return <SchemaFields {...props} />;
    }
    render(<ThemeProvider theme={mockTheme}><Fixture /></ThemeProvider>);

    expect(screen.queryByRole("button", { name: "Use preview rate" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add component" }));
    await user.click(screen.getByRole("menuitem", { name: "Particles" }));
    expect(screen.getByRole("button", { name: "Use preview rate" })).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(initial);
    await user.click(screen.getByRole("button", { name: "Remove Particles" }));
    expect(onChange).toHaveBeenLastCalledWith({ name: initial.name, health: initial.health });
    expect(screen.queryByRole("button", { name: "Use preview rate" })).not.toBeInTheDocument();
  });

  it("supports a 2D inspector's directly selected component", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const props = { schema: componentSchema.properties?.particles ?? {}, value: initial.particles, onChange,
      path: "particles", componentName: "particles", componentEditors, dimension: "2d" as const };
    render(<ThemeProvider theme={mockTheme}><SchemaFields {...props} /></ThemeProvider>);
    await user.click(screen.getByRole("button", { name: "Use preview rate" }));
    expect(onChange).toHaveBeenLastCalledWith({ rate: 7 });
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ path: "particles", dimension: "2d" }));
  });

  it("keeps generic fields for unregistered and nested properties", () => {
    const props = { schema: componentSchema, value: initial, onChange: jest.fn(), componentEditors,
      dimension: "3d" as const };
    render(<ThemeProvider theme={mockTheme}><SchemaFields {...props} /></ThemeProvider>);
    expect(screen.getByRole("textbox", { name: "Rate" })).toHaveValue("2");
    expect(screen.getByRole("textbox", { name: "Value" })).toHaveValue("5");
    expect(seen).not.toHaveBeenCalled();
  });
});
