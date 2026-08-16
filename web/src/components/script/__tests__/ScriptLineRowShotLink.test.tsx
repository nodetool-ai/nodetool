import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// The keyframe thumbnail resolves through TanStack Query; this suite renders no
// query client (resolution is covered by useResolvedMediaUri's own suite).
jest.mock("../../../hooks/useResolvedMediaUri");

import ScriptLineRow from "../ScriptLineRow";
import type { ScriptLine } from "../../../stores/script/ScriptStore";

const line = (): ScriptLine => ({
  id: "l1",
  speakerId: "speaker_kim",
  text: "We are closed.",
  takes: []
});

const shot = (): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 2,
  slug: "Doorway",
  action: "A closed door",
  status: "planned",
  script_line_ids: ["l1"]
});

const renderRow = (
  props: Partial<React.ComponentProps<typeof ScriptLineRow>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptLineRow
        scriptId="script-1"
        line={line()}
        cast={[{ id: "speaker_kim", name: "Kim" }]}
        highlighted={false}
        readOnly={false}
        {...props}
      />
    </ThemeProvider>
  );

describe("ScriptLineRow storyboard gutter", () => {
  it("shows nothing about shots on an unlinked script", () => {
    renderRow();

    expect(screen.queryByText("No shot")).toBeNull();
    expect(screen.queryByRole("button", { name: /storyboard/i })).toBeNull();
  });

  it("badges a line no shot covers", () => {
    renderRow({ orphaned: true });

    expect(screen.getByText("No shot")).toBeInTheDocument();
  });

  it("renders the covering shot as a click-through chip", async () => {
    const open = jest.fn();
    renderRow({ shotLink: { boardId: "board-1", shot: shot(), open } });

    const chip = screen.getByRole("button", {
      name: "Open Shot 3: Doorway on the storyboard"
    });
    await userEvent.click(chip);

    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No shot")).toBeNull();
  });
});
