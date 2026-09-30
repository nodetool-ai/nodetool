import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import AudioSurface from "../AudioSurface";

const mockAssetQuery = jest.fn();
jest.mock("../../../serverState/useAssetById", () => ({
  useAssetById: () => mockAssetQuery()
}));
jest.mock("../../audio_editor/AudioSampleEditor", () => ({
  __esModule: true,
  default: function AudioEditorDraft({ active }: { active: boolean }) {
    const [draft, setDraft] = useState("original sample");
    return (
      <input
        aria-label="Audio draft"
        data-active={String(active)}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }
}));
jest.mock("../../asset_viewer/AudioViewer", () => () => (
  <div>Audio viewer</div>
));
jest.mock("../DocumentLoadStatus", () => ({
  __esModule: true,
  default: ({ state, onRetry }: { state: string; onRetry: () => void }) => (
    <button onClick={onRetry}>{state}</button>
  )
}));

beforeEach(() =>
  mockAssetQuery.mockReturnValue({ data: { id: "audio-1" }, isPending: false })
);

it("keeps the same edited draft through inactive and View/Edit transitions", () => {
  const result = render(<AudioSurface refId="audio-1" mode="edit" active />);
  fireEvent.change(screen.getByLabelText("Audio draft"), {
    target: { value: "trimmed sample with undo history" }
  });
  result.rerender(<AudioSurface refId="audio-1" mode="edit" active={false} />);
  expect(screen.getByLabelText("Audio draft")).toHaveValue(
    "trimmed sample with undo history"
  );
  expect(screen.getByLabelText("Audio draft")).toHaveAttribute(
    "data-active",
    "false"
  );
  result.rerender(<AudioSurface refId="audio-1" mode="view" active />);
  result.rerender(<AudioSurface refId="audio-1" mode="edit" active />);
  expect(screen.getByLabelText("Audio draft")).toHaveValue(
    "trimmed sample with undo history"
  );
});

it("shows a settled metadata error and retries the query", () => {
  const refetch = jest.fn();
  mockAssetQuery.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch
  });
  render(<AudioSurface refId="audio-1" mode="view" active />);
  fireEvent.click(screen.getByText("error"));
  expect(refetch).toHaveBeenCalledTimes(1);
});
