import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";
import { ShotPromptPreview } from "../ShotPromptPreview";

const KLING = "fal-ai/kling-video/v2.6/pro/image-to-video";
const LTX = "fal-ai/ltx-video";

const shot = (camera: Shot["camera"]): Shot => ({
  type: "shot",
  id: "s1",
  index: 0,
  action: "A lighthouse at dusk",
  status: "planned",
  render_mode: "direct",
  camera
});

/** The prompt text under a block's label. */
const blockText = (label: HTMLElement): string =>
  label.closest("div")?.nextElementSibling?.textContent ?? "";

const renderPreview = async (
  camera: Shot["camera"],
  videoModelId: string | null
) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotPromptPreview
        shot={shot(camera)}
        scene={null}
        style=""
        castNames={[]}
        videoModelId={videoModelId}
      />
    </ThemeProvider>
  );
  await userEvent.click(screen.getByText("Prompts"));
};

describe("ShotPromptPreview camera presets", () => {
  it("shows the compiled clause and sends it in place of the movement", async () => {
    await renderPreview(
      { movement: "dolly in", preset_ids: ["camera.dolly-in"] },
      KLING
    );

    const clause = blockText(await screen.findByText("Camera wording"));
    expect(clause).toBeTruthy();
    // The clip prompt carries the clause, not the bare movement words.
    const clipPrompt = blockText(screen.getByText("Clip prompt"));
    expect(clipPrompt).toContain(clause);
    expect(clipPrompt).not.toMatch(/^dolly in$/);
    expect(screen.queryByText(/default wording/)).not.toBeInTheDocument();
  });

  it("warns when the video model's family has no fragment", async () => {
    await renderPreview(
      { movement: "dolly in", preset_ids: ["camera.dolly-in"] },
      LTX
    );

    expect(await screen.findByText(/default wording is used/)).toHaveTextContent(
      `${LTX} has no tuned wording for dolly in`
    );
  });

  it("shows no camera wording for free-text movement", async () => {
    await renderPreview({ movement: "drift like a leaf" }, KLING);

    expect(await screen.findByText("Clip prompt")).toBeInTheDocument();
    expect(screen.queryByText("Camera wording")).not.toBeInTheDocument();
    expect(screen.getByText(/drift like a leaf/)).toBeInTheDocument();
  });
});
