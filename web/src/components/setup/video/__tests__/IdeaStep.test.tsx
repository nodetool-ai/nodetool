/**
 * @jest-environment jsdom
 *
 * Step 1 of the video flow. Two claims: an alternative is never offered as a
 * live route with nothing behind it (F5), and footage that arrives with no
 * brief keeps the creator here with what landed named (F10, F30).
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import type { Asset } from "../../../../stores/ApiTypes";
import { IdeaStep } from "../IdeaStep";

jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [] })
}));
jest.mock("../../../../hooks/useResolvedMediaUri");
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({
    data: [{ id: "e1", kind: "prop", name: "The paper boat" }]
  })
}));

const importFiles = jest.fn();
jest.mock("../../../../hooks/timeline/useSetupMediaImport", () => ({
  __esModule: true,
  useSetupMediaImport: () => ({ importFiles, importing: false })
}));

const asset = (id: string, name: string): Asset =>
  ({ id, name, content_type: "image/png" }) as Asset;

const renderStep = (onStartFromScript?: () => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <IdeaStep onStartBlank={jest.fn()} onStartFromScript={onStartFromScript} />
    </ThemeProvider>
  );

beforeEach(() => {
  importFiles.mockReset();
  useTimelineStore.getState().reset();
  useTimelineStore.getState().setSetup({ stage: "idea", brief: "" });
});

describe("video IdeaStep", () => {
  // F4: the composer's references and cast travel on the document, and the
  // step says so rather than leaving the creator to guess.
  it("shows the references and entities the composer carried", () => {
    useTimelineStore.getState().setSetup({ stage: "idea", brief: "" });
    useTimelineStore.setState({
      setup: {
        stage: "idea",
        brief: "",
        references: [{ uri: "asset://a1.png", name: "kerb.png" }],
        entityIds: ["e1"]
      }
    });
    renderStep();
    expect(screen.getByAltText("kerb.png")).toBeInTheDocument();
    expect(screen.getByText("The paper boat")).toBeInTheDocument();
  });

  it("shows nothing extra when the composer carried nothing", () => {
    renderStep();
    expect(screen.queryByText("From your project screen")).toBeNull();
  });

  it("offers Start from a script as a live route only when one exists (F5)", async () => {
    const start = jest.fn();
    renderStep(start);
    const card = screen.getByRole("button", { name: /Start from a script/ });
    expect(card).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(card);
    expect(start).toHaveBeenCalled();
  });

  it("disables Start from a script with a reason when no host takes it (F5)", () => {
    renderStep(undefined);
    expect(
      screen.getByRole("button", { name: /Start from a script/ })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("names what landed and what no track takes (F10)", async () => {
    importFiles.mockResolvedValue({
      placed: [asset("a1", "kerb.png")],
      skipped: [asset("a2", "notes.pdf")],
      advanced: false
    });
    renderStep();
    const input = screen.getByLabelText("Drop your media");
    await userEvent.upload(
      input,
      new File(["x"], "kerb.png", { type: "image/png" })
    );
    await waitFor(() =>
      expect(screen.getByText(/Placed 1 file on the timeline/)).toBeInTheDocument()
    );
    expect(screen.getByText(/kerb.png/)).toBeInTheDocument();
    expect(screen.getByText(/No track takes notes.pdf/)).toBeInTheDocument();
    expect(
      screen.getByText(/Say what to make of it below/)
    ).toBeInTheDocument();
  });

  it("imports files dropped on the step, not only picked ones (F30)", async () => {
    importFiles.mockResolvedValue({ placed: [], skipped: [], advanced: true });
    const { container } = renderStep();
    const surface = container.firstElementChild as HTMLElement;
    const file = new File(["x"], "hull.mp4", { type: "video/mp4" });
    const dataTransfer = {
      types: ["Files"],
      files: [file]
    } as unknown as DataTransfer;

    fireEvent.drop(surface, { dataTransfer });

    await waitFor(() => expect(importFiles).toHaveBeenCalled());
    expect((importFiles.mock.calls[0][0] as File[])[0].name).toBe("hull.mp4");
  });
});
