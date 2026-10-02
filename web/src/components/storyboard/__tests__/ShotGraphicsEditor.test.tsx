import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";
import ShotGraphicsEditor from "../ShotGraphicsEditor";
import { draftFromShot, shotPatchFromChangedDraft } from "../shotDraft";

const shot: Shot = {
  type: "shot",
  id: "hook",
  index: 0,
  action: "Sale",
  status: "planned",
  keyframe: { type: "image", asset_id: "clean-source" },
  production: {
    schema_version: 1, speech_mode: "none", requested_take_count: 1,
    media_strategy: "still_motion_graphics",
    protected_inputs: [
      {
        id: "price",
        kind: "exact_text",
        value: " €29 ",
        allowed_transformations: ["position", "opacity"]
      }
    ]
  },
  graphics: {
    mode: "graphics_first",
    elements: [
      { id: "headline", kind: "text", text: "Sale" },
      { id: "price", kind: "text", text: " €29 ", protected_input_id: "price" }
    ]
  }
};
const save = jest.fn();
function Editor({ readOnly = false }: { readOnly?: boolean }) {
  const original = draftFromShot(shot, null);
  const [draft, setDraft] = useState(original);
  return (
    <ThemeProvider theme={mockTheme}>
      <ShotGraphicsEditor
        shot={shot}
        draft={draft}
        onChange={setDraft}
        readOnly={readOnly}
      />
      <button
        onClick={() => save(shotPatchFromChangedDraft(draft, original, shot))}
      >
        Save
      </button>
    </ThemeProvider>
  );
}

describe("Shot graphics authoring", () => {
  beforeEach(() => save.mockClear());
  it("saves exact copy and semantic notes without changing the clean source or generating media", () => {
    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Exact text: headline"), {
      target: { value: "  Save €10  " }
    });
    fireEvent.change(screen.getByLabelText("Graphic direction"), {
      target: { value: "quiet premium composition" }
    });
    fireEvent.change(screen.getByLabelText("Shot motion design notes"), {
      target: { value: "Logo continues across the cut" }
    });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Save"));
    expect(save.mock.calls[0][0]).toEqual({
      motion: "Logo continues across the cut",
      graphics: {
        ...shot.graphics,
        direction: "quiet premium composition",
        elements: [
          { id: "headline", kind: "text", text: "  Save €10  " },
          shot.graphics!.elements![1]
        ]
      }
    });
    expect(screen.getByLabelText("Exact text: price")).toBeDisabled();
    expect(screen.getByLabelText("Exact text: price")).toHaveValue(" €29 ");
  });
  it("clears graphics with an explicit changed draft field", () => {
    render(<Editor />);
    fireEvent.click(screen.getByText("Remove graphics intent"));
    fireEvent.click(screen.getByText("Save"));
    expect(save.mock.calls[0][0]).toHaveProperty("graphics", undefined);
  });
  it("disabled semantic controls cannot change a read-only shot", () => {
    render(<Editor readOnly />);
    expect(screen.getByLabelText("Graphic direction")).toBeDisabled();
    expect(screen.getByLabelText("Shot motion design notes")).toBeDisabled();
    expect(screen.getByText("Add text")).toBeDisabled();
    fireEvent.click(screen.getByText("Add text"));
    fireEvent.click(screen.getByText("Save"));
    expect(save.mock.calls[0][0]).toEqual({});
  });
});
